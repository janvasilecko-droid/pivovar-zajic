// 1. 10. 2026: „nesedí mi data v inventuře… projdi to všechno pořádně".
import { describe, it, expect } from 'vitest';
import { najdiPodezrele, najdiChybejiciZdrojSudu } from './kontrolaPohybu';
import type { Movement } from './stockLedger';

const m = (date: string, kind: Movement['kind'], qty: number, extra: Partial<Movement> = {}): Movement =>
  ({ date, beer_id: 'b12', package_id: 'k50', qty, kind, ...extra });
const zaklad = { od: '2026-09-01', doDne: '2026-09-30' };

describe('kontrola pohybů', () => {
  it('stáčení zapsané dvakrát v jednom dni', () => {
    const n = najdiPodezrele({ ...zaklad, pohyby: [m('2026-09-10', 'sud_na_lahve', -2), m('2026-09-10', 'sud_na_lahve', -2)], objednavky: [], polozky: [] });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ vaha: 'pozor', dopad: 2 });
  });

  it('odpočet zrušené objednávky bez vrácení = chyba', () => {
    const n = najdiPodezrele({
      ...zaklad,
      pohyby: [m('2026-09-22', 'zavoz', -3, { orderId: 'o1' })],
      objednavky: [{ id: 'o1', place_name: 'Maneo', status: 'storno' }],
      polozky: [{ order_id: 'o1', beer_id: 'b12', package_id: 'k50', quantity: 3 }],
    });
    expect(n[0]).toMatchObject({ vaha: 'chyba', dopad: -3 });
    expect(n[0].text).toContain('Maneo');
  });

  it('zrušená a vrácená celá = v pořádku; vrácená dvakrát = chyba', () => {
    const spolecne = {
      ...zaklad,
      objednavky: [{ id: 'o1', place_name: 'Maneo', status: 'storno' }],
      polozky: [{ order_id: 'o1', beer_id: 'b12', package_id: 'k50', quantity: 2 }],
    };
    const ok = najdiPodezrele({ ...spolecne, pohyby: [m('2026-09-22', 'zavoz', -2, { orderId: 'o1' }), m('2026-09-29', 'dorovnani', 2, { orderId: 'o1' })] });
    expect(ok).toEqual([]);
    const dvakrat = najdiPodezrele({ ...spolecne, pohyby: [
      m('2026-09-22', 'zavoz', -2, { orderId: 'o1' }),
      m('2026-09-29', 'dorovnani', 2, { orderId: 'o1' }),
      m('2026-09-30', 'dorovnani', 2, { orderId: 'o1' }),
    ] });
    expect(dvakrat.some((x) => x.vaha === 'chyba' && x.dopad === 2)).toBe(true);
  });

  it('odepsáno víc, než je v objednávce; odpočet smazané objednávky', () => {
    const n = najdiPodezrele({
      ...zaklad,
      pohyby: [m('2026-09-15', 'zavoz', -5, { orderId: 'o1' }), m('2026-09-16', 'zavoz', -1, { orderId: 'smazana' })],
      objednavky: [{ id: 'o1', place_name: 'Karlín', status: 'vyrizeno' }],
      polozky: [{ order_id: 'o1', beer_id: 'b12', package_id: 'k50', quantity: 3 }],
    });
    expect(n.map((x) => x.dopad).sort()).toEqual([-1, -2]);
  });

  it('stejná objednávka zadaná dvakrát', () => {
    const n = najdiPodezrele({
      ...zaklad,
      pohyby: [],
      objednavky: [
        { id: 'a', place_name: 'Maneo', status: 'nova', delivery_date: '2026-09-21' },
        { id: 'b', place_name: 'maneo ', status: 'nova', delivery_date: '2026-09-21' },
      ],
      polozky: [
        { order_id: 'a', beer_id: 'b12', package_id: 'k50', quantity: 2 },
        { order_id: 'b', beer_id: 'b12', package_id: 'k50', quantity: 2 },
      ],
    });
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ vaha: 'pozor', dopad: -2 });
  });
});

describe('chybějící zdrojový sud u stáčení lahví', () => {
  const b = (entry_date: string, extra: Partial<Parameters<typeof najdiChybejiciZdrojSudu>[0][number]> = {}) =>
    ({ entry_date, beer_id: 'b12', quantity: 40, kegs_used: null, kegs_used_package_id: null, created_at: null, note: null, ...extra });

  it('stočení bez zapsaného sudu = nález', () => {
    const n = najdiChybejiciZdrojSudu([b('2026-09-29')], zaklad);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ vaha: 'chyba', beer_id: 'b12', package_id: '' });
  });

  it('kegs_used vyplněné, ale bez obalu sudu = pořád nález (přesně tenhle případ hlásil sládek)', () => {
    const n = najdiChybejiciZdrojSudu([b('2026-09-29', { kegs_used: 2, kegs_used_package_id: null })], zaklad);
    expect(n).toHaveLength(1);
  });

  it('sud zapsaný (kegs_used i obal) = v pořádku', () => {
    const n = najdiChybejiciZdrojSudu([b('2026-09-29', { kegs_used: 2, kegs_used_package_id: 'keg50' })], zaklad);
    expect(n).toEqual([]);
  });

  it('tři cílové obaly ze stejné dávky (stejný created_at) = jeden nález, ne tři', () => {
    const n = najdiChybejiciZdrojSudu([
      b('2026-09-29', { created_at: '2026-09-29T10:00:00Z' }),
      b('2026-09-29', { created_at: '2026-09-29T10:00:00Z' }),
      b('2026-09-29', { created_at: '2026-09-29T10:00:00Z' }),
    ], zaklad);
    expect(n).toHaveLength(1);
  });

  it('množství 0 nebo jiné pivo/mimo období se vynechá', () => {
    const n = najdiChybejiciZdrojSudu([
      b('2026-09-29', { quantity: 0 }),
      b('2026-09-29', { beer_id: 'jine' }),
      b('2026-08-01'),
    ], { ...zaklad, beerId: 'b12' });
    expect(n).toEqual([]);
  });
});
