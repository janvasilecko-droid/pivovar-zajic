// Zpráva, jejíž AI čtení spadlo (edge funkce ji označí 'error' — viz
// safeUpdateMessage v supabase/functions/whatsapp-auto-parse/index.ts, aby
// nezůstala navěky viset v 'processing'). Dřív to UI ukazovalo úplně stejně
// jako běžící zpracování ("Zpracovává se...") a bez tlačítka na nový pokus —
// z provozu 21. 9. 2026: zpráva „Vrací jednu plnou 30tku" natrvalo visela na
// „Zpracovává se...", ačkoli parsování už dávno selhalo/skončilo.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';

vi.mock('../lib/supabase', () => {
  const stub = () => ({
    select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  return { supabase: { from: vi.fn(() => stub()) } };
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

const beers: any[] = [];
const packages: any[] = [];
const places: any[] = [];

function renderModal(message: any) {
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={vi.fn().mockResolvedValue(undefined)}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />
  );
}

describe('WhatsAppOrderReviewModal — stav "error" po neúspěšném AI čtení', () => {
  it('ukáže "Čtení AI selhalo", ne "Zpracovává se...", a nabídne tlačítko na nový pokus', async () => {
    renderModal({
      id: 'error-1',
      sender_name: 'Odběratel',
      message_text: 'Vrací jednu plnou 30tku',
      message_type: 'text',
      status: 'error',
      error_message: 'AI request timed out',
      created_at: '2026-09-21T06:59:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText(/Čtení AI selhalo/)).toBeTruthy());
    expect(screen.getByText(/AI request timed out/)).toBeTruthy();
    expect(screen.queryByText('Zpracovává se...')).toBeNull();
    expect(screen.getByText('Zkusit znovu')).toBeTruthy();
  });

  it('kliknutí na "Zkusit znovu" spustí AI čtení znovu', async () => {
    renderModal({
      id: 'error-2',
      sender_name: 'Odběratel',
      message_text: 'Vrací jednu plnou 30tku',
      message_type: 'text',
      status: 'error',
      error_message: null,
      created_at: '2026-09-21T06:59:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText('Zkusit znovu')).toBeTruthy());
    const parseMock = parseWhatsAppOrderMessageWithAI as unknown as ReturnType<typeof vi.fn>;
    parseMock.mockClear();
    fireEvent.click(screen.getByText('Zkusit znovu'));
    await waitFor(() => expect(parseMock).toHaveBeenCalled());
  });

  it('skutečně běžící zpracování ("processing") dál ukazuje "Zpracovává se..." bez tlačítka', async () => {
    renderModal({
      id: 'processing-1',
      sender_name: 'Odběratel',
      message_text: '2x 12° 30l',
      message_type: 'text',
      status: 'processing',
      created_at: '2026-09-21T06:59:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText('Zpracovává se...')).toBeTruthy());
    expect(screen.queryByText('Parsovat ručně')).toBeNull();
    expect(screen.queryByText('Zkusit znovu')).toBeNull();
  });
});
