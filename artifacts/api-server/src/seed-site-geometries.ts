import { db, siteGeometriesTable, siteMarkersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === "," && !inQuotes) { result.push(current); current = ""; }
    else { current += ch; }
  }
  result.push(current);
  return result.map(s => s.trim().replace(/^"|"$/g, ""));
}

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

function thinCoords(coords: [number, number][], maxPoints = 40): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const result: [number, number][] = [];
  for (let i = 0; i < coords.length; i += step) result.push(coords[i]);
  const last = coords[coords.length - 1];
  if (result[result.length - 1] !== last) result.push(last);
  return result;
}

function parseCoords(coordStr: string): [number, number][] | null {
  if (!coordStr?.trim()) return null;
  const pairs = coordStr.trim().split(" ").filter(Boolean);
  const coords = pairs.map(pair => {
    const parts = pair.split(",");
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lng)) return null;
    return [lng, lat] as [number, number];
  }).filter((c): c is [number, number] => c !== null);
  return coords.length >= 2 ? coords : null;
}

async function main() {
  console.log("Loading site markers to build title → siteId map...");
  const markers = await db.select().from(siteMarkersTable);
  const labelToSiteId: Record<string, string> = {};
  for (const m of markers) {
    if (m.label) labelToSiteId[m.label] = m.siteId;
  }
  console.log(`Got ${markers.length} markers`);

  const csvPath = path.resolve(__dirname, "../../../attached_assets/FhGXF1RVtY_-_Pladser_1773829820438.csv");
  console.log("Reading Pladser.csv from:", csvPath);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const pladser = parseCSV(raw);
  console.log(`Parsed ${pladser.length} rows from Pladser.csv`);

  type GeoRow = { siteId: string; geojson: object; source: string };
  const geoRows: GeoRow[] = [];

  for (const row of pladser) {
    const title = row["SM Group"];
    const siteId = labelToSiteId[title];
    if (!siteId) continue;

    const rawCoords = parseCoords(row["SM Coordinates"]);
    if (!rawCoords || rawCoords.length < 2) continue;

    const coords = thinCoords(rawCoords, 40);
    const smType = row["SM Type"];

    let geojson: object;
    if (smType === "Polygon" && coords.length >= 4) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      const ring = (first[0] === last[0] && first[1] === last[1])
        ? coords : [...coords, first];
      geojson = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } };
    } else {
      geojson = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } };
    }

    geoRows.push({ siteId, geojson, source: "import-csv" });
  }

  console.log(`Building ${geoRows.length} geometry rows...`);

  const BATCH = 30;
  let count = 0;
  for (let i = 0; i < geoRows.length; i += BATCH) {
    const batch = geoRows.slice(i, i + BATCH);
    await db.insert(siteGeometriesTable).values(batch);
    count += batch.length;
    if (count % 150 === 0 || i + BATCH >= geoRows.length) {
      console.log(`  Inserted ${count}/${geoRows.length}`);
    }
  }

  console.log(`✓ Done! Inserted ${count} site geometries.`);
  process.exit(0);
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
