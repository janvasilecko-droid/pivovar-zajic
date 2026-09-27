// Zadání 27. 9. 2026: „jak to, že je tam na tento týden objednáno a ještě
// zbývá — vše je stočeno, sklad sedí."
import { describe, it, expect } from 'vitest';
import { objednavkyZTanku } from './objednavkyZTanku';

const piva = [
  { id: 'sv', name: '12° Světlá' },
  { id: 'tm', name: '13° Tmavé' },
  { id: 'ja', name: 'Jantar' },
];
const obaly = [
  { id: 'k50', kind: 'keg', volume_l: 50 },
  { id: 'k30', kind: 'keg', volume_l: 30 },
  { id: 'l05', kind: 'bottle', volume_l: 0.5 },
];
const tydenKlic = (d: string) => (d < '2026-09-21' ? '2026-38' : d <= '2026-09-27' ? '2026-39' : '2026-40');
const obj = (id: string, delivery_date: string, status = 'nova') => ({ id, order_date: delivery_date, delivery_date, status });

function spocti(polozky: any[], opts: { odjele?: string[]; sklad?: Record<string, number>; objednavky?: any[]; tyden?: string; tydenDnes?: string } = {}) {
  return objednavkyZTanku({
    objednavky: opts.objednavky ?? [obj('o1', '2026-09-24'), obj('o2', '2026-09-25')],
    polozky,
    obaly,
    piva,
    tyden: opts.tyden ?? '2026-39',
    tydenDnes: opts.tydenDnes ?? '2026-39',
    tydenKlic,
    odjeleIds: new Set(opts.odjele ?? []),
    sklad: new Map(Object.entries(opts.sklad ?? {})),
  });
}

describe('objednavkyZTanku', () => {
  it('co je skladem, se znovu stáčet nemusí — i když se stočilo minulý týden', () => {
    const r = spocti(
      [{ id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 10 }],
      { sklad: { sv__k50: 12 } },
    );
    expect(r.get('sv')).toEqual({ objednanoHl: 5, cekaHl: 5, zbyvaHl: 0 });
  });

  it('co už odjelo, nic nepotřebuje — sklad ho má odečtené', () => {
    const r = spocti(
      [{ id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 10 }],
      { odjele: ['i1'], sklad: { sv__k50: 0 } },
    );
    expect(r.get('sv')).toEqual({ objednanoHl: 5, cekaHl: 0, zbyvaHl: 0 });
  });

  it('chybějící sudy se počítají po obalech — přebytek 30l nepokryje 50l', () => {
    const r = spocti(
      [
        { id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 10 },
        { id: 'i2', order_id: 'o2', beer_id: 'sv', package_id: 'k30', quantity: 2 },
      ],
      { sklad: { sv__k50: 4, sv__k30: 20 } },
    );
    expect(r.get('sv')!.zbyvaHl).toBe(3); // 6 × 50 l
  });

  it('záporný sklad se bere jako nula', () => {
    const r = spocti([{ id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 2 }], { sklad: { sv__k50: -5 } });
    expect(r.get('sv')!.zbyvaHl).toBe(1);
  });

  it('storno a jiný týden se nepočítají', () => {
    const r = spocti(
      [
        { id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 2 },
        { id: 'i2', order_id: 'o2', beer_id: 'sv', package_id: 'k50', quantity: 2 },
      ],
      { objednavky: [obj('o1', '2026-09-24', 'storno'), obj('o2', '2026-09-30')] },
    );
    expect(r.get('sv')).toBeUndefined();
  });

  it('neodjeté objednávky z dřívějška si sklad zaberou první', () => {
    const r = spocti(
      [
        { id: 'i0', order_id: 'o0', beer_id: 'sv', package_id: 'k50', quantity: 8 },
        { id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 10 },
      ],
      { objednavky: [obj('o0', '2026-09-24'), obj('o1', '2026-09-30')], sklad: { sv__k50: 12 }, tyden: '2026-40' },
    );
    expect(r.get('sv')!.zbyvaHl).toBe(3); // 12 − 8 = 4 volné, chybí 6 × 50 l
  });

  it('zapomenutá neodjetá objednávka z minulých týdnů sklad neblokuje', () => {
    const r = spocti(
      [
        { id: 'i0', order_id: 'o0', beer_id: 'sv', package_id: 'k50', quantity: 8 },
        { id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 10 },
      ],
      { objednavky: [obj('o0', '2026-09-18'), obj('o1', '2026-09-24')], sklad: { sv__k50: 12 } },
    );
    expect(r.get('sv')!.zbyvaHl).toBe(0);
  });

  it('Jantar se rozdělí 80/20 do Světlé a Tmavého', () => {
    const r = spocti([{ id: 'i1', order_id: 'o1', beer_id: 'ja', package_id: 'k50', quantity: 2 }]);
    expect(r.get('sv')!.zbyvaHl).toBe(0.8);
    expect(r.get('tm')!.zbyvaHl).toBe(0.2);
    expect(r.get('ja')!.zbyvaHl).toBe(0);
  });

  it('chybějící lahve přidají 50 l rezervy', () => {
    const r = spocti([{ id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'l05', quantity: 100 }]);
    expect(r.get('sv')!.zbyvaHl).toBe(1); // 50 l + 50 l rezerva
  });
});
