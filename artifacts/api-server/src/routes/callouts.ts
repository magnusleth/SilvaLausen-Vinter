import { Router, type IRouter } from "express";
import { db, calloutsTable, calloutAreaStatusesTable } from "@workspace/db";
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
  res.status(201).json(callout);
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
