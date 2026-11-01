// 🛢️ Hlídání malých sudů nad daty z databáze (useHlidaniMalychSudu):
// načte i zavezené objednávky týdne s odpočty a chyba načtení nesmí přepsat
// dobrá data prázdnými (revize 1. 11. 2026 — číslo by skočilo zpět na
// naklikané a +/− by ho uložilo s novým časem).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type Odpoved = { data: unknown[] | null; error: { message: string } | null };
const odpovedi: Record<string, Odpoved> = {};
const filtry: { tabulka: string; or?: string }[] = [];
let obnov: (() => void) | null = null;

vi.mock('./supabase', () => ({
  supabase: { from: vi.fn() },
  useRealtime: (_tabulky: string[], cb: () => void) => { obnov = cb; },
  fetchAllRows: (tabulka: string) => {
    const zaznam: { tabulka: string; or?: string } = { tabulka };
    filtry.push(zaznam);
    const api = {
      neq: () => api,
      eq: () => api,
      in: () => api,
      or: (vyraz: string) => { zaznam.or = vyraz; return api; },
      then: (ok: (v: Odpoved) => unknown, chyba?: (e: unknown) => unknown) =>
        Promise.resolve(odpovedi[tabulka] ?? { data: [], error: null }).then(ok, chyba),
    };
    return api;
  },
}));
vi.mock('./skladovaKnihaData', () => ({ nactiSkladovouKnihu: vi.fn(async () => ({ pohyby: [], piva: [] })) }));

import { useHlidaniMalychSudu } from './useMaleSudy';

const ZADANO = { k10: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } };
const ZASOBA = { k10: 8 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-01T10:00:00+01:00'));
  filtry.length = 0;
  obnov = null;
  odpovedi.orders = {
    data: [{ id: 'MANEO', status: 'nova', is_delivered: true, delivered_at: '2026-10-29T09:30:00Z', delivery_date: '2026-10-29', created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo', note: null }],
    error: null,
  };
  odpovedi.order_items = { data: [{ id: 'm1', order_id: 'MANEO', package_id: 'k10', quantity: 6, beer_id: 'b10' }], error: null };
  odpovedi.zavoz_deductions = {
    data: [{ order_id: 'MANEO', order_item_id: 'm1', beer_id: 'b10', package_id: 'k10', quantity: 6, deduct_date: '2026-10-29', created_at: '2026-10-28T23:05:00Z' }],
    error: null,
  };
});
afterEach(() => { vi.useRealTimers(); });

describe('useHlidaniMalychSudu', () => {
  it('načte i zavezené objednávky tohoto týdne a odjeté od zadání odečte (8 − 6 = 2)', async () => {
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, undefined, ZADANO));
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    expect(result.current.souhrn[0]).toMatchObject({ package_id: 'k10', zadano: 8, odvezeno: 6, mame: 2 });
    expect(filtry.find((f) => f.tabulka === 'orders')?.or).toBe('is_delivered.eq.false,delivery_date.gte.2026-10-26,created_at.gte.2026-10-25');
  });

  it('chyba při obnově nepřepíše dobrá data — číslo zůstane 2', async () => {
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, undefined, ZADANO));
    await waitFor(() => expect(result.current.souhrn[0]?.mame).toBe(2));
    odpovedi.orders = { data: [], error: { message: 'HTTP 504' } };
    await act(async () => { obnov?.(); });
    await waitFor(() => expect(filtry.filter((f) => f.tabulka === 'orders')).toHaveLength(2));
    expect(result.current.souhrn[0]).toMatchObject({ mame: 2, odvezeno: 6 });
    expect(result.current.chybaNacteni).toBe(false);

    // Spadnou jen odpočty: dnešní odepsané by se tvářily jako otevřené — taky se nic nepřepíše.
    odpovedi.orders = { data: [{ id: 'MANEO', status: 'nova', is_delivered: true, delivery_date: '2026-10-29', created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo' }], error: null };
    odpovedi.zavoz_deductions = { data: [], error: { message: 'HTTP 500' } };
    await act(async () => { obnov?.(); });
    await waitFor(() => expect(filtry.filter((f) => f.tabulka === 'zavoz_deductions')).toHaveLength(2));
    expect(result.current.souhrn[0]).toMatchObject({ mame: 2 });
  });

  it('první načtení selže: chybaNacteni, žádný souhrn (záložka ukáže upozornění)', async () => {
    odpovedi.orders = { data: [], error: { message: 'HTTP 504' } };
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, undefined, ZADANO));
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    expect(result.current.chybaNacteni).toBe(true);
    expect(result.current.souhrn).toEqual([]);
  });
});
