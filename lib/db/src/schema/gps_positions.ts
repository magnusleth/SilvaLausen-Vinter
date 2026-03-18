import { pgTable, text, timestamp, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { driversTable } from "./drivers";

export const gpsPositionsTable = pgTable("gps_positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  driverId: uuid("driver_id")
    .notNull()
    .references(() => driversTable.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  heading: doublePrecision("heading"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGpsPositionSchema = createInsertSchema(gpsPositionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpsPosition = z.infer<typeof insertGpsPositionSchema>;
export type GpsPosition = typeof gpsPositionsTable.$inferSelect;
