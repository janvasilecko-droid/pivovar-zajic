#!/usr/bin/env node
/**
 * Odeslání jedné testovací zprávy na whatsapp-webhook.
 * Usage:
 *   node scripts/send-whatsapp-test.mjs ["Jméno odesílatele"] ["text zprávy"]
 * (bez argumentů pošle výchozí testovací objednávku)
 */
try {
  await import('dotenv/config');
} catch {
  // dotenv optional
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('CHYBA: chybí VITE_SUPABASE_URL v .env');
  process.exit(1);
}

const sender = process.argv[2] || 'Hospoda U Zajíce';
const message =
  process.argv[3] ||
  'Ahoj sládku, na pátek potřebujeme:\n2x 12° světlý ležák 50l\n1x 13° jantar 30l\nDíky!';

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

console.log(`📤 Odesílám zprávu od: ${sender}`);
console.log(`   ${message.split('\n').join(' | ')}`);

const res = await fetch(WEBHOOK_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender,
    message,
    timestamp: new Date().toISOString(),
    webhookId: `manual-${Date.now()}`,
  }),
});

const text = await res.text();
console.log(`Status: ${res.status}`);
console.log('Odpověď:', text);
