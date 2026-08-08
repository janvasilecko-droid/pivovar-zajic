// Test celého měsíce WhatsApp zpráv — ověřuje, jestli se objednávky správně
// "propisují" (přiřazení odběratele + položek).
//
// Samotná logika (rozdělení exportu → třídění/slučování → AI parsing) je ve
// sdíleném modulu scripts/month-order-pipeline.mjs — používá ho i
// scripts/seed-whatsapp-inbox.mjs, takže report a seed testují přesně to samé.
//
// Použití:
//   node scripts/test-month.mjs                 # výchozí scripts/input/month-export.txt
//   node scripts/test-month.mjs cesta\k\exportu.txt
//
// AI odpovědi se kešují do scripts/input/.month-ai-cache.json.
import { runMonthPipeline } from './month-order-pipeline.mjs';
import { resolve } from 'node:path';

const inputPath = resolve(process.argv[2] || 'scripts/input/month-export.txt');

let P;
try {
  P = await runMonthPipeline(inputPath, { quiet: false });
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const {
  messages, orders, filtered, mergedLog,
  results, onlyReal, likelyNon, errors,
  beers, packages, places,
} = P;

// ── 7) Report ─────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
const realOrders = orders.filter((o) => !o.dupOf);

// 7.1) Vyfiltrované (ne-objednávky) — heuristika
if (filtered.length) {
  console.log('── 🚫 Vyfiltrované zprávy (ne-objednávky) ──────────────────────────────');
  for (const { m, reason } of filtered) {
    console.log(`   [${m.date || '?'} ${m.time || ''}] ${m.sender || '?'} — ${reason}`);
    console.log(`     ${m.text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  console.log('');
}

// 7.2) Duplicity napříč odesílateli (nepropisují se)
const dups = orders.filter((o) => o.dupOf);
if (dups.length) {
  console.log('── 🔁 Duplicity (přeposlaná stejná objednávka — NEPROPISUJE SE) ───────');
  for (const d of dups) {
    const origIdx = d.dupOf.orderIndex + 1;
    console.log(`   [${d.date} ${d.time}] ${d.sender} → kopie objednávky #${origIdx} (${d.dupOf.sender})`);
    console.log(`     ${d.text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  console.log('');
}

// 7.3) Sloučení — co se připojilo k původní objednávce
if (mergedLog.length) {
  console.log('── 🔀 Sloučené zprávy (editují původní objednávku) ────────────────────');
  for (const { order: ord, m, kind } of mergedLog) {
    console.log(`   #${ord.orderIndex + 1} ← [${m.date || '?'} ${m.time || ''}] ${m.sender || '?'} — ${kind}`);
    console.log(`     ${m.text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  console.log('');
}

// 7.4) Pravděpodobně ne-objednávky (AI nenašla položky) — NEPROPISUJÍ SE
if (likelyNon.length) {
  console.log('── ⚠️ Pravděpodobně ne-objednávky (AI nenašla položky — NEPROPISUJE SE) ─');
  for (const r of likelyNon) {
    console.log(`   [${r.order.date} ${r.order.time}] ${r.order.sender}${r.order.internal ? ' (interní)' : ''}${r.placeName ? ` → AI: "${r.placeName}"` : ''}`);
    console.log(`     ${r.order.text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }
  console.log('');
}

// 7.5) Výsledné objednávky
console.log('── 📦 VÝSLEDNÉ OBJEDNÁVKY (propisují se) ─────────────────────────────');
for (let i = 0; i < onlyReal.length; i++) {
  const r = onlyReal[i];
  const o = r.order;
  const idx = o.orderIndex + 1;
  const senderTag = o.internal ? 'interní' : 'ZÁKAZNÍK';
  const placeTag = r.matched
    ? (r.matched.fuzzy ? `~ ${r.matched.place.name}` : r.matched.place.name)
    : (r.placeName ? `⚠️ ${r.placeName} (není v DB)` : '⚠️ —');
  const dayTag = r.app?.deliveryDay ? `, dodání: ${r.app.deliveryDay}${r.app.deliveryDate ? ` (${r.app.deliveryDate})` : ''}` : '';

  console.log(`   ${pad('#' + idx, 4)} [${o.date} ${o.time}] odeslal: ${o.sender} (${senderTag})${dayTag}`);
  console.log(`       odběratel (AI): ${placeTag}`);
  for (const iss of r.issues) console.log(`       ${iss}`);
  if (r.app?.note) console.log(`       📝 poznámka: ${r.app.note}`);
  for (const it of (r.items || [])) {
    const beer = beers.find((b) => b.id === it.beer_id);
    const pkg = packages.find((p) => p.id === it.package_id);
    const qty = `${it.quantity}×`;
    const name = beer ? beer.name : (it.beer_name || '?');
    const size = pkg ? pkg.label : (it.package_label || '?');
    const raw = it.raw ? ` [${it.raw}]` : '';
    console.log(`         ${pad(qty, 4)} ${pad(name, 28)} ${pad(size, 12)}${raw.slice(0, 60)}`);
  }
  if (r.totalL) console.log(`       = ${r.totalL} litrů`);
  const merged = mergedLog.filter((x) => x.order === o);
  if (merged.length) console.log(`       🔀 sloučeno ${merged.length} navazujících zpráv`);
  console.log('');
}

// 7.6) Souhrn + verdikt
console.log('── SOUHRN ───────────────────────────────────────────────────────────');
console.log(`   📩 zpráv celkem:        ${messages.length}`);
console.log(`   🚫 vyfiltrováno:        ${filtered.length}`);
console.log(`   🔀 sloučeno do původní: ${mergedLog.length}`);
console.log(`   🔁 duplicity:           ${dups.length}`);
console.log(`   📦 objednávek k AI:     ${realOrders.length}`);
console.log(`   ✅ propisuje se:        ${onlyReal.length}`);
console.log(`   ⚠️ ne-objednávky (AI):  ${likelyNon.length}`);
if (errors.length) console.log(`   ❌ chyby AI:             ${errors.length}`);

const badPlaces = onlyReal.filter((r) => !r.matched);
if (badPlaces.length) {
  console.log('\n   ⚠️ Objednávky bez nalezeného odběratele v DB (AI je nepoznal / nejsou v DB):');
  for (const r of badPlaces) {
    const o = r.order;
    console.log(`     • #${o.orderIndex + 1} [${o.date} ${o.time}] ${o.sender}: "${(r.placeName || '—')}"`);
  }
}
console.log('');
