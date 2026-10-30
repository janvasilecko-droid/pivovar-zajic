// 🛢️🍾 Fasování na telefonu: po dnech ve dvou sloupcích Sudy | Lahve (30. 10. 2026).
// Řádek ukazuje jen pivo, obal a kusy; tlačítka (−, +1, vrátit, upravit, smazat) se
// rozbalí pod sloupci klepnutím na řádek — do úzkého sloupce by se nevešla.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';
import { businessDateISO } from '../lib/businessDate';

// Pozor: NE new Date().toISOString() (UTC) — odfasuj() v ProdejnaScreen.tsx
// počítá "dnešek" přes businessDateISO() (pražský čas), takže kolem půlnoci
// UTC (= 1-2 v noci v Praze) by se test rozešel s kódem o jeden den.
const DNES = businessDateISO();

const h = vi.hoisted(() => {
  const zapisy: any[] = [];
  const smazane: string[] = [];
  const upravene: any[] = [];
  const DB: Record<string, any[]> = {
    fasovani_private: [],
    beers: [],
    packages: [],
    inventory: [],
    parser_aliases: [],
  };
  return { DB, zapisy, smazane, upravene };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn((sloupec: string, hodnoty: string[]) => {
      if (sloupec === 'id') h.smazane.push(...hodnoty);
      return q;
    });
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn((payload: any) => {
      const radky = Array.isArray(payload) ? payload : [payload];
      h.zapisy.push(...radky.map((r) => ({ ...r, __tabulka: table })));
      const vlozeno: any = Promise.resolve({ data: radky.map((_, i) => ({ id: `novy-${i}` })), error: null });
      vlozeno.select = vi.fn(() => vlozeno);
      return vlozeno;
    });
    q.update = vi.fn((patch: any) => {
      h.upravene.push({ tabulka: table, patch });
      return q;
    });
    q.delete = vi.fn(() => q);
    return q;
  }
  const supabase = { from: vi.fn((t: string) => makeQuery(t)) };
  return {
    supabase,
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
    beerInk: vi.fn(() => '#000'),
    beerName: vi.fn((b: any) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});

// Potvrzení vždy ANO — test zkoumá, CO se zapíše, ne jestli se appka ptá.
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  potvrd: vi.fn().mockResolvedValue(true),
  toastZpet: vi.fn(),
}));

describe('Fasování — dva sloupce Sudy | Lahve', () => {
  beforeEach(() => {
    h.DB.beers = [{ id: 'b12', name: '12° Světlá', is_active: true, sort_order: 1 }];
    h.DB.packages = [
      { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 },
      { id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1, sort_order: 2 },
    ];
    h.DB.fasovani_private = [
      { id: 'z-sud', entry_date: DNES, beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', package_label: 'KEG 30l', quantity: 2, who: null, note: null },
      { id: 'z-lahev', entry_date: DNES, beer_id: 'b12', beer_name: '12° Světlá', package_id: 'p1', package_label: 'PET 1l', quantity: 6, who: null, note: null },
    ];
  });

  it('den má sloupec Sudy a sloupec Lahve se součty', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
    fireEvent.click(await screen.findByRole('button', { name: /Přehled/i }));
    const den = (await screen.findAllByTestId('den-blok'))[0];
    expect(within(den).getByTestId('sloupec-sudy').textContent).toMatch(/^Sudy2.*30 l2$/);
    expect(within(den).getByTestId('sloupec-lahve').textContent).toMatch(/^Lahve6.*1 l6$/);
  });

  it('tlačítka se ukážou až po klepnutí na řádek a dalším klepnutím zmizí', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
    fireEvent.click(await screen.findByRole('button', { name: /Přehled/i }));
    const den = (await screen.findAllByTestId('den-blok'))[0];
    expect(within(den).queryByTestId('akce-zaznamu')).toBeNull();
    const radek = within(within(den).getByTestId('sloupec-lahve')).getByRole('button');
    fireEvent.click(radek);
    expect(radek.getAttribute('aria-expanded')).toBe('true');
    const akce = within(den).getByTestId('akce-zaznamu');
    expect(akce.textContent).toContain('1 l · 6 ks');
    expect(within(akce).getByRole('button', { name: /Odfasovat/ })).toBeTruthy();
    expect(within(akce).getByRole('button', { name: /Upravit datum a počet/ })).toBeTruthy();
    fireEvent.click(radek);
    expect(within(den).queryByTestId('akce-zaznamu')).toBeNull();
  });
});
