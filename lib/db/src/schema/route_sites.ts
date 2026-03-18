import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { routesTable } from "./routes";
import { sitesTable } from "./sites";

export const routeSitesTable = pgTable("route_sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => routesTable.id, { onDelete: "cascade" }),
  siteId: uuid("site_id")
    .notNull()
    .references(() => sitesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRouteSiteSchema = createInsertSchema(routeSitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRouteSite = z.infer<typeof insertRouteSiteSchema>;
export type RouteSite = typeof routeSitesTable.$inferSelect;
