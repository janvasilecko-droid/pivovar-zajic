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

import { useHlidaniMalychSudu, useMaleSudy } from './useMaleSudy';
import { supabase } from './supabase';
import { nactiSkladovouKnihu } from './skladovaKnihaData';

const ZADANO = { k10: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } };
const ZASOBA = { k10: 8 };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-11-01T10:00:00+01:00'));
  filtry.length = 0;
  obnov = null;
  vi.mocked(nactiSkladovouKnihu).mockReset();
  vi.mocked(nactiSkladovouKnihu).mockImplementation(async () => ({ pohyby: [], piva: [] }) as any);
  // delivered_at jako v ostrých datech: noční oznac_minule_zavozy píše den závozu 00:00 v Praze.
  odpovedi.orders = {
    data: [{ id: 'MANEO', status: 'nova', is_delivered: true, delivered_at: '2026-10-28T23:00:00+00:00', delivery_date: '2026-10-29', created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo', note: null }],
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

  // Revize 1. 11. 2026: skladová kniha (12 tabulek) na slabém signálu spadne —
  // u „započítat plné" by velké číslo potichu spadlo z 5 na 2.
  it('skladová kniha se při obnově nenačte: plné k zadání i jména piv zůstanou (5 nespadne na 2)', async () => {
    const kniha = vi.mocked(nactiSkladovouKnihu);
    kniha.mockImplementation(async () => ({
      pohyby: [
        { date: '2026-10-26', beer_id: 'b10', package_id: 'k10', qty: 3, kind: 'kegovani', createdAt: '2026-10-26T10:00:00Z' },
        { date: '2026-10-28', beer_id: 'b10', package_id: 'k10', qty: 3, kind: 'kegovani', createdAt: '2026-10-28T08:00:00Z' },
        { date: '2026-10-29', beer_id: 'b10', package_id: 'k10', qty: -6, kind: 'zavoz', createdAt: '2026-10-28T23:05:00Z' },
      ],
      piva: [{ id: 'b10', name: 'Desítka' }],
    }) as any);
    const ZAPOCITAT = new Set(['k10']);
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, ZAPOCITAT, ZADANO));
    // 3 plné z doby zadání pokryly půlku Manea — z prázdných odjely 3.
    await waitFor(() => expect(result.current.souhrn[0]?.mame).toBe(5));
    expect(result.current.souhrn[0]).toMatchObject({ zadano: 8, odvezeno: 3 });
    expect(result.current.souhrn[0].odvezenoZ?.[0]).toMatchObject({ order_id: 'MANEO', kusu: 3, plnych: 3 });
    expect(result.current.jmenaPiv.get('b10')).toBe('Desítka');

    // Obnova: přibyla otevřená objednávka X (2× 10 l), kniha selže.
    kniha.mockRejectedValueOnce(new Error('Neúplná data'));
    odpovedi.orders = {
      data: [...(odpovedi.orders.data ?? []), { id: 'X', status: 'nova', is_delivered: false, delivery_date: '2026-11-03', created_at: '2026-10-31T10:00:00Z', place_name: 'X' }],
      error: null,
    };
    odpovedi.order_items = { data: [...(odpovedi.order_items.data ?? []), { id: 'x1', order_id: 'X', package_id: 'k10', quantity: 2, beer_id: 'b20' }], error: null };
    await act(async () => { obnov?.(); });
    await waitFor(() => expect(result.current.souhrn[0]?.objednano).toBe(2));
    expect(kniha).toHaveBeenCalledTimes(2);
    expect(result.current.souhrn[0]).toMatchObject({ mame: 5, odvezeno: 3 });
    expect(result.current.jmenaPiv.get('b10')).toBe('Desítka');
    expect(result.current.chybaNacteni).toBe(false);
  });
});

describe('useHlidaniMalychSudu — chyby a vlastní sudy odběratelů', () => {
  it('položky nebo stočení vlastních sudů se při prvním načtení nenačtou → chybaNacteni', async () => {
    odpovedi.order_items = { data: [], error: { message: 'HTTP 500' } };
    const a = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, undefined, ZADANO));
    await waitFor(() => expect(a.result.current.nacteno).toBe(true));
    expect(a.result.current.chybaNacteni).toBe(true);
    a.unmount();

    odpovedi.order_items = { data: [{ id: 't1', order_id: 'MARTIN', package_id: 'k10', quantity: 2, beer_id: 'b10' }], error: null };
    odpovedi.orders = { data: [{ id: 'MARTIN', status: 'nova', is_delivered: false, delivery_date: '2026-11-02', created_at: '2026-10-30T10:00:00Z', place_name: 'Martin' }], error: null };
    odpovedi.zavoz_deductions = { data: [], error: null };
    odpovedi.kegging = { data: [], error: { message: 'HTTP 504' } };
    const b = renderHook(() => useHlidaniMalychSudu(ZASOBA, undefined, undefined, ZADANO));
    await waitFor(() => expect(b.result.current.nacteno).toBe(true));
    expect(b.result.current.chybaNacteni).toBe(true);
  });

  // Revize 1. 11. 2026: Martinovy sudy stočené před zadáním ostatním objednávkám
  // nepatří — ani když Martin odjede (dřív se po jeho odpočtu přestaly odečítat).
  it('„započítat plné": Martin odjede ve středu, Maneo stočený z prázdných čeká — K dispozici zůstane 1', async () => {
    vi.setSystemTime(new Date('2026-10-28T10:00:00+01:00'));
    vi.mocked(nactiSkladovouKnihu).mockImplementation(async () => ({
      pohyby: [
        { date: '2026-10-26', beer_id: 'b12', package_id: 'k20', qty: 2, kind: 'kegovani', createdAt: '2026-10-26T10:00:00Z' },   // Martinovy
        { date: '2026-10-28', beer_id: 'b12', package_id: 'k20', qty: -2, kind: 'zavoz', createdAt: '2026-10-27T23:05:00Z' },     // Martin odjel
        { date: '2026-10-28', beer_id: 'b12', package_id: 'k20', qty: 3, kind: 'kegovani', createdAt: '2026-10-28T08:00:00Z' },   // pro Maneo
      ],
      piva: [{ id: 'b12', name: 'Dvanáctka' }],
    }) as any);
    odpovedi.orders = {
      data: [
        { id: 'MARTIN', status: 'nova', is_delivered: true, delivered_at: '2026-10-27T23:00:00+00:00', delivery_date: '2026-10-28', created_at: '2026-10-26T09:00:00Z', place_name: 'Martin' },
        { id: 'MANEO', status: 'nova', is_delivered: false, delivery_date: '2026-10-29', created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo' },
      ],
      error: null,
    };
    odpovedi.order_items = {
      data: [
        { id: 't1', order_id: 'MARTIN', package_id: 'k20', quantity: 2, beer_id: 'b12' },
        { id: 'm1', order_id: 'MANEO', package_id: 'k20', quantity: 3, beer_id: 'b12' },
      ],
      error: null,
    };
    odpovedi.zavoz_deductions = {
      data: [{ order_id: 'MARTIN', order_item_id: 't1', beer_id: 'b12', package_id: 'k20', quantity: 2, deduct_date: '2026-10-28', created_at: '2026-10-27T23:05:00Z' }],
      error: null,
    };
    odpovedi.kegging = {
      data: [{ order_item_id: 't1', beer_id: 'b12', package_id: 'k20', quantity: 2, entry_date: '2026-10-26', created_at: '2026-10-26T10:00:00Z', note: null }],
      error: null,
    };
    const zadano = { k20: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } };
    const ZASOBA20 = { k20: 4 };
    const ZAPOCITAT = new Set(['k20']);
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA20, undefined, ZAPOCITAT, zadano));
    await waitFor(() => expect(result.current.souhrn[0]?.objednano).toBeDefined());
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    expect(result.current.souhrn[0]).toMatchObject({ mame: 4, objednano: 3, nad: 0, zapocitanoPlnych: 0, plneSkladem: {}, odvezeno: 0 });
  });

  it('sudy odběratele označené [mimo-sklad] ve skladu nejsou — z plných pivovaru se neubírají', async () => {
    vi.setSystemTime(new Date('2026-10-28T10:00:00+01:00'));
    vi.mocked(nactiSkladovouKnihu).mockImplementation(async () => ({
      pohyby: [
        // 3 plné pivovaru + 2 Martinovy; [mimo-sklad] kniha nepočítá.
        { date: '2026-10-26', beer_id: 'b12', package_id: 'k20', qty: 5, kind: 'kegovani', createdAt: '2026-10-26T10:00:00Z' },
      ],
      piva: [{ id: 'b12', name: 'Dvanáctka' }],
    }) as any);
    odpovedi.orders = {
      data: [
        { id: 'MARTIN', status: 'nova', is_delivered: false, delivery_date: '2026-10-30', created_at: '2026-10-26T09:00:00Z', place_name: 'Martin' },
        { id: 'MANEO', status: 'nova', is_delivered: false, delivery_date: '2026-10-29', created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo' },
      ],
      error: null,
    };
    odpovedi.order_items = {
      data: [
        { id: 't1', order_id: 'MARTIN', package_id: 'k20', quantity: 7, beer_id: 'b12' },
        { id: 'm1', order_id: 'MANEO', package_id: 'k20', quantity: 3, beer_id: 'b12' },
      ],
      error: null,
    };
    odpovedi.zavoz_deductions = { data: [], error: null };
    odpovedi.kegging = {
      data: [
        { order_item_id: 't1', beer_id: 'b12', package_id: 'k20', quantity: 2, entry_date: '2026-10-26', created_at: '2026-10-26T10:00:00Z', note: null },
        { order_item_id: 't1', beer_id: 'b12', package_id: 'k20', quantity: 5, entry_date: '2026-10-26', created_at: '2026-10-26T10:05:00Z', note: '[mimo-sklad]' },
      ],
      error: null,
    };
    const zadano = { k20: { cas: '2026-10-27T08:43:11Z', den: '2026-10-27' } };
    const ZASOBA20 = { k20: 4 };
    const { result } = renderHook(() => useHlidaniMalychSudu(ZASOBA20, undefined, undefined, zadano));
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    await waitFor(() => expect(result.current.souhrn[0]?.objednano).toBe(3));
    // Upozornění „skladem jsou plné" ukáže 3 pivovaru (Martinovy 2 ne, [mimo-sklad] nic neubírá).
    expect(result.current.souhrn[0]).toMatchObject({ mame: 4, objednano: 3, plneSkladem: { b12: 3 } });
  });
});

// +/− v záložce opraví naklikané číslo o kus — čas zadání musí zůstat, jinak
// by sudy stočené od zadání byly „plné k zadání" (revize 1. 11. 2026).
describe('useMaleSudy — +/− nechá čas zadání', () => {
  const upserty: Record<string, unknown>[] = [];
  let radky: Record<string, unknown>[] = [];
  let chybaVyberu: { message: string } | null = null;
  let vyberu = 0;
  beforeEach(() => {
    upserty.length = 0;
    chybaVyberu = null;
    vyberu = 0;
    vi.mocked(supabase.from).mockImplementation(((tabulka: string) => ({
      select: () => Promise.resolve(tabulka === 'male_sudy'
        ? (vyberu++, chybaVyberu ? { data: null, error: chybaVyberu } : { data: radky, error: null })
        : { data: [{ id: 'k10', kind: 'keg', volume_l: 10 }, { id: 'k20', kind: 'keg', volume_l: 20 }], error: null }),
      upsert: (radek: Record<string, unknown>) => { upserty.push(radek); return Promise.resolve({ error: null }); },
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    })) as any);
  });

  it('oprava o kus uloží původní čas; napsané číslo nový; další +/− hned potom naváže na nový', async () => {
    radky = [{ package_id: 'k10', pocet: 8, updated_at: '2026-10-27T08:43:11.123+00:00', zapocitat_plne: true }];
    const { result } = renderHook(() => useMaleSudy());
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    expect(result.current.zasoba).toEqual({ k10: 8, k20: 0 });
    expect(result.current.zadanoKdy.k10).toEqual({ cas: '2026-10-27T08:43:11.123+00:00', den: '2026-10-27' });

    await act(async () => { await result.current.ulozit('k10', 9, 'Honza', { zachovatCas: true }); });
    expect(upserty.at(-1)).toEqual({ package_id: 'k10', pocet: 9, updated_at: '2026-10-27T08:43:11.123+00:00', updated_by: 'Honza' });
    expect(result.current.zasoba.k10).toBe(9);
    expect(result.current.zadanoKdy.k10).toEqual({ cas: '2026-10-27T08:43:11.123+00:00', den: '2026-10-27' });
    expect(result.current.zapocitatPlne.has('k10')).toBe(true);

    // Napsané číslo = nové zadání teď.
    await act(async () => { await result.current.ulozit('k10', 5, 'Honza'); });
    const ted = String(upserty.at(-1)?.updated_at);
    expect(Date.parse(ted)).toBeGreaterThanOrEqual(Date.parse('2026-11-01T09:00:00Z'));
    expect(result.current.zadanoKdy.k10).toEqual({ cas: ted, den: '2026-11-01' });
    // − hned po tom (obnova z databáze ještě nedorazila) zachová nový čas, ne úterní.
    await act(async () => { await result.current.ulozit('k10', 4, 'Honza', { zachovatCas: true }); });
    expect(upserty.at(-1)).toMatchObject({ pocet: 4, updated_at: ted });
    // Obal, který ještě nikdo nezadal (bere se jako 0): „+" je první zadání s časem teď.
    await act(async () => { await result.current.ulozit('k20', 1, null, { zachovatCas: true }); });
    expect(Date.parse(String(upserty.at(-1)?.updated_at))).toBeGreaterThanOrEqual(Date.parse('2026-11-01T09:00:00Z'));
    expect(result.current.zadanoKdy.k20?.den).toBe('2026-11-01');
  });

  it('počty se nenačtou poprvé → chybaNacteni; nepovedená obnova potom nechá načtené počty', async () => {
    chybaVyberu = { message: 'TypeError: Failed to fetch' };
    const a = renderHook(() => useMaleSudy());
    await waitFor(() => expect(a.result.current.nacteno).toBe(true));
    expect(a.result.current.chybaNacteni).toBe(true);
    a.unmount();

    chybaVyberu = null;
    radky = [{ package_id: 'k10', pocet: 8, updated_at: '2026-10-27T08:43:11Z', zapocitat_plne: false }];
    const b = renderHook(() => useMaleSudy());
    await waitFor(() => expect(b.result.current.zasoba.k10).toBe(8));
    const predObnovou = vyberu;
    chybaVyberu = { message: 'TypeError: Failed to fetch' };
    await act(async () => { obnov?.(); });
    await waitFor(() => expect(vyberu).toBe(predObnovou + 1));
    await act(async () => { await Promise.resolve(); });
    expect(b.result.current.chybaNacteni).toBe(false);
    expect(b.result.current.zasoba.k10).toBe(8);
  });

  it('počet z minulého týdne: i +/− je nové zadání a „započítat plné" se zeptá znovu', async () => {
    radky = [{ package_id: 'k10', pocet: 8, updated_at: '2026-10-20T08:00:00Z', zapocitat_plne: true }];
    const { result } = renderHook(() => useMaleSudy());
    await waitFor(() => expect(result.current.nacteno).toBe(true));
    expect(result.current.zasoba).toEqual({});
    await act(async () => { await result.current.ulozit('k10', 1, null, { zachovatCas: true }); });
    expect(upserty.at(-1)).toMatchObject({ package_id: 'k10', pocet: 1, zapocitat_plne: false });
    expect(Date.parse(String(upserty.at(-1)?.updated_at))).toBeGreaterThanOrEqual(Date.parse('2026-11-01T09:00:00Z'));
    expect(result.current.zapocitatPlne.has('k10')).toBe(false);
  });
});
