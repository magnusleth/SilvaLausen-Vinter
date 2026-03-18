#!/usr/bin/env node
/**
 * Geocode sites without markers using DAWA (Danmarks Adresser)
 * Much faster than Nominatim, no strict rate limit for DK addresses.
 */
const PG_PATH = '/home/runner/workspace/node_modules/.pnpm/pg@8.20.0/node_modules/pg';
const { Pool } = require(PG_PATH);
const https = require('https');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function dawaGeocode(address, postalCode, city) {
  return new Promise((resolve) => {
    // Combine address with postal code and city for best match
    const parts = [address, postalCode, city].filter(Boolean);
    const q = encodeURIComponent(parts.join(', '));
    const url = `https://api.dataforsyningen.dk/adresser?q=${q}&format=json&per_side=1`;
    const opts = { headers: { 'User-Agent': 'VinterDrift/1.0' } };
    let buf = '';
    const req = https.get(url, opts, (res) => {
      res.on('data', d => buf += d);
      res.on('end', () => {
        try {
          const r = JSON.parse(buf);
          const coords = r[0]?.adgangsadresse?.vejpunkt?.koordinater
                      || r[0]?.adgangsadresse?.adgangspunkt?.koordinater;
          if (coords) resolve({ lng: coords[0], lat: coords[1] });
          else {
            // Fallback: search by postal code centroid
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

function dawaPostalCode(postalCode) {
  return new Promise((resolve) => {
    const url = `https://api.dataforsyningen.dk/postnumre/${postalCode}?format=json`;
    const opts = { headers: { 'User-Agent': 'VinterDrift/1.0' } };
    let buf = '';
    const req = https.get(url, opts, (res) => {
      res.on('data', d => buf += d);
      res.on('end', () => {
        try {
          const r = JSON.parse(buf);
          const vp = r?.visueltcenter;
          if (vp) resolve({ lng: vp[0], lat: vp[1] });
          else resolve(null);
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(5000, () => { req.destroy(); resolve(null); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== Geocode Sites (DAWA) ===\n');

  // Get all sites without markers
  const { rows: sites } = await pool.query(`
    SELECT s.id, s.name, s.address, s.postal_code, s.city
    FROM sites s
    LEFT JOIN site_markers sm ON sm.site_id = s.id
    WHERE sm.site_id IS NULL
    ORDER BY s.postal_code, s.address
  `);
  console.log(`Sites needing geocoding: ${sites.length}\n`);

  let geocoded = 0, postalFallback = 0, failed = 0;
  const failures = [];

  // Cache postal code centroids to avoid repeated lookups
  const postalCache = new Map();

  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    if (i % 100 === 0) process.stdout.write(`  Progress: ${i}/${sites.length} (geocoded=${geocoded} fallback=${postalFallback} failed=${failed})\n`);

    let coords = null;

    // Try DAWA with full address
    if (s.address && (s.postal_code || s.city)) {
      coords = await dawaGeocode(s.address, s.postal_code, s.city);
      await sleep(100); // Small delay to be polite
    }

    // Fallback: postal code centroid
    if (!coords && s.postal_code) {
      if (postalCache.has(s.postal_code)) {
        const cached = postalCache.get(s.postal_code);
        if (cached) { coords = cached; postalFallback++; }
      } else {
        const pc = await dawaPostalCode(s.postal_code);
        postalCache.set(s.postal_code, pc);
        if (pc) { coords = pc; postalFallback++; }
        await sleep(100);
      }
    }

    if (coords) {
      // Check if marker already exists (race condition protection)
      const { rows: ex } = await pool.query('SELECT id FROM site_markers WHERE site_id=$1 LIMIT 1', [s.id]);
      if (ex.length > 0) {
        await pool.query('UPDATE site_markers SET lat=$1,lng=$2,updated_at=NOW() WHERE site_id=$3', [coords.lat, coords.lng, s.id]);
      } else {
        await pool.query(
          'INSERT INTO site_markers(id,site_id,lat,lng,created_at,updated_at) VALUES(gen_random_uuid(),$1,$2,$3,NOW(),NOW())',
          [s.id, coords.lat, coords.lng]
        );
      }
      if (coords !== postalFallback) geocoded++;
    } else {
      failed++;
      failures.push({ name: s.name, address: s.address, postalCode: s.postal_code, city: s.city });
    }
  }

  const [total, withMarker] = await Promise.all([
    pool.query('SELECT COUNT(*) cnt FROM sites'),
    pool.query('SELECT COUNT(*) cnt FROM site_markers'),
  ]);

  console.log(`\n══════ GEOCODING RAPPORT ══════`);
  console.log(`Geocoded (exact): ${geocoded}`);
  console.log(`Geocoded (postal fallback): ${postalFallback}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total sites: ${total.rows[0].cnt}`);
  console.log(`Sites with marker: ${withMarker.rows[0].cnt}`);

  if (failures.length > 0) {
    console.log(`\nSites uden koordinater (${failures.length}):`);
    failures.forEach(f => console.log(`  ${f.name} | ${f.address || '-'}, ${f.postalCode || '-'} ${f.city || '-'}`));
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
