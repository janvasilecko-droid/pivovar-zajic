#!/usr/bin/env node
/**
 * Backfill doslovného přepisu AI (parsed_raw_text) pro staré WhatsApp zprávy.
 *
 * Starší zprávy rozparsované PŘED nasazením sloupce parsed_raw_text (migrace
 * „kontrola čtení“) mají uložené strukturované parsed_items, ale chybí jim
 * doslovný přepis textu od AI. Proto se v modálu „Kontrola WhatsApp
 * objednávky“ zobrazuje panel „Přepis AI (diff proti originálu)“ jen jako
 * zavádějící hláška o „rozparsované před nasazením kontroly čtení“.
 *
 * Skript pro každou takovou zprávu zavolá STEJNOU edge funkci parse-order-text
 * se stejným payloadem jako whatsapp-auto-parse (katalog piv/obalů + aliasy +
 * kontext chatu) a uloží jen parsed_raw_text. Stávající parsed_items,
 * odběratele, den atd. NEMĚNÍ — doplňuje jen chybějící přepis (minimální
 * zásah; plný re-parse je k dispozici ručně tlačítkem „Přečíst znovu (AI)“).
 *
 * Fotky (message_type != 'text') se přeskočí — AI je nepřepisuje, prázdný
 * parsed_raw_text je u nich LEGITIMNÍ (to už řeší upravený modál).
 *
 * Pozor: volá skutečné AI → stojí to peníze. Proto je default náhled (dry-run)
 * a zpracovává se až s --yes.
 *
 * Použití:
 *   node scripts/backfill-whatsapp-parsed-raw-text.mjs             # jen náhled (bez AI)
 *   node scripts/backfill-whatsapp-parsed-raw-text.mjs --yes       # doplnit přepisy
 *   node scripts/backfill-whatsapp-parsed-raw-text.mjs --yes --limit 50
 *   node scripts/backfill-whatsapp-parsed-raw-text.mjs --yes --delay-ms 1500
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

const FORCE = process.argv.includes('--yes');
const DRY_RUN = process.argv.includes('--dry-run') || !FORCE;
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(process.argv[limitIdx + 1], 10) || 100 : 100;
const delayIdx = process.argv.indexOf('--delay-ms');
const DELAY_MS = delayIdx >= 0 ? parseInt(process.argv[delayIdx + 1], 10) || 0 : 700;

const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

async function rest(path, opts = {}) {
  const res = await fetch(`${SU}/rest/v1/${path}`, { ...opts, headers: h });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, error: !res.ok };
}

// ── 1) Najít legacy zprávy bez parsed_raw_text ──────────────────────────────
// Pouze textové zprávy (fotky mají prázdný přepis legitimně), statusy starých
// zpráv parsed/imported/ignored, parsed_raw_text NULL nebo prázdný řetězec.
const q = new URLSearchParams({
  select: 'id,sender_name,message_text,message_type,status,created_at,message_timestamp,chat_id,parsed_raw_text',
  status: 'in.("parsed","imported","ignored")',
  message_type: 'eq.text',
  or: '(parsed_raw_text.is.null,parsed_raw_text.eq.)',
  order: 'created_at.desc',
  limit: String(LIMIT),
});
const { status: listStatus, data: rows, error: listError } = await rest(`whatsapp_incoming?${q}`);
if (listError) {
  console.error('Chyba dotazu:', listStatus, rows);
  process.exit(1);
}
console.log(`Nalezeno ${rows.length} textových zpráv bez parsed_raw_text (limit ${LIMIT}).`);
if (rows.length === 0) {
  console.log('Nic k doplnění — hotovo.');
  process.exit(0);
}

// ── 2) Katalog pro AI (stejně jako whatsapp-auto-parse) ─────────────────────
const [beersRes, packagesRes, placesRes, aliasRes, placeAliasRes] = await Promise.all([
  rest('beers?select=id,name,degree,short_name&order=name'),
  rest('packages?select=id,label,volume_l&order=label'),
  rest('places?select=id,name&order=name'),
  rest('parser_aliases?select=alias_text,beer_id,package_id'),
  rest('place_aliases?select=wrong_name,correct_name'),
]);
if (beersRes.error || packagesRes.error || placesRes.error || aliasRes.error || placeAliasRes.error) {
  console.error('Chyba načtení katalogu:', { beers: beersRes.status, packages: packagesRes.status, places: placesRes.status, aliases: aliasRes.status, placeAliases: placeAliasRes.status });
  process.exit(1);
}
const beers = beersRes.data || [];
const packages = packagesRes.data || [];
const places = placesRes.data || [];
const aliases = (aliasRes.data || []).map((a) => ({
  alias_text: a.alias_text,
  beer_name: beers.find((b) => b.id === a.beer_id)?.name ?? null,
  package_label: packages.find((p) => p.id === a.package_id)?.label ?? null,
}));
const placeAliases = placeAliasRes.data || [];

const fnUrl = `${SU}/functions/v1/parse-order-text`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchChatContext(row) {
  if (!row.chat_id) return [];
  const { data: ctx } = await rest(
    `whatsapp_incoming?select=sender_name,message_timestamp,message_text&chat_id=eq.${encodeURIComponent(row.chat_id)}&created_at=lt.${encodeURIComponent(row.created_at)}&order=created_at.desc&limit=3`
  );
  if (!Array.isArray(ctx) || ctx.length === 0) return [];
  return [...ctx].reverse().map((m) => ({
    sender: m.sender_name,
    date: m.message_timestamp ? new Date(m.message_timestamp).toISOString().split('T')[0] : null,
    text: m.message_text,
  }));
}

// ── 3) Re-parse přes AI a doplnění parsed_raw_text ──────────────────────────
let ok = 0, noTranscript = 0, failed = 0;
for (const row of rows) {
  const shortId = row.id.slice(0, 8);
  const text = row.message_text || '';
  if (!text.trim()) {
    console.log(`  [skip]  ${shortId} — prázdný text, nic k přepisu`);
    noTranscript++;
    continue;
  }

  const context = await fetchChatContext(row);
  const body = {
    rawText: text,
    beers,
    packages,
    places: places.map((p) => p.name),
    aliases,
    placeAliases,
    messages: [
      ...context,
      {
        sender: row.sender_name,
        date: row.message_timestamp ? new Date(row.message_timestamp).toISOString().split('T')[0] : null,
        text,
      },
    ],
  };

  if (DRY_RUN) {
    console.log(`  [dry-run] ${shortId} (${row.status}) — ${text.split('\n')[0].slice(0, 60)}…`);
    continue;
  }

  let res;
  try {
    res = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SRK}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`  [error]  ${shortId} — síťová chyba: ${e.message}`);
    failed++;
    continue;
  }
  const resText = await res.text();
  let data = null;
  try { data = resText ? JSON.parse(resText) : null; } catch { data = null; }

  if (!res.ok || data?.error) {
    console.error(`  [error]  ${shortId} — HTTP ${res.status}: ${data?.error || resText.slice(0, 200)}`);
    failed++;
  } else {
    const raw = typeof data?.raw_text === 'string' && data.raw_text.trim() ? data.raw_text : null;
    if (!raw) {
      console.log(`  [none]   ${shortId} — AI nevrátila žádný přepis (text zprávy je asi jen pozdrav)`);
      noTranscript++;
    } else {
      const u = await rest(`whatsapp_incoming?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ parsed_raw_text: raw }),
      });
      if (u.error) {
        console.error(`  [error]  ${shortId} — uložení selhalo: HTTP ${u.status} ${u.data}`);
        failed++;
      } else {
        console.log(`  [ok]     ${shortId} — přepis doplněn (${raw.length} znaků)`);
        ok++;
      }
    }
  }
  await sleep(DELAY_MS);
}

console.log('');
if (DRY_RUN) {
  console.log('Dry-run — AI se nevolalo, nic se neuložilo.');
  console.log('Reálné doplnění spusť s --yes:');
  console.log('  node scripts/backfill-whatsapp-parsed-raw-text.mjs --yes');
} else {
  console.log(`Hotovo: ${ok} doplněno, ${noTranscript} bez přepisu, ${failed} chyb (z ${rows.length}).`);
}

