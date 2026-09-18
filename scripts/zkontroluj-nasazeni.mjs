#!/usr/bin/env node
/**
 * ⏰ Připomínka: edge funkce se změnila, ale nikdo ji nenasadil na Supabase.
 * ---------------------------------------------------------------------------
 * Proč tohle vzniklo (18. 9. 2026): oprava `whatsapp-auto-parse` — odpověď
 * bez odběratele si má vzít odběratele z citované zprávy — ležela v mainu
 * od 17. 9. a v provozu pořád běžela stará verze. Nikdo to nepoznal:
 * aplikace se nasazuje sama (Cloudflare bere main z GitHubu), edge funkce
 * NE. Majitel to popsal jako „říkal jsi, že to umí, a furt nic".
 *
 * Nasazení edge funkce potřebuje klíč `SUPABASE_ACCESS_TOKEN`, který je jen
 * v `.env` na jednom počítači (v GitHubu jako secret nastavený není — běh
 * nasazení pak vypíše „edge funkce se nasazují ručně"). Proto tahle
 * připomínka mlčí všude, kde se stejně nedá nic dělat, a ozve se jen tam,
 * kde `.env` je.
 *
 * Jak pozná nenasazenou funkci: u každé složky v supabase/functions se vezme
 * commit, který se jí naposledy dotkl, a porovná se s tím, co je zapsané
 * v supabase/nasazeno.json. Ten soubor píše scripts/deploy-function.mjs po
 * povedeném nasazení, takže se to udržuje samo.
 *
 * Nikdy nekončí chybou — je to připomínka, ne hlídač. Rozbít kvůli ní build
 * by znamenalo, že ji někdo vypne.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOREN = new URL('..', import.meta.url).pathname;
const FUNKCE_DIR = join(KOREN, 'supabase', 'functions');
const ZAZNAM = join(KOREN, 'supabase', 'nasazeno.json');

/** Commit, který se dané cesty naposledy dotkl (prázdné = nezjištěno). */
function posledniCommit(cesta) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', cesta], {
      cwd: KOREN, encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function nactiZaznam() {
  try {
    return JSON.parse(readFileSync(ZAZNAM, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Sdílené soubory, které funkce doopravdy importuje.
 *
 * Záměrně se NEbere „_shared se změnil → všechno je staré": deset ze třinácti
 * funkcí z _shared něco importuje, takže by připomínka po každé drobnosti
 * vypsala deset položek. Seznam, který se vypisuje pokaždé celý, si člověk
 * odvykne číst — a přesně to se stalo s nasazováním. Bere se jen ten soubor,
 * který funkce jmenuje ve svém importu; deploy-function.mjs přibaluje totéž.
 */
function sdileneSoubory(indexTs) {
  const zdroj = readFileSync(indexTs, 'utf8');
  const nalezy = [...zdroj.matchAll(/["']\.\.\/_shared\/([\w.-]+)["']/g)].map((m) => m[1]);
  return [...new Set(nalezy)];
}

/** Novější ze dvou commitů podle data (prázdný prohrává). */
function novejsi(a, b) {
  if (!a) return b;
  if (!b) return a;
  const da = datumCommitu(a);
  const db = datumCommitu(b);
  return db > da ? b : a;
}

function datumCommitu(hash) {
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', hash], { cwd: KOREN, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export function nenasazeneFunkce() {
  if (!existsSync(FUNKCE_DIR)) return [];
  const zaznam = nactiZaznam();
  const out = [];
  for (const jmeno of readdirSync(FUNKCE_DIR)) {
    const cesta = join(FUNKCE_DIR, jmeno);
    if (jmeno.startsWith('_') || !statSync(cesta).isDirectory()) continue;
    const indexTs = join(cesta, 'index.ts');
    if (!existsSync(indexTs)) continue;

    let rozhodujici = posledniCommit(`supabase/functions/${jmeno}`);
    if (!rozhodujici) continue;
    for (const soubor of sdileneSoubory(indexTs)) {
      rozhodujici = novejsi(rozhodujici, posledniCommit(`supabase/functions/_shared/${soubor}`));
    }
    if (zaznam[jmeno] !== rozhodujici) out.push({ jmeno, commit: rozhodujici, nasazeno: zaznam[jmeno] ?? null });
  }
  return out;
}

// Spuštění z příkazové řádky (ne při importu v testu).
if (process.argv[1] && process.argv[1].endsWith('zkontroluj-nasazeni.mjs')) {
  const cekaji = nenasazeneFunkce();
  if (cekaji.length === 0) {
    console.log('Edge funkce: všechno nasazené.');
    process.exit(0);
  }

  const muzuTady = existsSync(join(KOREN, '.env'));
  console.log('');
  console.log('⏰ ČEKÁ NASAZENÍ NA SUPABASE — aplikace se nasadí sama, edge funkce NE.');
  console.log('');
  for (const f of cekaji) {
    console.log(`   • ${f.jmeno}${f.nasazeno ? '' : '   (nasazená verze není zaznamenaná)'}`);
  }
  console.log('');
  if (muzuTady) {
    console.log('   Na tomhle počítači to jde — .env s klíčem tu je. Spusť:');
    for (const f of cekaji) console.log(`     node scripts/deploy-function.mjs ${f.jmeno}`);
    console.log('');
    console.log('   Ať se to příště nasazuje samo odkudkoli, vlož ten samý klíč z .env do GitHubu:');
    console.log('     https://github.com/janvasilecko-droid/pivovar-zajic/settings/secrets/actions/new');
    console.log('     Name: SUPABASE_ACCESS_TOKEN');
  } else {
    console.log('   Tady to nejde — chybí .env s klíčem. Udělej to na počítači, kde .env máš,');
    console.log('   nebo vlož klíč do GitHubu a bude se to nasazovat samo:');
    console.log('     https://github.com/janvasilecko-droid/pivovar-zajic/settings/secrets/actions/new');
  }
  console.log('');
  // Schválně 0: připomínka nesmí rozbít build ani kontroly.
  process.exit(0);
}
