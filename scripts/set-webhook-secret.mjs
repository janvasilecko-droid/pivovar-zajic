#!/usr/bin/env node
/**
 * Nastaví sdílené tajemství webhooku (WEBHOOK_SECRET) na produkční Supabase
 * projekt a zapíše ho do .env. Bez něj webhook nepřijímá žádné požadavky
 * (kontrola hlavičky `x-webhook-token` ve whatsapp-webhook).
 *
 * Použití: node scripts/set-webhook-secret.mjs [vlastni-secret]
 *   - bez argumentu se vygeneruje náhodný 32znakový klíč
 *
 * POZOR: Po aktivaci tajemství musí Tasker/Make posílat hlavičku
 *   `x-webhook-token: <secret>` — jinak webhook vrací 401.
 * Vypnutí: node scripts/set-webhook-secret.mjs --remove
 */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const projectRef = 'sasqexjadvlqyticxwja';

const envPath = new URL('../.env', import.meta.url);
let env = '';
try { env = readFileSync(envPath, 'utf8'); } catch { /* .env zatím neexistuje */ }

const m = env.match(/^\s*(?:SUPABASE_ACCESS_TOKEN|SB_TOKEN)\s*=\s*["']?([^"'\r\n]+)/m);
if (!m) {
  console.error('Chybí SUPABASE_ACCESS_TOKEN / SB_TOKEN v .env');
  process.exit(1);
}
const token = m[1].trim();

const arg = process.argv[2];
if (arg === '--remove') {
  const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const secrets = await resp.json();
  const names = (Array.isArray(secrets) ? secrets : []).map((s) => s.name);
  if (!names.includes('WEBHOOK_SECRET')) {
    console.log('WEBHOOK_SECRET není nastaveno — nic k mazání.');
    process.exit(0);
  }
  const del = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ secrets: ['WEBHOOK_SECRET'] }),
  });
  console.log(`HTTP ${del.status} — WEBHOOK_SECRET odstraněno`);
  if (del.status === 201) {
    const nextEnv = env.replace(/^WEBHOOK_SECRET=.*$/m, '').replace(/\n{2,}/g, '\n');
    writeFileSync(envPath, nextEnv.replace(/^\n/, ''), 'utf8');
    console.log('.env: WEBHOOK_SECRET odebráno');
  }
  process.exit(del.status === 201 ? 0 : 1);
}

const secret = arg && arg !== '--generate' ? arg : randomBytes(24).toString('hex');
if (arg && arg !== '--generate' && secret.length < 16) {
  console.error('Tajemství musí mít alespoň 16 znaků.');
  process.exit(1);
}

console.log('Nastavuji WEBHOOK_SECRET na Supabase ...');
const resp = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/secrets`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'WEBHOOK_SECRET', value: secret }]),
});
console.log(`HTTP ${resp.status}`);
if (resp.status !== 201) {
  console.error(await resp.text());
  process.exit(1);
}

if (env.includes('WEBHOOK_SECRET=')) {
  writeFileSync(envPath, env.replace(/^WEBHOOK_SECRET=.*$/m, `WEBHOOK_SECRET=${secret}`), 'utf8');
} else {
  appendFileSync(envPath, `\nWEBHOOK_SECRET=${secret}\n`, 'utf8');
}
console.log('WEBHOOK_SECRET zapsán do .env');
console.log(`\n🔑 Webhook secret: ${secret}`);
console.log('\nDo Taskeru (HTTP Request → Headers) přidej:');
console.log(`  x-webhook-token: ${secret}`);
console.log('\n⚠️  Od teď webhook vrací 401, pokud hlavička chybí nebo nesouhlasí.');
