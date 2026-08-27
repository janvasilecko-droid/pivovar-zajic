#!/usr/bin/env node
/**
 * Připíše zápisy z aplikace na konec Google Tabulky.
 *
 * Nahrazuje ruční kopírování: vezme stejná data a ve stejném rozvržení, jaké
 * dává tlačítko „Přehled k vykopírování", a připíše je pod poslední vyplněný
 * řádek listu.
 *
 * ⚠️ PŘEDPOKLADY (bez nich to nepoběží):
 *
 *  1. List musí být NATIVNÍ Google Tabulka, ne nahraný .xlsx. Soubory
 *     s odznakem „.XLSX" v záhlaví jsou excelové přílohy otevřené v Tabulkách
 *     a Sheets API do nich zapisovat neumí.
 *     → V Tabulkách: Soubor → Uložit jako Tabulky Google. Vznikne nový soubor,
 *       jehož ID (z adresy) se použije níž.
 *
 *  2. Servisní účet Google s přístupem k Sheets API a soubor s jeho klíčem
 *     (JSON). Ten se do repozitáře NEDÁVÁ — cesta k němu se předá proměnnou
 *     GOOGLE_KLIC (výchozí ../google-klic.json vedle projektu).
 *
 *  3. Tabulka musí být nasdílená e-mailu toho servisního účtu s právem
 *     Editor (e-mail je v klíči jako client_email).
 *
 * Použití:
 *   node scripts/vloz-do-tabulky.mjs --list <ID_TABULKY> --zdroj personal \
 *       --od 2026-08-01 --do 2026-08-31 [--karta List1] [--nanecisto]
 *
 *   --zdroj: personal | prodejna | odpis | lahve | keg
 *   --nanecisto: jen vypíše, co by vložilo, a nic nezapíše
 *
 * Ověření a přístup:
 *   Data se čtou ze Supabase servisním klíčem z .env (stejně jako zálohy
 *   v scripts/zaloha-objednavek.mjs).
 */
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

// ── Argumenty ─────────────────────────────────────────────────────────────
const arg = (jmeno, vychozi = null) => {
  const i = process.argv.indexOf(`--${jmeno}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : vychozi;
};
const jeArg = (jmeno) => process.argv.includes(`--${jmeno}`);

const idTabulky = arg('list');
const zdrojKlic = arg('zdroj');
const karta = arg('karta', 'List1');
const od = arg('od');
const doKdy = arg('do');
const nanecisto = jeArg('nanecisto');

if (!idTabulky || !zdrojKlic || !od || !doKdy) {
  console.error('Chybí argument. Příklad:\n  node scripts/vloz-do-tabulky.mjs --list <ID> --zdroj personal --od 2026-08-01 --do 2026-08-31');
  process.exit(1);
}

// ── Rozvržení listů — musí odpovídat lib/prehledVydeje.ts ────────────────
const SLOUPCE_SUDY = [50, 30, 20, 15, 10];
const SLOUPCE_LAHVE = [1.5, 1, 0.5, 0.33];

const ZDROJE = {
  personal: { tabulka: 'fasovani', varianta: 'odberatel' },
  prodejna: { tabulka: 'fasovani_private', varianta: 'odberatel' },
  odpis: { tabulka: 'writeoffs', varianta: 'odberatel' },
  lahve: { tabulka: 'bottling', varianta: 'staceni_lahve' },
  keg: { tabulka: 'kegging', varianta: 'staceni_keg' },
};

const zdroj = ZDROJE[zdrojKlic];
if (!zdroj) {
  console.error(`Neznámý zdroj "${zdrojKlic}". Možnosti: ${Object.keys(ZDROJE).join(', ')}`);
  process.exit(1);
}

// ── Supabase ──────────────────────────────────────────────────────────────
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const zEnv = (klic) => env.match(new RegExp(`^\\s*${klic}\\s*=\\s*["']?([^"'\\r\\n]+)`, 'm'))?.[1]?.trim();
const supabaseUrl = zEnv('VITE_SUPABASE_URL');
const supabaseKlic = zEnv('VITE_SUPABASE_SERVICE_ROLE_KEY');
if (!supabaseUrl || !supabaseKlic) {
  console.error('Chybí VITE_SUPABASE_URL nebo VITE_SUPABASE_SERVICE_ROLE_KEY v .env');
  process.exit(1);
}

// Číselníky (obaly, tanky) nemají entry_date — řadit se dá jen tam, kde je.
async function ctiTabulku(tabulka, sloupce, razeni = null) {
  const out = [];
  const STRANKA = 1000;
  for (let odRadku = 0; ; odRadku += STRANKA) {
    const dotaz = `select=${sloupce}` + (razeni ? `&order=${razeni}` : '');
    const r = await fetch(`${supabaseUrl}/rest/v1/${tabulka}?${dotaz}`, {
      headers: {
        apikey: supabaseKlic,
        Authorization: `Bearer ${supabaseKlic}`,
        Range: `${odRadku}-${odRadku + STRANKA - 1}`,
      },
    });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < STRANKA) break;
  }
  return out;
}

// ── Sestavení řádků (stejná pravidla jako v aplikaci) ────────────────────
const klicObjemu = (l) => Math.round(l * 100) / 100;
const formatDatum = (iso) => {
  const [r, m, d] = iso.split('-');
  return `${Number(d)}.${Number(m)}.${r}`;
};

function sestav(radky, obaly, varianta, tanky) {
  const mapaObalu = new Map(obaly.map((o) => [o.id, o]));
  const mapaTanku = new Map(tanky.map((t) => [t.id, (t.label || '').trim()]));
  const sloupce = varianta === 'staceni_keg' ? SLOUPCE_SUDY : [...SLOUPCE_SUDY, ...SLOUPCE_LAHVE];
  const dovolene = new Set(sloupce.map(klicObjemu));
  const podleKlice = new Map();

  for (const r of radky) {
    if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy) continue;

    // U stáčení lahví jsou sloupce „Z sudů" spotřebované sudy (kegs_used),
    // ne obal zápisu — proto se z jednoho řádku dělají dvě položky.
    const polozky = [{ package_id: r.package_id, quantity: r.quantity }];
    if (varianta === 'staceni_lahve' && Number(r.kegs_used) > 0 && r.kegs_used_package_id) {
      polozky.push({ package_id: r.kegs_used_package_id, quantity: r.kegs_used });
    }

    const odberatel = (r.who || '').trim() || (r.note || '').trim() || '—';
    const pivo = (r.beer_name || '').trim() || '—';
    const klic = `${r.entry_date}|${odberatel}|${pivo}`;
    const zaznam = podleKlice.get(klic) ?? { datum: r.entry_date, odberatel, pivo, tank: '', kusy: {} };

    const tank = r.cellar_tank_id ? (mapaTanku.get(r.cellar_tank_id) ?? '') : '';
    if (tank && !zaznam.tank.split(', ').includes(tank)) {
      zaznam.tank = zaznam.tank ? `${zaznam.tank}, ${tank}` : tank;
    }

    for (const p of polozky) {
      const ks = Number(p.quantity || 0);
      if (!ks || !p.package_id) continue;
      const objem = klicObjemu(Number(mapaObalu.get(p.package_id)?.volume_l ?? 0));
      if (!dovolene.has(objem)) continue;
      zaznam.kusy[objem] = (zaznam.kusy[objem] ?? 0) + ks;
    }

    podleKlice.set(klic, zaznam);
  }

  return [...podleKlice.values()]
    .filter((z) => Object.keys(z.kusy).length > 0)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.odberatel.localeCompare(b.odberatel, 'cs') || a.pivo.localeCompare(b.pivo, 'cs'))
    .map((z) => [
      formatDatum(z.datum),
      ...(varianta === 'odberatel' ? [z.odberatel] : []),
      z.pivo,
      ...sloupce.map((l) => (z.kusy[klicObjemu(l)] ? z.kusy[klicObjemu(l)] : '')),
      ...(varianta === 'staceni_keg' ? [z.tank] : []),
    ]);
}

// ── Přihlášení servisního účtu (JWT → přístupový token) ──────────────────
function base64url(vstup) {
  return Buffer.from(vstup).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function ziskejToken(klic) {
  const ted = Math.floor(Date.now() / 1000);
  const hlavicka = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const telo = base64url(JSON.stringify({
    iss: klic.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: ted + 3600,
    iat: ted,
  }));
  const podpis = createSign('RSA-SHA256').update(`${hlavicka}.${telo}`).sign(klic.private_key);
  const jwt = `${hlavicka}.${telo}.${podpis.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!r.ok) throw new Error(`Přihlášení selhalo: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).access_token;
}

// ── Běh ───────────────────────────────────────────────────────────────────
const sloupceZdroje = zdroj.varianta === 'staceni_lahve'
  ? 'entry_date,beer_name,package_id,quantity,note,kegs_used,kegs_used_package_id'
  : zdroj.varianta === 'staceni_keg'
  ? 'entry_date,beer_name,package_id,quantity,note,cellar_tank_id'
  : 'entry_date,beer_name,package_id,quantity,who,note';

const [zapisy, obaly, tanky] = await Promise.all([
  ctiTabulku(zdroj.tabulka, sloupceZdroje, 'entry_date'),
  ctiTabulku('packages', 'id,label,kind,volume_l'),
  zdroj.varianta === 'staceni_keg' ? ctiTabulku('cellar_tanks', 'id,label') : Promise.resolve([]),
]);

const radky = sestav(zapisy, obaly, zdroj.varianta, tanky);
console.log(`Zdroj: ${zdroj.tabulka} (${zdroj.varianta}), období ${od} – ${doKdy}`);
console.log(`Řádků k vložení: ${radky.length}`);
if (!radky.length) process.exit(0);

console.log('\nPrvní tři řádky:');
radky.slice(0, 3).forEach((r) => console.log('  ' + r.join(' | ')));

if (nanecisto) {
  console.log('\n(nanečisto — nic se nezapisuje)');
  process.exit(0);
}

const cestaKlice = process.env.GOOGLE_KLIC || new URL('../../google-klic.json', import.meta.url).pathname.replace(/^\//, '');
let klic;
try {
  klic = JSON.parse(readFileSync(cestaKlice, 'utf8'));
} catch (e) {
  console.error(`\nNepodařilo se načíst klíč servisního účtu (${cestaKlice}).`);
  console.error('Nastav cestu proměnnou GOOGLE_KLIC, nebo si klíč vytvoř — postup je v komentáři nahoře.');
  process.exit(1);
}

const token = await ziskejToken(klic);
const rozsah = encodeURIComponent(`${karta}!A:A`);
const r = await fetch(
  `https://sheets.googleapis.com/v4/spreadsheets/${idTabulky}/values/${rozsah}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: radky }),
  },
);

const odpoved = await r.text();
if (!r.ok) {
  console.error(`\nZápis selhal: HTTP ${r.status}`);
  console.error(odpoved.slice(0, 500));
  if (r.status === 403) console.error(`\nTip: je tabulka nasdílená účtu ${klic.client_email} jako Editor?`);
  if (r.status === 400 && odpoved.includes('not supported')) {
    console.error('\nTip: soubor je nejspíš .xlsx. Převeď ho: Soubor → Uložit jako Tabulky Google.');
  }
  process.exit(1);
}

const kam = JSON.parse(odpoved)?.updates?.updatedRange ?? '(neuvedeno)';
console.log(`\nHotovo — vloženo ${radky.length} řádků do ${kam}.`);
