// Testy hlášky „Přepis od AI“ v WhatsAppOrderReviewModal, když parsed_raw_text chybí:
//  - legacy zpráva (rozparsovaná před nasazením kontroly čtení) → původní text
//  - fotka (legacy, AI ji tehdy nepřepisovala) → vysvětlení místo zavádějící hlášky
//  - pending (ještě se zpracovává) → vysvětlení + „Parsovat ručně“ (fotka se pošle AI)
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';

vi.mock('../lib/supabase', () => {
  const stub = () => ({
    select: vi.fn().mockReturnValue(Promise.resolve({ data: [], error: null })),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const supabase = {
    from: vi.fn(() => stub()),
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

const LEGACY_TEXT = 'Přepis od AI není k dispozici (zpráva rozparsovaná před nasazením kontroly čtení). Použijte „Přečíst znovu (AI)".';
const PHOTO_TEXT = 'Tahle zpráva je fotka bez přepisu od AI — byla rozparsovaná v době, kdy se fotky nečetly. Zkontrolujte objednávku podle fotky, případně použijte „Přečíst znovu (AI)".';
const PENDING_TEXT = 'Přepis od AI zatím není k dispozici — zpráva se teprve zpracovává. Pokud se tak nestane samo, klepněte na „Parsovat ručně“ výše.';

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

describe('WhatsAppOrderReviewModal — hláška „Přepis od AI“ bez parsed_raw_text', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('legacy zpráva (parsed bez parsed_raw_text) ukáže původní hlášku', async () => {
    renderModal({
      id: 'legacy-1',
      sender_name: 'Legacy Odběratel',
      message_text: 'Ahoj,\n2x 12° 30l',
      message_type: 'text',
      status: 'parsed',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [
        { qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l', raw_line: '2x 12° 30l' },
      ],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText(LEGACY_TEXT)).toBeTruthy());
    expect(screen.queryByText(PHOTO_TEXT)).toBeNull();
    expect(screen.queryByText(PENDING_TEXT)).toBeNull();
  });

  it('fotka bez přepisu ukáže vysvětlení o fotce, ne legacy hlášku', async () => {
    renderModal({
      id: 'photo-1',
      sender_name: 'Foto Odběratel',
      message_text: '',
      message_type: 'image',
      status: 'parsed',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText(PHOTO_TEXT)).toBeTruthy());
    expect(screen.queryByText(LEGACY_TEXT)).toBeNull();
  });

  it('pending zpráva ukáže „teprve zpracovává“ + tlačítko „Parsovat ručně“, ne legacy hlášku', async () => {
    renderModal({
      id: 'pending-1',
      sender_name: 'Čekající Odběratel',
      message_text: 'Ahoj,\n3x 10° 50l',
      message_type: 'text',
      status: 'pending',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText(PENDING_TEXT)).toBeTruthy());
    expect(screen.getByText('Parsovat ručně')).toBeTruthy();
    expect(screen.queryByText(LEGACY_TEXT)).toBeNull();
  });

  it('pending fotka ukáže „teprve zpracovává“ + „Parsovat ručně“ a AI parser dostane media_url fotky', async () => {
    const mediaUrl = 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg';
    renderModal({
      id: 'pending-photo-1',
      sender_name: 'Foto Odběratel',
      message_text: '',
      message_type: 'image',
      status: 'pending',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
      media_url: mediaUrl,
    });
    await waitFor(() => expect(screen.getByText(PENDING_TEXT)).toBeTruthy());
    expect(screen.queryByText(PHOTO_TEXT)).toBeNull();
    expect(screen.getByText('Parsovat ručně')).toBeTruthy();

    const parseMock = parseWhatsAppOrderMessageWithAI as unknown as ReturnType<typeof vi.fn>;
    parseMock.mockClear();
    fireEvent.click(screen.getByText('Parsovat ručně'));
    await waitFor(() => expect(parseMock).toHaveBeenCalled());
    expect(parseMock.mock.calls[0][9]).toBe(mediaUrl);
  });
});
