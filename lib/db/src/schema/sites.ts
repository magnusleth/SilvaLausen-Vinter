import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { areasTable } from "./areas";

export const siteLevelEnum = ["vip", "hoj", "lav", "standard"] as const;
export type SiteLevel = (typeof siteLevelEnum)[number];

export const siteDayRuleEnum = ["altid", "hverdage", "weekend", "hverdage_og_lordag"] as const;
export type SiteDayRule = (typeof siteDayRuleEnum)[number];

export const sitesTable = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  areaId: uuid("area_id")
    .notNull()
    .references(() => areasTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  address: text("address"),
  level: text("level").notNull().default("standard"),
  dayRule: text("day_rule").notNull().default("altid"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSiteSchema = createInsertSchema(sitesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sitesTable.$inferSelect;
