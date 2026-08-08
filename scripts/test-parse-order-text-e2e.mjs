// E2E test nasazené edge funkce parse-order-text (skutečné AI volání).
// Použití: node scripts/test-parse-order-text-e2e.mjs
// Načte VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY z .env a pošle 2 ukázkové
// WhatsApp objednávky. Ověřuje přiřazení piva/obalu, bedny a place_name.
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

const CASES = [
  {
    name: 'A: přiřazení piva/obalu + bedny',
    sender: 'Hospoda U Zajíce',
    text: 'Dobrý den, na čtvrtek potřebuji 2x 12° 50l keg, 1x 30l, 3 bedny 12sv a 2x jantar 30l. Bez etiket.',
  },
  {
    name: 'B: place_name z textu (pro Lukas) + lahve 0,5',
    sender: 'Petr Bednář',
    text: 'Ahoj, pro Lukas na pátek 2x 11° 30l sud a k tomu 10x 0,5 lahve.',
  },
];

async function callFunction(url, anonKey, body) {
  const resp = await fetch(`${url}/functions/v1/parse-order-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let data;
  try { data = JSON.parse(text); } catch { data = null; }
  return { ok: resp.ok, status: resp.status, data, raw: text.slice(0, 400) };
}

const env = loadEnv();
const fnUrl = env.VITE_SUPABASE_URL;
const anonKey = env.VITE_SUPABASE_ANON_KEY;

if (!fnUrl || !anonKey) {
  console.error('Chybí VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY v .env');
  process.exit(1);
}

let failures = 0;
for (const c of CASES) {
  console.log(`\n=== ${c.name} ===`);
  console.log(`  odesílatel: ${c.sender}`);
  console.log(`  text: ${c.text}`);
  const body = {
    rawText: c.text,
    beers: BEERS,
    packages: PACKAGES,
    places: PLACES,
    aliases: [],
    placeAliases: [],
    messages: [
      { sender: c.sender, date: '2026-08-06', text: c.text },
    ],
  };
  const { ok, status, data, raw } = await callFunction(fnUrl, anonKey, body);
  if (!ok) {
    console.error(`  ✗ HTTP ${status}: ${raw}`);
    failures++;
    continue;
  }
  console.log(`  place_name: ${JSON.stringify(data?.place_name ?? null)}`);
  console.log(`  items (${data?.items?.length ?? 0}):`);
  for (const it of data?.items ?? []) {
    console.log(
      `    - q=${it.quantity ?? 'null'} beer="${it.beer_name ?? 'null'}" pkg="${it.package_label ?? 'null'}" deg="${it.degree ?? 'null'}" place="${it.place_name ?? 'null'}" raw="${(it.raw_line ?? '').slice(0, 40)}"`
    );
  }
  const items = data?.items ?? [];
  const line = (q, b, p) => JSON.stringify({ q, b, p });
  if (c.sender === 'Hospoda U Zajíce') {
    const hasKeg50x2 = items.some(i => i.quantity === 2 && /50l/i.test(i.package_label ?? '') && /12/i.test(i.beer_name ?? ''));
    const hasJantar = items.some(i => /jantar/i.test(i.beer_name ?? ''));
    const hasBedny = items.some(i => i.quantity === 60 && /0.33/i.test(i.package_label ?? ''));
    console.log(`  kontroly: KEG50×2 12°=${hasKeg50x2} Jantar=${hasJantar} bedny(60×0.33)=${hasBedny}`);
    if (!(hasKeg50x2 && hasJantar && hasBedny)) failures++;
  }
  if (c.sender === 'Petr Bednář') {
    const placeOk = /lukas/i.test(data?.place_name ?? '') || items.some(i => /lukas/i.test(i.place_name ?? ''));
    const has005 = items.some(i => /0.5l/i.test(i.package_label ?? ''));
    const has11 = items.some(i => /11/i.test(i.beer_name ?? '') || /11/.test(i.degree ?? ''));
    console.log(`  kontroly: place=Lukas ${placeOk} lahve0.5 ${has005} 11° ${has11}`);
    if (!(placeOk && has005 && has11)) failures++;
  }
}

console.log(`\n===== VÝSLEDEK: ${failures === 0 ? 'OK' : `${failures} CHYB`} =====`);
process.exit(failures > 0 ? 1 : 0);
