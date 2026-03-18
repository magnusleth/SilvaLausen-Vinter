import { pgTable, text, timestamp, uuid, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";
import { areasTable } from "./areas";
import { companiesTable } from "./companies";

export const saltOrderStatusEnum = ["bestilt", "leveret", "annulleret"] as const;
export type SaltOrderStatus = (typeof saltOrderStatusEnum)[number];

export const saltOrdersTable = pgTable("salt_orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id").references(() => calloutsTable.id, { onDelete: "set null" }),
  areaId: uuid("area_id").references(() => areasTable.id, { onDelete: "set null" }),
  supplierCompanyId: uuid("supplier_company_id").references(() => companiesTable.id, {
    onDelete: "set null",
  }),
  quantityKg: integer("quantity_kg").notNull(),
  unitPriceOre: integer("unit_price_ore"),
  status: text("status").notNull().default("bestilt"),
  notes: text("notes"),
  orderedAt: timestamp("ordered_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSaltOrderSchema = createInsertSchema(saltOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSaltOrder = z.infer<typeof insertSaltOrderSchema>;
export type SaltOrder = typeof saltOrdersTable.$inferSelect;
