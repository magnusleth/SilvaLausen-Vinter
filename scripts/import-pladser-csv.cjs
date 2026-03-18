#!/usr/bin/env node
/**
 * Import all Pladser CSV files from SMAPS exports.
 * 
 * TWO things this script does:
 * 1. Updates site_markers with exact SMAPS GPS coordinates (replaces DAWA approximations)
 * 2. Updates site_geometries colors using smaps_id matching
 *
 * Handles two CSV formats:
 * - Format A: SM Type,SM Group,SM Title,SM Desc,SM Latitude,SM Longitude,SM Coordinates,smapsID,...
 *             (herning, horsens, lemvig, vejlebilund, viborg, brande, esbjerg, fredekolding)
 * - Format B: SM Group,SM Title,SM Desc,SM Type,Line Color,Fill Color,SM Latitude,SM Longitude,...
 *             (Holstebrodrift CSVs: DSB, Gunnar, Holstebro, Struer, Vinderup)
 */
const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const { Pool } = require(PG_PATH);
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ASSETS = path.join(__dirname, '../attached_assets');

// Color → geom_type mapping
const COLOR_TYPE = {
  '#1F49FF': 'stitraktor',
  '#2F46E1': 'stitraktor',
  '#FFB124': 'saltspreder',
  '#EB0920': 'haandarbejde',
  '#00B016': 'urea',
  '#26A928': 'urea',
  '#00B018': 'urea',
};

// Normalize level names
const LEVEL_MAP = {
  'vip': 'vip', 'VIP': 'vip',
  'høj': 'hoj', 'Høj': 'hoj', 'HOJ': 'hoj', 'HØJ': 'hoj',
  'lav': 'lav', 'Lav': 'lav', 'LAV': 'lav',
  'basis': 'basis', 'Basis': 'basis',
  'spare': null, 'Spare': null,
  'udkald på bestilling': null, 'Udkald på bestilling': null,
  'skat': null,
};

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g,''));
  return lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; }
      else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    vals.push(cur.trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || '').replace(/^"|"$/g,'').trim(); });
    return row;
  });
}

function detectFormat(headers) {
  // Format B has 'Line Color' as explicit early column
  if (headers.includes('Line Color') && headers[3] === 'SM Type') return 'B';
  return 'A';
}

function normalizeRow(row, fmt) {
  if (fmt === 'B') {
    return {
      smType: row['SM Type'],
      smapsId: row['smapsID'] || row['smapsId'],
      lat: parseFloat(row['SM Latitude']) || null,
      lng: parseFloat(row['SM Longitude']) || null,
      coordinates: row['SM Coordinates'] || '',
      lineColor: (row['Line Color'] || '').toUpperCase() === row['Line Color'] ? row['Line Color'] : row['Line Color'],
      smGroup: row['SM Group'],
      smTitle: row['SM Title'],
    };
  }
  // Format A
  return {
    smType: row['SM Type'],
    smapsId: row['smapsID'] || row['smapsId'],
    lat: parseFloat(row['SM Latitude']) || null,
    lng: parseFloat(row['SM Longitude']) || null,
    coordinates: row['SM Coordinates'] || '',
    lineColor: row['Line Color'] || null,
    smGroup: row['SM Group'],
    smTitle: row['SM Title'],
    // Site-specific fields (Format A markers only)
    pladsNavn: row['Plads navn'] || row['SM Title'] || '',
    adresse: row['Adresse'] || '',
    postnr: (row['post nr'] || row['Postnr'] || '').replace(/\D/g,''),
    by: row['By'] || '',
    niveau: row['Niveau'] || row['SM Group'] || '',
  };
}

// Convert "lat,lng lat,lng ..." coordinate string to GeoJSON geometry
function parseCoordinates(smType, coordStr) {
  if (!coordStr || !coordStr.includes(',')) return null;
  const pairs = coordStr.trim().split(/\s+/).map(p => {
    const [latStr, lngStr] = p.split(',');
    return [parseFloat(lngStr), parseFloat(latStr)]; // GeoJSON: [lng, lat]
  }).filter(p => !isNaN(p[0]) && !isNaN(p[1]));
  if (pairs.length < 2) return null;

  if (smType === 'Polygon' || smType === 'Plads') {
    // Close polygon if needed
    const first = pairs[0], last = pairs[pairs.length-1];
    if (first[0] !== last[0] || first[1] !== last[1]) pairs.push([...first]);
    if (pairs.length < 4) return null;
    return { type: 'Polygon', coordinates: [pairs] };
  }
  return { type: 'LineString', coordinates: pairs };
}

// Find centroid of geometry
function centroid(geometry) {
  if (!geometry) return null;
  let coords = [];
  if (geometry.type === 'LineString') coords = geometry.coordinates;
  else if (geometry.type === 'Polygon') coords = geometry.coordinates[0];
  else return null;
  if (!coords.length) return null;
  return { lat: coords.reduce((s,c) => s+c[1], 0)/coords.length, lng: coords.reduce((s,c) => s+c[0], 0)/coords.length };
}

async function main() {
  console.log('=== Import Pladser CSV files ===\n');

  // Load all current site markers for proximity matching
  const { rows: allMarkers } = await pool.query(`
    SELECT sm.site_id, sm.lat, sm.lng, s.name, s.postal_code, s.address, a.name AS area_name
    FROM site_markers sm JOIN sites s ON s.id=sm.site_id JOIN areas a ON a.id=s.area_id
  `);
  const markerMap = new Map(); // site_id → marker
  for (const m of allMarkers) markerMap.set(m.site_id, m);

  // Index by name+postalCode for fast lookup
  const byNamePostal = new Map();
  for (const m of allMarkers) {
    const key = (m.name||'').toLowerCase().trim() + '|' + (m.postal_code||'');
    if (!byNamePostal.has(key)) byNamePostal.set(key, []);
    byNamePostal.get(key).push(m);
  }
  const byAddressPostal = new Map();
  for (const m of allMarkers) {
    const key = (m.address||'').toLowerCase().trim() + '|' + (m.postal_code||'');
    if (!byAddressPostal.has(key)) byAddressPostal.set(key, []);
    byAddressPostal.get(key).push(m);
  }

  // Load all current geometry smaps_ids
  const { rows: existingGeo } = await pool.query('SELECT id, site_id, smaps_id, geom_type, color FROM site_geometries WHERE smaps_id IS NOT NULL');
  const geoBySmapsId = new Map();
  for (const g of existingGeo) geoBySmapsId.set(g.smaps_id, g);
  console.log(`Loaded ${allMarkers.length} markers, ${existingGeo.length} geometries with smaps_id\n`);

  // Find nearest site to lat/lng within threshold
  function nearestSite(lat, lng, threshold = 0.003) {
    let best = null, bestDist = Infinity;
    for (const m of allMarkers) {
      const d = Math.hypot(m.lat - lat, m.lng - lng);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    return bestDist < threshold ? best : null;
  }

  // CSV files to process (skip SilkeborgRanders which is already correct)
  const csvFiles = fs.readdirSync(ASSETS)
    .filter(f => f.endsWith('.csv') && !f.startsWith('FhGXF1RVtY') && !f.startsWith('P10ZBgvIk7'));

  let totalMarkerUpdates = 0, totalColorUpdates = 0, totalNewGeo = 0, totalFailed = 0;

  for (const file of csvFiles) {
    let content;
    try { content = fs.readFileSync(path.join(ASSETS, file), 'utf-8'); }
    catch { continue; }

    const rows = parseCSV(content);
    if (!rows.length) continue;

    const headers = Object.keys(rows[0]);
    const fmt = detectFormat(headers);

    let fileMarkers = 0, fileColors = 0, fileNewGeo = 0, fileFailed = 0;

    for (const rawRow of rows) {
      const row = normalizeRow(rawRow, fmt);
      if (!row.smType || !row.smapsId) continue;

      // ── Marker rows: update GPS coordinates ──
      if (row.smType === 'Marker') {
        if (!row.lat || !row.lng || !row.lat || row.lat === 56.414704) continue; // skip admin markers
        if (!row.smapsId) continue;

        // Try to find site by exact coordinate proximity (< 30m)
        const nearest = nearestSite(row.lat, row.lng, 0.0005);
        if (nearest) {
          await pool.query(
            'UPDATE site_markers SET lat=$1,lng=$2,updated_at=NOW() WHERE site_id=$3',
            [row.lat, row.lng, nearest.site_id]
          );
          // Update the in-memory record too
          const m = markerMap.get(nearest.site_id);
          if (m) { m.lat = row.lat; m.lng = row.lng; }
          fileMarkers++;
        } else {
          // Try to find by larger radius and match on address+postnr
          if (fmt === 'A' && row.postnr && row.adresse) {
            const key = row.adresse.toLowerCase().trim() + '|' + row.postnr;
            const candidates = byAddressPostal.get(key);
            if (candidates && candidates.length === 1) {
              await pool.query(
                'UPDATE site_markers SET lat=$1,lng=$2,updated_at=NOW() WHERE site_id=$3',
                [row.lat, row.lng, candidates[0].site_id]
              );
              fileMarkers++;
            }
          }
        }
        continue;
      }

      // ── Geometry rows: update colors ──
      const lineColor = row.lineColor;
      if (!lineColor) continue;

      const colorUpper = lineColor.toUpperCase();
      const geomType = COLOR_TYPE[lineColor] || COLOR_TYPE[colorUpper] || 'ukendt';
      const color = lineColor.startsWith('#') ? lineColor : '#8119E6';

      // If smaps_id exists in DB → update color
      if (row.smapsId && geoBySmapsId.has(row.smapsId)) {
        const geo = geoBySmapsId.get(row.smapsId);
        if (geo.geom_type !== geomType || geo.color !== color) {
          await pool.query(
            'UPDATE site_geometries SET geom_type=$1,color=$2,updated_at=NOW() WHERE id=$3',
            [geomType, color, geo.id]
          );
          fileColors++;
        }
        continue;
      }

      // smaps_id not in DB → parse geometry and insert
      const geometry = parseCoordinates(row.smType, row.coordinates);
      if (!geometry) { fileFailed++; continue; }

      const ctr = centroid(geometry);
      if (!ctr) { fileFailed++; continue; }

      // Find nearest site
      const site = nearestSite(ctr.lat, ctr.lng, 0.015);
      if (!site) { fileFailed++; continue; }

      // Check if already inserted with this smaps_id
      const { rows: ex } = await pool.query('SELECT id FROM site_geometries WHERE smaps_id=$1 LIMIT 1', [row.smapsId || null]);
      if (ex.length > 0) continue;

      await pool.query(
        `INSERT INTO site_geometries(id,site_id,geojson,source,geom_type,color,smaps_id,created_at,updated_at)
         VALUES(gen_random_uuid(),$1,$2,'import-csv',$3,$4,$5,NOW(),NOW())`,
        [site.site_id, JSON.stringify({ type: geometry.type, coordinates: geometry.coordinates }), geomType, color, row.smapsId || null]
      );
      if (row.smapsId) geoBySmapsId.set(row.smapsId, { id: 'new', site_id: site.site_id, geom_type: geomType, color });
      fileNewGeo++;
    }

    if (fileMarkers + fileColors + fileNewGeo + fileFailed > 0) {
      console.log(`${file}: markers=${fileMarkers} colorUpdates=${fileColors} newGeo=${fileNewGeo} failed=${fileFailed}`);
    }
    totalMarkerUpdates += fileMarkers;
    totalColorUpdates += fileColors;
    totalNewGeo += fileNewGeo;
    totalFailed += fileFailed;
  }

  console.log(`\n══════ RAPPORT ══════`);
  console.log(`Markør-koordinater opdateret: ${totalMarkerUpdates}`);
  console.log(`Geometrifarver opdateret: ${totalColorUpdates}`);
  console.log(`Nye geometrier indsat: ${totalNewGeo}`);
  console.log(`Fejlede/matchede ikke: ${totalFailed}`);

  // Final color distribution
  const { rows: colorDist } = await pool.query(
    'SELECT geom_type, color, COUNT(*) cnt FROM site_geometries GROUP BY geom_type,color ORDER BY cnt DESC'
  );
  console.log('\nFarvefordeling i site_geometries:');
  colorDist.forEach(r => console.log(`  ${r.geom_type} (${r.color}): ${r.cnt}`));

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
