// Objednávky pro Rozbor za týden / měsíc (lib/useObjednavkyRozboru.ts).
// Součty z půlky tabulky jsou horší než žádné — při selhání zůstává poslední
// úplný stav a hlásí se chyba; pozdě došlá starší odpověď nepřepíše novější.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

type Odpoved = { data: unknown[] | null; error: { message: string } | null };

const h = vi.hoisted(() => ({
  orders: [] as (() => Promise<Odpoved>)[],
  items: [] as (() => Promise<Odpoved>)[],
  volani: 0,
  realtime: null as null | (() => void),
  tabulky: [] as string[],
}));

vi.mock('./sdilenaData', () => ({
  nactiSdilenouTabulku: vi.fn((tabulka: string) => {
    const fronta = tabulka === 'orders' ? h.orders : h.items;
    const dalsi = fronta.length > 1 ? fronta.shift()! : fronta[0];
    return dalsi();
  }),
}));
vi.mock('./supabase', () => ({
  useRealtime: (tabulky: string[], cb: () => void) => { h.realtime = cb; h.tabulky = tabulky; },
}));

import { useObjednavkyRozboru } from './useObjednavkyRozboru';

const ok = (data: unknown[]): (() => Promise<Odpoved>) => async () => ({ data, error: null });
const chyba = (message = 'fetch failed'): (() => Promise<Odpoved>) => async () => ({ data: null, error: { message } });

const O1 = { id: 'o1', place_name: 'Restaurace', delivery_date: '2026-10-11', order_date: '2026-10-11', status: 'nova' };
const P1 = { order_id: 'o1', beer_id: 'sv', package_id: 'k50', quantity: 1 };

beforeEach(() => {
  h.orders = [ok([O1])];
  h.items = [ok([P1])];
  h.realtime = null;
});

describe('useObjednavkyRozboru', () => {
  it('načte objednávky i položky', async () => {
    const { result } = renderHook(() => useObjednavkyRozboru());
    expect(result.current.data).toBeNull();
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.data).toEqual({ objednavky: [O1], polozky: [P1] });
    expect(result.current.chyba).toBe(false);
  });

  it.each([['objednávky'], ['položky']])('selhání načtení tabulky %s = chyba, ne tichý prázdný zdroj', async (co) => {
    if (co === 'objednávky') h.orders = [chyba()]; else h.items = [chyba()];
    const { result } = renderHook(() => useObjednavkyRozboru());
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('odpověď bez dat (null bez chyby) se nebere jako prázdná tabulka', async () => {
    h.orders = [async () => ({ data: null, error: null })];
    const { result } = renderHook(() => useObjednavkyRozboru());
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('výjimka při načtení = chyba', async () => {
    h.orders = [async () => { throw new Error('síť'); }];
    const { result } = renderHook(() => useObjednavkyRozboru());
    await waitFor(() => expect(result.current.chyba).toBe(true));
  });

  it('když se přenačtení nepovede, zůstane poslední úplný stav a hlásí se chyba; další povedené chybu zruší', async () => {
    const { result } = renderHook(() => useObjednavkyRozboru());
    await waitFor(() => expect(result.current.data).not.toBeNull());

    h.items = [chyba()];
    await act(async () => { h.realtime!(); });
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toEqual({ objednavky: [O1], polozky: [P1] });

    h.items = [ok([P1, { ...P1, quantity: 2 }])];
    await act(async () => { h.realtime!(); });
    await waitFor(() => expect(result.current.chyba).toBe(false));
    expect(result.current.data!.polozky).toHaveLength(2);
  });

  it('změna v tabulkách (realtime) objednávky načte znovu', async () => {
    const { result } = renderHook(() => useObjednavkyRozboru());
    expect(h.tabulky).toEqual(['orders', 'order_items']);
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const O2 = { ...O1, id: 'o2' };
    h.orders = [ok([O1, O2])];
    await act(async () => { h.realtime!(); });
    await waitFor(() => expect(result.current.data!.objednavky).toHaveLength(2));
  });

  it('pozdě došlá starší odpověď nepřepíše novější', async () => {
    let propustStarou!: () => void;
    const stara = new Promise<void>((r) => { propustStarou = r; });
    h.orders = [
      async () => { await stara; return { data: [{ ...O1, id: 'stara' }], error: null }; },   // první načtení — pomalé
      ok([{ ...O1, id: 'nova' }]),                                                              // druhé — rychlé
    ];
    const { result } = renderHook(() => useObjednavkyRozboru());
    await act(async () => { h.realtime!(); });
    await waitFor(() => expect(result.current.data?.objednavky[0].id).toBe('nova'));
    await act(async () => { propustStarou(); await stara; });
    expect(result.current.data!.objednavky[0].id).toBe('nova');
  });
});
