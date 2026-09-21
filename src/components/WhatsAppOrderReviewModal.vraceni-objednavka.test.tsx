// ↩️ Vrácení z WhatsApp zprávy jde volitelně propojit s konkrétní zavezenou
// objednávkou stejného odběratele — appka pak u ní dopočítá efektivní
// množství (viz OrderCard.tsx / vracenoPodleObjednavky).
//
// Z provozu 21. 9. 2026: „to je ve zprave, takze normalne na cteni to
// precetlo vraci, tak at da volbu vratit sud z ty obednavky, at to napise
// puvodni a z ni to odecte."
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

const inserted: any[] = [];
const updated: any[] = [];

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<any>('../lib/supabase');
  return {
    ...actual,
    supabase: {
      from: (table: string) => ({
        select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        insert: (rows: any[]) => { inserted.push({ table, rows }); return Promise.resolve({ error: null }); },
        update: (patch: any) => ({
          eq: (_col: string, _val: string) => { updated.push({ table, patch }); return Promise.resolve({ error: null }); },
        }),
      }),
    },
  };
});

vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn().mockResolvedValue({
    items: [], placeId: null, placeName: null, deliveryDay: null,
    deliveryDate: null, note: null, raw_text: null,
  }),
}));

const beers = [{ id: 'b1', name: 'Osma', degree: '8°' } as any];
const packages = [{ id: 'p50', label: 'KEG 50l', volume_l: 50 } as any];
const places: any[] = [{ id: 'm1', name: 'Martin' }];

const order = {
  id: 'obj-1', order_date: '2026-09-14', place_id: 'm1', place_name: 'Martin',
  source: 'manual', status: 'nova', note: null, created_at: '2026-09-14T10:00:00+00:00',
  delivery_day: 'po', delivery_date: null, is_prepared: false, is_packaged: false,
  is_delivered: true, delivered_at: null,
} as any;
const orderItems = { 'obj-1': [{ id: 'oi-1', order_id: 'obj-1', beer_id: 'b1', beer_name: 'Osma', package_id: 'p50', package_label: 'KEG 50l', quantity: 5, is_prepared: false, is_bottled: false }] };

const message = {
  id: 'vraceni-obj-1',
  sender_name: 'Martin',
  message_text: 'Tady vrací 1x50l. Vosmy',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-09-21T08:00:00+00:00',
  parsed_place_id: 'm1',
  parsed_place_name: 'Martin',
  parsed_items: [
    { beer_id: 'b1', pkg_id: 'p50', qty: 1, beer_name: 'Osma', package_label: 'KEG 50l', raw_line: '1x50l vosmy' },
  ],
  parsed_raw_text: null,
};

function renderModal(extra: Record<string, unknown> = {}) {
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message as any}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={vi.fn().mockResolvedValue(undefined)}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
      {...extra}
    />
  );
}

describe('WhatsAppOrderReviewModal — vrácení propojené s objednávkou', () => {
  beforeEach(() => {
    inserted.length = 0;
    updated.length = 0;
    window.confirm = vi.fn(() => true);
  });

  it('bez orders/orderItems se nabídka objednávek vůbec neukáže (dřívější chování beze změny)', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByText('Vypadá to na VRÁCENÍ piva, ne na objednávku')).toBeTruthy());
    expect(screen.queryByText('Vrátit z konkrétní objednávky (nepovinné)')).toBeNull();
  });

  it('s orders/orderItems nabídne odpovídající objednávku odběratele', async () => {
    renderModal({ orders: [order], orderItems });
    let label: HTMLElement;
    await waitFor(() => { label = screen.getByText('Vrátit z konkrétní objednávky (nepovinné)'); expect(label).toBeTruthy(); });
    const select = label!.parentElement!.querySelector('select') as HTMLSelectElement;
    expect(select.querySelector('option[value="obj-1"]')?.textContent).toContain('Martin');
  });

  it('výběr objednávky propíše order_id do zápisu a poznámku na objednávku', async () => {
    renderModal({ orders: [order], orderItems });

    let radek: HTMLElement;
    await waitFor(() => { radek = screen.getByText('1× KEG 50l Osma'); expect(radek).toBeTruthy(); });
    const checkbox = radek!.closest('label')!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);

    let label: HTMLElement;
    await waitFor(() => { label = screen.getByText('Vrátit z konkrétní objednávky (nepovinné)'); expect(label).toBeTruthy(); });
    const select = label!.parentElement!.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'obj-1' } });

    await waitFor(() => expect(screen.getByText('Zapsat jako vrácení (1 ks)')).toBeTruthy());
    fireEvent.click(screen.getByText('Zapsat jako vrácení (1 ks)'));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].table).toBe('inventory_adjustments');
    expect(inserted[0].rows[0]).toMatchObject({ beer_id: 'b1', package_id: 'p50', quantity: 1, order_id: 'obj-1' });

    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].table).toBe('orders');
    expect(updated[0].patch.note).toContain('Vráceno');
  });

  it('bez výběru objednávky (výchozí) zůstává order_id null a objednávka se neupravuje', async () => {
    renderModal({ orders: [order], orderItems });

    let radek: HTMLElement;
    await waitFor(() => { radek = screen.getByText('1× KEG 50l Osma'); expect(radek).toBeTruthy(); });
    const checkbox = radek!.closest('label')!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() => expect(screen.getByText('Zapsat jako vrácení (1 ks)')).toBeTruthy());
    fireEvent.click(screen.getByText('Zapsat jako vrácení (1 ks)'));

    await waitFor(() => expect(inserted).toHaveLength(1));
    expect(inserted[0].rows[0].order_id).toBeNull();
    expect(updated).toHaveLength(0);
  });
});
