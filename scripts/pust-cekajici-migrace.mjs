#!/usr/bin/env node
// 🗄️ Pustí čekající migrace na produkci — volá se z CI po nasazení aplikace.
// ---------------------------------------------------------------------------
// Aplikace se nasazuje sama, migrace ne. Opakovaně se tak stávalo, že nová
// obrazovka byla na produkci a tabulka, kterou potřebuje, ne — a vypadalo to
// jako rozbitá aplikace (6. 9. 2026 čekalo šest migrací najednou).
//
// POJISTKY (proto to není prosté „pusť všechno"):
//  1. Pouští se jen migrace NOVĚJŠÍ než začátek evidence (stejná hranice jako
//     src/lib/migraceStav.ts). O starších se neví, jestli už běžely.
//  2. Po řadě od nejstarší; při první chybě se skončí a nic dalšího se nepustí.
//  3. Migrace, která maže data nebo tabulky (DROP TABLE, TRUNCATE, DELETE FROM
//     bez WHERE, DROP COLUMN), se automaticky NEPUSTÍ — zůstane čekat na
//     tlačítko v Diagnostice, kde ji člověk pustí vědomě. Výjimku jde povolit
//     řádkem `-- auto-migrace: povoleno` přímo v souboru.
//  4. Celé je to vypnuté, dokud v repozitáři není proměnná AUTO_MIGRACE=ano
//     (Settings → Secrets and variables → Actions → Variables) a klíč
//     SUPABASE_ACCESS_TOKEN (Secrets). Bez nich skript jen vypíše, co čeká.
//
// Použití: node scripts/pust-cekajici-migrace.mjs [--nanecisto]
import { readdirSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SLOZKA = resolve(KOREN, 'supabase/migrations');
const PROJEKT = 'sasqexjadvlqyticxwja';
// Musí sedět se ZACATEK_EVIDENCE v src/lib/migraceStav.ts.
export const ZACATEK_EVIDENCE = '20261227010000_evidence_migraci.sql';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ZAPNUTO = (process.env.AUTO_MIGRACE || '').toLowerCase() === 'ano';
const NANECISTO = process.argv.includes('--nanecisto') || !ZAPNUTO;

/** Vrátí důvod, proč migraci nepouštět automaticky, nebo null. */
export function nebezpecna(sql) {
  if (/--\s*auto-migrace:\s*povoleno/i.test(sql)) return null;
  // Komentáře pryč, ať slovo „DROP TABLE" v popisu migraci nezablokuje.
  const kod = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/\bDROP\s+TABLE\b/i.test(kod)) return 'maže tabulku (DROP TABLE)';
  if (/\bTRUNCATE\b/i.test(kod)) return 'maže obsah tabulky (TRUNCATE)';
  if (/\bDROP\s+COLUMN\b/i.test(kod)) return 'maže sloupec (DROP COLUMN)';
  for (const m of kod.matchAll(/\bDELETE\s+FROM\b[^;]*;/gi)) {
    if (!/\bWHERE\b/i.test(m[0])) return 'maže všechny řádky (DELETE bez WHERE)';
  }
  return null;
}

async function dotaz(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJEKT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : [];
}

/** Shrnutí do GitHub Actions (když běží v CI), jinak jen na výstup. */
function shrnuti(radky) {
  const text = radky.join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

async function main() {
  if (!TOKEN) {
    shrnuti(['### Migrace', 'Klíč `SUPABASE_ACCESS_TOKEN` není nastaven — automatické migrace jsou vypnuté. Pouštějí se tlačítkem v Diagnostice.']);
    return;
  }

  const soubory = readdirSync(SLOZKA).filter((f) => f.endsWith('.sql') && f >= ZACATEK_EVIDENCE).sort();

  // Zjistit, co už běžalo, je JEN HLÁŠENÍ — když se to nepovede, není to
  // důvod položit nasazení. 18. 9. 2026 tenhle dotaz vrátil HTTP 403 (token
  // nemá práva na Management API), skript spadl na výjimce a s ním celý job —
  // takže se NENASADILY ani edge funkce, kvůli kterým se klíč zaváděl.
  // Hlášení o migracích nesmí blokovat nasazení funkcí.
  let aplikovane;
  try {
    aplikovane = new Set((await dotaz('SELECT nazev FROM public.migrace_aplikovane;')).map((r) => r.nazev));
  } catch (e) {
    const zprava = e instanceof Error ? e.message : String(e);
    const prava = /\b403\b|privileges/i.test(zprava);
    shrnuti(['### Migrace', `Stav migrací se nepodařilo zjistit: ${zprava}`, '',
      prava
        ? 'Token nemá práva na Management API. Migrace se dá pustit tlačítkem v Diagnostice; nasazení tím nekončí.'
        : 'Migrace se dá pustit tlačítkem v Diagnostice; nasazení tím nekončí.']);
    return;
  }
  const cekajici = soubory.filter((f) => !aplikovane.has(f));

  if (cekajici.length === 0) {
    shrnuti(['### Migrace', 'Nic nečeká — databáze odpovídá repozitáři.']);
    return;
  }

  const vystup = ['### Migrace', NANECISTO
    ? `Automatické pouštění je vypnuté (proměnná \`AUTO_MIGRACE\` není \`ano\`). Čeká ${cekajici.length}:`
    : `Čeká ${cekajici.length}, pouštím po řadě:`];

  for (const f of cekajici) {
    const sql = readFileSync(resolve(SLOZKA, f), 'utf8');
    const duvod = nebezpecna(sql);
    if (duvod) {
      vystup.push(`- ⏸️ \`${f}\` — ${duvod}; pusť ji vědomě v Diagnostice. Další migrace čekají za ní.`);
      break;
    }
    if (NANECISTO) { vystup.push(`- \`${f}\``); continue; }
    try {
      await dotaz(sql);
      await dotaz(`INSERT INTO public.migrace_aplikovane (nazev, zdroj) VALUES ('${f.replace(/'/g, "''")}', 'ci') ON CONFLICT (nazev) DO NOTHING;`);
      vystup.push(`- ✅ \`${f}\``);
    } catch (e) {
      vystup.push(`- ❌ \`${f}\` — ${e instanceof Error ? e.message : String(e)}`, '', 'Zastaveno, další migrace se nepouštěly.');
      shrnuti(vystup);
      process.exitCode = 1;
      return;
    }
  }
  shrnuti(vystup);
}

// Import z testu nemá nic pouštět.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
