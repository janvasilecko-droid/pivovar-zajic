import { describe, it, expect } from 'vitest';
import { planOdecteniZKegovani } from './odecteniZKegovani';

const radky = [
  { id: 'a', entry_date: '2026-09-15', quantity: 12 },
  { id: 'b', entry_date: '2026-09-18', quantity: 5 },
  { id: 'c', entry_date: '2026-09-20', quantity: 2 },
  { id: 'd', entry_date: '2026-09-28', quantity: 4 },
];

describe('odečtení manka od stočených sudů', () => {
  it('nejdřív stejný den, pak nejbližší dřívější', () => {
    expect(planOdecteniZKegovani(radky, '2026-09-20', 4)).toEqual({ upravit: [{ id: 'b', quantity: 3 }], smazat: ['c'], zbytek: 0 });
  });
  it('když dřívějších nestačí, vezme pozdější', () => {
    const p = planOdecteniZKegovani(radky, '2026-09-20', 25);
    expect(p).toEqual({ upravit: [], smazat: ['c', 'b', 'a', 'd'], zbytek: 2 }); // 2 + 5 + 12 + 4 = 23 z 25
  });
  it('záporné řádky ignoruje a nic neodečítá při nule', () => {
    expect(planOdecteniZKegovani([{ id: 'x', entry_date: '2026-09-20', quantity: -3 }], '2026-09-20', 2)).toEqual({ upravit: [], smazat: [], zbytek: 2 });
    expect(planOdecteniZKegovani(radky, '2026-09-20', 0)).toEqual({ upravit: [], smazat: [], zbytek: 0 });
  });
});

import { datumDoplnkuStaceni, konecMesiceData, zdrojeOdecteni } from './odecteniZKegovani';

describe('datum doplnění a záznam odečtu', () => {
  it('chybějící stočení jde na poslední den měsíce, v běžícím měsíci na dnešek', () => {
    expect(konecMesiceData('2026-09-14')).toBe('2026-09-30');
    expect(datumDoplnkuStaceni('2026-09-27', '2026-10-13')).toBe('2026-09-30');
    expect(datumDoplnkuStaceni('2026-10-13', '2026-10-13')).toBe('2026-10-13');
  });
  it('záznam říká, z kterých řádků se odečetlo a jak', () => {
    const r = [{ id: 'a', entry_date: '2026-10-05', quantity: 6 }, { id: 'b', entry_date: '2026-10-07', quantity: 2 }];
    const plan = planOdecteniZKegovani(r, '2026-10-07', 4);
    expect(zdrojeOdecteni(plan, r)).toEqual([
      { id: 'a', entry_date: '2026-10-05', pred: 6, po: 4 },
      { id: 'b', entry_date: '2026-10-07', pred: 2, po: 0 },
    ]);
  });
});
