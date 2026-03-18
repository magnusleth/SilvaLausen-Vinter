import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { zonesTable } from "./zones";
import { driversTable } from "./drivers";
import { locationsTable } from "./locations";

export const assignmentStatusEnum = ["afventer", "igangsat", "afsluttet", "annulleret"] as const;
export type AssignmentStatus = (typeof assignmentStatusEnum)[number];

export const assignmentTypeEnum = ["snerydning", "saltning", "fejning", "grusning", "andet"] as const;
export type AssignmentType = (typeof assignmentTypeEnum)[number];

export const assignmentsTable = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  zoneId: uuid("zone_id").references(() => zonesTable.id, { onDelete: "set null" }),
  locationId: uuid("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  driverId: uuid("driver_id").references(() => driversTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("afventer"),
  priority: integer("priority").notNull().default(2),
  notes: text("notes"),
  plannedStart: timestamp("planned_start", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAssignmentSchema = createInsertSchema(assignmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAssignment = z.infer<typeof insertAssignmentSchema>;
export type Assignment = typeof assignmentsTable.$inferSelect;
