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
