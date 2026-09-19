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
  const zaznam = () =>
    JSON.parse(readFileSync('supabase/nasazeno.json', 'utf8')) as Record<string, string>;
  const funkce = (z: Record<string, string>) => Object.keys(z).filter((k) => !k.startsWith('_'));

  it('obsahuje všech třináct funkcí', () => {
    expect(funkce(zaznam())).toHaveLength(13);
  });

  it('klíčem je otisk obsahu, ne commit', () => {
    // První verze (18. 9. 2026) ukládala commit hash — 40 znaků a na každém
    // stroji jiný. Otisk je 16 znaků sha256 z obsahu nahrávaných souborů.
    const z = zaznam();
    for (const f of funkce(z)) {
      expect(z[f], `${f}: ${z[f]}`).toMatch(/^[0-9a-f]{16}$/);
    }
  });
});

// ⚠️ Tady se SCHVÁLNĚ NEKONTROLUJE, jestli je všechno nasazené.
// První verze to zkoušela (19. 9. 2026) a zacyklila se: nasazení běží až ZA
// testy, takže commit, který mění edge funkci, má záznam z podstaty věci
// ještě starý — test spadl, nasazení se nespustilo a záznam se neměl jak
// srovnat. Změněná edge funkce by se do provozu nedostala už nikdy.
//
// Stav provozu není vlastnost repozitáře. Od toho je připomínka při startu
// (scripts/zkontroluj-nasazeni.mjs), která schválně nikdy nekončí chybou —
// hlídač, který rozbíjí build, se za týden vypne. Test hlídá jen to, že
// připomínka funguje a nelze ji přehlédnout.
describe('připomínka nenasazených funkcí', () => {
  const spust = () =>
    execFileSync('node', ['scripts/zkontroluj-nasazeni.mjs'], { encoding: 'utf8' });

  it('nikdy nekončí chybou — nesmí rozbít build ani kontroly', () => {
    expect(() => spust()).not.toThrow();
  });

  it('řekne buď „všechno nasazené", nebo vyjmenuje, co chýbí', () => {
    const vystup = spust();
    const vseNasazeno = vystup.includes('všechno nasazené');
    const hlasiChybejici = vystup.includes('NEBĚŽÍ V POSLEDNÍ VERZI');
    expect(vseNasazeno !== hlasiChybejici, vystup).toBe(true);
  });

  it('když něco chýbí, řekne i jak to naspravit', () => {
    const vystup = spust();
    if (vystup.includes('všechno nasazené')) return;
    expect(vystup).toContain('pushni do mainu');
    expect(vystup).toContain('actions');
  });
});
