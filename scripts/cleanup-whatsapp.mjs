#!/usr/bin/env node
/**
 * Čištění/archivace starých WhatsApp zpráv (#23).
 *
 * Smaže (nebo jen ukáže) zprávy ve stavu 'imported' / 'ignored', které jsou
 * starší než N dní. Importované objednávky zůstávají nedotčené — mažou se jen
 * zprávy (audit kontroly čtení u zprávy se tím ztratí).
 *
 * Použití:
 *   node scripts/cleanup-whatsapp.mjs                # smazat starší než 90 dní
 *   node scripts/cleanup-whatsapp.mjs --days 30      # jiné stáří
 *   node scripts/cleanup-whatsapp.mjs --dry-run      # jen výpis, nic nesmazat
 *   node scripts/cleanup-whatsapp.mjs --yes          # bez potvrzení
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = readFileSync(resolve('.env'), 'utf8');
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
if (!SU || !SRK) {
  console.error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

const daysIdx = process.argv.indexOf('--days');
const DAYS = daysIdx >= 0 ? parseInt(process.argv[daysIdx + 1], 10) || 90 : 90;
const DRY_RUN = process.argv.includes('--dry-run');
const YES = process.argv.includes('--yes');

const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

const cutoff = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

const q = new URLSearchParams({
  select: 'id,sender_name,created_at,status',
  status: 'in.("imported","ignored")',
  created_at: `lt.${cutoff}`,
  order: 'created_at.desc',
  limit: '1000',
});

const res = await fetch(`${SU}/rest/v1/whatsapp_incoming?${q}`, { headers: h });
if (!res.ok) {
  console.error('Chyba dotazu:', res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();

console.log(`Zpráv starších než ${DAYS} dní ve stavu imported/ignored: ${rows.length}`);

if (rows.length > 0 && !DRY_RUN && !YES) {
  console.log(`Smazat? (spusť znovu s --yes) — nebo použij --dry-run pro náhled.`);
  process.exit(0);
}

let deleted = 0;
for (const row of rows) {
  const label = `${row.created_at.slice(0, 10)} ${row.status.padEnd(8)} ${row.sender_name} (${row.id.slice(0, 8)})`;
  if (DRY_RUN) {
    console.log(`  [dry-run] ${label}`);
    continue;
  }
  const d = await fetch(`${SU}/rest/v1/whatsapp_incoming?id=eq.${row.id}`, {
    method: 'DELETE',
    headers: h,
  });
  if (d.ok) {
    deleted++;
    console.log(`  smazáno ${label}`);
  } else {
    console.error(`  chyba u ${row.id}: ${d.status}`);
  }
}

console.log(DRY_RUN
  ? `Dry-run dokončen — ${rows.length} zpráv by se smazalo.`
  : `Hotovo: smazáno ${deleted}/${rows.length} zpráv.`);
