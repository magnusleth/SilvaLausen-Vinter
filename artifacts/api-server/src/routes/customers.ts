import { Router, type IRouter } from "express";
import { db, customersTable } from "@workspace/db";
import { ListCustomersResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.active, true))
    .orderBy(customersTable.name);
  res.json(ListCustomersResponse.parse(rows));
});

export default router;
