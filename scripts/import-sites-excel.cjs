#!/usr/bin/env node
/**
 * Import alle sites fra Excel Pladser-arket (linje 1–939)
 * - Sætter from_excel = true for alle importerede sites
 * - Gemmer ALLE 74 kolonner i excel_data JSONB
 * - Kernefelter gemmes som rigtige DB-kolonner
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
function mapActive(status) {
  const s = String(status).trim();
  return s === 'Aktiv' || s === 'NyAktiv';
}

const VEJR_MAP = {
  'aars': 'Aalborg',
  'aarhus': null,
  'randbøl': 'Vejle',
  'randboel': 'Vejle',
};
function normalizeVejr(vejr) {
  if (!vejr) return null;
  let v = String(vejr).trim();
  if (VEJR_MAP[v.toLowerCase()] !== undefined) return VEJR_MAP[v.toLowerCase()];
  v = v.replace(/^Banen\s+/i, '').replace(/^VD\s+cykelsti\s+\S+\s+\S+\s*/i, '').replace(/^VD\s+ras\s+\S+\s*/i, '').replace(/^Vd\s+cykelsti\s+\S+\s*/i, '');
  const skip = ['ingen schribbel', 'dsbgis', 'administativ', 'pladser', ''];
  if (skip.includes(v.toLowerCase())) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

// Hjælpefunktion: konverter rå celleværdi til streng eller null
function str(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return s === '' || s === '0' ? null : s;
}
// Tal eller null
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Alle 74 kolonner fra arket — kolonneindeks → nøgle
const COL_KEYS = [
  'status',           // 0
  'niveau',           // 1
  'kunHverdage',      // 2
  'vejrOmraade',      // 3
  'pladsNavn',        // 4
  'vaNrKunde',        // 5
  'kunde',            // 6
  'storkunde',        // 7
  'gennemgaaet2025',  // 8
  'kortOmraade',      // 9
  'scribbelNr',       // 10
  'adresse',          // 11
  'postnr',           // 12
  'by',               // 13
  'ansvarlig1',       // 14
  'ansvarlig2',       // 15
  'afregningsmodel',  // 16
  'timepris',         // 17
  'ueTimepris',       // 18
  'provision',        // 19
  'agent',            // 20
  'saltTillaeg',      // 21
  'saltningInclSalt', // 22
  'stroeUE',          // 23
  'stroeAva',         // 24
  'snerydningInclSaltning', // 25
  'kombiUE',          // 26
  'kombiAvance',      // 27
  'prisOK',           // 28
  'uePrisOk',         // 29
  'stroePrM2',        // 30
  'kombiPrM2',        // 31
  'ueStroPrM2',       // 32
  'ueKombiPrM2',      // 33
  'fastprisSnevagten',// 34
  'stroepris',        // 35
  'kombipris',        // 36
  'stroeture',        // 37
  'sneture',          // 38
  'egneBemaerkninger',// 39
  'bemaerkninger',    // 40
  'kodeNoegle',       // 41
  'ejendomskontakt',  // 42
  'kort',             // 43
  'app',              // 44
  'stroemiddel',      // 45
  'pladsArealM2',     // 46
  'stiLaengdeM',      // 47
  'haandLaengdeM',    // 48
  'ureaArealM2',      // 49
  'arealIAlt',        // 50
  'molokker',         // 51
  'svalegange',       // 52
  'trapper',          // 53
  'saltforbrugV20g',  // 54
  'ureaforbrugV20g',  // 55
  'pladssalterRute',  // 56
  'stiRute',          // 57
  'haandRute',        // 58
  'snetraktorrute',   // 59
  'ekstraHoej',       // 60
  'pladsTidSalt',     // 61
  'stiTidSalt',       // 62
  'haandTidSalt',     // 63
  'pladsTidKombi',    // 64
  'stiTidKombi',      // 65
  'haandTidKombi',    // 66
  'snetraktorTidKombi',// 67
  'email',            // 68
  'beregnetStroe',    // 69
  'beregnetKombi',    // 70
  'beregnetStroePrM2',// 71
  'beregnetKombiPrM2',// 72
  'snevagtkontrol',   // 73
];

function buildExcelData(row) {
  const obj = {};
  for (let i = 0; i < COL_KEYS.length; i++) {
    const raw = row[i];
    if (raw === null || raw === undefined || raw === '') continue;
    const s = String(raw).trim();
    if (s === '') continue;
    // Forsøg at parse tal; ellers bevar som streng
    const n = Number(raw);
    obj[COL_KEYS[i]] = !isNaN(n) && raw !== '' ? n : s;
  }
  return obj;
}

async function main() {
  console.log('=== Import Sites fra Excel (Pladser linje 1–939) med alle 74 kolonner ===\n');

  const { rows: dbAreas } = await pool.query('SELECT id, name FROM areas');
  const areaByName = new Map(dbAreas.map(a => [a.name.trim().toLowerCase(), a.id]));
  console.log(`DB areas: ${dbAreas.length}`);

  console.log('Parsing Excel...');
  const wb = xlsx.readFile(
    path.join(ASSETS, 'UDKALDSARK_2025_2026macro1_1773836369486.xlsm'),
    { bookVBA: false, sheets: ['Pladser'], sheetStubs: false, dense: true }
  );
  const ws = wb.Sheets['Pladser'];
  const rawRows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', range: 0 });

  const TABLE_END = 939;
  const tableRows = rawRows.slice(0, TABLE_END);
  const dataRows  = tableRows.slice(2);

  console.log(`Excel-ark total rækker: ${rawRows.length}`);
  console.log(`Tabelområde (linje 1–939): ${tableRows.length} rækker`);
  console.log(`Datarækker (linje 3–939): ${dataRows.length}`);
  console.log(`Rækker ignoreret efter linje 939: ${rawRows.length - TABLE_END}`);

  const COL = { status:0, niveau:1, dage:2, vejr:3, naam:4, vaKunde:5, kunde:6,
    storkunde:7, kortOmr:9, scribbelNr:10, adresse:11, postnr:12, by:13,
    kode:41, app:44, stroe:45 };

  const statusCounts = {};
  for (const row of dataRows) {
    const s = String(row[COL.status] || '').trim() || '(blank)';
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log('\nStatus-fordeling i tabelområdet:');
  Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // Load eksisterende sites
  const { rows: existing } = await pool.query('SELECT id, name FROM sites');
  const byName = new Map(existing.map(s => [s.name.trim().toLowerCase(), s.id]));
  console.log(`\nEksisterende sites i DB: ${existing.length}`);

  let ins = 0, upd = 0, skip = 0;

  for (const row of dataRows) {
    const naam = String(row[COL.naam] || '').trim();
    if (!naam || naam === 'PladsNavn') { skip++; continue; }

    const rawStatus   = String(row[COL.status] || '').trim();
    const active      = mapActive(rawStatus);
    const niveau      = mapNiveau(row[COL.niveau]);
    const dage        = mapDage(row[COL.dage]);
    const adresse     = str(row[COL.adresse]);
    const postnr      = row[COL.postnr] ? String(row[COL.postnr]).trim() || null : null;
    const by          = str(row[COL.by]);
    const storkunde   = String(row[COL.storkunde] || '').trim();
    const storkundeVal = storkunde && storkunde !== '0' && storkunde !== 'Ingen' ? storkunde : null;
    const kode        = String(row[COL.kode] || '').trim();
    const kodeVal     = kode && kode !== '0' ? kode : null;
    const app         = String(row[COL.app] || '').trim();
    const appVal      = app && app !== '0' ? app : null;
    const stroe       = String(row[COL.stroe] || '').trim();
    const stroeVal    = stroe && stroe !== '0' ? stroe : null;
    const vaKunde     = row[COL.vaKunde] ? String(row[COL.vaKunde]).trim() : null;
    const vaKundeVal  = vaKunde && vaKunde !== '0' ? vaKunde : null;
    const kundeStr    = String(row[COL.kunde] || '').trim();
    const kundeVal    = kundeStr && kundeStr !== '0' ? kundeStr : null;
    const scribbelNr  = row[COL.scribbelNr] ? String(row[COL.scribbelNr]).trim() : null;
    const smapsIdVal  = scribbelNr && scribbelNr !== '0' ? scribbelNr : null;

    const vejr     = String(row[COL.vejr] || '').trim();
    const areaName = normalizeVejr(vejr);
    let areaId     = areaName ? areaByName.get(areaName.toLowerCase()) : null;

    if (!areaId) {
      const ko = String(row[COL.kortOmr] || '').trim().toLowerCase();
      for (const [name, id] of areaByName) {
        if (ko.includes(name)) { areaId = id; break; }
      }
    }

    // Byg excel_data med ALLE 74 kolonner
    const excelData = buildExcelData(row);

    const existId = byName.get(naam.toLowerCase());

    if (existId) {
      await pool.query(
        `UPDATE sites SET
          address=$1, postal_code=$2, city=$3,
          level=$4, day_rule=$5, active=$6, excel_status=$7,
          code_key=$8, ice_control=$9, app=$10, big_customer=$11,
          area_id=COALESCE($12, area_id),
          va_kunde=$13, kunde=$14, smaps_id=$15,
          from_excel=true, excel_data=$16,
          updated_at=NOW()
         WHERE id=$17`,
        [adresse, postnr, by, niveau, dage, active, rawStatus || null,
         kodeVal, stroeVal, appVal, storkundeVal,
         areaId || null, vaKundeVal, kundeVal, smapsIdVal,
         JSON.stringify(excelData), existId]
      );
      upd++;
    } else {
      const { rows: [r] } = await pool.query(
        `INSERT INTO sites(id,area_id,name,address,postal_code,city,level,day_rule,active,excel_status,
          code_key,ice_control,app,big_customer,va_kunde,kunde,smaps_id,from_excel,excel_data,created_at,updated_at)
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,$17,NOW(),NOW()) RETURNING id`,
        [areaId || null, naam, adresse, postnr, by, niveau, dage, active, rawStatus || null,
         kodeVal, stroeVal, appVal, storkundeVal, vaKundeVal, kundeVal, smapsIdVal,
         JSON.stringify(excelData)]
      );
      byName.set(naam.toLowerCase(), r.id);
      ins++;
    }
  }

  console.log(`\nResultat: inserted=${ins}  updated=${upd}  skipped=${skip}`);
  console.log(`Total importerede rækker: ${ins + upd}`);

  const [tot, byStatus, byLvl, missingArea, fromExcelCount, notFromExcel] = await Promise.all([
    pool.query('SELECT COUNT(*) cnt FROM sites'),
    pool.query(`SELECT excel_status, COUNT(*) cnt FROM sites WHERE from_excel=true GROUP BY excel_status ORDER BY cnt DESC`),
    pool.query(`SELECT level, COUNT(*) cnt FROM sites WHERE from_excel=true GROUP BY level ORDER BY cnt DESC`),
    pool.query(`SELECT COUNT(*) cnt FROM sites WHERE area_id IS NULL AND from_excel=true`),
    pool.query(`SELECT COUNT(*) cnt FROM sites WHERE from_excel=true`),
    pool.query(`SELECT id, name, level FROM sites WHERE from_excel=false ORDER BY name`),
  ]);

  console.log(`\nTotal sites i DB: ${tot.rows[0].cnt}`);
  console.log(`Sites fra Excel (from_excel=true): ${fromExcelCount.rows[0].cnt}`);
  console.log(`Sites IKKE fra Excel (from_excel=false): ${notFromExcel.rows.length}`);
  notFromExcel.rows.forEach(r => console.log(`  - ${r.name} (${r.level})`));
  console.log(`Excel-sites uden område (area_id IS NULL): ${missingArea.rows[0].cnt}`);
  console.log('\nStatus-fordeling (kun Excel-sites):');
  byStatus.rows.forEach(r => console.log(`  ${r.excel_status || '(blank)'}: ${r.cnt}`));
  console.log('Niveau-fordeling:', byLvl.rows.map(r => `${r.level}:${r.cnt}`).join(', '));

  await pool.end();
  console.log('\nFærdig.');
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });
