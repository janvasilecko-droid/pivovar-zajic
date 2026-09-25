#!/usr/bin/env node
// 📌 Které verzi edge funkce odpovídá to, co běží na Supabase.
// ---------------------------------------------------------------------------
// Jedno místo pro výpočet i pro čtení/zápis souboru, ať se to nerozejde:
// čte to připomínka (zkontroluj-nasazeni.mjs), píše to nasazení z CI
// (zapis-nasazeni.mjs) i ruční nasazení z počítače (deploy-function.mjs).
//
// ⚠️ OTISK OBSAHU, NE COMMIT. První verze (18. 9. 2026) si pamatovala commit,
// který se funkce naposledy dotkl. Vypadalo to rozumně, ale rozbilo se to
// hned první den: CI zapsalo commity, které v klonu na jiném stroji VŮBEC
// NEEXISTUJÍ — `git log` závisí na tvaru checkoutu (hloubka, větve, merge),
// takže tatáž funkce vyšla jinak v CI a jinak na počítači a připomínka
// hlásila čtyři nenasazené funkce, které nasazené byly.
//
// Otisk obsahu tuhle vadu nemá: počítá se ze SOUBORŮ, které se nahrávají
// (index.ts + sdílené soubory, které funkce importuje), takže je všude
// stejný a nezávisí na historii. A odpovídá přesně na otázku, o kterou jde:
// „je nahrané to, co je v repozitáři?"
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const KOREN = new URL('..', import.meta.url).pathname;
export const ZAZNAM = join(KOREN, 'supabase', 'nasazeno.json');

/**
 * Sdílené soubory, které funkce doopravdy importuje.
 *
 * Záměrně ne „_shared se změnil → všechno je staré": deset ze třinácti funkcí
 * z _shared něco importuje, takže by připomínka po každé drobnosti vypsala
 * deset položek — a seznam, který je pokaždé celý, si člověk odvykne číst.
 */
function sdileneSoubory(zdroj) {
  return [...new Set([...zdroj.matchAll(/["']\.\.\/_shared\/([\w.-]+)["']/g)].map((m) => m[1]))].sort();
}

/**
 * Otisk funkce — kratší SHA-256 z jejího kódu i ze sdílených souborů,
 * které importuje. Prázdný řetězec = funkce v repozitáři není.
 */
export function otiskFunkce(slug) {
  const indexTs = join(KOREN, 'supabase', 'functions', slug, 'index.ts');
  if (!existsSync(indexTs)) return '';
  const zdroj = readFileSync(indexTs, 'utf8');
  const hash = createHash('sha256').update(zdroj);
  for (const soubor of sdileneSoubory(zdroj)) {
    const cesta = join(KOREN, 'supabase', 'functions', '_shared', soubor);
    if (existsSync(cesta)) hash.update(readFileSync(cesta));
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

export function zapisZaznam(zaznam) {
  writeFileSync(ZAZNAM, `${JSON.stringify(zaznam, null, 2)}\n`);
}

/** Zapíše, že dané funkce teď běží ve verzi z repozitáře. Vrací, co se zapsalo. */
export function zaznamenejNasazeni(slugy) {
  const zaznam = nactiZaznam();
  const zapsane = [];
  for (const slug of slugy) {
    const otisk = otiskFunkce(slug);
    if (!otisk) continue;
    zaznam[slug] = otisk;
    zapsane.push(slug);
  }
  if (zapsane.length > 0) zapisZaznam(zaznam);
  return zapsane;
}
