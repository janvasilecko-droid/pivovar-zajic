import { describe, it, expect, beforeEach } from 'vitest';
import { getSecondCarDates, toggleSecondCarDate, toggleSecondCarDates, collectZavozDates } from './zavozSecondCar';

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

  it('toggleSecondCarDates označí všechna data závozu najednou', () => {
    expect(toggleSecondCarDates(['2026-08-10', '2026-08-12'])).toEqual(['2026-08-10', '2026-08-12']);
    expect(getSecondCarDates()).toEqual(['2026-08-10', '2026-08-12']);
  });

  it('toggleSecondCarDates odškrtne celý závoz, když je některé datum označené', () => {
    toggleSecondCarDates(['2026-08-10', '2026-08-12']);
    expect(toggleSecondCarDates(['2026-08-10', '2026-08-12'])).toEqual([]);
  });

  it('toggleSecondCarDates neovlivní data jiných závozů', () => {
    toggleSecondCarDate('2026-08-11');
    toggleSecondCarDates(['2026-08-10', '2026-08-12']);
    expect(getSecondCarDates()).toEqual(['2026-08-10', '2026-08-11', '2026-08-12']);
    toggleSecondCarDates(['2026-08-10', '2026-08-12']);
    expect(getSecondCarDates()).toEqual(['2026-08-11']);
  });

  it('toggleSecondCarDates ignoruje prázdný seznam a neplatná data', () => {
    expect(toggleSecondCarDates([])).toEqual([]);
    expect(toggleSecondCarDates(['blbost'])).toEqual([]);
  });

  // --- collectZavozDates: sběr dat celého závozu (skupiny dne) ---

  it('collectZavozDates vrátí delivery_date ?? order_date pro každou objednávku', () => {
    const orders = [
      { id: 'a', order_date: '2026-08-10', delivery_date: '2026-08-12' },
      { id: 'b', order_date: '2026-08-11', delivery_date: null },
      { id: 'c', order_date: '2026-08-12', delivery_date: '2026-08-10' },
    ];
    expect(collectZavozDates(orders)).toEqual(['2026-08-12', '2026-08-11', '2026-08-10']);
  });

  it('collectZavozDates rozbalí podskupiny SPOLEČNÉHO ZÁVOZU (isGroup)', () => {
    const group = [
      { isGroup: true, groupName: 'Kynšperk centrum', orders: [
        { id: 'a', order_date: '2026-08-10', delivery_date: '2026-08-13' },
        { id: 'b', order_date: '2026-08-10', delivery_date: '2026-08-13' },
      ]},
      { id: 'c', order_date: '2026-08-11', delivery_date: null },
    ];
    expect(collectZavozDates(group)).toEqual(['2026-08-13', '2026-08-11']);
  });

  it('collectZavozDates deduplikuje a ignoruje prázdné záznamy', () => {
    expect(collectZavozDates([])).toEqual([]);
    expect(collectZavozDates([null as any, {} as any])).toEqual([]);
    expect(collectZavozDates([
      { id: 'a', order_date: '2026-08-10' },
      { id: 'b', order_date: '2026-08-10' },
    ])).toEqual(['2026-08-10']);
  });

  // --- Integrace se závozem: generátor Knihy jízd zapíše každý den závozu na druhé auto ---

  it('označení závozu přes toggleSecondCarDates pokryje všechna data jeho tras', () => {
    const zavozDates = collectZavozDates([
      { id: 'a', order_date: '2026-08-11', delivery_date: '2026-08-13' },
      { isGroup: true, orders: [
        { id: 'b', order_date: '2026-08-10', delivery_date: '2026-08-13' },
        { id: 'c', order_date: '2026-08-12', delivery_date: null },
      ]},
    ]);

    // Zaškrtnutí závozu v Závozu → do localStorage přibudou VŠECHNA data
    toggleSecondCarDates(zavozDates);
    expect(getSecondCarDates()).toEqual(['2026-08-12', '2026-08-13']);

    // Generátor Knihy jízd (KnihaJizdScreen: getSecondCarDates().includes(r.date))
    // → každé datum vygenerované trasy patří druhému autu
    const generatedRouteDates = ['2026-08-12', '2026-08-13'];
    for (const d of generatedRouteDates) {
      expect(getSecondCarDates().includes(d)).toBe(true);
    }

    // Odškrtnutí závozu → data se z Knihy jízd odeberou
    toggleSecondCarDates(zavozDates);
    expect(getSecondCarDates()).toEqual([]);
  });
});
