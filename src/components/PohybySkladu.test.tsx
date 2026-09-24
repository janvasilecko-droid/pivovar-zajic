// Sklad → Pohyby (zadání 24. 9. 2026): vybraný týden, filtr pivo / obal /
// druh, pod každým dnem stav večer.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-09-24' }));
vi.mock('../lib/chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  useRealtime: () => {},
  fetchAllRows: () => Promise.resolve({ data: [{ id: 'o1', place_name: 'U Zajíce' }], error: null }),
}));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => Promise.resolve({
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
  beforeEach(() => { localStorage.clear(); });

  it('ukáže týden den po dni s odběratelem u závozu a stavem večer', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.getByText('Po 21. 9.')).toBeTruthy();
    expect(screen.getByText('Ne 27. 9.')).toBeTruthy();
    // Jednou v řádku dne, jednou v souhrnu týdne.
    expect(screen.getAllByText('−14').length).toBe(2);
    expect(screen.getAllByText('Stav večer:').length).toBe(7);
  });

  it('filtr piva schová ostatní piva', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    expect(screen.getAllByText(/10° Výčepní · KEG 50l/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'b12' } });
    expect(screen.queryByText(/10° Výčepní · KEG 50l/)).toBeNull();
  });

  it('filtr druhu nechá jen závozy', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getByText(/U Zajíce/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Závozy' }));
    expect(screen.queryByText(/Stočeno \(sudy\)/)).toBeNull();
    expect(screen.getByText(/Zavezeno na objednávku/)).toBeTruthy();
    // Stav večer se filtrem druhu nemění — dál je celý jako ve Skladu.
    expect(screen.getAllByText('Stav večer:').length).toBe(7);
  });
});
