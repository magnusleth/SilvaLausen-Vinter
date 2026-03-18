import { Router, type IRouter } from "express";
import { db, calloutsTable, calloutAreaStatusesTable, areasTable, areaGeometriesTable } from "@workspace/db";
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

  // Optionally accept areaStatuses: Array<{areaId: string, color: string}>
  const areaStatuses = req.body.areaStatuses;
  if (Array.isArray(areaStatuses) && areaStatuses.length > 0) {
    const rows = areaStatuses
      .filter((s: { areaId?: string; color?: string }) => s.areaId && s.color)
      .map((s: { areaId: string; color: string }) => ({
        calloutId: callout.id,
        areaId: s.areaId,
        color: s.color,
      }));
    if (rows.length > 0) {
      await db.insert(calloutAreaStatusesTable).values(rows);
    }
  }

  // Return full callout detail with area statuses
  const savedStatuses = await db
    .select()
    .from(calloutAreaStatusesTable)
    .where(eq(calloutAreaStatusesTable.calloutId, callout.id));

  res.status(201).json({ ...callout, areaStatuses: savedStatuses });
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

// Rich map view endpoint — callout + area statuses + area names + geometries
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

  let areasWithGeo: Array<{ id: string; name: string; color: string; geometry: unknown }> = [];

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
    }));
  }

  res.json({ ...callout, areas: areasWithGeo });
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
