// Zadání 24. 9. 2026: „presun do auta a dej ji moznost editovat" — historie
// tras se přesunula z Statistiky do Auto → Historie tras a dostala tlačítko
// pro opravu chybně zapsané objednávky, ne jen dohledání a tisk trasovky.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ZavozHistory from './ZavozHistory';

const order = {
  id: 'o1', order_date: '2026-09-21', place_id: 'm1', place_name: 'Martin',
  status: 'nova', delivery_day: 'po', is_prepared: true, is_packaged: true,
  is_delivered: true, note: null, source: 'manual', delivered_at: null,
  created_at: '2026-09-21T08:00:00+00:00', delivery_date: null,
};
const item = { id: 'i1', order_id: 'o1', beer_id: 'b1', beer_name: 'Osma', package_id: 'p1', package_label: 'KEG 50l', quantity: 2, is_prepared: true };

// Vrátí thenable, na kterém se dá dál volat .eq()/.order() — přesně jak to
// dělá skutečný supabase-js query builder.
function dotaz(data: unknown[]) {
  const p: any = Promise.resolve({ data, error: null });
  p.eq = () => p;
  p.order = () => p;
  p.in = () => p;
  p.neq = () => p;
  return p;
}

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<any>('../lib/supabase');
  return {
    ...actual,
    useRealtime: () => {},
    fetchAllRows: (table: string) => dotaz(table === 'orders' ? [order] : []),
    supabase: {
      from: (table: string) => ({
        select: () => dotaz(
          table === 'packages' ? [{ id: 'p1', label: 'KEG 50l', kind: 'keg', volume_l: 50 }]
            : table === 'beers' ? [{ id: 'b1', name: 'Osma' }]
            : [{ id: 'm1', name: 'Martin' }],
        ),
      }),
    },
  };
});

vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: () => Promise.resolve({ data: [item], error: null }),
}));

describe('ZavozHistory — editace objednávky z historie tras', () => {
  it('tlačítko Upravit otevře EditOrderModal nad kliknutou objednávkou', async () => {
    render(<ZavozHistory />);
    const upravit = await screen.findByRole('button', { name: 'Upravit objednávku' });

    fireEvent.click(upravit);

    await waitFor(() => expect(screen.getByText('Upravit objednávku')).toBeTruthy());
  });
});
