#!/usr/bin/env node
/**
 * Ověření „Kontrola čtení“ (readback) v aplikaci — bez čekání na reálnou zprávu.
 *
 * Vloží do whatsapp_incoming testovací zprávu se statusem 'parsed', která
 * obsahuje položky s raw_line, které:
 *   - SEDÍ s originálem   (✓ zelená, zvýrazněno v originálu)
 *   - NESEDÍ s originálem (⚠ — AI „přečetla“ jiný text, než je v originálu)
 *
 * Pak otevři aplikaci → Objednávky → „WhatsApp“ / „Automatické zpracování“ →
 * zpráva od „Test Sládek (kontrola čtení)“ → panel „Kontrola čtení — originál
 * vs. přepis AI“.
 *
 * Použití:
 *   node scripts/verify-whatsapp-readback.mjs            # vložit test
 *   node scripts/verify-whatsapp-readback.mjs --cleanup  # smazat test
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

const CLEANUP = process.argv.includes('--cleanup');
const WID = 'verify-readback-test-1';
const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

const MESSAGE_TEXT = `Ahoj sládku,
pro U Dubu na pátek:
2x 12° 30l
4x 50l 12sv
díky!`;

const PARSED_ITEMS = [
  {
    qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l',
    raw_line: '2x 12° 30l',   // ✓ sedí s originálem → zelené zvýraznění
  },
  {
    qty: 4, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 50l',
    raw_line: '4x 30l 12sv',  // ⚠ NESEDÍ — v originálu je „4x 50l 12sv“
  },
  {
    qty: 5, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 50l',
    raw_line: '5x 50l 12sv',  // ⚠ NESEDÍ — v originálu je „4x 50l 12sv“
  },
];

async function rest(path, opts = {}) {
  const res = await fetch(`${SU}/rest/v1/${path}`, { ...opts, headers: h });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, error: !res.ok };
}

async function cleanup() {
  const { status, data } = await rest(
    `whatsapp_incoming?webhook_id=eq.${WID}&select=id`,
    { method: 'DELETE', headers: { Prefer: 'return=representation' } }
  );
  const n = Array.isArray(data) ? data.length : 0;
  console.log(`🧹 smazáno testovacích zpráv: ${n} (HTTP ${status})`);
}

async function insert() {
  const body = {
    sender_name: 'Test Sládek (kontrola čtení)',
    message_text: MESSAGE_TEXT,
    message_type: 'text',
    status: 'parsed',
    webhook_id: WID,
    parsed_place_name: 'U Dubu',
    parsed_delivery_day: 'pa',
    parsed_items: PARSED_ITEMS,
    // Záměrně = originál, aby šlo vidět i rozbalovací „Doslovný přepis AI“.
    parsed_raw_text: MESSAGE_TEXT,
  };
  const { status, data } = await rest('whatsapp_incoming', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { ...h, Prefer: 'return=representation' },
  });

  if (status >= 400) {
    if (String(data).includes('parsed_raw_text')) {
      console.log('⚠ Migrace ještě není nasazená (chybí sloupec parsed_raw_text).');
      console.log('  Spusť: npx supabase db push   (nebo ekvivalent) a zkus znovu.');
    }
    console.error(`❌ Vložení selhalo (HTTP ${status}):`, data);
    process.exit(1);
  }

  const row = Array.isArray(data) ? data[0] : data;
  console.log('✅ Testovací zpráva vložena (id: ' + (row?.id || '?') + ').');
  console.log('');
  console.log('Teď v aplikaci:');
  console.log('  1) otevři Objednávky → tlačítko „WhatsApp“ / „Automatické zpracování“');
  console.log('  2) otevři zprávu od „Test Sládek (kontrola čtení)“');
  console.log('  3) panel „Kontrola čtení — originál vs. přepis AI“ by měl ukázat:');
  console.log('     - souhrn: „⚠ 2 z 3 položek nesouhlasí s originálem“');
  console.log('     - v originální zprávě zeleně zvýrazněné „2x 12° 30l“ (položka #1)');
  console.log('     - položka 1: „✓ AI četla z originálu“');
  console.log('     - položky 2–3: „⚠ v originální zprávě se nenašlo“');
  console.log('     - rozbalené „Doslovný přepis AI“ (má stejný text jako zpráva)');
  console.log('  4) v seznamu Auto-Importu má zpráva ⚠ odznak „přepis nesouhlasí“');
  console.log('');
  console.log('Po kontrole smaž: node scripts/verify-whatsapp-readback.mjs --cleanup');
}

if (CLEANUP) { cleanup(); } else { insert(); }
