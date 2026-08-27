// Stránkování dotazů — pojistka proti tichému ořezání na 1000 řádků.
//
// Supabase vrátí nejvýš 1000 řádků a zbytek zahodí BEZ chyby. U skladu je to
// zákeřné: část pohybů se přestane počítat a nic nespadne. Tenhle test hlídá,
// že se načte všechno, včetně dotazů typu „položky těchhle objednávek" —
// tam je past největší, protože položek bývá násobně víc než objednávek,
// takže dotaz přeroste tisícovku dřív než samotná tabulka.
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Radek = { id: number; order_id?: string };

/** Kolik řádků má atrapa dohromady vrátit a co se jí vlastně ptali. */
let vsechny: Radek[] = [];
const dotazy: { rozsah: [number, number]; inHodnoty?: any[] }[] = [];

vi.mock('@supabase/supabase-js', () => {
  const dotaz = () => {
    let inVals: any[] | undefined;
    const q: any = {
      order: () => q,
      eq: () => q,
      gte: () => q,
      lte: () => q,
      in: (_col: string, vals: any[]) => { inVals = vals; return q; },
      range: (od: number, do_: number) => {
        dotazy.push({ rozsah: [od, do_], inHodnoty: inVals });
        // Server vrací nejvýš tolik, kolik se vejde do rozsahu.
        const zdroj = inVals
          ? vsechny.filter((r) => inVals!.includes(r.order_id))
          : vsechny;
        return Promise.resolve({ data: zdroj.slice(od, do_ + 1), error: null });
      },
    };
    return q;
  };
  return {
    createClient: () => ({
      from: () => ({ select: () => dotaz() }),
      auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
      removeChannel: () => {},
    }),
  };
});

const { fetchAllRows } = await import('./supabase');

beforeEach(() => {
  vsechny = [];
  dotazy.length = 0;
});

describe('fetchAllRows', () => {
  it('načte i to, co je za tisícovkou', async () => {
    vsechny = Array.from({ length: 2500 }, (_, i) => ({ id: i }));

    const { data } = await fetchAllRows<Radek>('order_items');

    expect(data).toHaveLength(2500);
    // Tři stránky: 0–999, 1000–1999, 2000–2999 (poslední je neúplná → konec).
    expect(dotazy.map((d) => d.rozsah)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('u přesně tisíce řádků se nezacyklí', async () => {
    vsechny = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const { data } = await fetchAllRows<Radek>('order_items');
    expect(data).toHaveLength(1000);
    expect(dotazy).toHaveLength(2); // druhá stránka je prázdná → konec
  });
});

describe('fetchAllRows s .in()', () => {
  it('položky objednávek se nenačtou jen do tisícovky', async () => {
    // 300 objednávek po deseti položkách = 3000 řádků. Jedním dotazem by se
    // jich vrátilo 1000 a zbylých 2000 by TIŠE zmizelo — objednávky by v appce
    // vypadaly menší, než jsou, a sklad by z toho počítal špatně.
    const ids = Array.from({ length: 300 }, (_, i) => `o${i}`);
    vsechny = ids.flatMap((oid) => Array.from({ length: 10 }, (_, j) => ({ id: j, order_id: oid })));

    const { data } = await fetchAllRows<Radek>('order_items').in('order_id', ids);

    expect(data).toHaveLength(3000);
  });

  it('dlouhý seznam hodnot se posílá po dávkách kvůli délce URL', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `o${i}`);
    vsechny = ids.map((oid, i) => ({ id: i, order_id: oid }));

    await fetchAllRows<Radek>('order_items').in('order_id', ids);

    const davky = dotazy.map((d) => d.inHodnoty!.length);
    expect(davky[0]).toBe(100);
    // 100 + 100 + 50 — každá dávka se ptá aspoň jednou.
    expect(new Set(davky)).toEqual(new Set([100, 50]));
  });

  it('prázdný seznam se serveru vůbec neposílá', async () => {
    // `in.()` je pro PostgREST syntaktická chyba; správná odpověď je „nic".
    const { data, error } = await fetchAllRows<Radek>('order_items').in('order_id', []);

    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(dotazy).toHaveLength(0);
  });

  it('dá se kombinovat s řazením', async () => {
    vsechny = [{ id: 1, order_id: 'o1' }];
    const { data } = await fetchAllRows<Radek>('order_items')
      .order('created_at', { ascending: false })
      .in('order_id', ['o1']);
    expect(data).toHaveLength(1);
  });
});
