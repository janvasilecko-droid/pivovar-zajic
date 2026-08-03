// Test WhatsApp import flow
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let parseWhatsAppExport, parseWhatsAppOrderMessage;

try {
  const esbuild = require('esbuild');
  const fs = require('fs');
  const path = require('path');
  // Bundle whatsappParser.ts (which imports orderParser.ts) into one CJS module
  const result = esbuild.buildSync({
    entryPoints: [path.resolve('src/lib/whatsappParser.ts')],
    bundle: true,
    format: 'cjs',
    write: false,
    platform: 'node',
  });
  const code = result.outputFiles[0].text;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', code)(mod, mod.exports, require);
  parseWhatsAppExport = mod.exports.parseWhatsAppExport;
  parseWhatsAppOrderMessage = mod.exports.parseWhatsAppOrderMessage;
} catch (e) {
  console.log('SKIP:', e.message);
  process.exit(0);
}

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

console.log('\n=== WHATSAPP TEST A: export s časovými razítky ===');
{
  const raw = `[12:00, 1.1.2026] Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l keg
[12:05, 1.1.2026] Seeberg: Dobrý den, 3x 10° 30l keg`;
  const msgs = parseWhatsAppExport(raw);
  console.log('  zprávy:', JSON.stringify(msgs.map(m => ({ sender: m.sender, text: m.text }))));
  check('rozparsoval 2 zprávy', msgs.length === 2, `dostal ${msgs.length}`);
  check('1. odesílatel = Hospoda U Zajíce', msgs[0]?.sender === 'Hospoda U Zajíce', msgs[0]?.sender);
  check('1. text = 2x 12° 50l keg', msgs[0]?.text === 'Ahoj, na čtvrtek 2x 12° 50l keg', msgs[0]?.text);

  const parsed = parseWhatsAppOrderMessage(msgs[0].text, beers, packages, places, undefined, undefined, msgs[0].sender);
  console.log('  parsed:', JSON.stringify({ placeId: parsed.placeId, placeName: parsed.placeName, day: parsed.deliveryDay, items: parsed.items.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label })) }));
  check('rozpozná místo', parsed.placeId === 'pl1', `dostal ${parsed.placeId}`);
  check('rozpozná den čtvrtek', parsed.deliveryDay === 'ct', `dostal ${parsed.deliveryDay}`);
  check('rozpozná položku 2x 12° 50l', parsed.items.length >= 1 && parsed.items[0]?.quantity === 2 && parsed.items[0]?.beer_id === 'b1' && parsed.items[0]?.package_id === 'p1', JSON.stringify(parsed.items));
}


console.log('\n=== WHATSAPP TEST B: text bez časových razítek (kopie zprávy) ===');
{
  const raw = `Hospoda U Zajíce: 2x 12° 50l keg`;
  const msgs = parseWhatsAppExport(raw);
  console.log('  zprávy:', JSON.stringify(msgs.map(m => ({ sender: m.sender, text: m.text }))));
  check('rozparsoval 1 zprávu', msgs.length === 1, `dostal ${msgs.length}`);

  const parsed = parseWhatsAppOrderMessage(msgs[0].text, beers, packages, places);
  console.log('  parsed:', JSON.stringify({ placeId: parsed.placeId, placeName: parsed.placeName, items: parsed.items.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label })) }));
  check('rozpozná místo', parsed.placeId === 'pl1', `dostal ${parsed.placeId}`);
  check('rozpozná položku', parsed.items.length >= 1 && parsed.items[0]?.quantity === 2 && parsed.items[0]?.beer_id === 'b1' && parsed.items[0]?.package_id === 'p1', JSON.stringify(parsed.items));
}

console.log('\n=== WHATSAPP TEST C: jen položky bez místa ===');
{
  const raw = `2x 12° 50l keg`;
  const msgs = parseWhatsAppExport(raw);
  const parsed = parseWhatsAppOrderMessage(msgs[0].text, beers, packages, places);
  console.log('  parsed:', JSON.stringify({ placeId: parsed.placeId, placeName: parsed.placeName, items: parsed.items.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label })) }));
  check('rozpozná položku bez místa', parsed.items.length >= 1 && parsed.items[0]?.quantity === 2 && parsed.items[0]?.beer_id === 'b1' && parsed.items[0]?.package_id === 'p1', JSON.stringify(parsed.items));
}

console.log('\n=== WHATSAPP TEST D: reálný export formát (MM/DD/YYYY, HH:MM - Sender) ===');
{
  const raw = `1/1/2026, 12:00 - Hospoda U Zajíce: Ahoj, na čtvrtek 2x 12° 50l keg
1/1/2026, 12:05 - Seeberg: Dobrý den, 3x 10° 30l keg`;
  const msgs = parseWhatsAppExport(raw);
  console.log('  zprávy:', JSON.stringify(msgs.map(m => ({ sender: m.sender, text: m.text }))));
  check('rozparsoval 2 zprávy', msgs.length === 2, `dostal ${msgs.length}`);
  check('1. odesílatel = Hospoda U Zajíce', msgs[0]?.sender === 'Hospoda U Zajíce', msgs[0]?.sender);
}

console.log('\n=== WHATSAPP TEST E: formát "50l12sv" ===');
{
  const raw = `Němci brali 50l12sv, 30l tmava a 30l 11`;
  const parsed = parseWhatsAppOrderMessage(raw, beers, packages, places);
  console.log('  parsed:', JSON.stringify({ placeId: parsed.placeId, items: parsed.items.map(i => ({ q: i.quantity, b: i.beer_name, p: i.package_label })) }));
  check('našel položky', parsed.items.length >= 1, `dostal ${parsed.items.length}`);
}

console.log('\n=== WHATSAPP TEST F: více zpráv oddělených prázdným řádkem ===');
{
  const raw = `Hospoda U Zajíce: 2x 12° 50l


Seeberg: 3x 10° 30l`;
  const msgs = parseWhatsAppExport(raw);
  console.log('  zprávy:', JSON.stringify(msgs.map(m => ({ sender: m.sender, text: m.text }))));
  check('rozparsoval 2 zprávy', msgs.length === 2, `dostal ${msgs.length}`);
}

console.log(`\n===== VÝSLEDEK: ${pass} OK, ${fail} CHYB =====`);
process.exit(fail > 0 ? 1 : 0);
