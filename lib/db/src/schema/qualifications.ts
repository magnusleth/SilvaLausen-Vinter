import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const qualificationsTable = pgTable("qualifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertQualificationSchema = createInsertSchema(qualificationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertQualification = z.infer<typeof insertQualificationSchema>;
export type Qualification = typeof qualificationsTable.$inferSelect;
