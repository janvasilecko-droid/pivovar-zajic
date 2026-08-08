#!/usr/bin/env node
/**
 * E2E test CELÉHO WhatsApp toku:
 *   webhook (reálný vstup Taskeru/Make) → DB (pending) → AI auto-parse → kontrola.
 *
 * Použití:
 *   node scripts/test-whatsapp-flow.mjs            # test + zprávy ZŮSTANOU v DB (k ověření v appce)
 *   node scripts/test-whatsapp-flow.mjs --cleanup  # test + smaže testovací zprávy (webhook_id flowtest-*)
 */
import { readFileSync } from 'node:fs';

const env = readFileSync('.env', 'utf8');
const get = (k) => env.split(/\r?\n/).find((l) => l.startsWith(k + '='))?.slice(k.length + 1).trim();
const SU = get('VITE_SUPABASE_URL');
const SRK = get('VITE_SUPABASE_SERVICE_ROLE_KEY');
const ANK = get('VITE_SUPABASE_ANON_KEY');

if (!SU || !SRK || !ANK) {
  console.error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY v .env');
  process.exit(1);
}

const CLEANUP = process.argv.includes('--cleanup');
const h = { apikey: SRK, Authorization: `Bearer ${SRK}`, 'Content-Type': 'application/json' };

// ── Testovací zprávy (realistické) ──────────────────────────────────────────
const CASES = [
  {
    id: 'A',
    name: 'Odběratel V TEXTU zprávy (odesílatel je zaměstnanec "Pojmi")',
    sender: 'Pojmi',
    text: 'Naseb 2x 12° světlý ležák 50l, 1x 13° jantar 30l',
    expectPlace: 'Naseb',
    expectQty: 3,
    expectDay: null,
  },
  {
    id: 'B',
    name: 'Odesílatel = zákazník (místo není v textu)',
    sender: 'V sadu Aš',
    text: 'Ahoj, na pátek 2x 12° 50l a 1x 13° 30l, díky!',
    expectPlace: 'V sadu Aš',
    expectQty: 3,
    expectDay: 'pa',
  },
  {
    id: 'C',
    name: 'REGRESE: zpráva bez odběratele (dřív špatně "V sadu Aš")',
    sender: 'Test Hospoda U Zajice',
    text: 'Ahoj sladku, na sobotu 2x 12° 50l',
    expectPlace: null,
    expectQty: 2,
    expectDay: 'so',
  },
  {
    id: 'D',
    name: 'Odesílatel = zákazník s diakritikou (Malešice)',
    sender: 'Malešice',
    text: 'Na čtvrtek 3x 11° 30l',
    expectPlace: 'Malešice',
    expectQty: 3,
    expectDay: 'ct',
  },
  {
    id: 'E',
    name: 'Místo v textu bez diakritiky: "Malesice" → Malešice',
    sender: 'Pojmi',
    text: 'Malesice 4x 10° 50l',
    expectPlace: 'Malešice',
    expectQty: 4,
    expectDay: null,
  },
];

// ── 1) Odeslání přes WEBHOOK (reálný vstup) ────────────────────────────────
console.log('=== 1) WEBHOOK (cesta Tasker/Make) ===');
const inserted = [];
for (const c of CASES) {
  const wid = 'flowtest-' + Date.now() + '-' + c.id;
  const r = await fetch(`${SU}/functions/v1/whatsapp-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: c.sender,
      message: c.text,
      timestamp: new Date().toISOString(),
      webhookId: wid,
      senderNumber: '+42060000000' + (CASES.indexOf(c) + 1),
    }),
  });
  const j = await r.json();
  const ok = r.status === 200 && j.success && j.status === 'pending';
  console.log(`  [${c.id}] HTTP ${r.status} ${ok ? '✓ uloženo (pending)' : '✗ ' + JSON.stringify(j).slice(0, 120)}`);
  inserted.push({ ...c, rowId: j.id, wid });
  await new Promise((res) => setTimeout(res, 300));
}

// ── 2) AUTO-PARSE (AI) ──────────────────────────────────────────────────────
console.log('=== 2) AUTO-PARSE (AI, ~15-40 s) ===');
const pr = await fetch(`${SU}/functions/v1/whatsapp-auto-parse`, {
  method: 'POST',
  headers: { apikey: ANK, Authorization: `Bearer ${ANK}`, 'Content-Type': 'application/json' },
  body: '{}',
});
const pbody = await pr.json();
console.log(`  HTTP ${pr.status} summary:`, JSON.stringify(pbody.summary || pbody));

// ── 3) Kontrola výsledků v DB ───────────────────────────────────────────────
console.log('=== 3) VÝSLEDKY ===');
let failures = 0;
for (const m of inserted) {
  const q = await (
    await fetch(
      `${SU}/rest/v1/whatsapp_incoming?select=id,status,parsed_place_id,parsed_place_name,parsed_delivery_day,parsed_note,parsed_items,error_message&id=eq.${m.rowId}`,
      { headers: h },
    )
  ).json();
  const row = q[0];
  const place = row?.parsed_place_name ?? null;
  const items = row?.parsed_items || [];
  const qty = items.reduce((s, i) => s + (i.qty || 0), 0);
  const day = row?.parsed_delivery_day ?? null;
  const itemsDesc = items.map((i) => `${i.qty}× ${i.beer_name || '?'} ${i.package_label || '?'}`).join(', ');

  const okPlace = (place ?? null) === m.expectPlace;
  const okQty = qty === m.expectQty;
  const okDay = (day ?? null) === m.expectDay;
  const okStatus = row?.status === 'parsed';
  const ok = okStatus && okPlace && okQty && okDay;

  if (!ok) failures++;
  console.log(`  [${m.id}] ${ok ? '✓ OK' : '✗ CHYBA'} — ${m.name}`);
  console.log(`        odesílatel: "${m.sender}"`);
  console.log(`        text: "${m.text.slice(0, 70)}"`);
  console.log(`        status: ${row?.status}${row?.error_message ? '  ERROR: ' + row.error_message : ''}`);
  console.log(`        místo: ${place ?? 'null'} ${okPlace ? '' : `(očekáváno: ${m.expectPlace})`}`);
  console.log(`        den: ${day ?? 'null'} ${okDay ? '' : `(očekáváno: ${m.expectDay})`}`);
  console.log(`        položky: ${itemsDesc || '(žádné)'} ${okQty ? '' : `(očekáváno ks: ${m.expectQty}, je: ${qty})`}`);
}

// ── 4) Úklid ────────────────────────────────────────────────────────────────
if (CLEANUP) {
  await fetch(`${SU}/rest/v1/whatsapp_incoming?webhook_id=like.flowtest-%`, { method: 'DELETE', headers: h });
  console.log('=== 4) ÚKLID ✓ (testovací zprávy smazány) ===');
} else {
  console.log('=== 4) Testovací zprávy ZŮSTALY v DB (webhook_id flowtest-*) — otevřete aplikaci a uvidíte modály.');
  console.log('         Po ověření je smažete v aplikaci (Zamítnout/Ignorovat) nebo spustíte:');
  console.log('         node scripts/test-whatsapp-flow.mjs --cleanup');
}

console.log(`\n===== VÝSLEDEK: ${failures === 0 ? 'VŠE OK ✓' : failures + ' CHYB ✗'} =====`);
process.exit(failures > 0 ? 1 : 0);
