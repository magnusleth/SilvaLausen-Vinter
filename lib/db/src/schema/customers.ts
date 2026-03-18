import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { parentCustomersTable } from "./parent_customers";

export const customersTable = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentCustomerId: uuid("parent_customer_id").references(() => parentCustomersTable.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  cvr: text("cvr"),
  address: text("address"),
  contactPerson: text("contact_person"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
