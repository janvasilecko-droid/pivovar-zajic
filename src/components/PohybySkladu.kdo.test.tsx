// Sklad → Pohyby: u fasování personálu je vidět kdo fasoval, u odpisu důvod.
// Majitel 26. 11. 2026: „fasování personál, musí být vidět kdo fasoval." Jména i důvody jsou vymyšlené.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-11-26' }));
vi.mock('../lib/chybyHlaseni', () => ({ zalogujANahlas: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => {
      const q: any = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [], error: null }) };
      return q;
    },
  },
  useRealtime: () => {},
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
  beerBg: vi.fn(() => '#f59e0b'),
  beerText: vi.fn(() => 'text-white'),
  formatPackageLabel: vi.fn((l: string) => l),
}));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => Promise.resolve({
    piva: [{ id: 'b12', name: '12° Světlá' }],
    obaly: [{ id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1 }],
    pohyby: buildMovements({
      inventoryRows: [{ entry_date: '2026-11-23', beer_id: 'b12', package_id: 'p1', quantity: 30, note: 'Počáteční stav' }],
      fasovaniRows: [
        { entry_date: '2026-11-24', beer_id: 'b12', package_id: 'p1', quantity: 2, who: 'Eva' },
        { entry_date: '2026-11-25', beer_id: 'b12', package_id: 'p1', quantity: 1 },
      ],
      writeoffsRows: [{ entry_date: '2026-11-25', beer_id: 'b12', package_id: 'p1', quantity: 3, who: 'Výhra v tombole' }],
    }),
    kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
  }),
}));

import PohybySkladu from './PohybySkladu';

describe('PohybySkladu — kdo fasoval a důvod odpisu', () => {
  beforeEach(() => { localStorage.clear(); });

  it('Fasování personál · Eva a Odpis · Výhra v tombole; řádek bez jména zůstává jen „Fasování personál“', async () => {
    render(<PohybySkladu />);
    await waitFor(() => expect(screen.getAllByText(/Fasování personál/).length).toBeGreaterThan(0));
    const text = document.body.textContent ?? '';
    expect(text).toContain('Fasování personál · Eva');
    expect(text).toContain('Odpis · Výhra v tombole');
    // Druhý zápis fasování nemá jméno — žádné „· " za popiskem.
    const radky = screen.getAllByText(/^Fasování personál/).map((e) => e.textContent);
    expect(radky.some((t) => t === 'Fasování personál')).toBe(true);
  });
});
