// Z provozu 29. 9. 2026: „objednávky z minulého týdne Maneo a Mutějovice
// nelze smazat" — odpočet závozu držel cizí klíč.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const kroky: string[] = [];
let chybaObjednavky: { message: string } | null = null;

vi.mock('./supabase', () => {
  const tabulka = (t: string) => ({
    select: () => ({ in: async () => ({ data: t === 'order_items' ? [{ id: 'p1' }, { id: 'p2' }] : [], error: null }) }),
    delete: () => ({
      in: async () => {
        kroky.push(`delete ${t}`);
        return { error: t === 'orders' ? chybaObjednavky : null };
      },
    }),
  });
  return {
    fetchAllRows: (t: string) => ({ in: async () => ({ data: t === 'order_items' ? [{ id: 'p1' }, { id: 'p2' }] : [], error: null }) }),
    supabase: {
      from: (t: string) => tabulka(t),
      rpc: async (fn: string, args: { p_order_item_id: string }) => { kroky.push(`${fn} ${args.p_order_item_id}`); return { error: null }; },
    },
  };
});

import { smazObjednavky } from './smazaniObjednavek';

describe('smazání objednávky i s odpočtem závozu', () => {
  beforeEach(() => { kroky.length = 0; chybaObjednavky = null; });

  it('nejdřív odpočty každé položky, pak položky, pak objednávka', async () => {
    expect(await smazObjednavky(['o1'])).toBeNull();
    expect(kroky).toEqual([
      'smaz_odpocty_polozky p1',
      'smaz_odpocty_polozky p2',
      'delete order_items',
      'delete orders',
    ]);
  });

  it('cizí klíč → srozumitelná česká hláška', async () => {
    chybaObjednavky = { message: 'update or delete on table "orders" violates foreign key constraint' };
    expect(await smazObjednavky(['o1'])).toMatch(/starý záznam odpočtu/);
  });

  it('prázdný výběr → nic', async () => {
    expect(await smazObjednavky([])).toBeNull();
    expect(kroky).toEqual([]);
  });
});
