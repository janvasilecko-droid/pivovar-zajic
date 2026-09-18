#!/usr/bin/env node
// 📌 Které verzi edge funkce odpovídá to, co běží na Supabase.
// ---------------------------------------------------------------------------
// Jedno místo pro výpočet i pro čtení/zápis souboru, ať se to nerozejde:
// čte to připomínka (zkontroluj-nasazeni.mjs), píše to nasazení z CI
// (zapis-nasazeni.mjs) i ruční nasazení z počítače (deploy-function.mjs).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const KOREN = new URL('..', import.meta.url).pathname;
export const ZAZNAM = join(KOREN, 'supabase', 'nasazeno.json');

/** Commit, který se dané cesty naposledy dotkl (prázdné = nezjištěno). */
export function posledniCommit(cesta) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%H', '--', cesta], { cwd: KOREN, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function datumCommitu(hash) {
  try {
    return execFileSync('git', ['show', '-s', '--format=%cI', hash], { cwd: KOREN, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Sdílené soubory, které funkce doopravdy importuje.
 *
 * Záměrně NE „_shared se změnil → všechno je staré": deset ze třinácti funkcí
 * z _shared něco importuje, takže by připomínka po každé drobnosti vypsala
 * deset položek — a seznam, který je pokaždé celý, si člověk odvykne číst.
 */
function sdileneSoubory(indexTs) {
  const zdroj = readFileSync(indexTs, 'utf8');
  return [...new Set([...zdroj.matchAll(/["']\.\.\/_shared\/([\w.-]+)["']/g)].map((m) => m[1]))];
}

/**
 * Commit, který pro danou funkci rozhoduje: novější z její vlastní složky
 * a ze sdílených souborů, které importuje.
 */
export function rozhodujiciCommit(slug) {
  const indexTs = join(KOREN, 'supabase', 'functions', slug, 'index.ts');
  if (!existsSync(indexTs)) return '';
  let vysledek = posledniCommit(`supabase/functions/${slug}`);
  for (const soubor of sdileneSoubory(indexTs)) {
    const h = posledniCommit(`supabase/functions/_shared/${soubor}`);
    if (h && (!vysledek || datumCommitu(h) > datumCommitu(vysledek))) vysledek = h;
  }
  return vysledek;
}

export function nactiZaznam() {
  try {
    return JSON.parse(readFileSync(ZAZNAM, 'utf8'));
  } catch {
    return {};
  }
}

export function zapisZaznam(zaznam) {
  writeFileSync(ZAZNAM, `${JSON.stringify(zaznam, null, 2)}\n`);
}

/** Zapíše, že dané funkce teď běží ve verzi z repozitáře. Vrací, co se zapsalo. */
export function zaznamenejNasazeni(slugy) {
  const zaznam = nactiZaznam();
  const zapsane = [];
  for (const slug of slugy) {
    const commit = rozhodujiciCommit(slug);
    if (!commit) continue;
    zaznam[slug] = commit;
    zapsane.push(slug);
  }
  if (zapsane.length > 0) zapisZaznam(zaznam);
  return zapsane;
}
