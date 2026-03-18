import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";
import { sitesTable } from "./sites";
import { vehiclesTable } from "./vehicles";
import { peopleTable } from "./people";

export const jobStatusEnum = ["afventer", "igangsat", "afsluttet", "annulleret"] as const;
export type JobStatus = (typeof jobStatusEnum)[number];

export const jobTypeEnum = ["snerydning", "saltning", "fejning", "grusning", "andet"] as const;
export type JobType = (typeof jobTypeEnum)[number];

export const jobsTable = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id")
    .notNull()
    .references(() => calloutsTable.id, { onDelete: "cascade" }),
  siteId: uuid("site_id").references(() => sitesTable.id, { onDelete: "set null" }),
  vehicleId: uuid("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  personId: uuid("person_id").references(() => peopleTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("snerydning"),
  status: text("status").notNull().default("afventer"),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertJobSchema = createInsertSchema(jobsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
