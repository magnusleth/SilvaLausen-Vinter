import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";
import { peopleTable } from "./people";
import { vehiclesTable } from "./vehicles";

export const notificationMethodEnum = ["sms", "app", "telefon", "email"] as const;
export type NotificationMethod = (typeof notificationMethodEnum)[number];

/**
 * MVP: Modtagere af udkald er altid personer (people).
 * SMS sendes til person.phone.
 * vehicle_id er valgfrit kontekst: angiver hvilket køretøj personen kører med under dette udkald.
 * Companies er ikke direkte SMS-modtagere i v1 — de håndteres via deres tilknyttede people.
 */
export const calloutRecipientsTable = pgTable("callout_recipients", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id")
    .notNull()
    .references(() => calloutsTable.id, { onDelete: "cascade" }),
  personId: uuid("person_id")
    .notNull()
    .references(() => peopleTable.id, { onDelete: "restrict" }),
  vehicleId: uuid("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  notificationMethod: text("notification_method").notNull().default("sms"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCalloutRecipientSchema = createInsertSchema(calloutRecipientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCalloutRecipient = z.infer<typeof insertCalloutRecipientSchema>;
export type CalloutRecipient = typeof calloutRecipientsTable.$inferSelect;
