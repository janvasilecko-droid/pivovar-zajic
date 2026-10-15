// Sklad → Pohyby (zadání 24. 9. 2026): vybraný týden, filtr pivo / obal /
// druh, pod každým dnem stav večer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

const rizeni = vi.hoisted(() => ({ selze: false, zPameti: false }));

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-09-24' }));
vi.mock('../lib/chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
// Týdenní inventura v Pohybech (11. 10. 2026): jeden zápis z pátku.
const tydenniZaznamy = [{
  tyden_od: '2026-09-21', tyden_do: '2026-09-27', beer_id: 'b12', package_id: 'k30',
  ocekavano: 7, napocitano: 6, rozdil: -1, vyreseno: null, updated_at: '2026-09-23T15:00:00Z',
}];
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: any = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: tydenniZaznamy, error: null }) };
      return q;
    },
  },
  useRealtime: () => {},
  fetchAllRows: () => Promise.resolve({ data: [{ id: 'o1', place_name: 'U Zajíce' }], error: null }),
  beerBg: vi.fn(() => '#f59e0b'),
  beerText: vi.fn(() => 'text-white'),
  formatPackageLabel: vi.fn((l: string) => l),
}));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => rizeni.selze ? Promise.reject(new Error('Chybí data: fasování — čísla by byla neúplná.')) : Promise.resolve({
    ...(rizeni.zPameti ? { zPameti: true } : {}),
    piva: [{ id: 'b12', name: '12° Světlá' }, { id: 'b10', name: '10° Výčepní' }],
    obaly: [{ id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 }, { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
    pohyby: buildMovements({
      inventoryRows: [{ entry_date: '2026-09-21', beer_id: 'b12', package_id: 'k30', quantity: 15, note: 'Počáteční stav' }],
      zavozDeductionRows: [{ deduct_date: '2026-09-21', beer_id: 'b12', package_id: 'k30', quantity: 14, order_id: 'o1' }],
      keggingRows: [
        { entry_date: '2026-09-22', beer_id: 'b12', package_id: 'k30', quantity: 6 },
        { entry_date: '2026-09-22', beer_id: 'b10', package_id: 'k50', quantity: 2 },
      ],
    }),
    kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
  }),
}));

import PohybySkladu from './PohybySkladu';

describe('PohybySkladu', () => {
  beforeEach(() => { localStorage.clear(); rizeni.selze = false; rizeni.zPameti = false; });

  it('ukáže týden den po dni s odběratelem u závozu a stavem večer', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.getByText('Po 21. 9.')).toBeTruthy();
    // Jednou v řádku dne, jednou v souhrnu týdne.
    expect(screen.getAllByText('−14').length).toBe(2);
    // Dny bez pohybu se od 1. 10. 2026 nevypisují (stav se v nich nemění).
    const dny = screen.getAllByText('Stav večer:').length;
    expect(dny).toBeGreaterThan(0);
    expect(dny).toBeLessThan(7);
  });

  it('ukáže napočítané hodnoty týdenní inventury (co appka čekala a jaký je sklad teď)', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/Týdenní inventura — co se napočítalo/)).toBeTruthy());
    expect(screen.getByText(/napočítáno/)).toBeTruthy();
    expect(screen.getByText(/appka čekala/)).toBeTruthy();
    expect(screen.getByText(/rozdíl -1/)).toBeTruthy();
  });

  it('filtr piva schová ostatní piva', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.getAllByText(/10° Výčepní · KEG 50l/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '12° Světlá' }));
    expect(screen.queryByText(/10° Výčepní · KEG 50l/)).toBeNull();
  });

  it('přepnutí na Měsíc ukáže celý kalendářní měsíc', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Měsíc' }));
    expect(screen.getByText('září 2026')).toBeTruthy();
    // Pohyby týdne jsou vidět i v měsíčním pohledu.
    expect(screen.getByText(/U Zajíce/)).toBeTruthy();
  });

  it('filtr druhu nechá jen závozy', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Závozy' }));
    expect(screen.queryByText(/Stočeno \(sudy\)/)).toBeNull();
    expect(screen.getByText(/Zavezeno na objednávku/)).toBeTruthy();
    // Jen dny, kdy se něco zaváželo — ostatní se schovají.
    expect(screen.getAllByText('Stav večer:').length).toBeGreaterThan(0);
  });

  // 15. 10. 2026: „občas se nechce načíst sklad" — neúplná data nebo odpověď
  // z paměti telefonu se nesmí tvářit jako čerstvé číslo.
  it('neúplná data: místo čísel chyba a tlačítko „Načíst znovu", které to zkusí znovu', async () => {
    rizeni.selze = true;
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByTestId('stara-data-pruh')).toBeTruthy());
    expect(screen.getByTestId('stara-data-pruh').textContent).toMatch(/Chybí data: fasování/);
    expect(screen.queryByText(/U Zajíce/)).toBeNull();

    rizeni.selze = false;
    fireEvent.click(screen.getByRole('button', { name: /Načíst znovu/ }));
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.queryByTestId('stara-data-pruh')).toBeNull();
  });

  it('data z paměti telefonu: čísla jsou vidět, ale s upozorněním', async () => {
    rizeni.zPameti = true;
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.getByTestId('stara-data-pruh').textContent).toMatch(/z paměti telefonu/);
  });

  it('čerstvá data upozornění nemají', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.queryByTestId('stara-data-pruh')).toBeNull();
  });
});
