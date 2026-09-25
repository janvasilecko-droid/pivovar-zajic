import { describe, it, expect } from 'vitest';
import { pivoJeVTextu, rozdelVraceni, vypadaJakoVraceni, type RadekZpravy } from './vraceniZeZpravy';

describe('vypadaJakoVraceni', () => {
  it('pozná zprávu z provozu 18. 9. 2026', () => {
    expect(vypadaJakoVraceni('Tady vrací 1x50l. Vosmy a jednu vosmu roztočenou, téměř plnou')).toBe(true);
  });

  it('bere i další tvary slovesa', () => {
    for (const t of ['Vracíme 2x30', 'vrátili jsme 1x50', 'Vráceno 3x20', 'Vracejí 1x30', 'Vrátím ten sud']) {
      expect(vypadaJakoVraceni(t), t).toBe(true);
    }
  });

  it('obyčejná objednávka vrácení není', () => {
    expect(vypadaJakoVraceni('60x0,5l. Grep a 40x0,5l. Citrón')).toBe(false);
    expect(vypadaJakoVraceni('Radek na čtvrtek 4x50 12sv')).toBe(false);
  });

  it('„vratné lahve" v objednávce nesmí udělat vrácení', () => {
    // Vratné obaly se v objednávkách píšou běžně — kdyby to appka brala jako
    // vrácení, každá druhá objednávka by skončila ve špatné záložce.
    expect(vypadaJakoVraceni('4x50 12sv + vratné lahve')).toBe(false);
    expect(vypadaJakoVraceni('Pošli vratný sud')).toBe(false);
  });

  it('prázdný text nic nehlásí', () => {
    expect(vypadaJakoVraceni(null)).toBe(false);
    expect(vypadaJakoVraceni('')).toBe(false);
  });
});

describe('pivoJeVTextu', () => {
  it('projde pád i obecná čeština („Vosmy" = „Osma")', () => {
    expect(pivoJeVTextu('Osma', 'Tady vrací 1x50l. Vosmy a jednu vosmu roztočenou')).toBe(true);
  });

  it('najde pivo i v jiném pádu', () => {
    expect(pivoJeVTextu('Summer Ale', 'Nakonec summeru 9x30')).toBe(true);
  });

  it('pivo, které ve zprávě není, nenajde', () => {
    expect(pivoJeVTextu('Citrón', 'Tady vrací 3x30')).toBe(false);
    expect(pivoJeVTextu('Osma', 'vrací 3x30')).toBe(false);
  });

  it('bez názvu piva nic netvrdí', () => {
    expect(pivoJeVTextu(null, 'vrací 3x30')).toBe(false);
    expect(pivoJeVTextu('', 'vrací 3x30')).toBe(false);
  });
});

const r = (o: Partial<RadekZpravy> & { klic: string }): RadekZpravy => ({
  beerId: 'b1', beerName: 'Osma', pkgId: 'p50', packageLabel: 'KEG 50l', pocet: 1, ...o,
});

describe('rozdelVraceni', () => {
  it('řádek s pivem napsaným ve zprávě se počítá jako vrácené pivo', () => {
    const { sPivem, jenObaly } = rozdelVraceni([r({ klic: 'a' })], 'Tady vrací 1x50l. Vosmy');
    expect(sPivem.map((x) => x.klic)).toEqual(['a']);
    expect(jenObaly).toEqual([]);
  });

  it('„vrací 3x30" bez piva jsou prázdné obaly, i když AI pivo doplnila', () => {
    // Přesně pravidlo od majitele: prázdné obaly se do piva nepočítají.
    const { sPivem, jenObaly } = rozdelVraceni(
      [r({ klic: 'a', beerName: 'Osma', pkgId: 'p30', packageLabel: 'KEG 30l', pocet: 3 })],
      'Tady vrací 3x30',
    );
    expect(sPivem).toEqual([]);
    expect(jenObaly.map((x) => x.klic)).toEqual(['a']);
  });

  it('řádek bez piva se NEZAHAZUJE — jen se nepočítá', () => {
    // Zahozením by tiše zmizel litr piva; ať rozhodne člověk.
    const { sPivem, jenObaly } = rozdelVraceni([r({ klic: 'a', beerId: '', beerName: null })], 'vrací 2x50');
    expect(sPivem).toEqual([]);
    expect(jenObaly).toHaveLength(1);
  });

  it('nulové množství a řádek bez obalu do vrácení nejdou vůbec', () => {
    const vysledek = rozdelVraceni([r({ klic: 'a', pocet: 0 }), r({ klic: 'b', pkgId: '' })], 'vrací 1x50 vosmy');
    expect(vysledek.sPivem).toEqual([]);
    expect(vysledek.jenObaly).toEqual([]);
  });

  it('rozdělí smíšenou zprávu', () => {
    const { sPivem, jenObaly } = rozdelVraceni(
      [
        r({ klic: 'pivo', beerName: 'Osma', pocet: 1 }),
        r({ klic: 'obal', beerName: 'Citrón', pkgId: 'p30', packageLabel: 'KEG 30l', pocet: 3 }),
      ],
      'Tady vrací 1x50l vosmy a 3x30 prázdné',
    );
    expect(sPivem.map((x) => x.klic)).toEqual(['pivo']);
    expect(jenObaly.map((x) => x.klic)).toEqual(['obal']);
  });
});
