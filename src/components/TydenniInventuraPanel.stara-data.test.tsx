// Týdenní inventura (components/TydenniInventuraPanel.tsx) a čísla z paměti telefonu.
// 15. 10. 2026: u Jantaru 50 l stálo „na začátku 3", i když v databázi byly 2.
// „Čeká se" se počítá ze skladové knihy — když je z paměti telefonu nebo se
// nenačetla celá, nesmí se z rozdílu tiše zapsat stáčení ani dorovnání.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

const h = vi.hoisted(() => ({
  kniha: { zPameti: false, selze: false },
  potvrd: vi.fn(),
  zapisy: [] as { tabulka: string; akce: string }[],
}));

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-15', posunMesic: (m: string) => m }));
vi.mock('../lib/toast', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/toast')>()),
  potvrd: h.potvrd,
}));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      const q: any = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        insert: () => { h.zapisy.push({ tabulka, akce: 'insert' }); return q; },
        upsert: () => { h.zapisy.push({ tabulka, akce: 'upsert' }); return q; },
        then: (ok: (r: any) => any, ko?: (e: any) => any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
      };
      return q;
    },
  },
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
  formatPackageLabel: (l: string) => l,
  beerBg: () => '#ffffff',
  beerText: () => '',
  useRealtime: () => {},
}));
vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: () => Promise.resolve({ data: [], error: null }),
}));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => h.kniha.selze
    ? Promise.reject(new Error('Chybí data: fasování — čísla by byla neúplná, proto se nepočítají.'))
    : Promise.resolve({
      ...(h.kniha.zPameti ? { zPameti: true } : {}),
      piva: [{ id: 'b50', name: 'Jantar', is_active: true }],
      obaly: [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
      pohyby: buildMovements({
        inventoryRows: [{ entry_date: '2026-10-01', beer_id: 'b50', package_id: 'k50', quantity: 2, note: 'Počáteční stav' }],
      }),
      kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
    }),
}));
vi.mock('./QuickCountModal', () => ({ QuickCountModal: () => null }));

import TydenniInventuraPanel from './TydenniInventuraPanel';

async function otevriSRozdilem() {
  render(<TydenniInventuraPanel />);
  await waitFor(() => expect(screen.getByText('Jantar')).toBeTruthy());
  // Čeká se 2, napočítáno 1 → rozdíl −1 → nabídne se „Dorovnat".
  fireEvent.change(screen.getByPlaceholderText('—'), { target: { value: '1' } });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dorovnat' })).toBeTruthy());
}

beforeEach(() => {
  localStorage.clear();
  h.kniha.zPameti = false;
  h.kniha.selze = false;
  h.potvrd.mockReset();
  h.zapisy.length = 0;
});

describe('Týdenní inventura — čerstvá data', () => {
  it('bez varování; dorovnání se zapíše bez dotazu', async () => {
    await otevriSRozdilem();
    expect(screen.queryByTestId('stara-data-pruh')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dorovnat' }));
    await waitFor(() => expect(h.zapisy.some((z) => z.tabulka === 'inventory_adjustments')).toBe(true));
    expect(h.potvrd).not.toHaveBeenCalled();
  });
});

describe('Týdenní inventura — čísla z paměti telefonu', () => {
  it('ukáže pruh „nemusí být aktuální"', async () => {
    h.kniha.zPameti = true;
    render(<TydenniInventuraPanel />);
    await waitFor(() => expect(screen.getByTestId('stara-data-pruh')).toBeTruthy());
    expect(screen.getByTestId('stara-data-pruh').textContent).toMatch(/z paměti telefonu/);
  });

  it('dorovnání se nejdřív zeptá; po „ne" se nezapíše nic', async () => {
    h.kniha.zPameti = true;
    h.potvrd.mockResolvedValue(false);
    await otevriSRozdilem();
    fireEvent.click(screen.getByRole('button', { name: 'Dorovnat' }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(String(h.potvrd.mock.calls[0][0])).toMatch(/z paměti telefonu/);
    expect(h.zapisy.filter((z) => z.tabulka === 'inventory_adjustments')).toEqual([]);
  });

  it('po „Zapsat přesto" se dorovnání zapíše', async () => {
    h.kniha.zPameti = true;
    h.potvrd.mockResolvedValue(true);
    await otevriSRozdilem();
    fireEvent.click(screen.getByRole('button', { name: 'Dorovnat' }));
    await waitFor(() => expect(h.zapisy.some((z) => z.tabulka === 'inventory_adjustments')).toBe(true));
  });

  it('„Zapsat do stáčení" / „Odečíst ze stáčení" se taky zeptá', async () => {
    h.kniha.zPameti = true;
    h.potvrd.mockResolvedValue(false);
    await otevriSRozdilem();
    fireEvent.click(screen.getByRole('button', { name: 'Odečíst ze stáčení' }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(h.zapisy).toEqual([]);
  });

  it('„Uložit kontrolu" se taky zeptá a po „ne" nic neuloží', async () => {
    h.kniha.zPameti = true;
    h.potvrd.mockResolvedValue(false);
    await otevriSRozdilem();
    fireEvent.click(screen.getByRole('button', { name: /Uložit kontrolu/ }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(h.zapisy).toEqual([]);
  });
});

describe('Týdenní inventura — načtení selhalo', () => {
  it('místo „sklad je prázdný" ukáže chybu a tlačítko, které zkusí znovu', async () => {
    h.kniha.selze = true;
    render(<TydenniInventuraPanel />);
    await waitFor(() => expect(screen.getByTestId('stara-data-pruh')).toBeTruthy());
    expect(screen.getByTestId('stara-data-pruh').textContent).toMatch(/Chybí data: fasování/);
    expect(screen.queryByText(/sklad je prázdný/)).toBeNull();

    h.kniha.selze = false;
    fireEvent.click(within(screen.getByTestId('stara-data-pruh')).getByRole('button', { name: /Načíst znovu/ }));
    await waitFor(() => expect(screen.getByText('Jantar')).toBeTruthy());
    expect(screen.queryByTestId('stara-data-pruh')).toBeNull();
  });
});
