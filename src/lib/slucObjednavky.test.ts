import { describe, it, expect } from 'vitest';
import { navrhSlouceni, type SlucHlavicka, type SlucPolozka } from './slucObjednavky';

const obj = (id: string, cas: string, extra: Partial<SlucHlavicka> = {}): SlucHlavicka => ({
  id, place_id: 'p-rest', place_name: 'Restaurace', order_date: '2026-10-13', delivery_day: null, delivery_date: null,
  note: null, status: 'nova', created_at: cas, ...extra,
});
const pol = (beer: string, pkg: string, q: number, extra: Partial<SlucPolozka> = {}): SlucPolozka =>
  ({ beer_id: beer, beer_name: beer, package_id: pkg, package_label: pkg, quantity: q, ...extra });

// Skutečný případ 13. 10. 2026: lístek Restaurace → tři objednávky.
const A = obj('a', '2026-10-13T09:40:53Z');
const B = obj('b', '2026-10-13T09:40:54Z', { delivery_day: 'st', delivery_date: '2026-10-14' });
const C = obj('c', '2026-10-13T09:40:54.5Z', { delivery_day: 'st', delivery_date: '2026-10-14' });
const POLOZKY = {
  a: [pol('des', '1.5l', 5), pol('osma', '1.5l', 4), pol('s11', '1l', 5), pol('jan', '1.5l', 3)],
  b: [pol('s12', '1l', 5)],
  c: [pol('jan', '1.5l', 5)],
};

describe('Sloučení objednávek jednoho odběratele', () => {
  it('tři objednávky Restaurace → jedna: stejné pivo + obal se sečte, den závozu se převezme', () => {
    const r = navrhSlouceni([C, A, B], POLOZKY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.cilId).toBe('a'); // nejstarší
    expect(r.kSmazani.sort()).toEqual(['b', 'c']);
    expect(r.polozky.map((p) => `${p.quantity}x ${p.package_label} ${p.beer_id}`)).toEqual([
      '5x 1.5l des', '4x 1.5l osma', '5x 1l s11', '8x 1.5l jan', '5x 1l s12',
    ]);
    expect(r.hlavicka.delivery_day).toBe('st');
    expect(r.hlavicka.delivery_date).toBe('2026-10-14');
    expect(r.polozky.every((p) => p.is_prepared === false)).toBe(true);
  });

  it('jiný odběratel → odmítne', () => {
    const r = navrhSlouceni([A, obj('x', '2026-10-13T10:00:00Z', { place_id: 'p-jiny', place_name: 'Radek' })], { ...POLOZKY, x: [pol('s12', '1l', 1)] });
    expect(r).toEqual({ ok: false, duvod: 'Sloučit jdou jen objednávky jednoho odběratele.' });
  });

  it('bez place_id se odběratel pozná podle jména (velikost písmen a diakritika nehrají roli)', () => {
    const r = navrhSlouceni(
      [obj('1', '2026-10-13T09:00:00Z', { place_id: null, place_name: 'Restaurace' }), obj('2', '2026-10-13T09:01:00Z', { place_id: null, place_name: 'restaurace ' })],
      { '1': [pol('s12', '1l', 1)], '2': [pol('s12', '1l', 2)] },
    );
    expect(r.ok && r.polozky[0].quantity).toBe(3);
  });

  it('rozpracovaná, zavezená nebo jinak označená objednávka se nesloučí (ztratila by se označení)', () => {
    for (const spatna of [obj('z', '2026-10-13T11:00:00Z', { status: 'expedovana' }), obj('z', '2026-10-13T11:00:00Z', { is_prepared: true })]) {
      const r = navrhSlouceni([A, spatna], { ...POLOZKY, z: [pol('s12', '1l', 1)] });
      expect(r.ok).toBe(false);
    }
    const r = navrhSlouceni([A, B], { ...POLOZKY, b: [pol('s12', '1l', 5, { is_bottled: true })] });
    expect(r.ok).toBe(false);
  });

  it('dvě různé dny závozu → odmítne, ať se nesloučí na špatný den', () => {
    const r = navrhSlouceni([B, obj('d', '2026-10-13T12:00:00Z', { delivery_day: 'ct', delivery_date: '2026-10-15' })], { ...POLOZKY, d: [pol('s12', '1l', 1)] });
    expect(r.ok).toBe(false);
  });

  it('poznámky se spojí, opakované se nezdvojí; méně než dvě objednávky se nesloučí', () => {
    const r = navrhSlouceni([obj('1', '2026-10-13T09:00:00Z', { note: 'bez etikety' }), obj('2', '2026-10-13T09:01:00Z', { note: 'bez etikety' }), obj('3', '2026-10-13T09:02:00Z', { note: 'zvonit' })],
      { '1': [pol('a', '1l', 1)], '2': [pol('a', '1l', 1)], '3': [pol('b', '1l', 1)] });
    expect(r.ok && r.hlavicka.note).toBe('bez etikety; zvonit');
    expect(navrhSlouceni([A], POLOZKY).ok).toBe(false);
  });
});
