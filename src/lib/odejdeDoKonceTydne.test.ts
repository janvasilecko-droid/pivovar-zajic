// 2. 10. 2026: Sklad = jen Stav a Odejde (do konce týdne).
import { describe, it, expect } from 'vitest';
import { odejdeDoKonceTydne } from './odejdeDoKonceTydne';

const tyden = { zacatekTydne: '2026-09-28', konecTydne: '2026-10-04', dnes: '2026-10-02' };
const o = (id: string, delivery_date: string | null, status = 'nova', order_date = '2026-09-25') =>
  ({ id, delivery_date, order_date, status });
const p = (id: string, order_id: string, quantity: number, package_id = 'k50', beer_id = 'b12') =>
  ({ id, order_id, beer_id, package_id, quantity });

describe('Odejde do konce týdne', () => {
  it('sečte nezavezené položky objednávek s dovozem v tomto týdnu', () => {
    const m = odejdeDoKonceTydne(
      [o('a', '2026-10-03'), o('b', '2026-10-04')],
      [p('a1', 'a', 2), p('b1', 'b', 3), p('b2', 'b', 10, 'l05')],
      [], tyden,
    );
    expect(m.get('b12__k50')).toBe(5);
    expect(m.get('b12__l05')).toBe(10);
  });

  it('co už odjelo (odpočet do dneška), se neodečte podruhé', () => {
    const m = odejdeDoKonceTydne(
      [o('a', '2026-10-01')],
      [p('a1', 'a', 4)],
      [{ order_item_id: 'a1', deduct_date: '2026-10-01', quantity: 4 }], tyden,
    );
    expect(m.get('b12__k50')).toBeUndefined();
  });

  it('odpočet datovaný až do budoucna ještě neodjel — počítá se do Odejde', () => {
    const m = odejdeDoKonceTydne(
      [o('a', '2026-10-03')],
      [p('a1', 'a', 2)],
      [{ order_item_id: 'a1', deduct_date: '2026-10-03', quantity: 2 }], tyden,
    );
    expect(m.get('b12__k50')).toBe(2);
  });

  it('částečně zavezená položka: odejde jen zbytek', () => {
    const m = odejdeDoKonceTydne([o('a', '2026-10-02')], [p('a1', 'a', 5)],
      [{ order_item_id: 'a1', deduct_date: '2026-10-02', quantity: 3 }], tyden);
    expect(m.get('b12__k50')).toBe(2);
  });

  it('storno, příští týden a minulý týden se nepočítají', () => {
    const m = odejdeDoKonceTydne(
      [o('s', '2026-10-03', 'storno'), o('n', '2026-10-05'), o('m', '2026-09-27')],
      [p('s1', 's', 1), p('n1', 'n', 1), p('m1', 'm', 1)],
      [], tyden,
    );
    expect(m.size).toBe(0);
  });

  it('bez data dovozu rozhoduje datum objednávky', () => {
    const m = odejdeDoKonceTydne([o('a', null, 'nova', '2026-10-01')], [p('a1', 'a', 1)], [], tyden);
    expect(m.get('b12__k50')).toBe(1);
  });
});
