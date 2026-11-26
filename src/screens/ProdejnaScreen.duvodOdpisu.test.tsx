// 📝 Fasování na telefonu: důvod odpisu (u personálu „Pro koho") je vidět hned pod řádkem v přehledu.
// ---------------------------------------------------------------------------
// 26. 11. 2026 (snímek obrazovky z telefonu): „V odpisu nejde vidět důvod odpisu, výhra v tombole…“
// Zápis důvod měl (sloupec `who`), ale řádek v přehledu po dnech ukazoval jen pivo, obal a kusy; důvod se
// objevil až po klepnutí na řádek a jen drobně na konci jedné řádky. Na počítači je pro něj sloupec v tabulce.
// Data v testech jsou vymyšlená (repozitář je veřejný).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';
import { businessDateISO } from '../lib/businessDate';

const DNES = businessDateISO();

const h = vi.hoisted(() => {
  const DB: Record<string, any[]> = {
    fasovani_private: [], fasovani: [], writeoffs: [],
    beers: [], packages: [], inventory: [], parser_aliases: [],
  };
  return { DB };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn(() => { const v: any = Promise.resolve({ data: [], error: null }); v.select = vi.fn(() => v); return v; });
    q.update = vi.fn(() => q);
    q.delete = vi.fn(() => q);
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
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
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(), uspech: vi.fn(), oznam: vi.fn(), potvrd: vi.fn().mockResolvedValue(true), toastZpet: vi.fn(),
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: { display_name: 'Jan' } }) }));
// Fotky k odpisu se tu nezkoušejí (mají vlastní testy), jen by tahaly úložiště.
vi.mock('../components/FotkyZaznamu', () => ({ FotkyZaznamu: () => null }));

const radek = (id: string, pkg: string, ks: number, nad: Record<string, unknown> = {}) => ({
  id, entry_date: DNES, beer_id: 'b12', beer_name: '12° Světlá', package_id: pkg, package_label: pkg === 'k50' ? 'KEG 50l' : 'PET 1l',
  quantity: ks, who: null, note: null, ...nad,
});

beforeEach(() => {
  h.DB.beers = [{ id: 'b12', name: '12° Světlá', is_active: true, sort_order: 1 }];
  h.DB.packages = [
    { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 1 },
    { id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1, sort_order: 2 },
  ];
  h.DB.writeoffs = [
    radek('w-sud', 'k50', 1, { who: 'Výhra v tombole' }),
    radek('w-lahve', 'p1', 2, { who: 'Karel' }),
    radek('w-bez', 'p1', 1),
  ];
  h.DB.fasovani = [
    radek('f-jana', 'p1', 3, { who: 'Jana' }),
    radek('f-petr', 'p1', 2, { note: '[Petr] vydáno na brigádu' }),
    radek('f-nikdo', 'p1', 1),
  ];
  h.DB.fasovani_private = [radek('p-1', 'p1', 4, { who: 'Karel' })];
});

async function otevriPrehled(tabulka: 'writeoffs' | 'fasovani' | 'fasovani_private') {
  render(<ProdejnaScreen table={tabulka} title={tabulka === 'writeoffs' ? 'Odpis' : 'Fasování'} />);
  fireEvent.click(await screen.findByRole('button', { name: /Přehled/i }));
  return (await screen.findAllByTestId('den-blok'))[0];
}

describe('Přehled výdeje na telefonu — důvod pod řádkem', () => {
  it('Odpis: důvod je vidět u sudu i u lahví hned, bez klepnutí na řádek', async () => {
    const den = await otevriPrehled('writeoffs');
    const sudy = within(den).getByTestId('sloupec-sudy');
    expect(within(sudy).getByTestId('duvod-radku').textContent).toBe('Důvod: Výhra v tombole');
    const lahve = within(den).getByTestId('sloupec-lahve');
    expect(within(lahve).getAllByTestId('duvod-radku').map((e) => e.textContent)).toEqual(['Důvod: Karel']);
    // Nic není rozbalené — důvod se nemusí hledat.
    for (const r of [...within(sudy).getAllByRole('button'), ...within(lahve).getAllByRole('button')]) {
      expect(r.getAttribute('aria-expanded')).toBe('false');
    }
  });

  it('každý důvod patří ke svému řádku (ne k sousednímu) a řádek bez důvodu žádný popisek nemá', async () => {
    const den = await otevriPrehled('writeoffs');
    const lahve = within(within(den).getByTestId('sloupec-lahve')).getAllByRole('button');
    expect(lahve).toHaveLength(2);
    expect(lahve[0].textContent).toContain('Důvod: Karel');
    expect(lahve[1].textContent).not.toContain('Důvod');
    expect(within(lahve[1]).queryByTestId('duvod-radku')).toBeNull();
    // Řádek bez důvodu je dál jen pivo, obal a kusy.
    expect(lahve[1].textContent).toMatch(/^12° Světlá1 l1$/);
  });

  it('řádek je pořád jedno tlačítko s počtem kusů, dost velké na prst, a dlouhý důvod se zalomí', async () => {
    const den = await otevriPrehled('writeoffs');
    const sud = within(within(den).getByTestId('sloupec-sudy')).getByRole('button');
    expect(sud.textContent).toBe('12° Světlá50 lDůvod: Výhra v tombole1');
    expect(within(sud).getByText('1', { selector: 'span.font-mono' })).toBeTruthy();
    expect(sud.className).toContain('min-h-[44px]');
    expect(within(sud).getByTestId('duvod-radku').className).toContain('break-words');
  });

  it('po klepnutí na řádek je důvod i v rozbaleném detailu (jako dřív)', async () => {
    const den = await otevriPrehled('writeoffs');
    fireEvent.click(within(within(den).getByTestId('sloupec-sudy')).getByRole('button'));
    expect(within(den).getByTestId('akce-zaznamu').textContent).toContain('Výhra v tombole');
  });

  it('Personál: popisek je „Pro koho“, jméno se vezme i z hranaté závorky v poznámce', async () => {
    const den = await otevriPrehled('fasovani');
    const lahve = within(den).getByTestId('sloupec-lahve');
    expect(within(lahve).getAllByTestId('duvod-radku').map((e) => e.textContent).sort()).toEqual(['Pro koho: Jana', 'Pro koho: Petr']);
    expect(within(lahve).getAllByRole('button')).toHaveLength(3);
  });

  it('Prodejna nemá pole navíc — žádný popisek pod řádkem, ani kdyby řádek v databázi jméno měl', async () => {
    const den = await otevriPrehled('fasovani_private');
    expect(within(den).queryAllByTestId('duvod-radku')).toHaveLength(0);
    expect(within(den).getByTestId('sloupec-lahve').textContent).not.toContain('Karel');
  });
});
