#!/usr/bin/env node
/**
 * Import GeoJSON geometry files for all areas (except already-imported SilkeborgRanders).
 * Matches features to sites via centroid proximity to site markers.
 * Note: color info only available for SilkeborgRanders (via Pladser CSV).
 * New area features imported as 'ukendt' color unless matched.
 */
const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const { Pool } = require(PG_PATH);
const fs = require('fs');
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ASSETS = path.join(__dirname, '../attached_assets');

function computeCentroid(geometry) {
  if (!geometry) return null;
  let coords = [];
  const t = geometry.type;
  if (t === 'Point') return { lat: geometry.coordinates[1], lng: geometry.coordinates[0] };
  if (t === 'LineString') coords = geometry.coordinates;
  else if (t === 'Polygon') coords = geometry.coordinates[0];
  else if (t === 'MultiPolygon') coords = geometry.coordinates[0][0];
  else if (t === 'MultiLineString') coords = geometry.coordinates[0];
  else return null;
  if (!coords.length) return null;
  return {
    lat: coords.reduce((s, c) => s + c[1], 0) / coords.length,
    lng: coords.reduce((s, c) => s + c[0], 0) / coords.length,
  };
}

// File name → area name (for restricting proximity search)
const FILE_AREA = {
  'Viborg':             'Viborg',
  'Kolding':            'Kolding',
  'fredericia':         'Fredericia',
  'holstebro':          'Holstebro',
  'horsens':            'Horsens',
  'vejlebillund':       'Vejle',
  'Ringkøbing':         'Ringkøbing',
  'Skive':              'Skive',
  'struer':             'Struer',
  'thisted':            'Thisted',
  'lemvig':             'Lemvig',
  'esbjerg':            'Esbjerg',
  'varde':              'Varde',
  'varde_kasserne':     'Varde',
  'RyogOmegn':          'Brande',
  'BrandeAulum':        'Brande',
  'skjerntarm':         'Skjern',
  'hurupagger':         'Hurup',
  'vinderup':           'Vinderup',
  'dsbruteholstebro':   'Holstebro',
  'dsbrutenherning':    'Herning',
  'gunnar':             null,
  'crossbridge':        null,
  'ibogkaj':            null,
  'jonas':              null,
  'kjærbyg':            null,
  'pillgaard':          null,
};

async function main() {
  console.log('=== Import GeoJSON Areas ===\n');

  // Load all site markers with area info
  const { rows: markers } = await pool.query(`
    SELECT sm.site_id, sm.lat, sm.lng, s.area_id, a.name AS area_name
    FROM site_markers sm
    JOIN sites s ON s.id = sm.site_id
    JOIN areas a ON a.id = s.area_id
  `);
  console.log(`Loaded ${markers.length} markers for proximity matching`);

  // Build area → markers lookup
  const markersByArea = new Map();
  for (const m of markers) {
    if (!markersByArea.has(m.area_name)) markersByArea.set(m.area_name, []);
    markersByArea.get(m.area_name).push(m);
  }

  // Find nearest site in area (or globally) to centroid
  function nearestSite(centroid, areaName) {
    if (!centroid) return null;
    const pool2 = areaName ? markersByArea.get(areaName) : null;
    const search = (pool2 && pool2.length > 0) ? pool2 : markers;
    let best = null, bestDist = Infinity;
    for (const m of search) {
      const d = Math.hypot(m.lat - centroid.lat, m.lng - centroid.lng);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    // Accept match within ~0.01 degrees (~1.1km) for area-restricted, ~0.005 (~550m) for global
    const threshold = (pool2 && pool2.length > 0) ? 0.015 : 0.005;
    return bestDist < threshold ? best : null;
  }

  // Load already-imported feature IDs
  const { rows: existFeat } = await pool.query('SELECT smaps_id FROM site_geometries WHERE smaps_id IS NOT NULL');
  const importedIds = new Set(existFeat.map(r => r.smaps_id));
  console.log(`Already imported: ${importedIds.size} feature IDs`);

  // Skip SilkeborgRanders (already imported with colors)
  const SKIP_BASES = new Set(['Pladser_SilkeborgRanders', 'Farver', 'Udkald_182']);

  // Get newest file per base name
  const geoFiles = fs.readdirSync(ASSETS).filter(f => f.endsWith('.geojson'));
  const byBase = new Map();
  for (const f of geoFiles) {
    const base = f.replace(/_\d+\.geojson$/, '');
    const ts = parseInt(f.match(/_(\d+)\.geojson$/)?.[1] || '0');
    if (!byBase.has(base) || ts > byBase.get(base).ts) byBase.set(base, { file: f, ts, base });
  }

  let totalIns = 0, totalSkip = 0, totalNoSite = 0;

  for (const [baseName, { file }] of byBase) {
    if (SKIP_BASES.has(baseName)) { console.log(`SKIP ${baseName}`); continue; }
    if (!(baseName in FILE_AREA)) { console.log(`UNKNOWN ${baseName} — skipping`); continue; }

    let gj;
    try { gj = JSON.parse(fs.readFileSync(path.join(ASSETS, file), 'utf-8')); }
    catch (e) { console.log(`ERROR reading ${file}: ${e.message}`); continue; }

    if (!gj.features || gj.features.length === 0) { console.log(`EMPTY ${baseName}`); continue; }

    const areaName = FILE_AREA[baseName];
    let fileIns = 0, fileSkip = 0, fileNoSite = 0;

    for (const feat of gj.features) {
      const featId = feat.id;
      if (!feat.geometry) { fileSkip++; continue; }
      if (featId && importedIds.has(featId)) { fileSkip++; continue; }

      const centroid = computeCentroid(feat.geometry);
      const match = nearestSite(centroid, areaName);

      if (!match) { fileNoSite++; continue; }

      // Insert geometry (color = ukendt since no Pladser CSV for these areas)
      await pool.query(
        `INSERT INTO site_geometries(id, site_id, geojson, source, geom_type, color, smaps_id, created_at, updated_at)
         VALUES(gen_random_uuid(), $1, $2, 'import-geojson', 'ukendt', '#8119E6', $3, NOW(), NOW())`,
        [match.site_id, JSON.stringify({ type: feat.geometry.type, coordinates: feat.geometry.coordinates }), featId || null]
      );
      if (featId) importedIds.add(featId);
      fileIns++;
    }

    const pct = Math.round(fileIns / gj.features.length * 100);
    console.log(`${baseName} (${areaName || 'global'}): ${gj.features.length} features → ins=${fileIns} noSite=${fileNoSite} dup=${fileSkip} (${pct}% matched)`);
    totalIns += fileIns;
    totalSkip += fileSkip;
    totalNoSite += fileNoSite;
  }

  console.log(`\nTotal: inserted=${totalIns} no-site=${totalNoSite} dup/skip=${totalSkip}`);

  // Final counts
  const [sitesWithGeo, totalGeo] = await Promise.all([
    pool.query('SELECT COUNT(DISTINCT site_id) cnt FROM site_geometries'),
    pool.query('SELECT COUNT(*) cnt FROM site_geometries'),
  ]);
  console.log(`Sites with geometry: ${sitesWithGeo.rows[0].cnt} / 885`);
  console.log(`Total geometry features: ${totalGeo.rows[0].cnt}`);

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
