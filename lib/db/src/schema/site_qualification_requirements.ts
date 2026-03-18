import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";
import { qualificationsTable } from "./qualifications";

export const siteQualificationRequirementsTable = pgTable("site_qualification_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  qualificationId: uuid("qualification_id")
    .notNull()
    .references(() => qualificationsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteQualificationRequirementSchema = createInsertSchema(
  siteQualificationRequirementsTable
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSiteQualificationRequirement = z.infer<typeof insertSiteQualificationRequirementSchema>;
export type SiteQualificationRequirement = typeof siteQualificationRequirementsTable.$inferSelect;
