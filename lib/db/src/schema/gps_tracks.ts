import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { jobsTable } from "./jobs";
import { peopleTable } from "./people";
import { vehiclesTable } from "./vehicles";

export const gpsTracksTable = pgTable("gps_tracks", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobsTable.id, { onDelete: "set null" }),
  personId: uuid("person_id").references(() => peopleTable.id, { onDelete: "set null" }),
  vehicleId: uuid("vehicle_id").references(() => vehiclesTable.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGpsTrackSchema = createInsertSchema(gpsTracksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGpsTrack = z.infer<typeof insertGpsTrackSchema>;
export type GpsTrack = typeof gpsTracksTable.$inferSelect;
