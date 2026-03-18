import { Router, type IRouter } from "express";
import { db, peopleTable } from "@workspace/db";
import { ListPeopleResponse } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/people", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(peopleTable)
    .where(eq(peopleTable.active, true))
    .orderBy(peopleTable.lastName, peopleTable.firstName);
  res.json(ListPeopleResponse.parse(rows));
});

export default router;
