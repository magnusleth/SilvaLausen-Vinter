import { Router, type IRouter } from "express";
import { db, sitesTable, siteMarkersTable, siteGeometriesTable } from "@workspace/db";
import {
  ListSitesResponse,
  GetSiteParams,
  GetSiteResponse,
  CreateSiteBody,
  ListSitesQueryParams,
} from "@workspace/api-zod";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sites", async (req, res): Promise<void> => {
  const query = ListSitesQueryParams.safeParse(req.query);

  const conditions = [];
  if (query.success) {
    if (query.data.areaId) conditions.push(eq(sitesTable.areaId, query.data.areaId));
    if (query.data.level) conditions.push(eq(sitesTable.level, query.data.level));
    if (query.data.active !== undefined) conditions.push(eq(sitesTable.active, query.data.active));
  }

  const rows = await db
    .select()
    .from(sitesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sitesTable.name);

  res.json(ListSitesResponse.parse(rows));
});

// Sites with marker coordinates — used for map rendering
router.get("/sites/map", async (req, res): Promise<void> => {
  const { areaId, level, active } = req.query;
  const conditions = [eq(sitesTable.active, true)]; // always filter active by default
  if (active === "false") conditions.length = 0; // allow override
  if (areaId && typeof areaId === "string") conditions.push(eq(sitesTable.areaId, areaId));
  if (level && typeof level === "string") conditions.push(eq(sitesTable.level, level));

  const sites = await db
    .select()
    .from(sitesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(sitesTable.name);

  if (sites.length === 0) { res.json([]); return; }

  const siteIds = sites.map(s => s.id);
  const markers = await db
    .select()
    .from(siteMarkersTable)
    .where(inArray(siteMarkersTable.siteId, siteIds));

  // First marker per site
  const markerBySite: Record<string, { lat: number; lng: number; label: string | null }> = {};
  for (const m of markers) {
    if (!markerBySite[m.siteId]) markerBySite[m.siteId] = { lat: m.lat, lng: m.lng, label: m.label };
  }

  const result = sites
    .filter(s => markerBySite[s.id])
    .map(s => ({ ...s, lat: markerBySite[s.id].lat, lng: markerBySite[s.id].lng, label: markerBySite[s.id].label }));

  res.json(result);
});

// Site geometries as GeoJSON FeatureCollection — for map overlay
router.get("/sites/geometries", async (req, res): Promise<void> => {
  const { areaId, level } = req.query;

  const conditions = [eq(sitesTable.active, true)];
  if (areaId && typeof areaId === "string") conditions.push(eq(sitesTable.areaId, areaId));
  if (level && typeof level === "string") conditions.push(eq(sitesTable.level, level));

  const sites = await db
    .select({ id: sitesTable.id, level: sitesTable.level })
    .from(sitesTable)
    .where(and(...conditions));

  if (sites.length === 0) { res.json({ type: "FeatureCollection", features: [] }); return; }

  const siteIds = sites.map(s => s.id);
  const levelBySite: Record<string, string> = Object.fromEntries(sites.map(s => [s.id, s.level]));

  const geometries = await db
    .select()
    .from(siteGeometriesTable)
    .where(inArray(siteGeometriesTable.siteId, siteIds));

  const features = geometries.map(geo => {
    const feature = geo.geojson as Record<string, unknown>;
    return {
      ...feature,
      properties: { ...(feature.properties as object ?? {}), siteId: geo.siteId, level: levelBySite[geo.siteId] ?? "basis" },
    };
  });

  res.json({ type: "FeatureCollection", features });
});

// Preview: which sites would be included in a callout given area→color assignments?
router.post("/sites/callout-preview", async (req, res): Promise<void> => {
  // Body: { assignments: [{areaId, color}] }
  const { assignments } = req.body;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    res.json({ totalSites: 0, byArea: {} });
    return;
  }

  // Color → which levels are included
  const COLOR_LEVELS: Record<string, string[]> = {
    grå: [],
    orange: ["vip"],
    blå: ["vip", "hoj"],
    rød: ["vip", "hoj", "lav"],
    grøn: ["vip", "hoj", "lav", "basis"],
  };

  const byArea: Record<string, { count: number; sites: { name: string; level: string; address?: string | null }[] }> = {};
  let totalSites = 0;

  for (const { areaId, color } of assignments) {
    const levels = COLOR_LEVELS[color as string];
    if (!levels || levels.length === 0) continue;

    const sites = await db
      .select({ id: sitesTable.id, name: sitesTable.name, level: sitesTable.level, address: sitesTable.address })
      .from(sitesTable)
      .where(and(
        eq(sitesTable.areaId, areaId),
        eq(sitesTable.active, true),
        inArray(sitesTable.level, levels)
      ))
      .orderBy(sitesTable.level, sitesTable.name);

    byArea[areaId] = {
      count: sites.length,
      sites: sites.slice(0, 10),
    };
    totalSites += sites.length;
  }

  res.json({ totalSites, byArea });
});

router.post("/sites", async (req, res): Promise<void> => {
  const parsed = CreateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.insert(sitesTable).values(parsed.data).returning();
  res.status(201).json(site);
});

router.get("/sites/:id", async (req, res): Promise<void> => {
  const params = GetSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [site] = await db
    .select()
    .from(sitesTable)
    .where(eq(sitesTable.id, raw));

  if (!site) {
    res.status(404).json({ error: "Plads ikke fundet" });
    return;
  }

  const markers = await db
    .select()
    .from(siteMarkersTable)
    .where(eq(siteMarkersTable.siteId, raw));

  res.json(GetSiteResponse.parse({ ...site, markers }));
});

export default router;
