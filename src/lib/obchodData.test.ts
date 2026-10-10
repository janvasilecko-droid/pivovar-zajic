// Obchod načítá piva z katalogu — i s BARVOU (10. 10. 2026: „barevně označený
// jako všude jinde"). Dřív se barva nenačítala, takže piva v Obchodě byla bez ní
// a žádný test s hotovými daty to nemohl poznat.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

type Radek = Record<string, unknown>;
const db: Record<string, Radek[]> = {};
/** Co se z databáze opravdu vyžádalo: tabulka → seznam sloupců. */
const dotazy: { tabulka: string; sloupce: string }[] = [];

vi.mock('./supabase', () => ({
  supabase: {},
  useRealtime: () => {},
  fetchAllRows: (tabulka: string, sloupce = '*') => {
    dotazy.push({ tabulka, sloupce });
    const b: Record<string, unknown> = {
      order: () => b,
      then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve({ data: db[tabulka] ?? [], error: null }).then(res, rej),
    };
    return b;
  },
}));

import { useObchod } from './obchodData';

describe('načtení dat Obchodu', () => {
  beforeEach(() => {
    dotazy.length = 0;
    for (const k of Object.keys(db)) delete db[k];
    db.beers = [{ id: 'b1', name: '12° Světlá', degree: '12°', short_name: null, beer_color: '#F59E0B', is_active: true, sort_order: 1 }];
  });

  it('piva se načítají i s barvou z katalogu', async () => {
    const { result } = renderHook(() => useObchod());
    await waitFor(() => expect(result.current.nacitam).toBe(false));
    const sloupce = dotazy.find((d) => d.tabulka === 'beers')!.sloupce.split(',');
    expect(sloupce).toContain('beer_color');
    expect(result.current.piva[0].beer_color).toBe('#F59E0B');
  });
});
