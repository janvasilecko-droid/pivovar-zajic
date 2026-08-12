import { describe, it, expect, beforeEach } from 'vitest';
import { getSecondCarDates, toggleSecondCarDate } from './zavozSecondCar';

const KEY = 'zavoz_second_car_dates';

describe('zavozSecondCar', () => {
  beforeEach(() => {
    localStorage.removeItem(KEY);
  });

  it('vrací prázdný seznam, když nic není uložené', () => {
    expect(getSecondCarDates()).toEqual([]);
  });

  it('toggle přidá a zase odebere datum', () => {
    expect(toggleSecondCarDate('2026-08-12')).toEqual(['2026-08-12']);
    expect(getSecondCarDates()).toEqual(['2026-08-12']);
    expect(toggleSecondCarDate('2026-08-12')).toEqual([]);
    expect(getSecondCarDates()).toEqual([]);
  });

  it('přidá více dat bez duplicit', () => {
    toggleSecondCarDate('2026-08-12');
    toggleSecondCarDate('2026-08-13');
    expect(getSecondCarDates()).toEqual(['2026-08-12', '2026-08-13']);
  });

  it('ignoruje neplatné záznamy v localStorage', () => {
    localStorage.setItem(KEY, JSON.stringify(['2026-08-12', 'blbost', 42]));
    expect(getSecondCarDates()).toEqual(['2026-08-12']);
  });
});
