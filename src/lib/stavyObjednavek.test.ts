/**
 * Stavy objednávky (lib/stavyObjednavek.ts).
 *
 * Pojistka na to, kvůli čemu tenhle modul vznikl: pět stavů z osmi mělo
 * jednu barvu a čtyři z nich stejný popisek, takže ze seznamu nešlo poznat
 * naloženo od odbaveného. A na třech místech v aplikaci se stav překládal
 * třemi různými způsoby.
 */
import { describe, it, expect } from 'vitest';
import { STAVY_OBJEDNAVKY, popisStavu, jeVyrizena } from './stavyObjednavek';

describe('stavy objednávky', () => {
  it('každý stav má popisek, barvu i tvar', () => {
    const neuplne = Object.entries(STAVY_OBJEDNAVKY)
      .filter(([, s]) => !s.label || !s.cls || !s.znak)
      .map(([k]) => k);
    expect(neuplne).toEqual([]);
  });

  it('naloženo, zavezeno a vyřízeno se od sebe poznají', () => {
    // Tři kroky závozu, které dřív vypadaly stejně. Musí se lišit BAREVNĚ
    // i TVAREM — barva sama nestačí (mizerné světlo ve sklepě, barvoslepost).
    const kroky = ['expedovana', 'vyrizeno_zavoz', 'vyrizeno'] as const;
    const barvy = new Set(kroky.map((k) => STAVY_OBJEDNAVKY[k].cls));
    const tvary = new Set(kroky.map((k) => STAVY_OBJEDNAVKY[k].znak));
    expect(barvy.size).toBe(3);
    expect(tvary.size).toBe(3);
  });

  it('barvy se berou z palety, ne z napsaných hodnot', () => {
    // Natvrdo napsaný odstín se v tmavém režimu neotočí a hlídač kontrastu
    // ho neuvidí, protože čte třídy.
    const sHexem = Object.entries(STAVY_OBJEDNAVKY)
      .filter(([, s]) => /#[0-9a-fA-F]{3,8}/.test(s.cls))
      .map(([k]) => k);
    expect(sHexem).toEqual([]);
  });

  it('popisStavu zvládne prázdný i neznámý stav', () => {
    expect(popisStavu('vyrizeno_zavoz')).toBe('Zavezeno');
    expect(popisStavu(null)).toBe('Nová');
    // Neznámý stav se vrátí syrový — podle něj se dá dohledat, co se
    // v databázi objevilo. „—" by problém jen schovalo.
    expect(popisStavu('neco_noveho')).toBe('neco_noveho');
  });

  it('jeVyrizena bere všechny čtyři podoby vyřízení', () => {
    expect(['vyrizeno_zavoz', 'vyrizeno', 'vyrizena', 'hotova'].every(jeVyrizena)).toBe(true);
    expect(['nova', 'pripravena', 'expedovana', 'storno'].some(jeVyrizena)).toBe(false);
  });
});
