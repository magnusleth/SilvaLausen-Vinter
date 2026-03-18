#!/usr/bin/env node
/**
 * VinterDrift — Fuld import fra Excel (UDKALDSARK 2025/2026)
 * Importerer alle sites fra Pladser-arket, geocoder nye markører, importerer GeoJSON geometrier.
 */

const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const XLSX_PATH = '/home/runner/workspace/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx';
const { Pool } = require(PG_PATH);
const xlsx = require(XLSX_PATH);
const fs = require('fs');
const path = require('path');
const https = require('https');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ASSETS = path.join(__dirname, '../attached_assets');

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapNiveau(n) {
  const m = { 'VIP': 'vip', 'Høj': 'hoj', 'Høj ': 'hoj', 'Lav': 'lav', 'Spare': 'basis', 'Udkald på bestilling': 'basis' };
  return m[String(n).trim()] || 'basis';
}

function mapDage(d) {
  return String(d).trim() === 'KunHverdage' ? 'hverdage' : 'altid';
}

function mapStatus(s) {
  return s === 'Aktiv' || s === 'NyAktiv';
}

// Normalize vejrområde → DB area name
function normalizeArea(vejr) {
  if (!vejr) return null;
  const v = String(vejr).trim()
    .replace(/^Banen\s+/i, '')
    .replace(/^VD\s+.*/i, '')
    .replace(/^Vd\s+.*/i, '')
    .replace(/^DSBGis$/i, null)
    .replace(/^Ingen schribbel$/i, null)
    .replace(/^Administativ$/i, null)
    .replace(/^(blank)$/i, null);
  if (!v || v === 'null') return null;
  // Lowercase → title case for lookup
  return v.charAt(0).toUpperCase() + v.slice(1).toLowerCase().replace(/ø/g,'ø').replace(/æ/g,'æ').replace(/å/g,'å');
}

// Compute polygon/linestring centroid
function computeCentroid(geometry) {
  if (!geometry) return null;
  let coords = [];
  if (geometry.type === 'Point') return { lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
  if (geometry.type === 'LineString') coords = geometry.coordinates;
  else if (geometry.type === 'Polygon') coords = geometry.coordinates[0];
  else if (geometry.type === 'MultiPolygon') coords = geometry.coordinates[0][0];
  else if (geometry.type === 'MultiLineString') coords = geometry.coordinates[0];
  else return null;
  if (!coords.length) return null;
  const avgLng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
  const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
  return { lat: avgLat, lng: avgLng };
}

// Nominatim geocoding (rate limited, 1 req/s max)
function geocode(address, postalCode, city) {
  return new Promise((resolve) => {
    const q = encodeURIComponent([address, postalCode, city, 'Danmark'].filter(Boolean).join(', '));
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=dk`;
    const opts = {
      headers: { 'User-Agent': 'VinterDrift/1.0 (driftstyring)' }
    };
    let buf = '';
    const req = https.get(url, opts, (res) => {
      res.on('data', d => buf += d);
      res.on('end', () => {
        try {
          const results = JSON.parse(buf);
          if (results[0]) resolve({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Color → geom type
function colorToGeomType(hex) {
  const h = (hex || '').toUpperCase().trim();
  if (h === '#1F49FF' || h === '#2F46E1' || h === '#1F49FE') return 'stitraktor';
  if (h === '#EB0920') return 'haandarbejde';
  if (h === '#FFB124') return 'saltspreder';
  if (h === '#00B016' || h === '#26A928') return 'urea';
  return 'ukendt';
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== VinterDrift Fuld Import ===\n');

  // 1. Load DB areas → name → id map
  const { rows: dbAreas } = await pool.query('SELECT id, name FROM areas');
  const areaByName = new Map(dbAreas.map(a => [a.name.trim().toLowerCase(), a.id]));
  console.log(`Loaded ${dbAreas.length} areas from DB`);

  // 2. Parse Excel Pladser sheet
  console.log('\nParsing Excel (Pladser sheet)...');
  const wb = xlsx.readFile(
    path.join(ASSETS, 'UDKALDSARK_2025_2026macro1_1773838307901.xlsm'),
    { bookVBA: false, sheets: ['Pladser'], sheetStubs: false }
  );
  const ws = wb.Sheets['Pladser'];
  const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', range: 0 });
  const headers = rawRows[1]; // Row index 1 = column headers
  const dataRows = rawRows.slice(2).filter(r => {
    const status = String(r[0] || '').trim();
    return status !== '' && status !== 'Udgår'; // skip empty and discontinued
  });
  console.log(`Excel: ${dataRows.length} rows (excluding Udgår)`);

  // Column indices (from analysis)
  const COL = {
    status: 0, niveau: 1, dage: 2, vejrOmraade: 3, pladsNavn: 4,
    storkunde: 7, kortOmraade: 9, scribbelNr: 10,
    adresse: 11, postnr: 12, by: 13,
    kodeNoegle: 41, app: 44, stroemiddel: 45,
  };

  // 3. Load existing sites for upsert
  const { rows: existingSites } = await pool.query('SELECT id, name FROM sites');
  const siteByName = new Map(existingSites.map(s => [s.name.trim().toLowerCase(), s.id]));
  console.log(`Existing sites in DB: ${existingSites.length}`);

  // 4. Upsert all sites from Excel
  console.log('\nUpserting sites from Excel...');
  let inserted = 0, updated = 0, skipped = 0;
  const allSiteIds = new Map(); // pladsNavn.lower → site_id (for geometry matching later)

  for (const row of dataRows) {
    const pladsNavn = String(row[COL.pladsNavn] || '').trim();
    if (!pladsNavn || pladsNavn === 'Pladser') { skipped++; continue; }

    const status = String(row[COL.status] || '').trim();
    const active = mapStatus(status);
    const niveau = mapNiveau(row[COL.niveau]);
    const dage = mapDage(row[COL.dage]);
    const vejr = String(row[COL.vejrOmraade] || '').trim();
    const adresse = String(row[COL.adresse] || '').trim() || null;
    const postnr = row[COL.postnr] ? String(row[COL.postnr]).trim() : null;
    const by = String(row[COL.by] || '').trim() || null;
    const storkunde = String(row[COL.storkunde] || '').trim() || null;
    const scribbelNr = row[COL.scribbelNr] ? parseInt(String(row[COL.scribbelNr])) : null;
    const kode = String(row[COL.kodeNoegle] || '').trim();
    const kodeVal = kode && kode !== '0' ? kode : null;
    const app = String(row[COL.app] || '').trim();
    const appVal = app && app !== '0' ? app : null;
    const stroe = String(row[COL.stroemiddel] || '').trim();
    const stroeVal = stroe && stroe !== '0' ? stroe : null;

    // Resolve area_id from Vejrområde
    const areaName = normalizeArea(vejr);
    let areaId = areaName ? (areaByName.get(areaName.toLowerCase()) || null) : null;
    // Fallback: try the kortOmraade compound name split
    if (!areaId && row[COL.kortOmraade]) {
      const ko = String(row[COL.kortOmraade]).trim();
      for (const [name, id] of areaByName) {
        if (ko.toLowerCase().includes(name.toLowerCase())) { areaId = id; break; }
      }
    }

    const existingId = siteByName.get(pladsNavn.toLowerCase());
    let siteId;

    if (existingId) {
      // Update existing
      await pool.query(
        `UPDATE sites SET
          address=$1, postal_code=$2, city=$3, level=$4, day_rule=$5, active=$6,
          code_key=$7, ice_control=$8, app=$9, big_customer=$10,
          area_id=COALESCE($11, area_id),
          updated_at=NOW()
        WHERE id=$12`,
        [adresse, postnr, by, niveau, dage, active, kodeVal, stroeVal, appVal, storkunde, areaId, existingId]
      );
      siteId = existingId;
      updated++;
    } else {
      // Insert new
      const { rows: [newSite] } = await pool.query(
        `INSERT INTO sites(id, area_id, name, address, postal_code, city, level, day_rule, active, code_key, ice_control, app, big_customer, created_at, updated_at)
        VALUES(gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
        RETURNING id`,
        [areaId, pladsNavn, adresse, postnr, by, niveau, dage, active, kodeVal, stroeVal, appVal, storkunde]
      );
      siteId = newSite.id;
      siteByName.set(pladsNavn.toLowerCase(), siteId);
      inserted++;
    }
    allSiteIds.set(pladsNavn.toLowerCase(), siteId);
  }
  console.log(`  Inserted: ${inserted}  Updated: ${updated}  Skipped: ${skipped}`);

  // 5. Geocode new sites (those without markers) using Nominatim
  console.log('\nChecking for sites needing geocoding...');
  const { rows: existingMarkers } = await pool.query('SELECT site_id FROM site_markers');
  const markerSet = new Set(existingMarkers.map(m => m.site_id));

  // Get all sites without markers
  const { rows: sitesNeedingGeo } = await pool.query(
    `SELECT s.id, s.name, s.address, s.postal_code, s.city
     FROM sites s
     LEFT JOIN site_markers sm ON sm.site_id = s.id
     WHERE sm.site_id IS NULL
     ORDER BY s.name`
  );
  console.log(`Sites needing geocoding: ${sitesNeedingGeo.length}`);

  let geocoded = 0, geoFailed = 0;
  const geoFailures = [];

  for (let i = 0; i < sitesNeedingGeo.length; i++) {
    const site = sitesNeedingGeo[i];
    if (i % 50 === 0) console.log(`  Geocoding ${i+1}/${sitesNeedingGeo.length}...`);

    await sleep(1100); // Nominatim rate limit: 1 req/s
    const coords = await geocode(site.address, site.postal_code, site.city);

    if (coords) {
      await pool.query(
        `INSERT INTO site_markers(id, site_id, lat, lng, created_at, updated_at)
         VALUES(gen_random_uuid(), $1, $2, $3, NOW(), NOW())
         ON CONFLICT (site_id) DO UPDATE SET lat=$2, lng=$3, updated_at=NOW()`,
        [site.id, coords.lat, coords.lng]
      );
      geocoded++;
    } else {
      geoFailed++;
      geoFailures.push({ name: site.name, address: site.address, postalCode: site.postal_code, city: site.city });
    }
  }
  console.log(`  Geocoded: ${geocoded}  Failed: ${geoFailed}`);
  if (geoFailures.length > 0) {
    console.log(`  Failed sites (first 10):`, JSON.stringify(geoFailures.slice(0, 10), null, 2));
  }

  // 6. Import new GeoJSON files — match by area + proximity
  console.log('\nImporting new GeoJSON geometry files...');

  // Load Pladser CSV for color info (existing)
  let smapsColorMap = new Map(); // featureId → {color, geomType}
  try {
    const fs2 = require('fs');
    const csvText = fs2.readFileSync(path.join(ASSETS, 'FhGXF1RVtY_-_Pladser_1773829820438.csv'), 'utf-8');
    const lines = csvText.split('\n').filter(l => l.trim());
    const [hdrLine, ...dataLines] = lines;
    // Simple CSV parse
    function parseLine(line) {
      const cells = []; let cur = '', inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cells.push(cur.trim());
      return cells;
    }
    const hdrs = parseLine(hdrLine);
    for (const dl of dataLines) {
      const cells = parseLine(dl);
      const obj = {};
      hdrs.forEach((h, i) => obj[h] = cells[i] || '');
      const id = obj['smapsID'];
      if (id) smapsColorMap.set(id, { color: obj['Line Color'] || '#888888', geomType: colorToGeomType(obj['Line Color']) });
    }
    console.log(`  Loaded ${smapsColorMap.size} color entries from Pladser CSV`);
  } catch (e) {
    console.log(`  No Pladser CSV color info: ${e.message}`);
  }

  // Get all site markers for proximity matching
  const { rows: allMarkers } = await pool.query(
    `SELECT sm.site_id, sm.lat, sm.lng, s.name, s.area_id
     FROM site_markers sm JOIN sites s ON s.id = sm.site_id`
  );

  // Find nearest site to a centroid (within same area if possible)
  function nearestSite(centroid, areaFilter) {
    if (!centroid || !allMarkers.length) return null;
    let best = null, bestDist = Infinity;
    for (const m of allMarkers) {
      if (areaFilter && m.area_id !== areaFilter) continue;
      const dlat = m.lat - centroid.lat;
      const dlng = m.lng - centroid.lng;
      const dist = Math.sqrt(dlat * dlat + dlng * dlng);
      if (dist < bestDist) { bestDist = dist; best = m; }
    }
    // Only match if within ~500m (0.005 degrees ≈ 550m)
    return bestDist < 0.005 ? best : null;
  }

  // Which GeoJSON files to import (newest version of each unique name)
  const geoJsonFiles = fs.readdirSync(ASSETS)
    .filter(f => f.endsWith('.geojson'))
    .filter(f => !f.startsWith('Farver') && !f.startsWith('Udkald') && !f.includes('Callout'));

  // Pick newest file per unique base name
  const filesByBase = new Map();
  for (const f of geoJsonFiles) {
    const base = f.replace(/_\d+\.geojson$/, '');
    const ts = parseInt(f.match(/_(\d+)\.geojson$/)?.[1] || '0');
    if (!filesByBase.has(base) || ts > filesByBase.get(base).ts) {
      filesByBase.set(base, { file: f, ts });
    }
  }

  // Skip already-imported SilkeborgRanders (already in DB)
  const skipFiles = new Set(['Pladser_SilkeborgRanders']);

  // Area name → id lookup by file name prefix
  const fileAreaMap = {
    'Viborg': 'Viborg', 'viborg': 'Viborg',
    'Kolding': 'Kolding', 'fredericia': 'Fredericia',
    'holstebro': 'Holstebro', 'horsens': 'Horsens',
    'vejlebillund': 'Vejle', 'Ringkøbing': 'Ringkøbing',
    'Skive': 'Skive', 'struer': 'Struer',
    'thisted': 'Thisted', 'lemvig': 'Lemvig',
    'esbjerg': 'Esbjerg', 'varde': 'Varde',
    'varde_kasserne': 'Varde', 'RyogOmegn': 'Brande',
    'BrandeAulum': 'Brande', 'skjerntarm': 'Skjern',
    'hurupagger': 'Hurup', 'vinderup': 'Vinderup',
    'dsbruteholstebro': 'Holstebro', 'dsbrutenherning': 'Herning',
    'gunnar': null, 'crossbridge': null, 'ibogkaj': null,
    'jonas': null, 'kjærbyg': null, 'pillgaard': null,
  };

  let geoInserted = 0, geoSkipped = 0;
  // We'll re-import all geometries to avoid duplicates
  // But keep SilkeborgRanders geometries intact
  // Delete only geometries from non-SilkeborgRanders sites
  const { rows: silkSites } = await pool.query(
    `SELECT DISTINCT sg.site_id FROM site_geometries sg
     JOIN sites s ON s.id = sg.site_id
     JOIN areas a ON a.id = s.area_id
     WHERE a.name IN ('Silkeborg','Randers')`
  );
  // We do NOT delete - we'll upsert by smaps_id to avoid duplicates
  // Track already-imported feature IDs
  const { rows: existingGeoFeats } = await pool.query('SELECT smaps_id FROM site_geometries WHERE smaps_id IS NOT NULL');
  const importedFeatIds = new Set(existingGeoFeats.map(r => r.smaps_id));

  for (const [baseName, { file }] of filesByBase) {
    if (skipFiles.has(baseName)) { console.log(`  Skipping ${baseName} (already imported)`); continue; }

    let gj;
    try {
      gj = JSON.parse(fs.readFileSync(path.join(ASSETS, file), 'utf-8'));
    } catch (e) { console.log(`  Error reading ${file}: ${e.message}`); continue; }

    if (!gj.features || gj.features.length === 0) { console.log(`  ${baseName}: empty`); continue; }

    const areaNameForFile = fileAreaMap[baseName];
    const areaId = areaNameForFile ? areaByName.get(areaNameForFile.toLowerCase()) : null;

    let fileInserted = 0, fileSkipped = 0;
    for (const feat of gj.features) {
      const featId = feat.id;
      if (!feat.geometry) { fileSkipped++; continue; }
      if (importedFeatIds.has(featId)) { fileSkipped++; continue; }

      // Get color from CSV map or default to ukendt
      const colorInfo = smapsColorMap.get(featId) || { color: '#888888', geomType: 'ukendt' };

      // Compute centroid for proximity matching
      const centroid = computeCentroid(feat.geometry);
      const nearest = centroid ? nearestSite(centroid, areaId) : null;
      const siteId = nearest?.site_id || null;

      if (!siteId) { fileSkipped++; continue; }

      await pool.query(
        `INSERT INTO site_geometries(id, site_id, geojson, source, geom_type, color, smaps_id, created_at, updated_at)
         VALUES(gen_random_uuid(), $1, $2, 'import-geojson', $3, $4, $5, NOW(), NOW())`,
        [siteId, JSON.stringify({ type: feat.geometry.type, coordinates: feat.geometry.coordinates }), colorInfo.geomType, colorInfo.color, featId]
      );
      importedFeatIds.add(featId);
      fileInserted++;
      geoInserted++;
    }
    console.log(`  ${baseName}: ${gj.features.length} features → inserted=${fileInserted} skipped=${fileSkipped}`);
    geoSkipped += fileSkipped;
  }

  // 7. Final report
  console.log('\n══════ DATAKVALITETSRAPPORT ══════');
  const [totalSites, totalMarkers, totalGeo, sitesWithGeo, sitesWithMarker, byLevel, byArea] = await Promise.all([
    pool.query('SELECT COUNT(*) cnt FROM sites'),
    pool.query('SELECT COUNT(*) cnt FROM site_markers'),
    pool.query('SELECT COUNT(*) cnt FROM site_geometries'),
    pool.query('SELECT COUNT(DISTINCT site_id) cnt FROM site_geometries'),
    pool.query('SELECT COUNT(*) cnt FROM site_markers'),
    pool.query('SELECT level, COUNT(*) cnt FROM sites GROUP BY level ORDER BY cnt DESC'),
    pool.query('SELECT a.name, COUNT(s.id) cnt FROM areas a LEFT JOIN sites s ON s.area_id=a.id GROUP BY a.name ORDER BY cnt DESC'),
  ]);

  console.log(`A. Sites i DB total:        ${totalSites.rows[0].cnt}`);
  console.log(`B. Sites med markør:        ${totalMarkers.rows[0].cnt}`);
  console.log(`C. Sites med geometri:      ${sitesWithGeo.rows[0].cnt}`);
  console.log(`D. Geometri-features total: ${totalGeo.rows[0].cnt}`);
  console.log(`E. Niveau fordeling:`);
  byLevel.rows.forEach(r => console.log(`   ${r.level}: ${r.cnt}`));
  console.log(`F. Sites per område (top 10):`);
  byArea.rows.slice(0, 10).forEach(r => console.log(`   ${r.name}: ${r.cnt}`));

  // 5 example sites with full popup data
  const { rows: examples } = await pool.query(`
    SELECT s.name, s.address, s.postal_code, s.city, s.level, s.code_key, s.ice_control, s.app, s.big_customer, s.day_rule,
           COUNT(sg.id) AS geom_count,
           (SELECT COUNT(*) FROM site_markers sm WHERE sm.site_id=s.id) AS has_marker
    FROM sites s
    LEFT JOIN site_geometries sg ON sg.site_id=s.id
    WHERE s.postal_code IS NOT NULL AND s.big_customer IS NOT NULL
    GROUP BY s.id
    ORDER BY geom_count DESC
    LIMIT 5
  `);
  console.log('\nG. 5 eksempel-sites med fuld popup-data:');
  examples.forEach(e => console.log(`  ${e.name} | ${e.address}, ${e.postal_code} ${e.city} | ${e.level} | kode:${e.code_key||'-'} | strø:${e.ice_control||'-'} | app:${e.app||'-'} | stork:${e.big_customer||'-'} | dage:${e.day_rule} | geo:${e.geom_count} | markør:${e.has_marker}`));

  console.log(`\nGeometri import: inserted=${geoInserted} skipped=${geoSkipped}`);
  console.log(`Geocoding: geocoded=${geocoded} failed=${geoFailed}`);
  if (geoFailures.length > 0) {
    console.log('\nH. Sites uden koordinater (første 20):');
    geoFailures.slice(0, 20).forEach(f => console.log(`  ${f.name} | ${f.address}, ${f.postalCode} ${f.city}`));
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
