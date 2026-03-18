import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";
import { sitesTable } from "./sites";

/**
 * Hvilke pladser er aktive i et udkald.
 * `included` beregnes automatisk ud fra callout_area_statuses farvelogik.
 * `manualOverride` = true hvis disponenten manuelt har overskrevet den beregnede værdi.
 */
export const calloutSitesTable = pgTable("callout_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id")
    .notNull()
    .references(() => calloutsTable.id, { onDelete: "cascade" }),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  included: boolean("included").notNull().default(false),
  manualOverride: boolean("manual_override").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCalloutSiteSchema = createInsertSchema(calloutSitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalloutSite = z.infer<typeof insertCalloutSiteSchema>;
export type CalloutSite = typeof calloutSitesTable.$inferSelect;
