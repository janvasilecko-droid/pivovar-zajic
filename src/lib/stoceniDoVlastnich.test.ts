import { describe, expect, it } from 'vitest';
import { otevrenePolozkyVlastnich, priradDoVlastnich, rozdelRadkyNaVlastni } from './stoceniDoVlastnich';

const obaly = [
  { id: 'k30', kind: 'keg', volume_l: 30 },
  { id: 'k15', kind: 'keg', volume_l: 15 },
  { id: 'k50', kind: 'keg', volume_l: 50 },
];
const objednavky = [
  { id: 'o1', place_name: 'Duck and Dog', status: 'nova', is_delivered: false, delivery_date: '2026-10-09' },
  { id: 'o2', place_name: 'Michal fojtovice', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o3', place_name: 'Martin', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o4', place_name: 'Restaurace U Zajíce', status: 'nova', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o5', place_name: 'Duck and Dog', status: 'storno', is_delivered: false, delivery_date: '2026-10-08' },
  { id: 'o6', place_name: 'Duck and Dog', status: 'nova', is_delivered: true, delivery_date: '2026-10-01' },
];
const polozky = [
  { id: 'i1', order_id: 'o1', beer_id: 'b12', package_id: 'k30', quantity: 2 },
  { id: 'i2', order_id: 'o2', beer_id: 'b12', package_id: 'k30', quantity: 3 },
  { id: 'i3', order_id: 'o3', beer_id: 'b12', package_id: 'k15', quantity: 1 },
  { id: 'i3b', order_id: 'o3', beer_id: 'b12', package_id: 'k50', quantity: 1 },
  { id: 'i4', order_id: 'o4', beer_id: 'b12', package_id: 'k30', quantity: 5 },
  { id: 'i5', order_id: 'o5', beer_id: 'b12', package_id: 'k30', quantity: 1 },
  { id: 'i6', order_id: 'o6', beer_id: 'b12', package_id: 'k30', quantity: 1 },
  { id: 'i7', order_id: 'o1', beer_id: 'b10', package_id: 'k30', quantity: 1 },
];

describe('stáčení do vlastních sudů odběratele', () => {
  it('nabídne jen otevřené položky odběratelů s vlastními sudy, nejdřívější napřed', () => {
    const o = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [{ order_item_id: 'i7' }], odepsanePolozky: new Set() });
    // Martin jen malé sudy (15 l ano, 50 l ne); běžná restaurace, storno,
    // zavezené a už stočená položka ne.
    expect(o.map((x) => x.polozkaId)).toEqual(['i2', 'i3', 'i1']);
  });

  it('odepsaná položka (už odjela) se nenabízí', () => {
    const o = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [], odepsanePolozky: new Set(['i2', 'i3', 'i7']) });
    expect(o.map((x) => x.polozkaId)).toEqual(['i1']);
  });

  it('rozdělí řádek: část do sudů odběratelů, zbytek do sudů pivovaru', () => {
    const otevrene = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [], odepsanePolozky: new Set() });
    const radky = [{ beerId: 'b12', pkgId: 'k30', qty: '10', tankId: 't1' }, { beerId: 'b10', pkgId: 'k50', qty: '4', tankId: '' }];
    const prirazeni = priradDoVlastnich(radky.map((r) => ({ beerId: r.beerId, pkgId: r.pkgId, pocet: Number(r.qty) })), otevrene);
    expect(prirazeni).toEqual([
      { radek: 0, polozkaId: 'i2', odberatel: 'Michal fojtovice', kusu: 3 },
      { radek: 0, polozkaId: 'i1', odberatel: 'Duck and Dog', kusu: 2 },
    ]);
    const rozdelene = rozdelRadkyNaVlastni(radky, prirazeni);
    expect(rozdelene).toEqual([
      { beerId: 'b12', pkgId: 'k30', qty: '3', tankId: 't1', orderItemId: 'i2' },
      { beerId: 'b12', pkgId: 'k30', qty: '2', tankId: 't1', orderItemId: 'i1' },
      { beerId: 'b12', pkgId: 'k30', qty: '5', tankId: 't1', orderItemId: null },
      { beerId: 'b10', pkgId: 'k50', qty: '4', tankId: '', orderItemId: null },
    ]);
    // Součet kusů se nemění.
    expect(rozdelene.reduce((s, r) => s + Number(r.qty), 0)).toBe(14);
  });

  it('méně sudů, než odběratel chce: celý řádek jde k jeho položce', () => {
    const otevrene = otevrenePolozkyVlastnich({ objednavky, polozky, obaly, stoceni: [], odepsanePolozky: new Set() });
    const prirazeni = priradDoVlastnich([{ beerId: 'b12', pkgId: 'k30', pocet: 1 }], otevrene);
    expect(prirazeni).toEqual([{ radek: 0, polozkaId: 'i2', odberatel: 'Michal fojtovice', kusu: 1 }]);
    expect(rozdelRadkyNaVlastni([{ qty: '1' }], prirazeni)).toEqual([{ qty: '1', orderItemId: 'i2' }]);
  });
});
