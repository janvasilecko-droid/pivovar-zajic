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

  it('obsahuje všech čtrnáct funkcí', () => {
    expect(funkce(zaznam())).toHaveLength(14);
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

// ⚠️ Výběr funkcí k nasazení musí vycházet z OTISKU, ne z git diffu.
// Běhy #730 a #731 (19. 9. 2026): #730 spadl na testu dřív, než se nasadilo,
// a #731 už ve svém diffu proti předchozímu commitu žádnou edge funkci
// neviděl — oprava čtení zpráv zůstala ležet v mainu a v provozu běžela stará
// verze. Otisk je samoopravný: říká, co se od nahrané verze LIŠÍ, takže
// zmeškané nasazení dojede sám další běh.
describe('nasazení si vybírá funkce podle otisku', () => {
  const WORKFLOW = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const KROK = WORKFLOW.slice(WORKFLOW.indexOf('Změněné edge funkce'));

  it('seznam bere z kontroly nasazení', () => {
    expect(KROK).toMatch(/zkontroluj-nasazeni\.mjs --jen-jmena/);
  });

  it('nerozhoduje se podle git diffu proti předchozímu commitu', () => {
    const kod = KROK.split('\n').filter((r) => !r.trim().startsWith('#')).join('\n');
    // `git diff --cached` níž je něco jiného — zjišťuje, jestli se záznam
    // vůbec změnil, než se commitne. Zakázaný je výběr funkcí z diffu.
    expect(kod).not.toMatch(/git diff --name-only/);
    expect(kod).not.toMatch(/github\.event\.before/);
  });

  it('--jen-jmena vypíše holý seznam, nic víc', () => {
    const vystup = execFileSync('node', ['scripts/zkontroluj-nasazeni.mjs', '--jen-jmena'], { encoding: 'utf8' });
    const radky = vystup.split('\n').filter(Boolean);
    for (const r of radky) expect(r, vystup).toMatch(/^[a-z0-9-]+$/);
  });

  it('zapíše se jen to, co se opravdu nasadilo', () => {
    expect(KROK).toMatch(/NASAZENE="\$NASAZENE \$f"/);
    expect(KROK).toMatch(/zapis-nasazeni\.mjs \$NASAZENE/);
  });
});
