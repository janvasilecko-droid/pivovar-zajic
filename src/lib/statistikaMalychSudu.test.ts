import { describe, expect, it } from 'vitest';
import { statistikaMalychSudu } from './statistikaMalychSudu';

const obaly = [
  { id: 'k50', kind: 'keg', volume_l: 50 }, { id: 'k20', kind: 'keg', volume_l: 20 },
  { id: 'k15', kind: 'keg', volume_l: 15 }, { id: 'k10', kind: 'keg', volume_l: 10 }, { id: 'pet', kind: 'pet', volume_l: 1.5 },
];
const piva = [{ id: 'b10', name: '10° Desítka' }, { id: 'b12', name: '12° Světlá' }];
const orders = [
  { id: 'o1', place_name: 'Radek', delivery_date: '2026-10-20', status: 'nova', is_delivered: true },
  { id: 'o2', place_name: 'Radek', delivery_date: '2026-10-22', status: 'nova', is_delivered: false },
  { id: 'o3', place_name: 'Maneo', delivery_date: '2026-10-21', status: 'storno', is_delivered: false },
  { id: 'o4', place_name: 'Foodtruck', delivery_date: '2026-09-01', status: 'vyrizeno_zavoz', is_delivered: true },
];
const items = [
  { order_id: 'o1', beer_id: 'b10', package_id: 'k20', quantity: 2 },
  { order_id: 'o1', beer_id: 'b12', package_id: 'k50', quantity: 5 },
  { order_id: 'o2', beer_id: 'b10', package_id: 'k20', quantity: 1 },
  { order_id: 'o2', beer_id: 'b12', package_id: 'k15', quantity: 4 },
  { order_id: 'o3', beer_id: 'b10', package_id: 'k10', quantity: 9 },
  { order_id: 'o4', beer_id: 'b10', package_id: 'k10', quantity: 3 },
  { order_id: 'o1', beer_id: 'b10', package_id: 'pet', quantity: 20 },
];

describe('statistikaMalychSudu', () => {
  const s = statistikaMalychSudu({ orders, items, obaly, piva, od: '2026-10-19', do: '2026-10-25' });
  it('počítá jen malé sudy, bez storna a mimo období', () => {
    expect(s.kusu).toBe(7);
    expect(s.zavezeno).toBe(2);
    expect(s.litru).toBe(2 * 20 + 1 * 20 + 4 * 15);
  });
  it('po obalech od největšího', () => {
    expect(s.poObalech).toEqual([
      { obalL: 20, obal: '20 l', kusu: 3, zavezeno: 2 },
      { obalL: 15, obal: '15 l', kusu: 4, zavezeno: 0 },
    ]);
  });
  it('po pivech a po odběratelích s rozpisem', () => {
    expect(s.poPivech.map((p) => [p.pivo, p.kusu])).toEqual([['12° Světlá', 4], ['10° Desítka', 3]]);
    expect(s.poOdberatelich).toHaveLength(1);
    expect(s.poOdberatelich[0].odberatel).toBe('Radek');
    expect(s.poOdberatelich[0].radky.map((r) => `${r.pivo} ${r.obal} ${r.kusu}`)).toEqual(['10° Desítka 20 l 3', '12° Světlá 15 l 4']);
  });
  it('větší období zahrne i starší zavezené', () => {
    const v = statistikaMalychSudu({ orders, items, obaly, piva, od: '2026-01-01', do: '2026-12-31' });
    expect(v.kusu).toBe(10);
    expect(v.poOdberatelich.map((o) => o.odberatel)).toContain('Foodtruck');
  });
});

// 27. 11. 2026: „DaD nepočítat do malých sudů, má svoje sudy, ani do počtu stočených sudů, myšleno jako počet obalů,
// jen se počítá objem, ale ne obaly."
describe('statistikaMalychSudu — odběratel s vlastními sudy (DaD): objem ano, obaly ne', () => {
  const pOrders = [
    { id: 'r', place_name: 'Radek', delivery_date: '2026-11-20', status: 'nova', is_delivered: true },
    { id: 'd', place_name: 'Duck and Dog', delivery_date: '2026-11-21', status: 'nova', is_delivered: true },
  ];
  const pItems = [
    { order_id: 'r', beer_id: 'b10', package_id: 'k20', quantity: 2 },
    { order_id: 'd', beer_id: 'b10', package_id: 'k20', quantity: 4 },
    { order_id: 'd', beer_id: 'b12', package_id: 'k15', quantity: 2 },
  ];
  const s = statistikaMalychSudu({ orders: pOrders, items: pItems, obaly, piva, od: '2026-11-16', do: '2026-11-22' });

  it('sudy DaD nejsou v počtu sudů ani zavezených, jeho litry ano', () => {
    expect(s.kusu).toBe(2);
    expect(s.zavezeno).toBe(2);
    expect(s.litru).toBe(2 * 20 + 4 * 20 + 2 * 15);
  });

  it('po velikostech a pivech jen naše sudy, litry u piv celé', () => {
    expect(s.poObalech).toEqual([{ obalL: 20, obal: '20 l', kusu: 2, zavezeno: 2 }]);
    expect(s.poPivech.map((b) => [b.pivo, b.kusu, b.litru])).toEqual([['10° Desítka', 2, 120], ['12° Světlá', 0, 30]]);
  });

  it('v seznamu „Pro koho“ DaD zůstává, s příznakem a nulou sudů; co dostal, je v řádcích', () => {
    expect(s.poOdberatelich.map((o) => [o.odberatel, o.kusu, o.zavezeno, o.litru, o.vlastniObaly])).toEqual([
      ['Radek', 2, 2, 40, false],
      ['Duck and Dog', 0, 0, 110, true],
    ]);
    const dad = s.poOdberatelich[1];
    expect(dad.radky.map((r) => `${r.pivo} ${r.obal} ×${r.kusu}`)).toEqual(['10° Desítka 20 l ×4', '12° Světlá 15 l ×2']);
    expect(dad.radky.every((r) => r.vlastniObaly)).toBe(true);
  });

  it('období jen s DaD: žádné sudy, ale litry', () => {
    const jenDad = statistikaMalychSudu({ orders: pOrders, items: pItems, obaly, piva, od: '2026-11-21', do: '2026-11-21' });
    expect(jenDad.kusu).toBe(0);
    expect(jenDad.litru).toBe(110);
    expect(jenDad.poObalech).toEqual([]);
  });

  it('Michal Fojtovice a Martin (vlastní sudy ze seznamu) se chovají stejně jako DaD', () => {
    const v = statistikaMalychSudu({
      orders: [{ id: 'm', place_name: 'MARTIN', delivery_date: '2026-11-20', status: 'nova', is_delivered: false }],
      items: [{ order_id: 'm', beer_id: 'b10', package_id: 'k10', quantity: 3 }],
      obaly, piva, od: '2026-11-16', do: '2026-11-22',
    });
    expect(v.kusu).toBe(0);
    expect(v.litru).toBe(30);
  });
});
