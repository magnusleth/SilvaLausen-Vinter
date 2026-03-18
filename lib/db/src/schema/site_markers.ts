import { pgTable, text, timestamp, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";

export const siteMarkersTable = pgTable("site_markers", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  label: text("label"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteMarkerSchema = createInsertSchema(siteMarkersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSiteMarker = z.infer<typeof insertSiteMarkerSchema>;
export type SiteMarker = typeof siteMarkersTable.$inferSelect;
