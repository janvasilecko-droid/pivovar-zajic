// Text SMS s počtem malých sudů (24. 11. 2026).
import { describe, expect, it } from 'vitest';
import { prijemceMaleSudy, textSmsMaleSudy } from './maleSudyZprava';

describe('textSmsMaleSudy', () => {
  it('ve tvaru z přání majitele: „Čau, malé sudy <datum>: 20l: 2x, 15l: 0x, 10l: 1x" — od největšího sudu', () => {
    expect(textSmsMaleSudy([
      { objem: 10, pocet: 1 },
      { objem: 20, pocet: 2 },
      { objem: 15, pocet: 0 },
    ], '2026-11-24')).toBe('Čau, malé sudy 24. 11.: 20l: 2x, 15l: 0x, 10l: 1x');
  });

  it('nula se píše taky (Radek se dozví i to, že nějaký sud nemáme)', () => {
    expect(textSmsMaleSudy([{ objem: 20, pocet: 0 }, { objem: 10, pocet: 0 }], '2026-12-01')).toBe('Čau, malé sudy 1. 12.: 20l: 0x, 10l: 0x');
  });

  it('desetinný objem má čárku', () => {
    expect(textSmsMaleSudy([{ objem: 7.5, pocet: 2 }], '2026-11-24')).toBe('Čau, malé sudy 24. 11.: 7,5l: 2x');
  });

  it('bez sudů je text prázdný; s nesmyslným datem se datum vynechá', () => {
    expect(textSmsMaleSudy([], '2026-11-24')).toBe('');
    expect(textSmsMaleSudy([{ objem: 20, pocet: 1 }], 'dnes')).toBe('Čau, malé sudy: 20l: 1x');
  });

  it('vstup se nemění (řadí se kopie)', () => {
    const sudy = [{ objem: 10, pocet: 1 }, { objem: 20, pocet: 2 }];
    textSmsMaleSudy(sudy, '2026-11-24');
    expect(sudy.map((x) => x.objem)).toEqual([10, 20]);
  });
});

describe('prijemceMaleSudy', () => {
  it('najde Radka bez ohledu na velikost písmen, mezery a diakritiku; ostatní odběratele ignoruje', () => {
    expect(prijemceMaleSudy([{ name: 'Jona', phone: '111 222 333' }, { name: ' RADEK ', phone: '777 123 456' }])).toEqual({ jmeno: 'RADEK', telefon: '777 123 456' });
    expect(prijemceMaleSudy([{ name: 'Rádek', phone: null }])).toEqual({ jmeno: 'Rádek', telefon: null });
  });

  it('bez telefonu je telefon null (prázdný řetězec i mezery se berou jako žádný)', () => {
    expect(prijemceMaleSudy([{ name: 'Radek', phone: '' }])).toEqual({ jmeno: 'Radek', telefon: null });
    expect(prijemceMaleSudy([{ name: 'Radek', phone: '   ' }])).toEqual({ jmeno: 'Radek', telefon: null });
    expect(prijemceMaleSudy([{ name: 'Radek' }])).toEqual({ jmeno: 'Radek', telefon: null });
  });

  it('víc Radků: vezme se ten s telefonem', () => {
    expect(prijemceMaleSudy([{ name: 'Radek', phone: null }, { name: 'radek', phone: '777 123 456' }])).toEqual({ jmeno: 'radek', telefon: '777 123 456' });
  });

  it('jméno jen podobné („Radek Sklad", „Radka") Radek není; bez Radka null', () => {
    expect(prijemceMaleSudy([{ name: 'Radek Sklad', phone: '777 123 456' }, { name: 'Radka', phone: '1' }])).toBeNull();
    expect(prijemceMaleSudy([])).toBeNull();
  });
});
