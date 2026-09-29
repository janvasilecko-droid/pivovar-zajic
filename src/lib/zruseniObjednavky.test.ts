// Z provozu 29. 9. 2026: „já je zruším a ty sudy vrať na sklad k dnešnímu
// dni, stejně jako přes formulář, ať to nerozhází uzavřenou inventuru."
import { describe, it, expect } from 'vitest';
import { vraceniZOdpoctu, zruseniSVracenim } from './zruseniObjednavky';

const polozky = [
  { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l' },
  { beer_id: 'b10', beer_name: '10° Desítka', package_id: 'k50', package_label: 'KEG 50l' },
];

describe('zrušení odepsané objednávky s vrácením dnešním dnem', () => {
  it('vrací to, co se odepsalo (součet po pivu a obalu)', () => {
    const v = vraceniZOdpoctu([
      { order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 2 },
      { order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 1 },
      { order_id: 'o', beer_id: 'b10', package_id: 'k50', quantity: 4 },
    ], polozky);
    expect(v).toEqual([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l', pocet: 3 },
      { beer_id: 'b10', beer_name: '10° Desítka', package_id: 'k50', package_label: 'KEG 50l', pocet: 4 },
    ]);
  });

  it('záznam vrácení je DNEŠNÍ, s vazbou na objednávku a poznámkou', () => {
    const v = vraceniZOdpoctu([{ order_id: 'o', beer_id: 'b12', package_id: 'k30', quantity: 2 }], polozky);
    const { zaznamy, poznamka } = zruseniSVracenim({ id: 'o', note: 'původní', place_name: 'Maneo' }, v, '2026-09-29');
    expect(zaznamy).toHaveLength(1);
    expect(zaznamy[0]).toMatchObject({ entry_date: '2026-09-29', order_id: 'o', quantity: 2, beer_id: 'b12', package_id: 'k30' });
    expect(String(zaznamy[0].reason)).toMatch(/^Zrušená objednávka, vráceno na sklad/);
    expect(poznamka.startsWith('původní\nZrušeno.')).toBe(true);
  });
});
