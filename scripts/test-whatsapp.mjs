// Test WhatsApp import flow — rozparsování exportu (parseWhatsAppExport),
// rozdělení zpráv (splitWhatsAppMessages) a detekce dne dodání (detectDeliveryDay).
// Pozn.: Heuristický parser objednávek (parseWhatsAppOrderMessage) byl odstraněn —
// text objednávek čte nyní AI cesta parseWhatsAppOrderMessageWithAI (parse-order-text).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let parseWhatsAppExport, splitWhatsAppMessages, detectDeliveryDay;

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
  splitWhatsAppMessages = mod.exports.splitWhatsAppMessages;
  detectDeliveryDay = mod.exports.detectDeliveryDay;
} catch (e) {
  console.log('SKIP:', e.message);
  process.exit(0);
}

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
}


console.log('\n=== WHATSAPP TEST B: splitWhatsAppMessages (časová razítka) ===');
{
  const raw = `[12:00, 1.1.2026] Hospoda U Zajíce: 2x 12° 50l
[12:05, 1.1.2026] Seeberg: 3x 10° 30l`;
  const parts = splitWhatsAppMessages(raw);
  console.log('  části:', JSON.stringify(parts));
  check('rozdělil na 2 části', parts.length === 2, `dostal ${parts.length}`);
}

console.log('\n=== WHATSAPP TEST C: detectDeliveryDay ===');
{
  check('na čtvrtek → ct', detectDeliveryDay('na čtvrtek 2x 12° 50l').day === 'ct', detectDeliveryDay('na čtvrtek 2x 12° 50l').day);
  check('v pátek → pa', detectDeliveryDay('v pátek dodám').day === 'pa', detectDeliveryDay('v pátek dodám').day);
  check('dnes → den', detectDeliveryDay('dnes večer').day !== null);
  check('zítra → den + datum', detectDeliveryDay('zítra').day !== null && detectDeliveryDay('zítra').dateStr !== null);
  check('bez dne → null', detectDeliveryDay('2x 12° 50l').day === null);
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

console.log('\n=== WHATSAPP TEST E: více zpráv oddělených prázdným řádkem ===');
{
  const raw = `Hospoda U Zajíce: 2x 12° 50l


Seeberg: 3x 10° 30l`;
  const msgs = parseWhatsAppExport(raw);
  console.log('  zprávy:', JSON.stringify(msgs.map(m => ({ sender: m.sender, text: m.text }))));
  check('rozparsoval 2 zprávy', msgs.length === 2, `dostal ${msgs.length}`);
}

console.log(`\n===== VÝSLEDEK: ${pass} OK, ${fail} CHYB =====`);
process.exit(fail > 0 ? 1 : 0);
