import { describe, expect, it } from 'vitest';
import { rozdelSudyLahve } from './sudyLahve';

const OBALY = [{ id: 'k30', kind: 'keg', label: 'KEG 30l' }, { id: 'p1', kind: 'bottle', label: 'PET 1l' }];

describe('rozdelSudyLahve', () => {
  it('rozdělí podle druhu obalu a sečte kusy; pořadí zůstane', () => {
    const r = rozdelSudyLahve([
      { id: 'a', package_id: 'p1', package_label: 'PET 1l', quantity: 5 },
      { id: 'b', package_id: 'k30', package_label: 'KEG 30l', quantity: 1 },
      { id: 'c', package_id: 'p1', package_label: 'PET 1l', quantity: '3' },
    ], OBALY);
    expect(r.sudy.map((p) => p.id)).toEqual(['b']);
    expect(r.lahve.map((p) => p.id)).toEqual(['a', 'c']);
    expect([r.kusuSudu, r.kusuLahvi]).toEqual([1, 8]);
  });

  it('obal mimo číselník se pozná podle popisku', () => {
    const r = rozdelSudyLahve([{ package_id: null, package_label: 'KEG 50l', quantity: 2 }, { package_id: 'x', package_label: 'Sklo 0,5l', quantity: 4 }], OBALY);
    expect([r.kusuSudu, r.kusuLahvi]).toEqual([2, 4]);
  });
});
