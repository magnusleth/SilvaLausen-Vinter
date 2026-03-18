import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const parentCustomersTable = pgTable("parent_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  cvr: text("cvr"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertParentCustomerSchema = createInsertSchema(parentCustomersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertParentCustomer = z.infer<typeof insertParentCustomerSchema>;
export type ParentCustomer = typeof parentCustomersTable.$inferSelect;
