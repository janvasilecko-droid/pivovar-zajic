// Odškrtnutí se na obrazovce ukáže HNED (ne až po odpovědi serveru), uloží se
// jedním dotazem, přežije přenačtení, které přišlo dřív než zápis, a vrátí se
// jen když server zápis odmítne. (14. 10. 2026: „nejde mi označovat, že mám
// připravený lahve" — telefon se slabým signálem.)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useState } from 'react';

type Zapis = { table: string; patch: any; ids: string[]; hotovo: () => void; selhani: (m: string) => void };
const zapisy: Zapis[] = [];
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (patch: any) => ({
        in: (_sloupec: string, ids: string[]) => new Promise((resolve) => {
          zapisy.push({
            table, patch, ids,
            hotovo: () => resolve({ error: null }),
            selhani: (message: string) => resolve({ error: { message } }),
          });
        }),
      }),
    }),
  },
}));
const chybaMock = vi.fn();
vi.mock('./toast', () => ({ chyba: (...a: any[]) => chybaMock(...a) }));

import { useOdskrtavani } from './useOdskrtavani';

const polozky = () => ({
  o1: [
    { id: 'a', is_prepared: false, is_bottled: false },
    { id: 'b', is_prepared: false, is_bottled: false },
  ],
  o2: [{ id: 'c', is_prepared: false, is_bottled: false }],
});
const objednavky = () => [{ id: 'o1', is_prepared: false }, { id: 'o2', is_prepared: false }];

function pripoj() {
  return renderHook(() => {
    const [items, setItems] = useState<Record<string, any[]>>(polozky());
    const [orders, setOrders] = useState<any[]>(objednavky());
    const h = useOdskrtavani({ items, setItems, orders, setOrders });
    return { items, orders, ...h };
  });
}
const priznaky = (r: ReturnType<typeof pripoj>['result'], oid: string, klic = 'is_prepared') =>
  r.current.items[oid].map((x: any) => x[klic]);

/** Nechá doběhnout mikroúlohy i časovač, ať se zápis stihne dostat k serveru. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const dej = () => act(async () => { await tick(); });

/**
 * Fronta zápisů (vPoradi) je proměnná celého modulu. Zápis, který by v testu zůstal
 * viset, by zablokoval všechny další testy — proto se po každém testu vše dokončí.
 */
async function dokonciVse() {
  for (let kolo = 0; kolo < 5; kolo++) {
    const pocet = zapisy.length;
    zapisy.forEach((z) => z.hotovo());
    await act(async () => { await tick(); });
    if (zapisy.length === pocet) break;
  }
}

beforeEach(() => { zapisy.length = 0; chybaMock.mockClear(); });
afterEach(dokonciVse);

describe('useOdskrtavani', () => {
  it('klepnutí se promítne HNED, dřív než server odpoví', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => { hotovo = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }], 'is_prepared', true); });
    // Server zatím neodpověděl (zapis visí), obrazovka už ukazuje odškrtnuto.
    expect(priznaky(result, 'o1')).toEqual([true, false]);
    await dej();
    expect(zapisy).toHaveLength(1);
    await act(async () => { zapisy[0].hotovo(); await hotovo; });
    expect(priznaky(result, 'o1')).toEqual([true, false]);
    expect(chybaMock).not.toHaveBeenCalled();
  });

  it('celý řádek nakládky (víc položek) se uloží jedním dotazem', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => {
      hotovo = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }, { orderId: 'o1', itemId: 'b' }, { orderId: 'o2', itemId: 'c' }], 'is_prepared', true);
    });
    await dej();
    expect(zapisy[0]).toMatchObject({ table: 'order_items', patch: { is_prepared: true }, ids: ['a', 'b', 'c'] });
    await act(async () => { zapisy[0].hotovo(); await tick(); });
    // Obě objednávky jsou teď celé připravené → druhý dotaz zapíše příznak objednávek.
    expect(zapisy[1]).toMatchObject({ table: 'orders', patch: { is_prepared: true }, ids: ['o1', 'o2'] });
    await act(async () => { zapisy[1].hotovo(); await hotovo; });
    expect(result.current.orders.map((o) => o.is_prepared)).toEqual([true, true]);
  });

  it('příznak celé objednávky se přepne hned s položkami', async () => {
    const { result } = pripoj();
    act(() => { void result.current.nastavPriznak([{ orderId: 'o2', itemId: 'c' }], 'is_prepared', true); });
    expect(result.current.orders.map((o) => o.is_prepared)).toEqual([false, true]);
    await dokonciVse();
    expect(result.current.orders.map((o) => o.is_prepared)).toEqual([false, true]);
  });

  it('přenačtení, které přijde dřív než zápis doběhne, odškrtnutí nevrátí (prekryj)', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => { hotovo = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }], 'is_prepared', true); });
    // „Čerstvě načtená“ data ze starého stavu — bez odškrtnutí.
    const nactene = result.current.prekryj(polozky());
    expect(nactene.o1.map((x: any) => x.is_prepared)).toEqual([true, false]);
    // Až zápis doběhne, přimíchávat se přestane (server už to ví).
    await dej();
    await act(async () => { zapisy[0].hotovo(); await hotovo; });
    expect(result.current.prekryj(polozky()).o1.map((x: any) => x.is_prepared)).toEqual([false, false]);
  });

  it('server zápis odmítne → vrátí se původní stav a ohlásí se chyba', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => { hotovo = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }], 'is_prepared', true); });
    expect(priznaky(result, 'o1')).toEqual([true, false]);
    await dej();
    await act(async () => { zapisy[0].selhani('permission denied'); await hotovo; });
    expect(priznaky(result, 'o1')).toEqual([false, false]);
    expect(chybaMock).toHaveBeenCalledWith(expect.stringContaining('permission denied'));
  });

  it('neúspěšné odškrtnutí vrátí zpět i příznak celé objednávky', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => { hotovo = result.current.nastavPriznak([{ orderId: 'o2', itemId: 'c' }], 'is_prepared', true); });
    expect(result.current.orders[1].is_prepared).toBe(true);
    await dej();
    await act(async () => { zapisy[0].selhani('chyba'); await hotovo; });
    expect(result.current.orders[1].is_prepared).toBe(false);
  });

  it('zaškrtnout a hned odškrtnout: zápisy jdou ve stejném pořadí', async () => {
    const { result } = pripoj();
    let p1!: Promise<void>, p2!: Promise<void>;
    act(() => { p1 = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }], 'is_prepared', true); });
    // Druhé klepnutí jde nad stavem, který už je vidět (zaškrtnuto) → odškrtnout.
    act(() => { p2 = result.current.nastavPriznak([{ orderId: 'o1', itemId: 'a' }], 'is_prepared', false); });
    await dej();
    // Druhý zápis se na server nedostane, dokud neskončí první.
    expect(zapisy).toHaveLength(1);
    expect(zapisy[0].patch).toEqual({ is_prepared: true });
    await act(async () => { zapisy[0].hotovo(); await tick(); });
    expect(zapisy[1].patch).toEqual({ is_prepared: false });
    await act(async () => { zapisy[1].hotovo(); await Promise.all([p1, p2]); });
    expect(priznaky(result, 'o1')).toEqual([false, false]);
  });

  it('„stočeno“ (is_bottled) se ukládá stejně, ale příznak objednávky se nemění', async () => {
    const { result } = pripoj();
    let hotovo!: Promise<void>;
    act(() => { hotovo = result.current.nastavPriznak([{ orderId: 'o2', itemId: 'c' }], 'is_bottled', true); });
    expect(priznaky(result, 'o2', 'is_bottled')).toEqual([true]);
    await dej();
    expect(zapisy[0].patch).toEqual({ is_bottled: true });
    await act(async () => { zapisy[0].hotovo(); await hotovo; });
    expect(zapisy).toHaveLength(1);               // žádný druhý dotaz na orders
    expect(result.current.orders[1].is_prepared).toBe(false);
  });

  it('bez cílů se nic neděje', async () => {
    const { result } = pripoj();
    await act(async () => { await result.current.nastavPriznak([], 'is_prepared', true); });
    expect(zapisy).toEqual([]);
    await waitFor(() => expect(priznaky(result, 'o1')).toEqual([false, false]));
  });
});
