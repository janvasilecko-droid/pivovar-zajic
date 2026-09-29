// Z provozu 29. 9. 2026: „když mám 3× 15, hlídej, že můžu celkem použít
// jen 3× 15, ne třeba 6× 15."
import { describe, it, expect } from 'vitest';
import { hlidejMaleSudy, jeMalySud } from './maleSudy';

const o = (id: string, delivery_date: string | null, extra: Record<string, unknown> = {}) => ({ id, delivery_date, status: 'nova', is_delivered: false, ...extra });
const p = (id: string, order_id: string, package_id: string, quantity: number) => ({ id, order_id, package_id, quantity });

describe('malé sudy', () => {
  it('malý sud je KEG pod 30 l', () => {
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 15 })).toBe(true);
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 20 })).toBe(true);
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 30 })).toBe(false);
    expect(jeMalySud({ id: 'a', kind: 'bottle', volume_l: 1 })).toBe(false);
  });

  it('3× 15 l na skladě, objednávky chtějí 6 — tři se označí jako nad počet', () => {
    const r = hlidejMaleSudy(
      { k15: 3 },
      [o('A', '2026-09-30'), o('B', '2026-10-01')],
      [p('a1', 'A', 'k15', 2), p('b1', 'B', 'k15', 4)],
    );
    expect(r.souhrn).toEqual([{ package_id: 'k15', mame: 3, objednano: 6, nad: 3 }]);
    // Dřívější dovoz má přednost: A se vejde celá, B jen 1 ze 4.
    expect(r.nadPoPolozce.get('a1')).toBeUndefined();
    expect(r.nadPoPolozce.get('b1')).toBe(3);
  });

  it('storno, zavezené a vyřízené se nepočítají', () => {
    const r = hlidejMaleSudy(
      { k15: 3 },
      [o('A', '2026-09-30', { status: 'storno' }), o('B', '2026-09-30', { is_delivered: true }), o('C', '2026-09-30', { status: 'vyrizeno_zavoz' }), o('D', '2026-10-01')],
      [p('a', 'A', 'k15', 5), p('b', 'B', 'k15', 5), p('c', 'C', 'k15', 5), p('d', 'D', 'k15', 3)],
    );
    expect(r.souhrn[0]).toMatchObject({ objednano: 3, nad: 0 });
    expect(r.nadPoPolozce.size).toBe(0);
  });

  it('obal bez naklikaného počtu se nehlídá', () => {
    const r = hlidejMaleSudy({}, [o('A', '2026-09-30')], [p('a', 'A', 'k15', 99)]);
    expect(r.souhrn).toEqual([]);
    expect(r.nadPoPolozce.size).toBe(0);
  });

  it('objednávka bez data dovozu jde na konec fronty', () => {
    const r = hlidejMaleSudy(
      { k20: 2 },
      [o('bezData', null), o('A', '2026-10-02')],
      [p('x', 'bezData', 'k20', 2), p('a', 'A', 'k20', 2)],
    );
    expect(r.nadPoPolozce.get('a')).toBeUndefined();
    expect(r.nadPoPolozce.get('x')).toBe(2);
  });

  it('nula znamená, že nemáme žádný — vše je nad počet', () => {
    const r = hlidejMaleSudy({ k10: 0 }, [o('A', '2026-09-30')], [p('a', 'A', 'k10', 1)]);
    expect(r.nadPoPolozce.get('a')).toBe(1);
  });
});

import { volneProObjednavku } from './maleSudy';

describe('volné malé sudy pro jednu objednávku', () => {
  const souhrn = [{ package_id: 'k15', mame: 3, objednano: 2, nad: 0 }];
  it('nová objednávka smí jen to, co zbylo', () => {
    expect(volneProObjednavku(souhrn, 'k15')).toBe(1);
  });
  it('úprava objednávky uvolní její původní kusy', () => {
    expect(volneProObjednavku(souhrn, 'k15', 2)).toBe(3);
  });
  it('nehlídaný obal → null', () => {
    expect(volneProObjednavku(souhrn, 'k20')).toBeNull();
    expect(volneProObjednavku(souhrn, null)).toBeNull();
  });
  it('když je přečerpáno, vyjde záporné číslo', () => {
    expect(volneProObjednavku([{ package_id: 'k15', mame: 3, objednano: 5, nad: 2 }], 'k15')).toBe(-2);
  });
});
