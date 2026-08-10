import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

// Ovládané Supabase: reálný loadAliasMap (orderParser) čeká na tento síťový dotaz,
// takže asynchronní inicializace modálu zůstane viset, dokud jej neuvolníme.
const supabaseMock = vi.hoisted(() => ({
  resolveSelect: null as (() => void) | null,
  fromCalls: [] as string[],
}));
vi.mock('../lib/supabase', () => {
  const stub = () => ({
    select: vi.fn().mockImplementation(() => new Promise((resolve) => {
      supabaseMock.resolveSelect = () => resolve({ data: [], error: null });
    })),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const supabase = {
    from: vi.fn((table: string) => { supabaseMock.fromCalls.push(table); return stub(); }),
  };
  return { supabase };
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

const DEMO_MSG: any = {
  id: '2166ff96-29df-422e-ab3c-def62b95f444',
  sender_name: 'Test Sládek (kontrola čtení)',
  message_text: 'Ahoj sládku,\npro U Dubu na pátek:\n2x 12° 30l\n4x 50l 12sv\ndíky!',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-08-09T14:45:26+00:00',
  parsed_place_id: null,
  parsed_place_name: 'U Dubu',
  parsed_delivery_day: 'pa',
  parsed_items: [
    { qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l', raw_line: '2x 12° 30l' },
    { qty: 4, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 50l', raw_line: '4x 30l 12sv' },
    { qty: 5, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 50l', raw_line: '5x 50l 12sv' },
  ],
};

const beers: any[] = [
  { id: 'b1', name: '12° Světlá', short_name: '12°S', degree: '12°', color: 'světlé', beer_color: '#FDE68A', is_active: true, sort_order: 1, created_at: '' },
];
const packages: any[] = [
  { id: 'p30', label: '30l', kind: 'keg', volume_l: 30 },
  { id: 'p50', label: '50l', kind: 'keg', volume_l: 50 },
];
const places: any[] = [
  { id: 'pl-kiosek', name: 'Kiosek' },
  { id: 'pl-kvelb', name: 'Pivní Kvelb' },
];

function renderModal() {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onReject = vi.fn().mockResolvedValue(undefined);
  const onDecision = vi.fn();
  const onClose = vi.fn();
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={onClose}
      message={DEMO_MSG}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={onApprove}
      onReject={onReject}
      onDecision={onDecision}
    />
  );
  return { onApprove, onReject, onDecision, onClose };
}

describe('WhatsAppOrderReviewModal — závod inicializace vs. psaní odběratele', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    supabaseMock.resolveSelect = null;
    supabaseMock.fromCalls = [];
  });

  it('zachová uživatelův vstup, i když asynchronní inicializace doběhne později', async () => {
    renderModal();
    const input = await screen.findByPlaceholderText('Napiš nebo vyber odběratele…') as HTMLInputElement;

    // Asynchronní inicializace visí na síťovém dotazu (loadAliasMap).
    await waitFor(() => expect(supabaseMock.resolveSelect).not.toBeNull());

    // OPRAVA: pole odběratele je předvyplněné synchronně (nezávisle na loadAliasMap).
    await waitFor(() => expect(input).toHaveValue('U Dubu'));

    // Uživatel začne psát dřív, než se asynchronní inicializace dokončí.
    fireEvent.change(input, { target: { value: 'Kiosek' } });
    expect(input).toHaveValue('Kiosek');

    // Síťový dotaz teď doběhne → asynchronní inicializace se dokončí.
    await act(async () => { supabaseMock.resolveSelect!(); await Promise.resolve(); });

    // OPRAVA: uživatelův vstup se NEPŘEPÍŠE parsed_place_name („U Dubu“).
    expect(input).toHaveValue('Kiosek');
  });
});
