// ✏️ Fasování: právě uložený zápis jde upravit HNED.
//
// Majitel 18. 11. 2026: „když zadám fasování, musí jít editovat hned." Seznam
// „Dnes uloženo" pod zápisem byl jen ke čtení — tužka u řádku byla ve Stáčení
// KEG a v Lahvích, ve Fasování ne. Opravit překlep (špatné pivo, obal, počet)
// šlo až v Přehledu, po rozbalení řádku, a tam se dalo změnit jen datum a počet.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';
import { businessDateISO } from '../lib/businessDate';

const DNES = businessDateISO();

const h = vi.hoisted(() => {
  const upravene: { tabulka: string; patch: Record<string, unknown>; id?: string }[] = [];
  const DB: Record<string, Record<string, unknown>[]> = { fasovani_private: [], fasovani: [], beers: [], packages: [], inventory: [], parser_aliases: [] };
  return { DB, upravene };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> & Record<string, unknown>;
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn((sloupec: string, hodnota: string) => {
      const posledni = h.upravene[h.upravene.length - 1];
      if (sloupec === 'id' && posledni && posledni.tabulka === table && posledni.id === undefined) posledni.id = hodnota;
      return q;
    });
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn(() => {
      const vlozeno = Promise.resolve({ data: [{ id: 'novy-1' }], error: null }) as Promise<{ data: unknown; error: null }> & Record<string, unknown>;
      vlozeno.select = vi.fn(() => vlozeno);
      return vlozeno;
    });
    q.update = vi.fn((patch: Record<string, unknown>) => {
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
    beerName: vi.fn((b: { name?: string } | null) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});

vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
  potvrd: vi.fn().mockResolvedValue(true),
  toastZpet: vi.fn(),
}));

/** Okno úpravy (Modal nemá role dialogu — hledá se podle nadpisu). */
const oknoUpravy = async () =>
  (await screen.findByRole('heading', { name: /Upravit záznam/ })).closest('.card') as HTMLElement;

const ZAPIS = {
  id: 'zapis-1', entry_date: DNES, beer_id: 'beer-12', beer_name: '12° Světlá',
  package_id: 'pkg-05', package_label: '0,5 l', quantity: 5, who: null, note: null,
  created_at: `${DNES}T08:30:00+00:00`,
};

describe('Fasování — úprava právě uloženého zápisu', () => {
  beforeEach(() => {
    localStorage.clear();
    h.upravene.length = 0;
    h.DB.beers = [
      { id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 },
      { id: 'beer-11', name: '11° Světlá', is_active: true, sort_order: 2 },
    ];
    h.DB.packages = [
      { id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 1 },
      { id: 'pkg-1', label: '1 l', kind: 'bottle', volume_l: 1, sort_order: 2 },
    ];
    h.DB.inventory = [];
    h.DB.fasovani_private = [{ ...ZAPIS }];
    h.DB.fasovani = [{ ...ZAPIS, who: 'Honza' }];
  });

  it('seznam „Dnes uloženo" pod zápisem má tužku a otevře úpravu pivo / obal / počet / datum', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);

    const tuzka = await screen.findByRole('button', { name: /Upravit uložené: 12° Světlá · 5× 0,5 l/ });
    fireEvent.click(tuzka);

    const okno = await oknoUpravy();
    expect(within(okno).getByLabelText('Pivo')).toHaveProperty('value', 'beer-12');
    expect(within(okno).getByLabelText('Obal')).toHaveProperty('value', 'pkg-05');
    expect(within(okno).getByLabelText('Počet kusů')).toHaveProperty('value', '5');
    expect(within(okno).getByLabelText('Datum')).toHaveProperty('value', DNES);
    // Prodejna nemá pole „pro koho".
    expect(within(okno).queryByLabelText(/Pro koho/)).toBeNull();
  });

  it('změna piva, obalu a počtu se uloží i se jménem a štítkem, které záznam nese', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
    fireEvent.click(await screen.findByRole('button', { name: /Upravit uložené: 12° Světlá · 5× 0,5 l/ }));
    const okno = await oknoUpravy();

    fireEvent.change(within(okno).getByLabelText('Pivo'), { target: { value: 'beer-11' } });
    fireEvent.change(within(okno).getByLabelText('Obal'), { target: { value: 'pkg-1' } });
    fireEvent.change(within(okno).getByLabelText('Počet kusů'), { target: { value: '8' } });
    fireEvent.click(within(okno).getByRole('button', { name: 'Uložit' }));

    await waitFor(() => expect(h.upravene).toHaveLength(1));
    expect(h.upravene[0]).toMatchObject({
      tabulka: 'fasovani_private',
      id: 'zapis-1',
      patch: {
        quantity: 8,
        beer_id: 'beer-11', beer_name: '11° Světlá',
        package_id: 'pkg-1', package_label: '1 l',
      },
    });
    // Datum se neměnilo, „pro koho" u prodejny není.
    expect(h.upravene[0].patch).not.toHaveProperty('who');
  });

  it('beze změny se nic nezapisuje', async () => {
    render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
    fireEvent.click(await screen.findByRole('button', { name: /Upravit uložené: 12° Světlá · 5× 0,5 l/ }));
    const okno = await oknoUpravy();
    fireEvent.click(within(okno).getByRole('button', { name: 'Uložit' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Upravit záznam/ })).toBeNull());
    expect(h.upravene).toHaveLength(0);
  });

  it('Personál: jde opravit i „Pro koho"', async () => {
    render(<ProdejnaScreen table="fasovani" title="Fasování personál" />);
    fireEvent.click(await screen.findByRole('button', { name: /Upravit uložené: 12° Světlá · 5× 0,5 l/ }));
    const okno = await oknoUpravy();

    const kdo = within(okno).getByLabelText(/Pro koho/);
    expect(kdo).toHaveProperty('value', 'Honza');
    fireEvent.change(kdo, { target: { value: 'Petr' } });
    fireEvent.click(within(okno).getByRole('button', { name: 'Uložit' }));

    await waitFor(() => expect(h.upravene).toHaveLength(1));
    expect(h.upravene[0]).toMatchObject({ tabulka: 'fasovani', id: 'zapis-1', patch: { who: 'Petr' } });
    expect(h.upravene[0].patch).not.toHaveProperty('beer_id');
    expect(h.upravene[0].patch).not.toHaveProperty('package_id');
  });
});
