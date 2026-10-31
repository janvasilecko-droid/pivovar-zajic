#!/usr/bin/env node
// 📚 Edge funkce PROJEKTU BIBLE: které se liší od toho, co v projektu běží.
// ---------------------------------------------------------------------------
// Projekt bible je samostatný Supabase projekt (cegrelgvkygcatupqwrx,
// rozhodnutí R12). Jeho funkce leží v bible/supabase/functions a nasazuje je
// CI krokem „Edge funkce projektu bible" (deploy.yml) — nikdy do hlavního
// projektu. Záznam o nasazení je v bible/supabase/nasazeno.json.
//
// Stejná zásada jako u funkcí appky (scripts/nasazeni-zaznam.mjs): OTISK
// OBSAHU, ne git diff — zmeškané nasazení dojede sám další běh. Otisk se tu
// počítá z CELÉ složky funkce, celé složky _shared (bez testů) a config.toml:
// importy uvnitř _shared nebo změna verify_jwt se tak neztratí.
//
//   node scripts/bible-nasazeni.mjs --jen-jmena     → funkce k nasazení (řádek po řádku)
//   node scripts/bible-nasazeni.mjs --zapis a b     → zapíše, že a, b teď běží v této verzi
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Ve vitestu je import.meta.url přes /@fs/… — předpona pryč, ať sedí cesta na disku.
export const KOREN = decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/@fs/, '');
export const FUNKCE_DIR = join(KOREN, 'bible', 'supabase', 'functions');
export const ZAZNAM = join(KOREN, 'bible', 'supabase', 'nasazeno.json');
const CONFIG = join(KOREN, 'bible', 'supabase', 'config.toml');

function souboryVeSlozce(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const jmeno of readdirSync(dir).sort()) {
    const cesta = join(dir, jmeno);
    if (statSync(cesta).isDirectory()) out.push(...souboryVeSlozce(cesta));
    else if (!/\.test\.ts$/.test(jmeno)) out.push(cesta);
  }
  return out;
}

/** Funkce projektu bible (složky s index.ts, mimo _shared). */
export function funkceBible() {
  if (!existsSync(FUNKCE_DIR)) return [];
  return readdirSync(FUNKCE_DIR)
    .filter((s) => !s.startsWith('_') && existsSync(join(FUNKCE_DIR, s, 'index.ts')))
    .sort();
}

/** Kratší SHA-256 všeho, co se s funkcí nahrává; '' = funkce v repozitáři není. */
export function otiskFunkce(slug) {
  const dir = join(FUNKCE_DIR, slug);
  if (!existsSync(join(dir, 'index.ts'))) return '';
  const hash = createHash('sha256');
  const soubory = [...souboryVeSlozce(dir), ...souboryVeSlozce(join(FUNKCE_DIR, '_shared'))];
  if (existsSync(CONFIG)) soubory.push(CONFIG);
  for (const f of soubory) {
    hash.update(relative(KOREN, f));
    hash.update('\0');
    hash.update(readFileSync(f));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

export function nactiZaznam() {
  try {
    return JSON.parse(readFileSync(ZAZNAM, 'utf8'));
  } catch {
    return {};
  }
}

export function nenasazene() {
  const zaznam = nactiZaznam();
  return funkceBible().filter((slug) => zaznam[slug] !== otiskFunkce(slug));
}

export function zaznamenej(slugy) {
  const zaznam = nactiZaznam();
  const zapsane = [];
  for (const slug of slugy) {
    const otisk = otiskFunkce(slug);
    if (!otisk) continue;
    zaznam[slug] = otisk;
    zapsane.push(slug);
  }
  if (zapsane.length > 0) writeFileSync(ZAZNAM, `${JSON.stringify(zaznam, null, 2)}\n`);
  return zapsane;
}

if (process.argv[1] && process.argv[1].endsWith('bible-nasazeni.mjs')) {
  if (process.argv.includes('--jen-jmena')) {
    for (const f of nenasazene()) console.log(f);
  } else if (process.argv.includes('--zapis')) {
    const slugy = process.argv.slice(process.argv.indexOf('--zapis') + 1).filter(Boolean);
    const zapsane = zaznamenej(slugy);
    console.log(zapsane.length > 0 ? `Zapsáno do bible/supabase/nasazeno.json: ${zapsane.join(', ')}` : 'Nic k zápisu.');
  } else {
    const cekaji = nenasazene();
    console.log(cekaji.length > 0 ? `Funkce bible čekají na nasazení: ${cekaji.join(', ')}` : 'Funkce bible: všechno nasazené.');
  }
}
