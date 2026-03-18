import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { peopleTable } from "./people";

export const calloutStatusEnum = ["kladde", "aktiv", "afsluttet", "annulleret"] as const;
export type CalloutStatus = (typeof calloutStatusEnum)[number];

export const calloutsTable = pgTable("callouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  status: text("status").notNull().default("kladde"),
  createdById: uuid("created_by_id").references(() => peopleTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCalloutSchema = createInsertSchema(calloutsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCallout = z.infer<typeof insertCalloutSchema>;
export type Callout = typeof calloutsTable.$inferSelect;
