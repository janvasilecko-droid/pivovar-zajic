// E2E test nasazené funkce parse-order-text — scénář z hlášení uživatele:
// odesílatel "Miláček" posílá objednávku, odběratel "U Dubu" je UVNITŘ zprávy.
// Odesílatel se nesmí objevit jako place_name.
// Použití: node scripts/test-sender-vs-customer.mjs
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
];
const PACKAGES = [
  { id: 'p1', label: 'KEG 50l' },
  { id: 'p2', label: 'KEG 30l' },
  { id: 'p3', label: 'KEG 20l' },
];
// V seznamu známých odběratelů je i "Miláček" — i tak nesmí vyhrát, protože je odesílatel.
const PLACES = ['U Dubu', 'Miláček', 'Seeberg', 'U Zajíce', 'Malešice'];

const CASES = [
  {
    name: 'Odesílatel Miláček, v textu "pro U Dubu"',
    sender: 'Miláček',
    text: 'Dobrý den, tady Miláček. Objednáváme pro U Dubu 2x 12° 50l sud a 1x 30l. Díky.',
    expected: /u dubu/i,
  },
  {
    name: 'Odesílatel Miláček, v textu "objednávka U Dubu" (bez slova pro)',
    sender: 'Miláček',
    text: 'Ahoj, objednávka U Dubu: 3x 11° 30l. Díky moc.',
    expected: /u dubu/i,
  },
  {
    name: 'Odesílatel Miláček, v textu není žádný odběratel → place_name by měl být null',
    sender: 'Miláček',
    text: 'Dobrý den, prosím 2x 12° 50l sud. Děkuji.',
    expected: null,
  },
];

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
    messages: [{ sender: c.sender, date: '2026-08-06', text: c.text }],
  };
  const resp = await fetch(`${fnUrl}/functions/v1/parse-order-text`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }

  if (!resp.ok) {
    console.error(`  ✗ HTTP ${resp.status}: ${raw.slice(0, 300)}`);
    failures++;
    continue;
  }

  const top = data?.place_name ?? null;
  const itemPlaces = [...new Set((data?.items ?? []).map((i) => i.place_name).filter(Boolean))];
  console.log(`  top-level place_name: ${JSON.stringify(top)}`);
  console.log(`  place_name položek:   ${JSON.stringify(itemPlaces)}`);

  let ok;
  if (c.expected === null) {
    ok = top === null || top === undefined;
  } else {
    ok = (top && c.expected.test(top)) || itemPlaces.some((p) => c.expected.test(p));
  }
  console.log(ok ? '  ✓ OK' : `  ✗ očekáváno: ${c.expected} (nebo null), dostáno: ${JSON.stringify(top)}`);
  if (!ok) failures++;
}

console.log(`\n${failures === 0 ? '✅ VŠE V POŘÁDKU' : `❌ SELHÁNÍ: ${failures}`}`);
process.exit(failures === 0 ? 0 : 1);
