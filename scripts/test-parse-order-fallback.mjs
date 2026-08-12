// Test živého fallback řetězce parse-order-text (Gemini → Groq → Mistral → OpenAI).
// Dočasně znehodnotí GEMINI_API_KEY v app_secrets, ověří že funkce stále
// vrátí správně přečtenou objednávku (přes fallback providera), a klíč
// PŘESNĚ OBNOVÍ (i když test spadne).
// Použití: node scripts/test-parse-order-fallback.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function loadEnv() {
  const env = {};
  const txt = fs.readFileSync(path.join(projectRoot, '.env'), 'utf8');
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const BEERS = [
  { id: 'b1', name: '12° Světlá', degree: '12°' },
  { id: 'b2', name: '11° Světlá', degree: '11°' },
  { id: 'b3', name: '10° Desítka', degree: '10°' },
  { id: 'b4', name: '12° Tmavá', degree: '12°' },
  { id: 'b5', name: 'Jantar', degree: null },
  { id: 'b6', name: 'Summer Ale', degree: null },
  { id: 'b7', name: '13 Hazy Bunny', degree: '13°' },
  { id: 'b8', name: 'Hazy Spring Day', degree: null },
];

const PACKAGES = [
  { id: 'p1', label: 'KEG 50l' },
  { id: 'p2', label: 'KEG 30l' },
  { id: 'p3', label: 'KEG 20l' },
  { id: 'p4', label: 'KEG 15l' },
  { id: 'p5', label: 'KEG 10l' },
  { id: 'p6', label: 'Lahve 1.5l' },
  { id: 'p7', label: 'Lahve 1l' },
  { id: 'p8', label: 'Lahve 0.5l' },
  { id: 'p9', label: 'Lahve 0.33l' },
];

const PLACES = ['Hospoda U Zajíce', 'Lukas', 'Seeberg', 'Žižkov', 'Malesice', 'Terasa'];

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL;
const serviceRole = env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.VITE_SUPABASE_ANON_KEY;
if (!supabaseUrl || !serviceRole || !anonKey) {
  console.error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY v .env');
  process.exit(1);
}

const TEST_TEXT = 'Ahoj, pro Lukas na pátek 2x 11° 30l sud a k tomu 10x 0,5 lahve.';
const TEST_BODY = {
  rawText: TEST_TEXT,
  beers: BEERS,
  packages: PACKAGES,
  places: PLACES,
  aliases: [],
  placeAliases: [],
  messages: [{ sender: 'Petr Bednář', date: '2026-08-06', text: TEST_TEXT }],
};

async function rest(pathStr, opts = {}) {
  const resp = await fetch(`${supabaseUrl}/rest/v1/${pathStr}`, {
    ...opts,
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  return resp;
}

async function getSecret(key) {
  const r = await rest(`app_secrets?key=eq.${key}&select=value`, { method: 'GET' });
  const rows = await r.json();
  return rows?.[0]?.value ?? null;
}

async function setSecret(key, value) {
  const r = await rest(`app_secrets?key=eq.${key}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`PATCH app_secrets selhal: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
}

async function callFunction() {
  const resp = await fetch(`${supabaseUrl}/functions/v1/parse-order-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify(TEST_BODY),
  });
  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  return { ok: resp.ok, status: resp.status, data, raw: raw.slice(0, 300) };
}

function checkResult(name, { ok, status, data }) {
  if (!ok) {
    console.error(`  ✗ ${name}: HTTP ${status}: ${(data && data.error) || ''}`);
    return false;
  }
  const items = data?.items ?? [];
  const placeOk = /lukas/i.test(data?.place_name ?? '') || items.some((i) => /lukas/i.test(i.place_name ?? ''));
  const has005 = items.some((i) => /0.5l/i.test(i.package_label ?? ''));
  const has11 = items.some((i) => /11/i.test(i.beer_name ?? '') || /11/.test(i.degree ?? ''));
  console.log(`  ${name}: place=Lukas ${placeOk}, lahve0.5 ${has005}, 11° ${has11}, items=${items.length}`);
  return placeOk && has005 && has11;
}

let failures = 0;
const originalKey = await getSecret('GEMINI_API_KEY');
if (!originalKey) {
  console.error('✗ Nenašel jsem GEMINI_API_KEY v app_secrets');
  process.exit(1);
}
console.log('Původní Gemini klíč načten (maskovaně):', originalKey.slice(0, 6) + '…');

try {
  console.log('\n--- 1) Dočasně znehodnocuji GEMINI_API_KEY ---');
  await setSecret('GEMINI_API_KEY', 'BAD_KEY_TEST');
  console.log('   GEMINI_API_KEY = BAD_KEY_TEST');

  console.log('\n--- 2) Volání funkce (očekávám fallback → Groq/Mistral/OpenAI) ---');
  const r1 = await callFunction();
  console.log(`   HTTP ${r1.status}`);
  if (!checkResult('fallback', r1)) failures++;
} finally {
  console.log('\n--- 3) Obnovuji původní GEMINI_API_KEY ---');
  try {
    await setSecret('GEMINI_API_KEY', originalKey);
    console.log('   klíč obnoven');
  } catch (e) {
    console.error(`   ✗ NEPODAŘILO SE OBNOVIT KLÍČ! ${e.message}`);
    failures++;
  }
}

console.log('\n--- 4) Volání funkce s obnoveným klíčem ---');
const r2 = await callFunction();
console.log(`   HTTP ${r2.status}`);
if (!checkResult('obnoveno', r2)) failures++;

console.log(`\n===== VÝSLEDEK: ${failures === 0 ? 'OK' : `${failures} CHYB`} =====`);
process.exit(failures > 0 ? 1 : 0);
