import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";
import { areasTable } from "./areas";

/**
 * Farvelogik for udkald pr. område:
 *   grå     = ingen kørsel
 *   orange  = kun VIP
 *   blå     = HØJ + VIP
 *   rød     = LAV + HØJ + VIP
 *   grøn    = alle pladser (standard + LAV + HØJ + VIP)
 */
export const calloutColorEnum = ["grå", "orange", "blå", "rød", "grøn"] as const;
export type CalloutColor = (typeof calloutColorEnum)[number];

export const calloutAreaStatusesTable = pgTable("callout_area_statuses", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id")
    .notNull()
    .references(() => calloutsTable.id, { onDelete: "cascade" }),
  areaId: uuid("area_id")
    .notNull()
    .references(() => areasTable.id, { onDelete: "cascade" }),
  color: text("color").notNull().default("grå"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCalloutAreaStatusSchema = createInsertSchema(calloutAreaStatusesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalloutAreaStatus = z.infer<typeof insertCalloutAreaStatusSchema>;
export type CalloutAreaStatus = typeof calloutAreaStatusesTable.$inferSelect;
