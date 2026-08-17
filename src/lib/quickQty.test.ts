import { describe, it, expect, vi, afterEach } from 'vitest';
import { topQuantitiesLastMonth } from './quickQty';

describe('topQuantitiesLastMonth', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('vrátí 4 nejčastější hodnoty z minulého měsíce, seřazené vzestupně', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));

    const rows = [
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-05' },
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-06' },
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-07' },
      { beer_id: 'b1', package_id: 'p50', quantity: 12, entry_date: '2026-02-10' },
      { beer_id: 'b1', package_id: 'p50', quantity: 12, entry_date: '2026-02-11' },
      { beer_id: 'b1', package_id: 'p50', quantity: 18, entry_date: '2026-02-12' },
      { beer_id: 'b1', package_id: 'p50', quantity: 24, entry_date: '2026-02-13' },
      { beer_id: 'b1', package_id: 'p50', quantity: 30, entry_date: '2026-02-14' },
    ];

    expect(topQuantitiesLastMonth(rows, 'b1', 'p50')).toEqual([6, 12, 24, 30]);
  });

  it('ignoruje jiné pivo/obal a jiné měsíce', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));

    const rows = [
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-05' },
      { beer_id: 'b2', package_id: 'p50', quantity: 99, entry_date: '2026-02-05' },
      { beer_id: 'b1', package_id: 'p30', quantity: 99, entry_date: '2026-02-05' },
      { beer_id: 'b1', package_id: 'p50', quantity: 99, entry_date: '2026-01-05' },
      { beer_id: 'b1', package_id: 'p50', quantity: 99, entry_date: '2026-03-05' },
    ];

    expect(topQuantitiesLastMonth(rows, 'b1', 'p50')).toEqual([6]);
  });

  it('vrátí prázdné pole bez beerId/packageId nebo bez dat', () => {
    expect(topQuantitiesLastMonth([], 'b1', 'p50')).toEqual([]);
    expect(topQuantitiesLastMonth([{ beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-05' }], null, 'p50')).toEqual([]);
    expect(topQuantitiesLastMonth([{ beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-05' }], 'b1', null)).toEqual([]);
  });

  it('ignoruje neplatné/nulové hodnoty quantity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T10:00:00Z'));

    const rows = [
      { beer_id: 'b1', package_id: 'p50', quantity: 0, entry_date: '2026-02-05' },
      { beer_id: 'b1', package_id: 'p50', quantity: null, entry_date: '2026-02-06' },
      { beer_id: 'b1', package_id: 'p50', quantity: 6, entry_date: '2026-02-07' },
    ];

    expect(topQuantitiesLastMonth(rows, 'b1', 'p50')).toEqual([6]);
  });
});
