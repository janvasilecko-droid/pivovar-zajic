#!/usr/bin/env node
// 🔁 Vrácení zářijové inventury 2026 ze zálohy z 5. 10. 2026.
// ---------------------------------------------------------------------------
// Co se stalo: září se uzavřelo 1. 10. 2026 ve 22:04 — schválená inventura
// k 30. 9. a počáteční stav 1. 10. vznikly z týchž řádků. 9. 10. 2026 ve
// 12:20 se v Inventuře se vybraným zářím uložila čísla napočítaná ten den
// (save_physical_inventory_v2): smazala schválenou inventuru (41 řádků)
// i zářijové ztráty (9 dorovnání bez objednávky a důvodu) a zapsala místo
// nich stav z 9. 10. Ten správně leží v týdenní inventuře týdne od 5. 10.
// Majitel 10. 10. 2026: „ano" (vrátit září).
//
// Skript vrátí PŘESNĚ to, co bylo v záloze (stejná id, čísla, časy zápisu),
// a smaže jen řádky z chybného uložení 9. 10. Nic nehádá: když v databázi
// k září leží cokoli jiného než to chybné uložení, nebo záloha nesedí
// s počátečním stavem 1. 10., skončí bez zápisu.
//
// Do výpisu (veřejný log GitHub Actions) jdou jen POČTY, ne čísla skladu.
// Bez --opravdu se nic nezapíše. Před zápisem se současné řádky uloží
// zašifrované (heslem zálohy) do predchozi-zari.json.enc.
//
//   node scripts/obnov-zari-2026.mjs [--commit 3e06e48] [--opravdu]

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { desifruj, zasifruj } from './lib/sifraZalohy.mjs';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const hodnota = (jmeno) => {
  const i = args.indexOf(`--${jmeno}`);
  return i >= 0 ? args[i + 1] : null;
};
const OPRAVDU = args.includes('--opravdu');
const COMMIT = hodnota('commit') || '3e06e48';

const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HESLO = process.env.ZALOHA_HESLO;

/** Chybné uložení z 9. 10. 2026 (UTC) — jen tyhle řádky se smí smazat. */
const CHYBNE_ULOZENI = '2026-10-09T10:20:32';
const OD = '2026-09-01';
const DO = '2026-09-30';

const hlavicky = { apikey: KLIC, Authorization: `Bearer ${KLIC}`, 'Content-Type': 'application/json' };
const napocitana = (r) => /fyzick|schválen|schvalen/i.test(String(r.note ?? ''));
const ztrata = (r) => !r.order_id && !String(r.reason ?? '').trim();
const vZari = (r) => String(r.entry_date).slice(0, 10) >= OD && String(r.entry_date).slice(0, 10) <= DO;
const klicPolozky = (r) => `${r.beer_id}__${r.package_id}`;

function zaloha(tabulka) {
  const text = execFileSync('git', ['show', `${COMMIT}:zalohy/${tabulka}.json.enc`], { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(desifruj(text, HESLO));
}

async function zDb(tabulka, filtr) {
  const out = [];
  for (let od = 0; ; od += 1000) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?select=*&${filtr}&order=id`, { headers: { ...hlavicky, Range: `${od}-${od + 999}` } });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < 1000) return out;
  }
}

async function vloz(tabulka, radky) {
  if (!radky.length) return;
  const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?on_conflict=id`, {
    method: 'POST',
    headers: { ...hlavicky, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(radky),
  });
  if (!r.ok) throw new Error(`${tabulka} (vložení): HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function smaz(tabulka, ids) {
  if (!ids.length) return;
  const seznam = ids.map((x) => `"${x}"`).join(',');
  const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?id=in.(${encodeURIComponent(seznam)})`, {
    method: 'DELETE',
    headers: { ...hlavicky, Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(`${tabulka} (mazání): HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

function stop(zprava) {
  console.error(`STOP — nic se nezapsalo: ${zprava}`);
  process.exit(1);
}

async function stav() {
  const inv = await zDb('inventory', `entry_date=gte.${OD}&entry_date=lte.2026-10-01`);
  const adj = await zDb('inventory_adjustments', `entry_date=gte.${OD}&entry_date=lte.${DO}`);
  return {
    napocitane: inv.filter((r) => vZari(r) && napocitana(r)),
    pocatecni: inv.filter((r) => String(r.entry_date).slice(0, 10) === '2026-10-01' && /počáteč|pocatec/i.test(String(r.note ?? ''))),
    ztraty: adj.filter((r) => ztrata(r)),
  };
}

async function main() {
  if (!URL_DB || !KLIC) stop('chybí SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
  if (!HESLO) stop('chybí ZALOHA_HESLO.');

  // ── Záloha ──
  const zInv = zaloha('inventory').filter((r) => vZari(r) && napocitana(r));
  const zAdj = zaloha('inventory_adjustments').filter((r) => vZari(r) && ztrata(r));
  console.log(`Záloha ${COMMIT}: napočítaná inventura září ${zInv.length} řádků, ztráty září ${zAdj.length} řádků.`);
  if (!zInv.length) stop('v záloze není napočítaná zářijová inventura.');
  if ([...zInv, ...zAdj].some((r) => String(r.created_at) >= '2026-10-09')) stop('záloha obsahuje řádky z 9. 10. nebo novější — je to špatná záloha.');

  // ── Databáze teď ──
  const ted = await stav();
  console.log(`Databáze teď: napočítaná inventura září ${ted.napocitane.length} řádků, ztráty září ${ted.ztraty.length} řádků, počáteční stav 1. 10. ${ted.pocatecni.length} řádků.`);
  const cizi = [...ted.napocitane, ...ted.ztraty].filter((r) => !String(r.created_at).startsWith(CHYBNE_ULOZENI));
  if (cizi.length) stop(`k září leží ${cizi.length} řádků, které nevznikly chybným uložením 9. 10. — je potřeba se na ně podívat ručně.`);

  // Uzávěrka zapsala schválenou inventuru a počáteční stav 1. 10. z týchž řádků.
  const pocatecni = new Map(ted.pocatecni.map((r) => [klicPolozky(r), Number(r.quantity)]));
  const nesedi = zInv.filter((r) => pocatecni.get(klicPolozky(r)) !== Number(r.quantity));
  if (nesedi.length || pocatecni.size !== zInv.length) stop(`záloha nesedí s počátečním stavem 1. 10. (${nesedi.length} rozdílů, ${pocatecni.size} vs ${zInv.length} položek).`);
  console.log('Kontrola: zálohovaná inventura k 30. 9. = počáteční stav 1. 10. u všech položek ✓');

  const zmenene = zInv.filter((z) => {
    const d = ted.napocitane.find((r) => klicPolozky(r) === klicPolozky(z));
    return !d || Number(d.quantity) !== Number(z.quantity);
  }).length;
  console.log(`Chybné uložení 9. 10. změnilo ${zmenene} z ${zInv.length} položek inventury a přepsalo ${ted.ztraty.length} ztrát.`);

  if (!OPRAVDU) {
    console.log('Nanečisto — nic se nezapsalo. Naostro: --opravdu');
    return;
  }

  // Současný stav zašifrovaně stranou — kdyby bylo potřeba obnovu vrátit.
  writeFileSync(resolve(KOREN, 'predchozi-zari.json.enc'), zasifruj(JSON.stringify({ inventory: ted.napocitane, inventory_adjustments: ted.ztraty }), HESLO));

  // Nejdřív vložit zálohu (jiná id), pak smazat chybné řádky — kdyby něco
  // spadlo uprostřed, nezůstane září prázdné.
  await vloz('inventory', zInv);
  await vloz('inventory_adjustments', zAdj);
  await smaz('inventory', ted.napocitane.map((r) => r.id).filter((id) => !zInv.some((z) => z.id === id)));
  await smaz('inventory_adjustments', ted.ztraty.map((r) => r.id).filter((id) => !zAdj.some((z) => z.id === id)));

  const po = await stav();
  const sedi = po.napocitane.length === zInv.length && po.ztraty.length === zAdj.length
    && zInv.every((z) => po.napocitane.some((r) => r.id === z.id && Number(r.quantity) === Number(z.quantity)))
    && zAdj.every((z) => po.ztraty.some((r) => r.id === z.id && Number(r.quantity) === Number(z.quantity)));
  console.log(`Po obnově: napočítaná inventura září ${po.napocitane.length} řádků, ztráty září ${po.ztraty.length} řádků — ${sedi ? 'shoduje se se zálohou ✓' : 'NESHODUJE SE se zálohou ✗'}`);
  if (!sedi) process.exit(1);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
