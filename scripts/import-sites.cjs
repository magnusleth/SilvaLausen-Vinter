#!/usr/bin/env node
const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const { Pool } = require(PG_PATH);
const fs = require('fs');
const path = require('path');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const assets = path.join(__dirname, '../attached_assets');

function parseCSV(text) {
  const lines = text.split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    row.push(cur.trim());
    result.push(row);
  }
  return result;
}
function csvToObjects(rows) {
  const [headers, ...data] = rows;
  return data.map(r => { const o = {}; headers.forEach((h,i) => o[h]=(r[i]||'').trim()); return o; });
}
function mapNiveau(n) {
  return {'VIP':'vip','Høj':'hoj','Lav':'lav','Spare':'basis','Udkald på bestilling':'basis'}[n] || 'basis';
}
function mapDage(d) { return d === 'KunHverdage' ? 'hverdage' : 'altid'; }
function colorToGeomType(hex) {
  const h = (hex||'').toUpperCase();
  if (h==='#1F49FF'||h==='#2F46E1') return 'stitraktor';
  if (h==='#EB0920') return 'haandarbejde';
  if (h==='#FFB124') return 'saltspreder';
  if (h==='#00B016'||h==='#26A928') return 'urea';
  return 'ukendt';
}

async function main() {
  // 1. Load existing DB sites
  const { rows: dbSites } = await pool.query('SELECT id, name FROM sites');
  const siteByName = new Map(dbSites.map(s => [s.name.trim().toLowerCase(), s]));

  // 2. Load List CSV - enrich sites, build title → siteId map
  const listRows = csvToObjects(parseCSV(fs.readFileSync(
    path.join(assets,'FhGXF1RVtY_-_List29_10-2025_1773829820437.csv'),'utf-8'
  ))).filter(r => r['SM Type']==='Marker' && r['Niveau']);
  console.log(`List CSV: ${listRows.length} markers`);

  const titleToSiteId = new Map();
  let enriched=0, notFound=[];

  for (const row of listRows) {
    const title = (row['title']||row['SM Title']||'').trim();
    const pladsNavn = (row['Plads navn']||'').trim();
    const site = siteByName.get(pladsNavn.toLowerCase()) || siteByName.get(title.toLowerCase());
    if (site) {
      titleToSiteId.set(title, site.id);
      const postalCode = row['post nr']||null;
      const by = row['By']||null;
      const kode = row['KodeNøgle']!=='0' ? row['KodeNøgle']||null : null;
      const stroe = row['Strømiddel']!=='0' ? row['Strømiddel']||null : null;
      const app = row['App']!=='0' ? row['App']||null : null;
      const stor = row['Storkunde']||null;
      const smaps = row['smapsID']||null;
      const active = row['Status']==='Aktiv'||row['Status']==='NyAktiv';
      await pool.query(
        `UPDATE sites SET postal_code=$1,city=$2,code_key=$3,ice_control=$4,app=$5,big_customer=$6,smaps_id=$7,level=$8,day_rule=$9,active=$10,updated_at=NOW() WHERE id=$11`,
        [postalCode,by,kode,stroe,app,stor,smaps,mapNiveau(row['Niveau']),mapDage(row['Dage']),active,site.id]
      );
      const lat=parseFloat(row['SM Latitude']), lng=parseFloat(row['SM Longitude']);
      if (!isNaN(lat)&&!isNaN(lng)) {
        const {rows:ex} = await pool.query('SELECT id FROM site_markers WHERE site_id=$1 LIMIT 1',[site.id]);
        if (ex.length>0) await pool.query('UPDATE site_markers SET lat=$1,lng=$2,updated_at=NOW() WHERE site_id=$3',[lat,lng,site.id]);
        else await pool.query('INSERT INTO site_markers(id,site_id,lat,lng,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,NOW(),NOW())',[site.id,lat,lng]);
      }
      enriched++;
    } else {
      notFound.push({title,pladsNavn});
    }
  }
  console.log(`Enriched: ${enriched}  Not matched: ${notFound.length}`);
  if (notFound.length) console.log('Not found sample:', JSON.stringify(notFound.slice(0,3)));

  // 3. Load Pladser CSV → smapsID → {color, geomType, siteTitle}
  const pladsRows = csvToObjects(parseCSV(fs.readFileSync(
    path.join(assets,'FhGXF1RVtY_-_Pladser_1773829820438.csv'),'utf-8'
  )));
  const smapsInfo = new Map();
  for (const r of pladsRows) {
    const id=r['smapsID']; if (!id) continue;
    smapsInfo.set(id,{color:r['Line Color']||'',geomType:colorToGeomType(r['Line Color']||''),siteTitle:(r['SM Group']||r['SM Group 4']||'').trim()});
  }
  console.log(`Pladser CSV: ${smapsInfo.size} features indexed`);

  // 4. Re-import geometries from SilkeborgRanders GeoJSON
  const gj = JSON.parse(fs.readFileSync(path.join(assets,'Pladser_SilkeborgRanders_1773829820439.geojson'),'utf-8'));
  const {rowCount:deleted} = await pool.query('DELETE FROM site_geometries');
  console.log(`Deleted ${deleted} old geometries`);

  let ins=0,skipSite=0,skipInfo=0;
  for (const feat of gj.features) {
    const sid=feat.id;
    if (!sid||!feat.geometry){skipInfo++;continue;}
    const info=smapsInfo.get(sid);
    if (!info){skipInfo++;continue;}
    const dbSiteId=titleToSiteId.get(info.siteTitle);
    if (!dbSiteId){skipSite++;continue;}
    await pool.query(
      `INSERT INTO site_geometries(id,site_id,geojson,source,geom_type,color,smaps_id,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,'import-geojson',$3,$4,$5,NOW(),NOW())`,
      [dbSiteId,JSON.stringify({type:feat.geometry.type,coordinates:feat.geometry.coordinates}),info.geomType,info.color,sid]
    );
    ins++;
  }
  console.log(`Inserted: ${ins}  skip(no site): ${skipSite}  skip(no info): ${skipInfo}`);

  // 5. Report
  const [sCnt,mCnt,gCnt,cColors,lCounts,wGeom,sample] = await Promise.all([
    pool.query("SELECT COUNT(*) cnt FROM sites WHERE smaps_id IS NOT NULL"),
    pool.query("SELECT COUNT(*) cnt FROM site_markers"),
    pool.query("SELECT COUNT(*) cnt FROM site_geometries"),
    pool.query("SELECT geom_type,color,COUNT(*) cnt FROM site_geometries GROUP BY geom_type,color ORDER BY cnt DESC"),
    pool.query("SELECT level,COUNT(*) cnt FROM sites GROUP BY level ORDER BY cnt DESC"),
    pool.query("SELECT COUNT(DISTINCT site_id) cnt FROM site_geometries"),
    pool.query("SELECT name,postal_code,city,level,code_key,ice_control,big_customer FROM sites WHERE postal_code IS NOT NULL LIMIT 3"),
  ]);
  console.log('\n──── DATAKVALITETSRAPPORT ────');
  console.log(`A. Kilder: List CSV (149 sites) + Pladser CSV + Pladser_SilkeborgRanders.geojson`);
  console.log(`B. Sites beriget: ${sCnt.rows[0].cnt} / ${dbSites.length}`);
  console.log(`C. Site markers (koordinater): ${mCnt.rows[0].cnt}`);
  console.log(`D. Sites med geometri: ${wGeom.rows[0].cnt}`);
  console.log(`E. Total geometrier: ${gCnt.rows[0].cnt}`);
  console.log('   Typer:'); cColors.rows.forEach(r=>console.log(`     ${r.geom_type}(${r.color}): ${r.cnt}`));
  console.log('F. Niveau:'); lCounts.rows.forEach(r=>console.log(`     ${r.level}: ${r.cnt}`));
  console.log('Eksempel sites:'); sample.rows.forEach(s=>console.log(' ',JSON.stringify(s)));
  await pool.end();
}
main().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
