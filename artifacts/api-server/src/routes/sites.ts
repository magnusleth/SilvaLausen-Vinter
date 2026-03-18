import { Router, type IRouter } from "express";
import { db, sitesTable, siteMarkersTable } from "@workspace/db";
import {
  ListSitesResponse,
  GetSiteParams,
  GetSiteResponse,
  CreateSiteBody,
  ListSitesQueryParams,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";

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
