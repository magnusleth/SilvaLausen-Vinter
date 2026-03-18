import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const personRoleEnum = ["chauffør", "disponent", "leder", "andet"] as const;
export type PersonRole = (typeof personRoleEnum)[number];

/**
 * People repræsenterer driftspersonale: chauffører, disponenter, ledere og UE-folk.
 * De tilhører altid et firma (company_id). De er IKKE kundedata.
 * Kundekontakter modelleres som customers.contact_person (tekst) i MVP.
 */
export const peopleTable = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id")
    .notNull()
    .references(() => companiesTable.id, { onDelete: "restrict" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  role: text("role").notNull().default("chauffør"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPersonSchema = createInsertSchema(peopleTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof peopleTable.$inferSelect;
