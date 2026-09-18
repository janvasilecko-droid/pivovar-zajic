// 📌 Záznam „co běží na Supabase" musí vyjít stejně na každém stroji.
// ---------------------------------------------------------------------------
// První verze (18. 9. 2026) si pamatovala COMMIT, který se funkce naposledy
// dotkl. Rozbilo se to hned první den: CI zapsalo commity, které v klonu na
// jiném stroji vůbec neexistovaly — `git log` závisí na tvaru checkoutu
// (hloubka, větve, merge). Připomínka pak hlásila čtyři nenasazené funkce,
// které nasazené byly — a přesně tím se z hlídače stane šum, co se ignoruje.
//
// Teď je klíčem OTISK OBSAHU souborů, které se nahrávají. Je všude stejný
// a odpovídá na otázku, o kterou jde: „je nahrané to, co je v repozitáři?"
//
// Skript se SPOUŠTÍ, neimportuje: pod vitestem chodí moduly přes Vite, takže
// `import.meta.url` není souborová cesta (vyjde „/@fs/…") a skript by si
// nenašel vlastní soubory. Testovat nástroj příkazové řádky jeho spuštěním
// je stejně poctivější — ověří se i to, že vůbec nastartuje.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const ZDROJ = readFileSync('scripts/nasazeni-zaznam.mjs', 'utf8');
/** Zdroj bez komentářů — jinak si test sáhne na popis chyby, kterou hlídá. */
const KOD = ZDROJ.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('otisk se počítá z obsahu, ne z gitu', () => {
  it('modul nesahá na git', () => {
    expect(KOD).not.toMatch(/execFileSync|child_process/);
  });

  it('počítá skutečný otisk obsahu', () => {
    expect(KOD).toMatch(/createHash\('sha256'\)/);
  });

  it('bere i sdílené soubory, které funkce importuje', () => {
    expect(KOD).toMatch(/_shared/);
  });
});

describe('uložený záznam sedí s repozitářem', () => {
  it('obsahuje všech třináct funkcí', () => {
    const zaznam = JSON.parse(readFileSync('supabase/nasazeno.json', 'utf8')) as Record<string, string>;
    expect(Object.keys(zaznam).filter((k) => !k.startsWith('_'))).toHaveLength(13);
  });

  it('kontrola hlásí, že je všechno nasazené', () => {
    // Když tenhle test spadne, je v mainu funkce, která se nenasadila —
    // což je právě to, co má připomínka hlásit. Skript nikdy nekončí chybou,
    // takže se čte jeho výpis.
    const vystup = execFileSync('node', ['scripts/zkontroluj-nasazeni.mjs'], { encoding: 'utf8' });
    expect(vystup, vystup).toContain('všechno nasazené');
  });
});
