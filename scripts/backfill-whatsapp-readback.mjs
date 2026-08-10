#!/usr/bin/env node
/**
 * Backfill „Kontrola čtení" pro staré WhatsApp zprávy (#19).
 *
 * Starší zprávy (rozparsované před nasazením readback sloupce) nemají
 * readback_unmatched_count. Skript ho dopočítá LOKÁLNĚ (bez AI) stejným
 * algoritmem jako aplikace: pro každý parsed_items[].raw_line zkontroluje,
 * jestli se v normalizovaném message_text nachází. Počet nesouladů uloží.
 *
 * Nové zprávy to už dělá whatsapp-auto-parse sám při parsování.
 *
 * Použití:
 *   node scripts/backfill-whatsapp-readback.mjs             # dopočítat a uložit
 *   node scripts/backfill-whatsapp-readback.mjs --dry-run   # jen ukázat, nic neuložit
 *   node scripts/backfill-whatsapp-readback.mjs --limit 100 # omezit počet zpráv
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

const DRY_RUN = process.argv.includes('--dry-run');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 200 : 200;

const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

function normText(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9°]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countUnmatched(parsedItems, messageText) {
  const text = normText(messageText);
  if (!text || !Array.isArray(parsedItems)) return 0;
  return parsedItems.filter((item) => {
    const raw = normText(item?.raw_line);
    if (!raw || raw.length < 2) return false;
    return !text.includes(raw);
  }).length;
}

const q = new URLSearchParams({
  select: 'id,message_text,parsed_items,readback_unmatched_count',
  status: 'in.("parsed","imported","ignored")',
  readback_unmatched_count: 'is.null',
  order: 'created_at.desc',
  limit: String(LIMIT),
});

const res = await fetch(`${SU}/rest/v1/whatsapp_incoming?${q}`, { headers: h });
if (!res.ok) {
  console.error('Chyba dotazu:', res.status, await res.text());
  process.exit(1);
}
const rows = await res.json();
console.log(`Nalezeno ${rows.length} zpráv bez readback_unmatched_count (limit ${LIMIT}).`);

let updated = 0;
for (const row of rows) {
  const count = countUnmatched(row.parsed_items, row.message_text);
  if (DRY_RUN) {
    console.log(`  [dry-run] ${row.id.slice(0, 8)} → readback_unmatched_count = ${count}`);
    continue;
  }
  const u = await fetch(`${SU}/rest/v1/whatsapp_incoming?id=eq.${row.id}`, {
    method: 'PATCH',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({ readback_unmatched_count: count }),
  });
  if (u.ok) updated++;
  else console.error(`  Chyba u ${row.id}: ${u.status}`);
}

console.log(DRY_RUN
  ? 'Dry-run dokončen — nic se neukládalo.'
  : `Hotovo: aktualizováno ${updated}/${rows.length} zpráv.`);
