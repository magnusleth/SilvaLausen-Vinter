import { Router, type IRouter } from "express";
import {
  db,
  calloutsTable,
  calloutAreaStatusesTable,
  calloutSitesTable,
  areasTable,
  areaGeometriesTable,
  sitesTable,
  siteMarkersTable,
} from "@workspace/db";
import { inArray } from "drizzle-orm";
import {
  ListCalloutsResponse,
  ListCalloutsQueryParams,
  CreateCalloutBody,
  GetCalloutParams,
  GetCalloutResponse,
  UpdateCalloutParams,
  UpdateCalloutBody,
  UpdateCalloutResponse,
  ListCalloutAreaStatusesParams,
  ListCalloutAreaStatusesResponse,
  SetCalloutAreaStatusParams,
  SetCalloutAreaStatusBody,
  SetCalloutAreaStatusResponse,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

// Color → which site levels are included (snapshot logic)
const COLOR_LEVELS: Record<string, string[]> = {
  grå: [],
  orange: ["vip"],
  blå: ["vip", "hoj"],
  rød: ["vip", "hoj", "lav"],
  grøn: ["vip", "hoj", "lav", "basis"],
};

const router: IRouter = Router();

router.get("/callouts", async (req, res): Promise<void> => {
  const query = ListCalloutsQueryParams.safeParse(req.query);
  const rows = await db
    .select()
    .from(calloutsTable)
    .where(query.success && query.data.status ? eq(calloutsTable.status, query.data.status) : undefined)
    .orderBy(calloutsTable.createdAt);
  res.json(ListCalloutsResponse.parse(rows));
});

router.post("/callouts", async (req, res): Promise<void> => {
  const parsed = CreateCalloutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [callout] = await db
    .insert(calloutsTable)
    .values({ ...parsed.data, status: "kladde" })
    .returning();

  // Save area statuses
  const areaStatuses: Array<{ areaId: string; color: string }> = req.body.areaStatuses ?? [];
  const validStatuses = areaStatuses.filter(s => s.areaId && s.color);

  if (validStatuses.length > 0) {
    await db.insert(calloutAreaStatusesTable).values(
      validStatuses.map(s => ({ calloutId: callout.id, areaId: s.areaId, color: s.color }))
    );
  }

  // --- Snapshot: compute and save callout_sites ---
  // For each area assignment, find all active sites matching the color's levels
  // and insert as a frozen snapshot (manualOverride=false).
  let totalSitesSaved = 0;
  for (const { areaId, color } of validStatuses) {
    const levels = COLOR_LEVELS[color] ?? [];
    if (levels.length === 0) continue;

    const sites = await db
      .select({ id: sitesTable.id })
      .from(sitesTable)
      .where(
        and(
          eq(sitesTable.areaId, areaId),
          eq(sitesTable.active, true),
          inArray(sitesTable.level, levels)
        )
      );

    if (sites.length > 0) {
      await db.insert(calloutSitesTable).values(
        sites.map(s => ({
          calloutId: callout.id,
          siteId: s.id,
          included: true,
          manualOverride: false,
        }))
      );
      totalSitesSaved += sites.length;
    }
  }

  res.status(201).json({ ...callout, totalSites: totalSitesSaved });
});

router.get("/callouts/:id", async (req, res): Promise<void> => {
  const params = GetCalloutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [callout] = await db
    .select()
    .from(calloutsTable)
    .where(eq(calloutsTable.id, raw));

  if (!callout) {
    res.status(404).json({ error: "Udkald ikke fundet" });
    return;
  }

  const areaStatuses = await db
    .select()
    .from(calloutAreaStatusesTable)
    .where(eq(calloutAreaStatusesTable.calloutId, raw));

  res.json(GetCalloutResponse.parse({ ...callout, areaStatuses }));
});

// Rich map view endpoint — callout + area statuses + area names + geometries + site snapshot
router.get("/callouts/:id/map", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [callout] = await db
    .select()
    .from(calloutsTable)
    .where(eq(calloutsTable.id, raw));

  if (!callout) {
    res.status(404).json({ error: "Udkald ikke fundet" });
    return;
  }

  const areaStatuses = await db
    .select()
    .from(calloutAreaStatusesTable)
    .where(eq(calloutAreaStatusesTable.calloutId, raw));

  // Load snapshot sites for this callout (joined with sites for names/area)
  const snapshotSites = await db
    .select({
      siteId: calloutSitesTable.siteId,
      name: sitesTable.name,
      level: sitesTable.level,
      address: sitesTable.address,
      areaId: sitesTable.areaId,
    })
    .from(calloutSitesTable)
    .innerJoin(sitesTable, eq(calloutSitesTable.siteId, sitesTable.id))
    .where(
      and(
        eq(calloutSitesTable.calloutId, raw),
        eq(calloutSitesTable.included, true)
      )
    )
    .orderBy(sitesTable.level, sitesTable.name);

  // Group sites by area
  const sitesByArea: Record<string, { count: number; sites: Array<{ name: string; level: string; address?: string | null }> }> = {};
  for (const s of snapshotSites) {
    if (!s.areaId) continue;
    if (!sitesByArea[s.areaId]) sitesByArea[s.areaId] = { count: 0, sites: [] };
    sitesByArea[s.areaId].count++;
    if (sitesByArea[s.areaId].sites.length < 50) {
      sitesByArea[s.areaId].sites.push({ name: s.name, level: s.level, address: s.address });
    }
  }

  let areasWithGeo: Array<{
    id: string;
    name: string;
    color: string;
    geometry: unknown;
    siteCount: number;
    sites: Array<{ name: string; level: string; address?: string | null }>;
  }> = [];

  if (areaStatuses.length > 0) {
    const areaIds = areaStatuses.map(s => s.areaId);
    const areas = await db
      .select()
      .from(areasTable)
      .where(inArray(areasTable.id, areaIds));

    const geometries = await db
      .select()
      .from(areaGeometriesTable)
      .where(inArray(areaGeometriesTable.areaId, areaIds));

    const geoByArea: Record<string, unknown> = {};
    for (const geo of geometries) {
      if (!geoByArea[geo.areaId]) geoByArea[geo.areaId] = geo.geojson;
    }

    const areaMap: Record<string, { name: string }> = {};
    for (const a of areas) areaMap[a.id] = { name: a.name };

    areasWithGeo = areaStatuses.map(s => ({
      id: s.areaId,
      name: areaMap[s.areaId]?.name ?? "Ukendt",
      color: s.color,
      geometry: geoByArea[s.areaId] ?? null,
      siteCount: sitesByArea[s.areaId]?.count ?? 0,
      sites: sitesByArea[s.areaId]?.sites ?? [],
    }));
  }

  const totalSites = snapshotSites.length;

  res.json({ ...callout, areas: areasWithGeo, totalSites });
});

// Live driver view endpoint — snapshot sites with marker coordinates
router.get("/callouts/:id/live", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [callout] = await db
    .select()
    .from(calloutsTable)
    .where(eq(calloutsTable.id, raw));

  if (!callout) {
    res.status(404).json({ error: "Udkald ikke fundet" });
    return;
  }

  // Fetch snapshot sites joined with site details
  const snapshotSites = await db
    .select({
      siteId: calloutSitesTable.siteId,
      name: sitesTable.name,
      level: sitesTable.level,
      address: sitesTable.address,
      areaId: sitesTable.areaId,
      dayRule: sitesTable.dayRule,
    })
    .from(calloutSitesTable)
    .innerJoin(sitesTable, eq(calloutSitesTable.siteId, sitesTable.id))
    .where(
      and(
        eq(calloutSitesTable.calloutId, raw),
        eq(calloutSitesTable.included, true)
      )
    )
    .orderBy(sitesTable.level, sitesTable.name);

  if (snapshotSites.length === 0) {
    res.json({ ...callout, totalSites: 0, sites: [] });
    return;
  }

  // Fetch first marker per site for coordinates
  const siteIds = snapshotSites.map(s => s.siteId);
  const markers = await db
    .select()
    .from(siteMarkersTable)
    .where(inArray(siteMarkersTable.siteId, siteIds));

  const markerBySite: Record<string, { lat: number; lng: number }> = {};
  for (const m of markers) {
    if (!markerBySite[m.siteId]) markerBySite[m.siteId] = { lat: m.lat, lng: m.lng };
  }

  const sites = snapshotSites
    .filter(s => markerBySite[s.siteId])
    .map(s => ({
      id: s.siteId,
      name: s.name,
      level: s.level,
      address: s.address,
      areaId: s.areaId,
      dayRule: s.dayRule,
      lat: markerBySite[s.siteId].lat,
      lng: markerBySite[s.siteId].lng,
    }));

  res.json({ ...callout, totalSites: snapshotSites.length, sites });
});

router.patch("/callouts/:id", async (req, res): Promise<void> => {
  const params = UpdateCalloutParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCalloutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [callout] = await db
    .update(calloutsTable)
    .set(parsed.data)
    .where(eq(calloutsTable.id, raw))
    .returning();

  if (!callout) {
    res.status(404).json({ error: "Udkald ikke fundet" });
    return;
  }

  res.json(UpdateCalloutResponse.parse(callout));
});

router.get("/callouts/:id/area-statuses", async (req, res): Promise<void> => {
  const params = ListCalloutAreaStatusesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const rows = await db
    .select()
    .from(calloutAreaStatusesTable)
    .where(eq(calloutAreaStatusesTable.calloutId, raw));

  res.json(ListCalloutAreaStatusesResponse.parse(rows));
});

router.put("/callouts/:id/area-statuses", async (req, res): Promise<void> => {
  const params = SetCalloutAreaStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = SetCalloutAreaStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const existing = await db
    .select()
    .from(calloutAreaStatusesTable)
    .where(
      and(
        eq(calloutAreaStatusesTable.calloutId, raw),
        eq(calloutAreaStatusesTable.areaId, parsed.data.areaId)
      )
    );

  let row;
  if (existing.length > 0) {
    [row] = await db
      .update(calloutAreaStatusesTable)
      .set({ color: parsed.data.color })
      .where(
        and(
          eq(calloutAreaStatusesTable.calloutId, raw),
          eq(calloutAreaStatusesTable.areaId, parsed.data.areaId)
        )
      )
      .returning();
  } else {
    [row] = await db
      .insert(calloutAreaStatusesTable)
      .values({
        calloutId: raw,
        areaId: parsed.data.areaId,
        color: parsed.data.color,
      })
      .returning();
  }

  res.json(SetCalloutAreaStatusResponse.parse(row));
});

export default router;
