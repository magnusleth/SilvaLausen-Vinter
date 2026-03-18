#!/usr/bin/env node
/**
 * Step 1: Import alle sites fra Excel Pladser-arket
 */
const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const XLSX_PATH = '/home/runner/workspace/node_modules/.pnpm/xlsx@0.18.5/node_modules/xlsx';
const { Pool } = require(PG_PATH);
const xlsx = require(XLSX_PATH);
const path = require('path');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const ASSETS = path.join(__dirname, '../attached_assets');

function mapNiveau(n) {
  const m = { 'VIP': 'vip', 'Høj': 'hoj', 'Høj ': 'hoj', 'Lav': 'lav', 'Spare': 'basis', 'Udkald på bestilling': 'basis' };
  return m[String(n).trim()] || 'basis';
}
function mapDage(d) { return String(d).trim() === 'KunHverdage' ? 'hverdage' : 'altid'; }
function mapStatus(s) { return s === 'Aktiv' || s === 'NyAktiv'; }

// Maps unusual Vejrområde values to known area names
const VEJR_MAP = {
  'aars': 'Aalborg',     // nearest area
  'aarhus': null,        // not in our area list — skip
  'randbøl': 'Vejle',    // geographically close
  'randboel': 'Vejle',
};

function normalizeVejr(vejr) {
  if (!vejr) return null;
  let v = String(vejr).trim();
  // Direct map first
  if (VEJR_MAP[v.toLowerCase()] !== undefined) return VEJR_MAP[v.toLowerCase()];
  // Strip prefixes
  v = v.replace(/^Banen\s+/i, '').replace(/^VD\s+cykelsti\s+\S+\s+\S+\s*/i, '').replace(/^VD\s+ras\s+\S+\s*/i, '').replace(/^Vd\s+cykelsti\s+\S+\s*/i, '');
  const skip = ['ingen schribbel', 'dsbgis', 'administativ', 'pladser', ''];
  if (skip.includes(v.toLowerCase())) return null;
  // Title-case first letter
  return v.charAt(0).toUpperCase() + v.slice(1);
}

async function main() {
  console.log('=== Import Sites fra Excel ===\n');

  // Load areas
  const { rows: dbAreas } = await pool.query('SELECT id, name FROM areas');
  const areaByName = new Map(dbAreas.map(a => [a.name.trim().toLowerCase(), a.id]));
  console.log(`DB areas: ${dbAreas.length}`);

  // Parse Excel
  console.log('Parsing Excel...');
  const wb = xlsx.readFile(
    path.join(ASSETS, 'UDKALDSARK_2025_2026macro1_1773838307901.xlsm'),
    { bookVBA: false, sheets: ['Pladser'], sheetStubs: false }
  );
  const ws = wb.Sheets['Pladser'];
  const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', range: 0 });
  const dataRows = rawRows.slice(2).filter(r => {
    const s = String(r[0] || '').trim();
    return s !== '' && s !== 'Udgår';
  });
  console.log(`Rows to import: ${dataRows.length}`);

  const COL = {
    status: 0, niveau: 1, dage: 2, vejr: 3, naam: 4,
    storkunde: 7, kortOmr: 9, scribbelNr: 10,
    adresse: 11, postnr: 12, by: 13,
    kode: 41, app: 44, stroe: 45,
  };

  // Load existing
  const { rows: existing } = await pool.query('SELECT id, name FROM sites');
  const byName = new Map(existing.map(s => [s.name.trim().toLowerCase(), s.id]));
  console.log(`Existing sites: ${existing.length}`);

  let ins = 0, upd = 0, skip = 0;
  const results = [];

  for (const row of dataRows) {
    const naam = String(row[COL.naam] || '').trim();
    if (!naam || naam === 'Pladser' || naam === 'PladsNavn') { skip++; continue; }

    const status = String(row[COL.status] || '').trim();
    const active = mapStatus(status);
    const niveau = mapNiveau(row[COL.niveau]);
    const dage = mapDage(row[COL.dage]);
    const adresse = String(row[COL.adresse] || '').trim() || null;
    const postnr = row[COL.postnr] ? String(row[COL.postnr]).trim() : null;
    const by = String(row[COL.by] || '').trim() || null;
    const storkunde = String(row[COL.storkunde] || '').trim() || null;
    const storkundeVal = storkunde && storkunde !== '0' && storkunde !== 'Ingen' ? storkunde : null;
    const kode = String(row[COL.kode] || '').trim();
    const kodeVal = kode && kode !== '0' ? kode : null;
    const app = String(row[COL.app] || '').trim();
    const appVal = app && app !== '0' ? app : null;
    const stroe = String(row[COL.stroe] || '').trim();
    const stroeVal = stroe && stroe !== '0' ? stroe : null;

    // Resolve area
    const vejr = String(row[COL.vejr] || '').trim();
    const areaName = normalizeVejr(vejr);
    let areaId = areaName ? areaByName.get(areaName.toLowerCase()) : null;

    // Fallback: match via KortOmråde
    if (!areaId) {
      const ko = String(row[COL.kortOmr] || '').trim().toLowerCase();
      for (const [name, id] of areaByName) {
        if (ko.includes(name)) { areaId = id; break; }
      }
    }

    // Skip if we still can't resolve area (schema requires NOT NULL)
    if (!areaId) {
      skip++;
      continue;
    }

    const existId = byName.get(naam.toLowerCase());
    let siteId;

    if (existId) {
      await pool.query(
        `UPDATE sites SET
          address=COALESCE($1,address), postal_code=COALESCE($2,postal_code), city=COALESCE($3,city),
          level=$4, day_rule=$5, active=$6,
          code_key=COALESCE($7,code_key), ice_control=COALESCE($8,ice_control),
          app=COALESCE($9,app), big_customer=COALESCE($10,big_customer),
          area_id=COALESCE($11,area_id), updated_at=NOW()
         WHERE id=$12`,
        [adresse, postnr, by, niveau, dage, active, kodeVal, stroeVal, appVal, storkundeVal, areaId, existId]
      );
      siteId = existId;
      upd++;
    } else {
      const { rows: [r] } = await pool.query(
        `INSERT INTO sites(id,area_id,name,address,postal_code,city,level,day_rule,active,code_key,ice_control,app,big_customer,created_at,updated_at)
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW()) RETURNING id`,
        [areaId, naam, adresse, postnr, by, niveau, dage, active, kodeVal, stroeVal, appVal, storkundeVal]
      );
      siteId = r.id;
      byName.set(naam.toLowerCase(), siteId);
      ins++;
    }
  }

  console.log(`\nResult: inserted=${ins}  updated=${upd}  skipped=${skip}`);

  // Report
  const [tot, byLvl, byArea, missingArea] = await Promise.all([
    pool.query('SELECT COUNT(*) cnt FROM sites'),
    pool.query('SELECT level, COUNT(*) cnt FROM sites GROUP BY level ORDER BY cnt DESC'),
    pool.query(`SELECT a.name, COUNT(s.id) cnt FROM areas a 
                LEFT JOIN sites s ON s.area_id=a.id 
                GROUP BY a.name ORDER BY cnt DESC`),
    pool.query(`SELECT COUNT(*) cnt FROM sites WHERE area_id IS NULL`),
  ]);

  console.log(`\nTotal sites in DB: ${tot.rows[0].cnt}`);
  console.log(`Sites without area: ${missingArea.rows[0].cnt}`);
  console.log('By level:', byLvl.rows.map(r => `${r.level}:${r.cnt}`).join(', '));
  console.log('By area:');
  byArea.rows.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));

  // Sample 5 sites with full data
  const { rows: sample } = await pool.query(`
    SELECT s.name, s.address, s.postal_code, s.city, s.level, s.code_key, s.ice_control, s.app, s.big_customer, s.day_rule, a.name AS area
    FROM sites s LEFT JOIN areas a ON a.id=s.area_id
    WHERE s.postal_code IS NOT NULL
    ORDER BY s.name LIMIT 10
  `);
  console.log('\nSample sites:');
  sample.forEach(s => console.log(`  [${s.area||'?'}] ${s.name} | ${s.address}, ${s.postal_code} ${s.city} | ${s.level} | strø:${s.ice_control||'-'} | app:${s.app||'-'} | stork:${s.big_customer||'-'}`));

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
