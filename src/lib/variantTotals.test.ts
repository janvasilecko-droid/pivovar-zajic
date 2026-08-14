// 🧮 computeVariantTotals — souhrn objednaného množství podle varianty (pivo + obal)
// pro záložku „Celkem“ v Objednávkách.
import { describe, it, expect } from 'vitest';
import { computeVariantTotals } from './variantTotals';

describe('computeVariantTotals — souhrn variant pro záložku „Celkem“', () => {
  const beer12 = 'beer-12';
  const beer10 = 'beer-10';
  const pkg50 = 'pkg-50';
  const pkg30 = 'pkg-30';

  it('sčítá quantity stejné varianty přes více objednávek', () => {
    const res = computeVariantTotals(
      [
        { id: 'o1', status: 'nova' },
        { id: 'o2', status: 'pripravena' },
      ],
      {
        o1: [{ beer_id: beer12, package_id: pkg50, quantity: 3 }],
        o2: [{ beer_id: beer12, package_id: pkg50, quantity: 2 }],
      }
    );
    expect(res.totalKs).toBe(5);
    expect(res.totalOrders).toBe(2);
    expect(res.totals).toHaveLength(1);
    expect(res.totals[0]).toMatchObject({ beerId: beer12, packageId: pkg50, qty: 5, orderCount: 2 });
  });

  it('rozlišuje různé varianty (pivo × obal)', () => {
    const res = computeVariantTotals(
      [{ id: 'o1', status: 'nova' }],
      {
        o1: [
          { beer_id: beer12, package_id: pkg50, quantity: 3 },
          { beer_id: beer12, package_id: pkg30, quantity: 1 },
          { beer_id: beer10, package_id: pkg50, quantity: 2 },
        ],
      }
    );
    expect(res.totals).toHaveLength(3);
    expect(res.totalKs).toBe(6);
  });

  it('vynechává stornované objednávky', () => {
    const res = computeVariantTotals(
      [
        { id: 'o1', status: 'nova' },
        { id: 'o2', status: 'storno' },
      ],
      {
        o1: [{ beer_id: beer12, package_id: pkg50, quantity: 3 }],
        o2: [{ beer_id: beer12, package_id: pkg50, quantity: 99 }],
      }
    );
    expect(res.totalKs).toBe(3);
    expect(res.totalOrders).toBe(1);
  });

  it('vynechává položky bez piva nebo bez obalu', () => {
    const res = computeVariantTotals(
      [{ id: 'o1', status: 'nova' }],
      {
        o1: [
          { beer_id: beer12, package_id: pkg50, quantity: 3 },
          { beer_id: null, package_id: pkg50, quantity: 7 },
          { beer_id: beer12, package_id: null, quantity: 7 },
        ],
      }
    );
    expect(res.totalKs).toBe(3);
    expect(res.totalOrders).toBe(1);
  });

  it('počítá objednávku jen jednou, i když má variantu na více řádcích', () => {
    const res = computeVariantTotals(
      [{ id: 'o1', status: 'nova' }],
      {
        o1: [
          { beer_id: beer12, package_id: pkg50, quantity: 2 },
          { beer_id: beer12, package_id: pkg50, quantity: 1 },
        ],
      }
    );
    expect(res.totals[0].qty).toBe(3);
    expect(res.totals[0].orderCount).toBe(1);
    expect(res.totalOrders).toBe(1);
  });

  it('vrací prázdný souhrn, když nejsou žádné objednávky', () => {
    const res = computeVariantTotals([], {});
    expect(res.totals).toEqual([]);
    expect(res.totalKs).toBe(0);
    expect(res.totalOrders).toBe(0);
  });
});
