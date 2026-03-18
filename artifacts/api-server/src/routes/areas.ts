import { Router, type IRouter } from "express";
import { db, areasTable, areaGeometriesTable, sitesTable } from "@workspace/db";
import {
  ListAreasResponse,
  GetAreaParams,
  GetAreaResponse,
  CreateAreaBody,
  ListAreasQueryParams,
} from "@workspace/api-zod";
import { eq, and, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/areas", async (req, res): Promise<void> => {
  const query = ListAreasQueryParams.safeParse(req.query);
  const rows = await db
    .select()
    .from(areasTable)
    .where(
      query.success && query.data.customerId
        ? and(eq(areasTable.customerId, query.data.customerId), eq(areasTable.active, true))
        : eq(areasTable.active, true)
    )
    .orderBy(areasTable.name);
  res.json(ListAreasResponse.parse(rows));
});

// Returns all active areas with their first geometry — used for map rendering
router.get("/areas-with-geometry", async (req, res): Promise<void> => {
  const areas = await db
    .select()
    .from(areasTable)
    .where(eq(areasTable.active, true))
    .orderBy(areasTable.name);

  if (areas.length === 0) {
    res.json([]);
    return;
  }

  const areaIds = areas.map(a => a.id);
  const geometries = await db
    .select()
    .from(areaGeometriesTable)
    .where(inArray(areaGeometriesTable.areaId, areaIds));

  // Group geometries by area_id (take first)
  const geoByArea: Record<string, unknown> = {};
  for (const geo of geometries) {
    if (!geoByArea[geo.areaId]) {
      geoByArea[geo.areaId] = geo.geojson;
    }
  }

  const result = areas.map(area => ({
    ...area,
    geometry: geoByArea[area.id] ?? null,
  }));

  res.json(result);
});

router.post("/areas", async (req, res): Promise<void> => {
  const parsed = CreateAreaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [area] = await db.insert(areasTable).values(parsed.data).returning();
  res.status(201).json(area);
});

router.get("/areas/:id", async (req, res): Promise<void> => {
  const params = GetAreaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const [area] = await db
    .select()
    .from(areasTable)
    .where(eq(areasTable.id, raw));

  if (!area) {
    res.status(404).json({ error: "Område ikke fundet" });
    return;
  }

  const geometries = await db
    .select()
    .from(areaGeometriesTable)
    .where(eq(areaGeometriesTable.areaId, raw));

  const sites = await db
    .select()
    .from(sitesTable)
    .where(eq(sitesTable.areaId, raw));

  res.json(
    GetAreaResponse.parse({
      ...area,
      geometries,
      sites,
    })
  );
});

export default router;
