// Sklad → Stav (screens/Dashboard.tsx).
// 15. 10. 2026: „občas se nechce načíst sklad". Tři příčiny, které tu hlídáme:
//  1. přenačtení po cizím zápisu (realtime) přebilo první načtení a kostra
//     „načítám" zůstala viset navždy,
//  2. selhaný dotaz se bral jako prázdná tabulka → číslo z neúplných dat,
//  3. odpověď z paměti telefonu (slabý signál) se tvářila jako čerstvá.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  radky: {} as Record<string, any[]>,
  chyby: {} as Record<string, { message: string } | null>,
  zPameti: {} as Record<string, boolean>,
  bezDat: {} as Record<string, boolean>,
  cekat: null as null | Promise<void>,
  obnov: null as null | (() => void),
  dotazy: [] as string[],
}));

const odpoved = (tabulka: string) => ({
  data: h.chyby[tabulka] || h.bezDat[tabulka] ? null : (h.radky[tabulka] ?? []).map((r) => ({ ...r })),
  error: h.chyby[tabulka] ?? null,
  ...(h.zPameti[tabulka] ? { zPameti: true } : {}),
});

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-15' }));
vi.mock('../lib/chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      const q: any = {
        select: () => q, eq: () => q, order: () => q,
        then: (ok: (r: any) => any, ko?: (e: any) => any) => (async () => {
          h.dotazy.push(tabulka);
          if (h.cekat) await h.cekat;
          return odpoved(tabulka);
        })().then(ok, ko),
      };
      return q;
    },
  },
  useRealtime: (_t: string[], cb: () => void) => { h.obnov = cb; },
  beerBorder: () => '#f59e0b',
}));
vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: async (tabulka: string) => {
    h.dotazy.push(tabulka);
    if (h.cekat) await h.cekat;
    return odpoved(tabulka);
  },
}));
vi.mock('../components/CekaNaOdpocet', () => ({ default: () => null }));
vi.mock('../components/SkladZalozky', () => ({ SkladZalozky: () => null }));
vi.mock('./SkloPromoScreen', () => ({ default: () => null }));
vi.mock('../components/AnnouncementManagerModal', () => ({ AnnouncementManagerModal: () => null }));
vi.mock('../components/QuickCountModal', () => ({ QuickCountModal: () => null }));

import Dashboard from './Dashboard';

function nastavData() {
  h.radky = {
    beers: [{ id: 'b12', name: '12° Světlá', is_active: true, sort_order: 1 }],
    packages: [{ id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 }],
    inventory: [{ entry_date: '2026-10-01', beer_id: 'b12', package_id: 'k30', quantity: 7, note: 'Počáteční stav' }],
  };
  h.chyby = {};
  h.zPameti = {};
  h.bezDat = {};
  h.cekat = null;
  h.obnov = null;
  h.dotazy = [];
}

beforeEach(() => { nastavData(); });
afterEach(() => { vi.useRealTimers(); });

describe('Dashboard — načítání', () => {
  it('ukáže stav skladu', async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('12° Světlá')).toBeTruthy());
    expect(screen.getByText('KEG 30l')).toBeTruthy();
    expect(screen.queryByTestId('stara-data-pruh')).toBeNull();
  });

  it('přenačtení po cizím zápisu během prvního načtení nenechá kostru viset navždy', async () => {
    let pust!: () => void;
    h.cekat = new Promise<void>((r) => { pust = r; });
    render(<Dashboard />);
    // První načtení čeká na server; mezitím kolega něco zapíše → realtime přenačtení.
    await waitFor(() => expect(h.obnov).toBeTruthy());
    act(() => { h.obnov!(); });
    h.cekat = null;
    pust();
    await waitFor(() => expect(screen.getByText('12° Světlá')).toBeTruthy());
    expect(screen.queryByLabelText('Načítám')).toBeNull();
  });

  it('selhaný dotaz = chyba s tlačítkem „Zkusit znovu", ne prázdný sklad ani číslo z neúplných dat', async () => {
    h.chyby = { fasovani: { message: 'JWT expired' } };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/Sklad se nepodařilo načíst/)).toBeTruthy());
    expect(screen.getByText(/fasování/)).toBeTruthy();
    expect(screen.queryByText('Žádná piva v evidenci.')).toBeNull();
    expect(screen.queryByText('12° Světlá')).toBeNull();

    h.chyby = {};
    fireEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    await waitFor(() => expect(screen.getByText('12° Světlá')).toBeTruthy());
    expect(screen.queryByText(/Sklad se nepodařilo načíst/)).toBeNull();
  });

  it('tabulka, která vrátí null místo řádků, se taky nebere jako prázdná', async () => {
    h.bezDat = { zavoz_deductions: true };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/Sklad se nepodařilo načíst/)).toBeTruthy());
    expect(screen.getByText(/závozy/)).toBeTruthy();
  });

  it('když tiché přenačtení selže, zůstane poslední známý stav a nad ním červený pruh', async () => {
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('12° Světlá')).toBeTruthy());
    h.chyby = { kegging: { message: 'timeout' } };
    await act(async () => { h.obnov!(); });
    await waitFor(() => expect(screen.getByTestId('stara-data-pruh')).toBeTruthy());
    expect(screen.getByTestId('stara-data-pruh').getAttribute('role')).toBe('alert');
    expect(screen.getByText('12° Světlá')).toBeTruthy();
    expect(screen.getByText('KEG 30l')).toBeTruthy();
  });

  it('data z paměti telefonu: čísla zůstanou, ale s upozorněním', async () => {
    h.zPameti = { bottling: true };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('12° Světlá')).toBeTruthy());
    const pruh = screen.getByTestId('stara-data-pruh');
    expect(pruh.textContent).toMatch(/z paměti telefonu/);
  });

  it('po návratu čerstvých dat upozornění zmizí', async () => {
    h.zPameti = { bottling: true };
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId('stara-data-pruh')).toBeTruthy());
    h.zPameti = {};
    fireEvent.click(screen.getByRole('button', { name: /Načíst znovu/ }));
    await waitFor(() => expect(screen.queryByTestId('stara-data-pruh')).toBeNull());
  });

  it('zaseknutý dotaz se po limitu změní na chybu místo věčné kostry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    h.cekat = new Promise<void>(() => {}); // server neodpoví nikdy
    render(<Dashboard />);
    expect(screen.getByLabelText('Načítám')).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(45_000); });
    expect(screen.getByText(/Sklad se nepodařilo načíst/)).toBeTruthy();
    expect(screen.getByText(/trvalo moc dlouho/)).toBeTruthy();
    expect(screen.queryByLabelText('Načítám')).toBeNull();
  });
});
