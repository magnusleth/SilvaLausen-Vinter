import { Router, type IRouter } from "express";
import { db, sitesTable, siteMarkersTable, siteGeometriesTable, areasTable } from "@workspace/db";
import {
  ListSitesResponse,
  GetSiteParams,
  GetSiteResponse,
  CreateSiteBody,
  ListSitesQueryParams,
} from "@workspace/api-zod";
import { eq, and, inArray, sql } from "drizzle-orm";

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

// Admin endpoint — all sites with areaName, hasMarker, geometryCount (no active filter)
router.get("/sites/admin", async (req, res): Promise<void> => {
  const { areaId, active, search } = req.query as Record<string, string | undefined>;

  const [allSites, allAreas, markerRows, geoRows] = await Promise.all([
    db.select().from(sitesTable).orderBy(sitesTable.name),
    db.select({ id: areasTable.id, name: areasTable.name }).from(areasTable),
    db.select({ siteId: siteMarkersTable.siteId }).from(siteMarkersTable),
    db
      .select({ siteId: siteGeometriesTable.siteId, cnt: sql<number>`count(*)::int` })
      .from(siteGeometriesTable)
      .where(eq(siteGeometriesTable.draft, false))
      .groupBy(siteGeometriesTable.siteId),
  ]);

  const areaMap = Object.fromEntries(allAreas.map(a => [a.id, a.name]));
  const markerSet = new Set(markerRows.map(m => m.siteId));
  const geoMap = Object.fromEntries(geoRows.map(g => [g.siteId, g.cnt]));

  let result = allSites.map(s => ({
    ...s,
    areaName: areaMap[s.areaId] ?? "—",
    hasMarker: markerSet.has(s.id),
    geometryCount: geoMap[s.id] ?? 0,
  }));

  if (areaId) result = result.filter(s => s.areaId === areaId);
  if (active === "true") result = result.filter(s => s.active);
  if (active === "false") result = result.filter(s => !s.active);
  if (search) {
    const q = search.toLowerCase();
    result = result.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.address ?? "").toLowerCase().includes(q) ||
      (s.city ?? "").toLowerCase().includes(q) ||
      (s.postalCode ?? "").toLowerCase().includes(q) ||
      (s.codeKey ?? "").toLowerCase().includes(q) ||
      (s.kunde ?? "").toLowerCase().includes(q) ||
      (s.vaKunde ?? "").toLowerCase().includes(q)
    );
  }

  res.json(result);
});

// Sites with marker coordinates — used for map rendering
router.get("/sites/map", async (req, res): Promise<void> => {
  const { areaId, level, active } = req.query;
  const conditions = [eq(sitesTable.active, true)];
  if (active === "false") conditions.length = 0;
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

  const markerBySite: Record<string, { lat: number; lng: number; label: string | null }> = {};
  for (const m of markers) {
    if (!markerBySite[m.siteId]) markerBySite[m.siteId] = { lat: m.lat, lng: m.lng, label: m.label };
  }

  const result = sites
    .filter(s => markerBySite[s.id])
    .map(s => ({ ...s, lat: markerBySite[s.id].lat, lng: markerBySite[s.id].lng, label: markerBySite[s.id].label }));

  res.json(result);
});

// Site geometries as GeoJSON FeatureCollection — only active sites, non-draft geometries
router.get("/sites/geometries", async (req, res): Promise<void> => {
  const { areaId, level } = req.query;

  const conditions = [eq(sitesTable.active, true)];
  if (areaId && typeof areaId === "string") conditions.push(eq(sitesTable.areaId, areaId));
  if (level && typeof level === "string") conditions.push(eq(sitesTable.level, level));

  const sites = await db
    .select({
      id: sitesTable.id,
      name: sitesTable.name,
      level: sitesTable.level,
      postalCode: sitesTable.postalCode,
      city: sitesTable.city,
      codeKey: sitesTable.codeKey,
      iceControl: sitesTable.iceControl,
      app: sitesTable.app,
      bigCustomer: sitesTable.bigCustomer,
    })
    .from(sitesTable)
    .where(and(...conditions));

  if (sites.length === 0) { res.json({ type: "FeatureCollection", features: [] }); return; }

  const siteIds = sites.map(s => s.id);
  const siteMeta: Record<string, typeof sites[number]> = Object.fromEntries(sites.map(s => [s.id, s]));

  const geometries = await db
    .select()
    .from(siteGeometriesTable)
    .where(and(
      inArray(siteGeometriesTable.siteId, siteIds),
      eq(siteGeometriesTable.draft, false)
    ));

  const features = geometries.map(geo => {
    const geojson = geo.geojson as Record<string, unknown>;
    const meta = siteMeta[geo.siteId];
    return {
      type: "Feature",
      geometry: geojson,
      properties: {
        siteId: geo.siteId,
        level: meta?.level ?? "basis",
        name: meta?.name ?? "",
        postalCode: meta?.postalCode ?? null,
        city: meta?.city ?? null,
        codeKey: meta?.codeKey ?? null,
        iceControl: meta?.iceControl ?? null,
        app: meta?.app ?? null,
        bigCustomer: meta?.bigCustomer ?? null,
        geomType: geo.geomType ?? "ukendt",
        color: geo.color ?? "#888888",
      },
    };
  });

  res.json({ type: "FeatureCollection", features });
});

// Preview: which sites would be included in a callout given area→color assignments?
router.post("/sites/callout-preview", async (req, res): Promise<void> => {
  const { assignments } = req.body;
  if (!Array.isArray(assignments) || assignments.length === 0) {
    res.json({ totalSites: 0, byArea: {} });
    return;
  }

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

    byArea[areaId] = { count: sites.length, sites: sites.slice(0, 10) };
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

// Get site detail with markers and geometry count
router.get("/sites/:id", async (req, res): Promise<void> => {
  const params = GetSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [siteRow] = await db
    .select()
    .from(sitesTable)
    .where(eq(sitesTable.id, raw));

  if (!siteRow) {
    res.status(404).json({ error: "Plads ikke fundet" });
    return;
  }

  const [markers, geoCount, areaRow] = await Promise.all([
    db.select().from(siteMarkersTable).where(eq(siteMarkersTable.siteId, raw)),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(siteGeometriesTable)
      .where(and(eq(siteGeometriesTable.siteId, raw), eq(siteGeometriesTable.draft, false))),
    db.select({ name: areasTable.name }).from(areasTable).where(eq(areasTable.id, siteRow.areaId)),
  ]);

  res.json({
    ...siteRow,
    markers,
    geometryCount: geoCount[0]?.cnt ?? 0,
    areaName: areaRow[0]?.name ?? "—",
  });
});

// Update site fields (incl. active toggle)
router.patch("/sites/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const body = req.body as Record<string, unknown>;

  const allowed = ["name", "address", "postalCode", "city", "level", "dayRule", "active", "notes", "codeKey", "iceControl", "app", "bigCustomer", "vaKunde", "kunde"] as const;
  const updates: Record<string, unknown> = {};
  for (const field of allowed) {
    if (field in body) updates[field] = body[field];
  }

  if (!Object.keys(updates).length) {
    res.status(400).json({ error: "Ingen felter at opdatere" });
    return;
  }

  const [site] = await db.update(sitesTable).set(updates).where(eq(sitesTable.id, raw)).returning();
  if (!site) { res.status(404).json({ error: "Plads ikke fundet" }); return; }
  res.json(site);
});

// Re-geocode site marker from address using DAWA
router.post("/sites/:id/geocode", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, raw));
  if (!site) { res.status(404).json({ error: "Plads ikke fundet" }); return; }

  const q = [site.address, site.postalCode, site.city].filter(Boolean).join(" ");
  if (!q) { res.status(400).json({ error: "Ingen adresse at geokode" }); return; }

  try {
    const dawaRes = await fetch(`https://api.dataforsyningen.dk/adresser?q=${encodeURIComponent(q)}&fuzzy&format=json`);
    const results = await dawaRes.json() as Record<string, unknown>[];

    if (!results.length) {
      res.status(404).json({ error: "Adresse ikke fundet i DAWA" });
      return;
    }

    const first = results[0] as Record<string, unknown>;
    const adg = first.adgangsadresse as Record<string, unknown>;
    const koordinater = (adg?.adgangspunkt as Record<string, number[]>)?.koordinater;
    if (!koordinater) {
      res.status(422).json({ error: "Ingen koordinater i DAWA-svar" });
      return;
    }

    const lng = koordinater[0];
    const lat = koordinater[1];

    const existingMarkers = await db.select().from(siteMarkersTable).where(eq(siteMarkersTable.siteId, raw));

    if (existingMarkers.length > 0) {
      await db.update(siteMarkersTable).set({ lat, lng, updatedAt: new Date() }).where(eq(siteMarkersTable.siteId, raw));
    } else {
      await db.insert(siteMarkersTable).values({ siteId: raw, lat, lng, label: site.name });
    }

    res.json({ lat, lng, updated: existingMarkers.length > 0 ? "updated" : "created" });
  } catch (err) {
    console.error("[geocode]", err);
    res.status(500).json({ error: "Geokodningsfejl" });
  }
});

export default router;
