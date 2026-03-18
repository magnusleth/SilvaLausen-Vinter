import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { areasTable } from "./areas";
import { importsTable } from "./imports";

export const areaGeometriesTable = pgTable("area_geometries", {
  id: uuid("id").primaryKey().defaultRandom(),
  areaId: uuid("area_id")
    .notNull()
    .references(() => areasTable.id, { onDelete: "cascade" }),
  importId: uuid("import_id").references(() => importsTable.id, { onDelete: "set null" }),
  geojson: jsonb("geojson").notNull(),
  source: text("source").notNull().default("manuel"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAreaGeometrySchema = createInsertSchema(areaGeometriesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAreaGeometry = z.infer<typeof insertAreaGeometrySchema>;
export type AreaGeometry = typeof areaGeometriesTable.$inferSelect;
