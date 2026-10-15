// Plán stáčení (lib/usePlanStaceni.ts) a neúplná / zastaralá data.
// 15. 10. 2026: tabulka, která se nenačetla, se brala jako prázdná (`?? []`)
// a „zbývá stočit" se počítalo bez části pohybů. Plán z neúplných dat je horší
// než žádný — má se nechat poslední úplný stav a říct, že se nepovedlo obnovit.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  chyby: {} as Record<string, { message: string }>,
  bezDat: new Set<string>(),
  zPameti: new Set<string>(),
}));

const odpoved = (tabulka: string) => ({
  data: h.chyby[tabulka] || h.bezDat.has(tabulka) ? null : [] as any[],
  error: h.chyby[tabulka] ?? null,
  ...(h.zPameti.has(tabulka) ? { zPameti: true } : {}),
});

vi.mock('./businessDate', () => ({ businessDateISO: () => '2026-10-15' }));
vi.mock('./supabase', () => {
  const retez = (tabulka: string) => {
    const q: any = new Proxy({}, {
      get: (_t, prop: string) => {
        if (prop === 'then') return (ok: (r: any) => any, ko?: (e: any) => any) => Promise.resolve(odpoved(tabulka)).then(ok, ko);
        return () => q;
      },
    });
    return q;
  };
  return {
    supabase: { from: (t: string) => retez(t) },
    fetchAllRows: (t: string) => retez(t),
    useRealtime: () => {},
  };
});
vi.mock('./sdilenaData', () => ({
  nactiSdilenouTabulku: async (tabulka: string) => odpoved(tabulka),
}));

import { usePlanStaceni } from './usePlanStaceni';
import { vycistiZPameti } from './zPameti';

beforeEach(() => {
  vycistiZPameti();
  h.chyby = {};
  h.bezDat = new Set();
  h.zPameti = new Set();
});

describe('usePlanStaceni', () => {
  it('z úplných dat vrátí plán bez chyby a bez upozornění', async () => {
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.chyba).toBe(false);
    expect(result.current.zPameti).toBe(false);
  });

  it('tabulka, která se nenačetla (třeba odpočty závozu), plán neuvolní', async () => {
    h.chyby = { zavoz_deductions: { message: 'fetch failed' } };
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it.each([
    ['kegging'], ['bottling'], ['fasovani'], ['fasovani_private'], ['writeoffs'],
    ['inventory'], ['inventory_adjustments'], ['akce'], ['keg_prefuk'], ['order_items'],
  ])('selhání tabulky %s = chyba, ne tichý prázdný zdroj', async (tabulka) => {
    h.chyby = { [tabulka]: { message: 'x' } };
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('tabulka vrátila null místo řádků: taky chyba', async () => {
    h.bezDat = new Set(['kegging']);
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.chyba).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('po neúspěšném obnovení zůstane poslední úplný stav a nastaví se chyba', async () => {
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    const predtim = result.current.data;
    h.chyby = { bottling: { message: 'timeout' } };
    await act(async () => { await result.current.nacti(); });
    expect(result.current.chyba).toBe(true);
    expect(result.current.data).toBe(predtim);
  });

  it('po úspěšném opakování chyba zmizí', async () => {
    h.chyby = { bottling: { message: 'timeout' } };
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.chyba).toBe(true));
    h.chyby = {};
    await act(async () => { await result.current.nacti(); });
    expect(result.current.chyba).toBe(false);
    expect(result.current.data).not.toBeNull();
  });

  it('data z paměti telefonu: plán je, ale s příznakem zPameti', async () => {
    h.zPameti = new Set(['fasovani']);
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.zPameti).toBe(true);
    expect(result.current.chyba).toBe(false);
  });

  it('po čerstvém načtení příznak zPameti zmizí', async () => {
    h.zPameti = new Set(['fasovani']);
    const { result } = renderHook(() => usePlanStaceni('2026-42'));
    await waitFor(() => expect(result.current.zPameti).toBe(true));
    h.zPameti = new Set();
    await act(async () => { await result.current.nacti(); });
    expect(result.current.zPameti).toBe(false);
  });
});
