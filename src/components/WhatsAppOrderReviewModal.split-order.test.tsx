// ✂️ Rozdělení WhatsApp zprávy se dvěma odběrateli na dvě objednávky.
// Z provozu 15. 9. 2026: zpráva „Chmeloun 4x30l 12sv / Sluhy 10x30l desitka"
// dorazila jako jedna objednávka pro jednoho odběratele — chyběla možnost
// část položek odeslat druhému odběrateli místo ruční opravy po schválení.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

const { insertCalls } = vi.hoisted(() => ({ insertCalls: [] as { table: string; payload: any }[] }));

vi.mock('../lib/supabase', () => {
  const supabase = {
    from: vi.fn((table: string) => ({
      select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn((payload: any) => {
        insertCalls.push({ table, payload });
        if (table === 'orders') {
          return { select: () => ({ single: () => Promise.resolve({ data: { id: 'new-order-sluhy' }, error: null }) }) };
        }
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };
  return { supabase };
});

vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

const beers: any[] = [
  { id: 'b-12sv', name: '12° Světlá' },
  { id: 'b-des', name: '10° Desítka' },
];
const packages: any[] = [
  { id: 'p30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
];
const places: any[] = [
  { id: 'pl-chmeloun', name: 'Chmeloun' },
  { id: 'pl-sluhy', name: 'Sluhy' },
];

const message: any = {
  id: 'msg-chmeloun-sluhy',
  sender_name: 'Pivovar',
  message_text: 'Chmeloun\n4x30l 12sv\n\nSluhy\n10x30l desitka',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-09-15T10:00:00+00:00',
  parsed_place_id: 'pl-chmeloun',
  parsed_place_name: 'Chmeloun',
  parsed_items: [
    { beer_id: 'b-12sv', pkg_id: 'p30', qty: 4, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '4x30l 12sv' },
    { beer_id: 'b-des', pkg_id: 'p30', qty: 10, degree: null, beer_name: '10° Desítka', package_label: 'KEG 30l', raw_line: '10x30l desitka' },
  ],
  parsed_raw_text: 'Chmeloun\n4x30l 12sv\n\nSluhy\n10x30l desitka',
};

function renderModal() {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  const onReject = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onDecision = vi.fn();
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={onClose}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={onApprove}
      onReject={onReject}
      onDecision={onDecision}
    />
  );
  return { onApprove, onReject, onClose, onDecision };
}

describe('WhatsAppOrderReviewModal — rozdělit na dva odběratele', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    insertCalls.length = 0;
    vi.clearAllMocks();
  });

  it('bez zapnutí rozdělení schválí obě položky jako jednu objednávku (beze změny)', async () => {
    const { onApprove } = renderModal();
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));

    fireEvent.click(screen.getByText('Schválit a importovat'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0].parsed_items).toHaveLength(2);
    expect(insertCalls).toHaveLength(0);
  });

  it('zaškrtnutá položka odejde do nové objednávky pro druhého odběratele', async () => {
    const { onApprove } = renderModal();
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));

    fireEvent.click(screen.getByText('✂️ Rozdělit na dva odběratele'));

    // Zaškrtnout druhou položku (10° Desítka — patří Sluhy). Jméno „2." je
    // z <label> u zaškrtávátka (viz WhatsAppOrderReviewModal.tsx) — odliší
    // je to od jiných zaškrtávátek v modálu (přísný režim atd).
    const checkboxes = await screen.findAllByRole('checkbox', { name: '2.' });
    expect(checkboxes).toHaveLength(2);
    fireEvent.click(checkboxes[1]);

    // Vybrat druhého odběratele z nabídky (existující „Sluhy").
    const comboboxy = await screen.findAllByPlaceholderText('Napiš nebo vyber odběratele…');
    expect(comboboxy).toHaveLength(2);
    fireEvent.change(comboboxy[1], { target: { value: 'Sluhy' } });
    const navrh = await screen.findByRole('button', { name: /Sluhy/ });
    fireEvent.click(navrh);

    fireEvent.click(screen.getByText('Schválit a importovat'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));

    // Prvnímu (schválenému přes onApprove) zůstane jen nezaškrtnutá položka.
    const approveArg = onApprove.mock.calls[0][0];
    expect(approveArg.parsed_items).toHaveLength(1);
    expect(approveArg.parsed_items[0].beer_name).toBe('12° Světlá');

    // Druhá objednávka vznikne přímým zápisem — jméno odběratele a položka.
    await waitFor(() => expect(insertCalls.some((c) => c.table === 'orders')).toBe(true));
    const orderInsert = insertCalls.find((c) => c.table === 'orders')!;
    expect(orderInsert.payload.place_name).toBe('Sluhy');
    expect(orderInsert.payload.place_id).toBe('pl-sluhy');

    const itemsInsert = insertCalls.find((c) => c.table === 'order_items')!;
    expect(itemsInsert).toBeTruthy();
    expect(itemsInsert.payload).toHaveLength(1);
    expect(itemsInsert.payload[0].order_id).toBe('new-order-sluhy');
    expect(itemsInsert.payload[0].beer_name).toBe('10° Desítka');
    expect(itemsInsert.payload[0].quantity).toBe(10);
  });

  it('rozdělení bez vybraného druhého odběratele schválení zastaví', async () => {
    const { onApprove } = renderModal();
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));

    fireEvent.click(screen.getByText('✂️ Rozdělit na dva odběratele'));
    const checkboxes = await screen.findAllByRole('checkbox', { name: '2.' });
    fireEvent.click(checkboxes[1]);
    // Druhý odběratel se NEVYBRAL.

    fireEvent.click(screen.getByText('Schválit a importovat'));
    await waitFor(() => expect(screen.getByText(/Vyber nebo napiš druhého odběratele/)).toBeTruthy());
    expect(onApprove).not.toHaveBeenCalled();
  });
});
