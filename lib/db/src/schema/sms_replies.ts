import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { smsMessagesTable } from "./sms_messages";

export const smsRepliesTable = pgTable("sms_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  smsMessageId: uuid("sms_message_id").references(() => smsMessagesTable.id, { onDelete: "set null" }),
  senderPhone: text("sender_phone").notNull(),
  message: text("message").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSmsReplySchema = createInsertSchema(smsRepliesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSmsReply = z.infer<typeof insertSmsReplySchema>;
export type SmsReply = typeof smsRepliesTable.$inferSelect;
