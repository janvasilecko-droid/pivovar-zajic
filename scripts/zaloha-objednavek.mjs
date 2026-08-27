// 💾 Denní záloha objednávek a stáčení do git repozitáře.
// ---------------------------------------------------------------------------
// Zálohují se JEN tabulky, na kterých záleží a které nejdou dopočítat:
//   orders + order_items  … co si kdo objednal
//   kegging + bottling    … co se kdy stočilo
// Závoz se nezálohuje — odečty se dají odvodit z objednávek.
//
// Proč do gitu: je to zadarmo, mimo Supabase (takže to přežije i smazání
// projektu) a hlavně VERZOVANÉ — každý den je jeden commit, takže se dá
// vrátit ke stavu k libovolnému dni, ne jen k poslednímu. Placené zálohy
// Supabase tohle umí taky, tohle nestojí nic.
//
// Spouští se z .github/workflows/zaloha.yml každý den; ručně jde pustit
// přes „Run workflow" na kartě Actions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_DB || !KLIC) {
  console.error(
    'Záloha se nespustila — chybí přístup k databázi.\n' +
    (URL_DB ? '' : '  • SUPABASE_URL není nastavené\n') +
    (KLIC ? '' : '  • SUPABASE_SERVICE_ROLE_KEY není nastavený\n') +
    '\nNa GitHubu se přidává v Settings → Secrets and variables → Actions.\n' +
    'Hodnotu servisního klíče najdeš v Supabase → Project Settings → API\n' +
    '(pole "service_role"). Lokálně je v .env jako VITE_SUPABASE_SERVICE_ROLE_KEY.'
  );
  process.exit(1);
}

const TABULKY = ['orders', 'order_items', 'kegging', 'bottling'];

/** Načte celou tabulku po stránkách — Supabase vrací nejvýš 1000 řádků naráz. */
async function nactiVse(tabulka) {
  const STRANKA = 1000;
  const out = [];
  for (let od = 0; ; od += STRANKA) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?select=*&order=id`, {
      headers: {
        apikey: KLIC,
        Authorization: `Bearer ${KLIC}`,
        Range: `${od}-${od + STRANKA - 1}`,
      },
    });
    if (!r.ok) throw new Error(`${tabulka}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < STRANKA) break;
    if (out.length > 500_000) break;
  }
  return out;
}

const dnes = new Date().toISOString().slice(0, 10);
const slozka = resolve(KOREN, 'zalohy');
mkdirSync(slozka, { recursive: true });

const souhrn = {};
for (const t of TABULKY) {
  const radky = await nactiVse(t);
  souhrn[t] = radky.length;
  // Každá tabulka zvlášť — menší soubory se v gitu lépe porovnávají a
  // v historii je pak vidět, co přesně se který den změnilo.
  writeFileSync(resolve(slozka, `${t}.json`), JSON.stringify(radky, null, 1) + '\n', 'utf8');
}

writeFileSync(
  resolve(slozka, 'README.md'),
  [
    '# Zálohy',
    '',
    `Poslední záloha: **${dnes}**`,
    '',
    '| Tabulka | Řádků |',
    '| --- | ---: |',
    ...TABULKY.map((t) => `| ${t} | ${souhrn[t]} |`),
    '',
    'Zálohuje se automaticky každý den (`.github/workflows/zaloha.yml`).',
    'Každý den je jeden commit, takže se dá vrátit ke stavu k libovolnému dni.',
    '',
    '**Obnova: [OBNOVA.md](OBNOVA.md)** — `node scripts/obnov-ze-zalohy.mjs`',
    'nejdřív jen ukáže, co by se změnilo; zapisuje se až s `--opravdu`.',
    '',
    '_(Tenhle soubor přepisuje záloha při každém běhu — návod patří do OBNOVA.md.)_',
    '',
    '⚠️ Závoz (`zavoz_deductions`) se zálohuje záměrně NE — odečty se dají',
    'odvodit z objednávek.',
  ].join('\n'),
  'utf8'
);

console.log(`Záloha ${dnes}: ` + TABULKY.map((t) => `${t}=${souhrn[t]}`).join(', '));
