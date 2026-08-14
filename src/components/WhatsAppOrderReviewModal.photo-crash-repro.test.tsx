// Reprodukce hlášeného pádu: parsování WhatsApp objednávky, která je FOTKA.
// Scénáře:
//  1. pending fotka + „Parsovat ručně" → AI vrátí položky (úspěch) → nesmí spadnout
//  2. pending fotka + „Parsovat ručně" → AI vrátí chybu → hláška, nesmí spadnout
//  3. fotka se starou zprávou, kde message_type je NULL (Make.com/legacy) → render nesmí spadnout
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
  const supabase = { from: vi.fn(() => stub()) };
  return { supabase };
});

vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
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

describe('WhatsAppOrderReviewModal — fotka (reprodukce pádu)', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('1. pending fotka + „Parsovat ručně" s úspěšným AI čtením nespadne', async () => {
    const parseMock = parseWhatsAppOrderMessageWithAI as unknown as ReturnType<typeof vi.fn>;
    parseMock.mockResolvedValue({
      items: [
        {
          beer_id: null,
          package_id: null,
          quantity: 2,
          degree: '12°',
          beer_name: 'Světlý ležák 12°',
          package_label: 'KEG 30l',
          raw: '2x KEG30 12sv',
        },
      ],
      placeId: null,
      placeName: 'U Dubu',
      deliveryDay: null,
      deliveryDate: null,
      note: null,
      raw_text: '2x KEG30 12sv',
    });

    renderModal({
      id: 'repro-photo-1',
      sender_name: 'Foto Odběratel',
      message_text: '',
      message_type: 'image',
      status: 'pending',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
      media_url: 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-1.jpg',
    });

    await waitFor(() => expect(screen.getByText('Parsovat ručně')).toBeTruthy());
    fireEvent.click(screen.getByText('Parsovat ručně'));
    // Po parsování se objeví rozparsované informace — nesmí to spadnout.
    await waitFor(() => expect(screen.getByText('AI rozpoznalo z objednávky')).toBeTruthy());
    // PlaceCombobox zobrazí odběratele v inputu (hodnota, ne prostý text).
    expect(screen.getByDisplayValue('U Dubu')).toBeTruthy();
  });

  it('2. pending fotka + „Parsovat ručně" s chybou AI ukáže hlášku a nespadne', async () => {
    const parseMock = parseWhatsAppOrderMessageWithAI as unknown as ReturnType<typeof vi.fn>;
    parseMock.mockRejectedValue(new Error('AI čtení selhalo (všichni poskytovatelé)'));

    renderModal({
      id: 'repro-photo-2',
      sender_name: 'Foto Odběratel',
      message_text: '',
      message_type: 'image',
      status: 'pending',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
      media_url: 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-2.jpg',
    });

    await waitFor(() => expect(screen.getByText('Parsovat ručně')).toBeTruthy());
    fireEvent.click(screen.getByText('Parsovat ručně'));
    await waitFor(() =>
      expect(screen.getByText(/Chyba při parsování: AI čtení selhalo/)).toBeTruthy()
    );
  });

  it('3. fotka, kde message_type je null (legacy/Make.com) — render nesmí spadnout', async () => {
    // Legacy zprávy uložené před výchozí hodnotou 'text' mohou mít message_type = NULL.
    renderModal({
      id: 'repro-photo-3',
      sender_name: 'Legacy Foto',
      message_text: '',
      message_type: null,
      status: 'parsed',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [],
      parsed_raw_text: null,
      media_url: 'https://xyz.supabase.co/storage/v1/object/public/whatsapp-media/incoming/wa-3.jpg',
    });

    await waitFor(() => expect(screen.getByText(/Nová WhatsApp objednávka/)).toBeTruthy());
  });

  it('4. fotka rozparsovaná, kde se v popisku shodují jen čísla — načtení modálu nespadne', async () => {
    // Regrese „Cannot read properties of null (reading 'start')“: AI přečetla
    // z fotky řádek „2x KEG30 12sv“, popisek zprávy je „2 30 12“. Přesná ani
    // fuzzy shoda řádku neexistuje, ale čísla sedí → dřív dostal status 'fuzzy'
    // s match=null a render padl v .map (i.match.start).
    renderModal({
      id: 'repro-photo-4',
      sender_name: 'Foto Odběratel',
      message_text: '2 30 12',
      message_type: 'image',
      status: 'parsed',
      created_at: '2026-08-01T10:00:00+00:00',
      parsed_items: [
        { qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l', raw_line: '2x KEG30 12sv' },
      ],
      parsed_raw_text: '2x KEG30 12sv',
    });
    // Render nesmí spadnout a měl by zobrazit rozparsované položky.
    await waitFor(() => expect(screen.getByText(/AI rozpoznalo z objednávky/)).toBeTruthy());
    // raw_line se zobrazuje u položky i v přepisu AI → může být více výskytů.
    expect(screen.getAllByText(/2x KEG30 12sv/).length).toBeGreaterThan(0);
  });
});
