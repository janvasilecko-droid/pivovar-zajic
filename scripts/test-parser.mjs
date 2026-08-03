// Test parser logic (orderParser.ts) with sample data
// Run: node scripts/test-parser.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// We need to transpile TS. Use esbuild if available, else skip.
let parseOrderText, parseFreeTextEntries, matchPlaceFromText, parseVoiceOrder, dedupeAgainstExisting;

try {
  const esbuild = require('esbuild');
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.resolve('src/lib/orderParser.ts'), 'utf8');
  const result = esbuild.transformSync(src, { loader: 'ts', format: 'cjs' });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', result.code)(mod, mod.exports, require);
  parseOrderText = mod.exports.parseOrderText;
  parseFreeTextEntries = mod.exports.parseFreeTextEntries;
  matchPlaceFromText = mod.exports.matchPlaceFromText;
  parseVoiceOrder = mod.exports.parseVoiceOrder;
  dedupeAgainstExisting = mod.exports.dedupeAgainstExisting;

} catch (e) {
  console.log('SKIP: esbuild not available, cannot transpile TS. Error:', e.message);
  process.exit(0);
}

// Sample reference data (matching seed data)
const beers = [
  { id: 'b1', name: '12° Světlá', short_name: '12°S', degree: '12°', color: 'světlé', beer_color: '#FDE68A', is_active: true, sort_order: 1, created_at: '' },
  { id: 'b2', name: '11° Světlá', short_name: '11°S', degree: '11°', color: 'světlé', beer_color: '#FEF3C7', is_active: true, sort_order: 2, created_at: '' },
  { id: 'b3', name: '10° Desítka', short_name: '10°', degree: '10°', color: 'světlé', beer_color: '#FCD34D', is_active: true, sort_order: 3, created_at: '' },
  { id: 'b4', name: '12° Tmavá', short_name: '12°T', degree: '12°', color: 'tmavé', beer_color: '#44403B', is_active: true, sort_order: 4, created_at: '' },
  { id: 'b5', name: 'Jantar', short_name: null, degree: '13°', color: 'jantarové', beer_color: '#F59E0B', is_active: true, sort_order: 5, created_at: '' },
  { id: 'b6', name: 'Summer Ale', short_name: null, degree: null, color: 'ovocné', beer_color: '#86EFAC', is_active: true, sort_order: 6, created_at: '' },
  { id: 'b7', name: '13 Hazy Bunny', short_name: null, degree: '13°', color: 'nefiltrované', beer_color: '#FCA5A5', is_active: true, sort_order: 7, created_at: '' },
  { id: 'b8', name: 'Hazy Spring Day', short_name: null, degree: null, color: 'nefiltrované', beer_color: '#F9A8D4', is_active: true, sort_order: 8, created_at: '' },
];

const packages = [
  { id: 'p1', code: 'KEG50', kind: 'keg', volume_l: 50, label: 'KEG 50l', sort_order: 1 },
  { id: 'p2', code: 'KEG30', kind: 'keg', volume_l: 30, label: 'KEG 30l', sort_order: 2 },
  { id: 'p3', code: 'KEG20', kind: 'keg', volume_l: 20, label: 'KEG 20l', sort_order: 3 },
  { id: 'p4', code: 'KEG15', kind: 'keg', volume_l: 15, label: 'KEG 15l', sort_order: 4 },
  { id: 'p5', code: 'KEG10', kind: 'keg', volume_l: 10, label: 'KEG 10l', sort_order: 5 },
  { id: 'p6', code: 'LAHEV15', kind: 'bottle', volume_l: 1.5, label: 'Lahve 1.5l', sort_order: 6 },
  { id: 'p7', code: 'LAHEV1', kind: 'bottle', volume_l: 1, label: 'Lahve 1l', sort_order: 7 },
  { id: 'p8', code: 'LAHEV05', kind: 'bottle', volume_l: 0.5, label: 'Lahve 0.5l', sort_order: 8 },
  { id: 'p9', code: 'LAHEV033', kind: 'bottle', volume_l: 0.33, label: 'Lahve 0.33l', sort_order: 9 },
];

const places = [
  { id: 'pl1', name: 'U Zajíce', address: 'Hlavní 1', contact_name: null, phone: null, email: null, note: null, delivery_group: null },
  { id: 'pl2', name: 'Seeberg', address: 'Seeberg 2', contact_name: null, phone: null, email: null, note: null, delivery_group: null },
  { id: 'pl3', name: 'U Labutě', address: 'Labutí 3', contact_name: null, phone: null, email: null, note: null, delivery_group: null },
];

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail ? '→ ' + detail : ''}`); }
}

console.log('\n=== TEST 1: parseOrderText (fotka objednávky) ===');
{
  const text = '2x 30l 12° Světlá\n1x 50l 10° Desítka\n3x 0,5l 12° Tmavá';
  const res = parseOrderText(text, beers, packages);
  check('našel 3 položky', res.length === 3, `dostal ${res.length}`);
  const first = res[0];
  check('1. položka: 2x 30l 12° Světlá', first.quantity === 2 && first.beer_id === 'b1' && first.package_id === 'p2', JSON.stringify(first));
  const second = res[1];
  check('2. položka: 1x 50l 10° Desítka', second.quantity === 1 && second.beer_id === 'b3' && second.package_id === 'p1', JSON.stringify(second));
  const third = res[2];
  check('3. položka: 3x 0,5l 12° Tmavá', third.quantity === 3 && third.beer_id === 'b4' && third.package_id === 'p8', JSON.stringify(third));
}

console.log('\n=== TEST 2: parseFreeTextEntries (volné zadávání) ===');
{
  const text = '2x 30l 12° Světlá, 1x 50l 10° Desítka';
  const res = parseFreeTextEntries(text, beers, packages);
  check('našel 2 položky', res.length === 2, `dostal ${res.length}`);
  check('1. položka 2x 30l 12°S', res[0]?.quantity === 2 && res[0]?.beer_id === 'b1' && res[0]?.package_id === 'p2', JSON.stringify(res[0]));
  check('2. položka 1x 50l 10°', res[1]?.quantity === 1 && res[1]?.beer_id === 'b3' && res[1]?.package_id === 'p1', JSON.stringify(res[1]));
}

console.log('\n=== TEST 3: matchPlaceFromText (rozpoznání odběratele) ===');
{
  const r1 = matchPlaceFromText('Objednávka pro U Zajíce: 2x 30l 12°', places);
  check('rozpozná "U Zajíce"', r1.placeId === 'pl1', JSON.stringify(r1));
  const r2 = matchPlaceFromText('Seeberg 2x 30l 12°', places);
  check('rozpozná "Seeberg"', r2.placeId === 'pl2', JSON.stringify(r2));
  const r3 = matchPlaceFromText('U Labutě 1x 50l', places);
  check('rozpozná "U Labutě"', r3.placeId === 'pl3', JSON.stringify(r3));
}

console.log('\n=== TEST 4: parseVoiceOrder (hlasové zadávání) ===');
{
  const r = parseVoiceOrder('objednávka pro U Zajíce: 2x 30l 12° Světlá a 1x 50l 10° Desítka', beers, packages, places);
  check('rozpozná místo', r.placeId === 'pl1', JSON.stringify(r.placeId));
  check('našel 2 položky', r.items.length === 2, `dostal ${r.items.length}`);
}

console.log('\n=== TEST 5: OCR korekce (čtení z fotky) ===');
{
  // OCR misread: "seeger" should map to "Seeberg"
  const r = matchPlaceFromText('Seeger 2x 30l 12°', places);
  check('OCR korekce "Seeger"→Seeberg', r.placeId === 'pl2', JSON.stringify(r));
  // "zajic" should map to "U Zajíce"
  const r2 = matchPlaceFromText('Zajic 2x 30l', places);
  check('OCR korekce "Zajic"→U Zajíce', r2.placeId === 'pl1', JSON.stringify(r2));
}

console.log('\n=== TEST 6: dedupeAgainstExisting ===');
{
  const parsed = [
    { beer_id: 'b1', package_id: 'p2', quantity: 2, raw: 'x', originalLine: 'x', confidence: 'high', issues: [] },
    { beer_id: 'b3', package_id: 'p1', quantity: 1, raw: 'y', originalLine: 'y', confidence: 'high', issues: [] },
  ];
  const existing = [{ beer_id: 'b1', package_id: 'p2', quantity: 2 }];
  const res = dedupeAgainstExisting(parsed, existing);
  check('označí duplicitu', res[0].duplicate === true && res[1].duplicate === false, JSON.stringify(res.map(r => r.duplicate)));
}

console.log('\n=== TEST 7: WhatsApp formáty (reálné zprávy) ===');
{
  // Zpráva 1: "Němci brali 50l12sv,30l tmava a 30l 11.."
  const r1 = parseFreeTextEntries('Němci brali 50l12sv,30l tmava a 30l 11..', beers, packages);
  console.log('  Zpráva 1 položky:', JSON.stringify(r1.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label }))));
  check('Zpráva 1: našel položky', r1.length >= 1, `dostal ${r1.length}`);

  // Zpráva 2: "Malesice\n• SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev"
  const r2 = parseFreeTextEntries('SV 12 = 3x50l KEG + 24x1,5l PET + 20x0,5l lahev', beers, packages);
  console.log('  Zpráva 2 položky:', JSON.stringify(r2.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label }))));
  check('Zpráva 2: našel 3 položky (3x50l, 24x1,5l, 20x0,5l)', r2.length === 3, `dostal ${r2.length}`);

  // Zpráva 3: "250l desitka, sudy 30l a alespon dva mensi 15l"
  const r3 = parseFreeTextEntries('250l desitka, sudy 30l a alespon dva mensi 15l', beers, packages);
  console.log('  Zpráva 3 položky:', JSON.stringify(r3.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label }))));
  check('Zpráva 3: našel položky', r3.length >= 1, `dostal ${r3.length}`);

  // Zpráva 4: "40 ks světlý ležák 12° PET 1 litr"
  const r4 = parseFreeTextEntries('40 ks světlý ležák 12° PET 1 litr', beers, packages);
  console.log('  Zpráva 4 položky:', JSON.stringify(r4.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label }))));
  check('Zpráva 4: 40 ks 12° PET 1l', r4.length === 1 && r4[0]?.quantity === 40 && r4[0]?.beer_id === 'b1' && r4[0]?.package_id === 'p7', JSON.stringify(r4[0]));
}

console.log(`\n===== VÝSLEDEK: ${pass} OK, ${fail} CHYB =====`);
process.exit(fail > 0 ? 1 : 0);


