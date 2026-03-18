import { pgTable, timestamp, uuid, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gpsTracksTable } from "./gps_tracks";

export const gpsPointsTable = pgTable("gps_points", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackId: uuid("track_id")
    .notNull()
    .references(() => gpsTracksTable.id, { onDelete: "cascade" }),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  accuracy: doublePrecision("accuracy"),
  heading: doublePrecision("heading"),
  speed: doublePrecision("speed"),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGpsPointSchema = createInsertSchema(gpsPointsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpsPoint = z.infer<typeof insertGpsPointSchema>;
export type GpsPoint = typeof gpsPointsTable.$inferSelect;
