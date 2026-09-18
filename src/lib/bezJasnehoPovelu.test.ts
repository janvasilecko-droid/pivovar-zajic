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
