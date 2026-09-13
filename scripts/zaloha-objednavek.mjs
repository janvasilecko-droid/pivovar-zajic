// 💾 Denní ŠIFROVANÁ záloha databáze do git repozitáře.
// ---------------------------------------------------------------------------
// Repozitář je VEŘEJNÝ. Do 13. 9. 2026 se sem ukládaly objednávky a stáčení
// v čitelném JSONu — komukoli na internetu. Od té doby:
//   • každá tabulka je zašifrovaná (scripts/lib/sifraZalohy.mjs, AES-256-GCM),
//   • bez hesla ZALOHA_HESLO se nic nezapíše (ani nezašifrovaně),
//   • zálohuje se celá databáze kromě tajemství a provozních logů
//     (seznam a důvody: scripts/lib/zalohaTabulky.mjs).
//
// Proč pořád do gitu: je to zadarmo, mimo Supabase a VERZOVANÉ — každý den
// commit, dá se vrátit ke stavu k libovolnému dni. Šifrované soubory se ale
// nedají porovnávat po řádcích, proto se tabulka přepíše jen když se její
// obsah opravdu změnil (otisk v manifest.json) — jinak by repozitář rostl
// o celou zálohu každý den.
//
// Spouští .github/workflows/zaloha.yml; ručně „Run workflow" na kartě Actions.
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zasifruj, otisk } from './lib/sifraZalohy.mjs';
import { TABULKY } from './lib/zalohaTabulky.mjs';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOZKA = resolve(KOREN, 'zalohy');
const URL_DB = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HESLO = process.env.ZALOHA_HESLO;

const chybi = [
  !URL_DB && '  • SUPABASE_URL není nastavené',
  !KLIC && '  • SUPABASE_SERVICE_ROLE_KEY není nastavený',
  (!HESLO || HESLO.length < 12) && '  • ZALOHA_HESLO chybí nebo je kratší než 12 znaků',
].filter(Boolean);

if (chybi.length) {
  console.error(
    'Záloha se nespustila:\n' + chybi.join('\n') +
    '\n\nNa GitHubu se přidává v Settings → Secrets and variables → Actions.' +
    '\nBez hesla se záloha záměrně NEZAPÍŠE — repozitář je veřejný.',
  );
  process.exit(1);
}

/** Načte celou tabulku po stránkách. Tabulka, která v databázi (zatím) není, vrátí null. */
async function nactiVse(tabulka, poradi) {
  const STRANKA = 1000;
  const out = [];
  for (let od = 0; ; od += STRANKA) {
    const r = await fetch(`${URL_DB}/rest/v1/${tabulka}?select=*&order=${poradi}`, {
      headers: { apikey: KLIC, Authorization: `Bearer ${KLIC}`, Range: `${od}-${od + STRANKA - 1}` },
    });
    if (!r.ok) {
      const text = await r.text();
      // Tabulka z ještě nespuštěné migrace — záloha kvůli ní nesmí spadnout celá.
      if (r.status === 404 || /PGRST205|42P01|does not exist/.test(text)) return null;
      throw new Error(`${tabulka}: HTTP ${r.status} ${text.slice(0, 200)}`);
    }
    const davka = await r.json();
    out.push(...davka);
    if (davka.length < STRANKA) break;
    if (out.length > 500_000) break;
  }
  return out;
}

mkdirSync(SLOZKA, { recursive: true });
const cestaManifestu = resolve(SLOZKA, 'manifest.json');
const minule = existsSync(cestaManifestu) ? JSON.parse(readFileSync(cestaManifestu, 'utf8')) : { tabulky: {} };

const manifest = {
  format: 'pivovar-zaloha-manifest',
  v: 1,
  // Mění se při každém běhu → každý den commit → hlídač v appce pozná,
  // že záloha doběhla, i když se data nezměnila.
  datum: new Date().toISOString(),
  tabulky: {},
  nejsouVDatabazi: [],
};
let prepsano = 0;

for (const [tabulka, pk] of TABULKY) {
  const radky = await nactiVse(tabulka, pk);
  if (radky === null) { manifest.nejsouVDatabazi.push(tabulka); continue; }
  const text = JSON.stringify(radky, null, 1) + '\n';
  const sha256 = otisk(text);
  const soubor = resolve(SLOZKA, `${tabulka}.json.enc`);
  if (minule.tabulky?.[tabulka]?.sha256 !== sha256 || !existsSync(soubor)) {
    writeFileSync(soubor, zasifruj(text, HESLO), 'utf8');
    prepsano++;
  }
  manifest.tabulky[tabulka] = { radku: radky.length, sha256 };

  // Starý nešifrovaný soubor pryč (v historii gitu zůstává — viz OBNOVA.md).
  const stary = resolve(SLOZKA, `${tabulka}.json`);
  if (existsSync(stary)) unlinkSync(stary);
}

writeFileSync(cestaManifestu, JSON.stringify(manifest, null, 1) + '\n', 'utf8');

const dnes = manifest.datum.slice(0, 10);
writeFileSync(
  resolve(SLOZKA, 'README.md'),
  [
    '# Zálohy',
    '',
    `Poslední záloha: **${dnes}** · tabulek ${Object.keys(manifest.tabulky).length} · přepsáno ${prepsano}`,
    '',
    '🔐 **Soubory jsou zašifrované** (AES-256-GCM). Bez hesla `ZALOHA_HESLO` je',
    'nikdo nepřečte — a bez něj je nejde ani obnovit. Heslo musí být uložené i mimo GitHub.',
    '',
    '**Obnova: [OBNOVA.md](OBNOVA.md)** — `node scripts/obnov-ze-zalohy.mjs`',
    'nejdřív jen ukáže, co by se změnilo; zapisuje se až s `--opravdu`.',
    '',
    ...(manifest.nejsouVDatabazi.length
      ? [`⚠️ V databázi zatím nejsou (nespuštěná migrace?): ${manifest.nejsouVDatabazi.join(', ')}`, '']
      : []),
    '_(Tenhle soubor přepisuje záloha při každém běhu — návod patří do OBNOVA.md.)_',
    '',
  ].join('\n'),
  'utf8',
);

console.log(`Záloha ${dnes}: ${Object.keys(manifest.tabulky).length} tabulek, přepsáno ${prepsano}` +
  (manifest.nejsouVDatabazi.length ? `, chybí v databázi: ${manifest.nejsouVDatabazi.join(', ')}` : ''));
