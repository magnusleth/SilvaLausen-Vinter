import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { sitesTable } from "./sites";
import { importsTable } from "./imports";

export const siteGeometriesTable = pgTable("site_geometries", {
  id: uuid("id").primaryKey().defaultRandom(),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  importId: uuid("import_id").references(() => importsTable.id, { onDelete: "set null" }),
  geojson: jsonb("geojson").notNull(),
  source: text("source").notNull().default("manuel"),
  geomType: text("geom_type"),
  color: text("color"),
  smapsId: text("smaps_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteGeometrySchema = createInsertSchema(siteGeometriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSiteGeometry = z.infer<typeof insertSiteGeometrySchema>;
export type SiteGeometry = typeof siteGeometriesTable.$inferSelect;
