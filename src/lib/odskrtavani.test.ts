// 14. 10. 2026: „nejde mi označovat, že mám připravený lahve" (Rozvoz → Co naložit,
// telefon se slabým signálem). Pravidla odškrtávání — čistá část a zápis na server.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const zapisy: { table: string; patch: any; sloupec: string; hodnoty: string[] }[] = [];
let chybaServeru: string | null = null;
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (patch: any) => ({
        in: (sloupec: string, hodnoty: string[]) => {
          zapisy.push({ table, patch, sloupec, hodnoty });
          return Promise.resolve({ error: chybaServeru ? { message: chybaServeru } : null });
        },
      }),
    }),
  },
}));

import { nastavPriznakPolozek, ulozPriznakPolozek, ulozPripravenostObjednavek, vPoradi, zmenyPripravenostiObjednavek } from './odskrtavani';

const items = () => ({
  o1: [{ id: 'a', is_prepared: false, is_bottled: false }, { id: 'b', is_prepared: false, is_bottled: false }],
  o2: [{ id: 'c', is_prepared: true, is_bottled: false }],
});

beforeEach(() => { zapisy.length = 0; chybaServeru = null; });

describe('nastavPriznakPolozek', () => {
  it('nastaví příznak jen vybraným položkám a původní mapu nezmění', () => {
    const puvodni = items();
    const nove = nastavPriznakPolozek(puvodni, [{ orderId: 'o1', itemId: 'b' }], 'is_prepared', true);
    expect(nove.o1.map((x) => x.is_prepared)).toEqual([false, true]);
    expect(nove.o2).toBe(puvodni.o2);                          // nedotčená objednávka zůstává tatáž
    expect(puvodni.o1.map((x) => x.is_prepared)).toEqual([false, false]);
  });

  it('víc položek přes víc objednávek najednou', () => {
    const nove = nastavPriznakPolozek(items(), [{ orderId: 'o1', itemId: 'a' }, { orderId: 'o2', itemId: 'c' }], 'is_bottled', true);
    expect(nove.o1.map((x) => x.is_bottled)).toEqual([true, false]);
    expect(nove.o2[0].is_bottled).toBe(true);
  });

  it('neznámá objednávka nebo položka nic nerozbije', () => {
    const nove = nastavPriznakPolozek(items(), [{ orderId: 'nic', itemId: 'x' }, { orderId: 'o1', itemId: 'zzz' }], 'is_prepared', true);
    expect(nove.o1.map((x) => x.is_prepared)).toEqual([false, false]);
  });
});

describe('zmenyPripravenostiObjednavek', () => {
  const objednavky = [{ id: 'o1', is_prepared: false }, { id: 'o2', is_prepared: true }, { id: 'o3', is_prepared: false }];

  it('objednávka, kde jsou všechny položky připravené, se označí jako připravená', () => {
    const i = nastavPriznakPolozek(items(), [{ orderId: 'o1', itemId: 'a' }, { orderId: 'o1', itemId: 'b' }], 'is_prepared', true);
    expect(zmenyPripravenostiObjednavek(i, objednavky, ['o1'])).toEqual([{ orderId: 'o1', hotovo: true }]);
  });

  it('po odškrtnutí jedné položky přestane být celá připravená', () => {
    const i = nastavPriznakPolozek(items(), [{ orderId: 'o2', itemId: 'c' }], 'is_prepared', false);
    expect(zmenyPripravenostiObjednavek(i, objednavky, ['o2'])).toEqual([{ orderId: 'o2', hotovo: false }]);
  });

  it('vrací jen skutečné změny', () => {
    expect(zmenyPripravenostiObjednavek(items(), objednavky, ['o1', 'o2'])).toEqual([]);
  });

  it('prázdná objednávka hotová není, ani když se dotkneme jejího id', () => {
    expect(zmenyPripravenostiObjednavek({ o3: [] }, [{ id: 'o3', is_prepared: true }], ['o3'])).toEqual([{ orderId: 'o3', hotovo: false }]);
  });
});

describe('zápis na server', () => {
  it('všechny položky řádku nakládky jdou JEDNÍM dotazem', async () => {
    const chyba = await ulozPriznakPolozek('is_prepared', ['a', 'b', 'c', 'a'], true);
    expect(chyba).toBeNull();
    expect(zapisy).toEqual([{ table: 'order_items', patch: { is_prepared: true }, sloupec: 'id', hodnoty: ['a', 'b', 'c'] }]);
  });

  it('velká nakládka se dělí na dávky po 40 id', async () => {
    const ids = Array.from({ length: 95 }, (_, i) => `id${i}`);
    await ulozPriznakPolozek('is_bottled', ids, false);
    expect(zapisy.map((z) => z.hodnoty.length)).toEqual([40, 40, 15]);
  });

  it('bez položek se nic neposílá', async () => {
    expect(await ulozPriznakPolozek('is_prepared', [], true)).toBeNull();
    expect(zapisy).toEqual([]);
  });

  it('chyba serveru se vrátí jako text a další dávky se neposílají', async () => {
    chybaServeru = 'permission denied';
    const ids = Array.from({ length: 50 }, (_, i) => `id${i}`);
    expect(await ulozPriznakPolozek('is_prepared', ids, true)).toBe('permission denied');
    expect(zapisy).toHaveLength(1);
  });

  it('příznak celých objednávek: jeden dotaz na „ano“ a jeden na „ne“', async () => {
    await ulozPripravenostObjednavek([{ orderId: 'o1', hotovo: true }, { orderId: 'o2', hotovo: false }, { orderId: 'o3', hotovo: true }]);
    expect(zapisy).toEqual([
      { table: 'orders', patch: { is_prepared: true }, sloupec: 'id', hodnoty: ['o1', 'o3'] },
      { table: 'orders', patch: { is_prepared: false }, sloupec: 'id', hodnoty: ['o2'] },
    ]);
    zapisy.length = 0;
    await ulozPripravenostObjednavek([]);
    expect(zapisy).toEqual([]);
  });
});

describe('vPoradi', () => {
  it('úkoly běží jeden po druhém ve stejném pořadí, i když první trvá déle', async () => {
    const udalosti: string[] = [];
    const pomaly = vPoradi(async () => { udalosti.push('1 start'); await new Promise((r) => setTimeout(r, 30)); udalosti.push('1 konec'); return 1; });
    const rychly = vPoradi(async () => { udalosti.push('2 start'); udalosti.push('2 konec'); return 2; });
    expect(await Promise.all([pomaly, rychly])).toEqual([1, 2]);
    expect(udalosti).toEqual(['1 start', '1 konec', '2 start', '2 konec']);
  });

  it('selhání jednoho úkolu další úkoly nezastaví', async () => {
    const spatny = vPoradi(async () => { throw new Error('boom'); });
    await expect(spatny).rejects.toThrow('boom');
    expect(await vPoradi(async () => 'ok')).toBe('ok');
  });
});
