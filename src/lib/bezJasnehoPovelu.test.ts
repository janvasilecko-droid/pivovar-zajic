// 🔒 Appka nesmí sama přidávat stáčení, objednávky ani odepisovat.
// ---------------------------------------------------------------------------
// Pravidlo od majitele, 18. 9. 2026, po druhém nálezu várky, kterou nezadal:
// „apka nesmi pridavat staceni, objednavky, nebo odepisovat bez jasnyho
// povelu — dopis staceni keg, staceni lahvi, uprav objednavku".
//
// Jasný povel = tlačítko, které říká, co udělá („Dopsat stáčení KEG",
// „Upravit objednávku"), nebo dotaz s takovým tlačítkem. NENÍ to zaškrtnutí
// políčka u objednávky: to je poznámka „mám nachystáno", ne hlášení výroby.
//
// Konkrétně se tím zrušilo zakládání stáčení po zaškrtnutí kapky „Stočeno"
// (lib/staceniZPolozky.ts). Tenhle test hlídá, že se to nevrátí — ani
// nedopatřením při slučování, jako se tu už stalo jinde.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as staceniZPolozky from './staceniZPolozky';

describe('zaškrtnutí „Stočeno" nezakládá stáčení', () => {
  it('lib/staceniZPolozky.ts neumí do stáčení zapsat', () => {
    // Zůstat smí jen to, co rozpozná a uklidí STARÉ řádky.
    const povolene = ['POZNAMKA_AUTOMATICKY', 'jeZeZaskrtnuti', 'naplanujZaznamZeStoceni',
      'dopsaneZaskrtnutim', 'smazZaznamyStaceni'];
    expect(Object.keys(staceniZPolozky).sort()).toEqual([...povolene].sort());
  });

  it('soubor neobsahuje insert do stáčení', () => {
    const zdroj = readFileSync('src/lib/staceniZPolozky.ts', 'utf8');
    expect(zdroj).not.toMatch(/from\('kegging'\)\s*\.insert/);
    expect(zdroj).not.toMatch(/from\('bottling'\)\s*\.insert/);
    // Mazání starých řádků naopak zůstat MUSÍ — je to úklid po zrušené funkci.
    expect(zdroj).toMatch(/from\('kegging'\)\s*\.delete/);
  });

  for (const cesta of ['src/screens/Orders.tsx', 'src/screens/Zavoz.tsx']) {
    it(`${cesta} po odškrtnutí položky do stáčení nesahá`, () => {
      const zdroj = readFileSync(cesta, 'utf8');
      expect(zdroj).not.toMatch(/zapisStaceniZPolozky/);
      expect(zdroj).not.toMatch(/zrusStaceniZPolozky/);
    });
  }
});

describe('úprava objednávky z plánu stáčení se ptá', () => {
  // Přesun položky na jiný den mění POLOŽKU OBJEDNÁVKY, ne jen plán.
  for (const cesta of ['src/screens/Kegging.tsx', 'src/screens/BottlingScreen.tsx']) {
    it(`${cesta} se před úpravou objednávky zeptá`, () => {
      const zdroj = readFileSync(cesta, 'utf8');
      const presun = zdroj.slice(zdroj.indexOf('async function presunPolozkuPlanu'));
      const telo = presun.slice(0, presun.indexOf('\n  async function', 1));
      expect(telo, 'chybí potvrzení').toMatch(/potvrd\(/);
      expect(telo, 'tlačítko musí říct, co udělá').toMatch(/Upravit objednávku/);
    });
  }
});

// ---------------------------------------------------------------------------
// Úklid dopsaných záznamů musí být vidět — i na telefonu
// ---------------------------------------------------------------------------
describe('upozornění na dopsané záznamy', () => {
  // Poprvé se to vykreslilo uvnitř týdenní tabulky, která je v bloku
  // `hidden md:block` — na telefonu tedy nebylo vůbec a na počítači se k němu
  // muselo dorolovat pod nadpis. Majitel ho nenašel a napsal
  // „udělej je nějak výrazněji".
  const zdroj = readFileSync('src/screens/Kegging.tsx', 'utf8');

  it('vykresluje se, až když takové záznamy opravdu jsou', () => {
    expect(zdroj).toMatch(/\{dopsaneVse\.length > 0 && \(/);
  });

  it('není schované v části jen pro počítač', () => {
    // Komentáře pryč: fráze `hidden md:block` je i v komentáři, který tuhle
    // chybu popisuje, a bez očištění by test hlásil právě tenhle komentář.
    const kod = zdroj.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const zacatek = kod.indexOf('{dopsaneVse.length > 0 && (');
    expect(zacatek, 'upozornění se vůbec nevykresluje').toBeGreaterThan(-1);
    // Týdenní tabulka (a všechny ostatní `hidden md:block`) jsou až POD ním.
    const prvniSkryti = kod.indexOf('hidden md:block');
    expect(prvniSkryti === -1 || zacatek < prvniSkryti,
      'upozornění je až za blokem jen pro počítač — na telefonu se neukáže').toBe(true);
  });

  it('nabízí smazání a ptá se předem', () => {
    expect(zdroj).toMatch(/uklidDopsane\(dopsaneVse\)/);
    const uklid = zdroj.slice(zdroj.indexOf('async function uklidDopsane'));
    expect(uklid.slice(0, 1200)).toMatch(/potvrd\(/);
    expect(uklid.slice(0, 1200)).toMatch(/nebezpecne: true/);
  });
});
