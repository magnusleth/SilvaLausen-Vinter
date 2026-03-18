import { pgTable, text, timestamp, uuid, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const importFileTypeEnum = ["geojson", "csv", "shapefile", "kml", "andet"] as const;
export type ImportFileType = (typeof importFileTypeEnum)[number];

export const importStatusEnum = ["afventer", "behandlet", "fejlet"] as const;
export type ImportStatus = (typeof importStatusEnum)[number];

export const importsTable = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  filename: text("filename").notNull(),
  fileType: text("file_type").notNull(),
  status: text("status").notNull().default("afventer"),
  importedBy: text("imported_by"),
  rowCount: integer("row_count"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImportSchema = createInsertSchema(importsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertImport = z.infer<typeof insertImportSchema>;
export type Import = typeof importsTable.$inferSelect;
