import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { areasTable } from "./areas";

/**
 * Niveauhierarki for pladser — bruges til at beregne hvilke pladser
 * der aktiveres for et givent udkald-område ud fra callout_area_statuses.color:
 *
 *   grå    → ingen pladser (ingen kørsel)
 *   orange → vip
 *   blå    → vip + hoj
 *   rød    → vip + hoj + lav
 *   grøn   → vip + hoj + lav + basis  (alle aktive pladser)
 *
 * "basis" er det laveste prioritetsniveau og aktiveres kun ved grøn.
 */
export const siteLevelEnum = ["vip", "hoj", "lav", "basis"] as const;
export type SiteLevel = (typeof siteLevelEnum)[number];

export const siteDayRuleEnum = ["altid", "hverdage", "weekend", "hverdage_og_lordag"] as const;
export type SiteDayRule = (typeof siteDayRuleEnum)[number];

export const sitesTable = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  areaId: uuid("area_id")
    .references(() => areasTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  address: text("address"),
  postalCode: text("postal_code"),
  city: text("city"),
  level: text("level").notNull().default("basis"),
  dayRule: text("day_rule").notNull().default("altid"),
  active: boolean("active").notNull().default(false),
  excelStatus: text("excel_status"),
  notes: text("notes"),
  codeKey: text("code_key"),
  iceControl: text("ice_control"),
  app: text("app"),
  bigCustomer: text("big_customer"),
  smapsId: text("smaps_id"),
  vaKunde: text("va_kunde"),
  kunde: text("kunde"),
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
