import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calloutsTable } from "./callouts";

export const smsStatusEnum = ["afventer", "afsendt", "leveret", "fejlet"] as const;
export type SmsStatus = (typeof smsStatusEnum)[number];

export const smsMessagesTable = pgTable("sms_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  calloutId: uuid("callout_id").references(() => calloutsTable.id, { onDelete: "set null" }),
  recipientPhone: text("recipient_phone").notNull(),
  recipientName: text("recipient_name"),
  message: text("message").notNull(),
  status: text("status").notNull().default("afventer"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSmsMessageSchema = createInsertSchema(smsMessagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsMessage = z.infer<typeof insertSmsMessageSchema>;
export type SmsMessage = typeof smsMessagesTable.$inferSelect;
