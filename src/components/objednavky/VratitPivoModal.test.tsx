// ↩️ VratitPivoModal — vrácení z konkrétní objednávky, bez samostatné
// záložky (viz zadání 21. 9. 2026 v OrderCard.vratitPivo.test.tsx).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VratitPivoModal } from './VratitPivoModal';
import type { Order, OrderItem } from './spolecne';

const inserted: any[] = [];
const updated: any[] = [];

vi.mock('../../lib/supabase', async () => {
  const actual = await vi.importActual<any>('../../lib/supabase');
  return {
    ...actual,
    supabase: {
      from: (table: string) => ({
        insert: (rows: any[]) => { inserted.push({ table, rows }); return Promise.resolve({ error: null }); },
        update: (patch: any) => ({
          eq: (_col: string, _val: string) => { updated.push({ table, patch }); return Promise.resolve({ error: null }); },
        }),
      }),
    },
  };
});

const order: Order = {
  id: 'o1', order_date: '2026-09-15', place_id: 'm1', place_name: 'Lužec',
  source: 'manual', status: 'nova', note: null, created_at: '2026-09-15T10:00:00+00:00',
  delivery_day: 'po', delivery_date: null, is_prepared: false, is_packaged: false,
  is_delivered: true, delivered_at: null,
};

const items: OrderItem[] = [
  { id: 'i1', order_id: 'o1', beer_id: 'b1', beer_name: '12° Světlé', package_id: 'p1', package_label: 'KEG 30l', quantity: 5, is_prepared: false, is_bottled: false },
];

describe('VratitPivoModal', () => {
  beforeEach(() => { inserted.length = 0; updated.length = 0; });

  it('zapíše vrácený počet s order_id téhle objednávky a nezmění položky objednávky', async () => {
    render(
      <VratitPivoModal
        isOpen onClose={vi.fn()} order={order} items={items} beers={[]}
        vracenoZaznamy={[]} onSaved={vi.fn()}
      />
    );

    const input = screen.getByLabelText('Vráceno 12° Světlé KEG 30l');
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.click(screen.getByText('Vrátit'));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].table).toBe('inventory_adjustments');
    expect(inserted[0].rows[0]).toMatchObject({ beer_id: 'b1', package_id: 'p1', quantity: 1, order_id: 'o1' });

    // Poznámka se připojí k objednávce, položky (order_items) se nedotknou.
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].table).toBe('orders');
    expect(updated[0].patch.note).toContain('Vráceno');
  });

  it('vstup jde nastavit maximálně na to, co ještě nebylo vráceno', () => {
    render(
      <VratitPivoModal
        isOpen onClose={vi.fn()} order={order} items={items} beers={[]}
        vracenoZaznamy={[{ beer_id: 'b1', package_id: 'p1', quantity: 2 }]}
        onSaved={vi.fn()}
      />
    );
    const input = screen.getByLabelText('Vráceno 12° Světlé KEG 30l') as HTMLInputElement;
    expect(input.max).toBe('3'); // zavezeno 5 − už vráceno 2
    expect(screen.getByText(/už vráceno 2/)).toBeTruthy();
  });

  it('tlačítko Vrátit je disabled, dokud se nezadá žádné množství', () => {
    render(
      <VratitPivoModal
        isOpen onClose={vi.fn()} order={order} items={items} beers={[]}
        vracenoZaznamy={[]} onSaved={vi.fn()}
      />
    );
    expect(screen.getByText('Vrátit').closest('button')).toBeDisabled();
  });
});
