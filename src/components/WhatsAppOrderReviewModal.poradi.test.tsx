// Pořadí oken v kontrole WhatsApp objednávky.
// První obrazovka: objednatel, položky, den závozu, originál, Schválit,
// Znovu parsovat, Znovu načíst. V Další: skóre, návod, UUID, ignorovat.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { parseWhatsAppOrderMessageWithAI } from '../lib/whatsappParser';
import { fetchWhatsAppMessage } from '../lib/whatsappApi';

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
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
  fetchWhatsAppMessage: vi.fn().mockResolvedValue(null),
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
  return render(
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

/** `b` stojí v dokumentu až za `a`. */
function jeZa(a: Element, b: Element): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const PARSOVANA = {
  id: 'poradi-1',
  sender_name: 'Objednávky pivovar',
  message_text: 'Seeberg čtvrtek\n2x 12° 30l',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-14T07:50:00+00:00',
  parsed_place_name: 'Seeberg',
  parsed_items: [
    { qty: 2, degree: '12°', beer_name: 'Světlý ležák 12°', package_label: 'KEG 30l', raw_line: '2x 12° 30l' },
  ],
  parsed_raw_text: '2x 12° 30l',
};

describe('WhatsAppOrderReviewModal — pořadí oken', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('na první obrazovce je lístek, originál, schválit, znovu parsovat a znovu načíst', async () => {
    const { container } = renderModal(PARSOVANA);

    await waitFor(() => expect(screen.getByText(/AI rozpoznalo z objednávky/)).toBeTruthy());

    expect(screen.getByText('Odběratel')).toBeTruthy();
    expect(screen.getByText('Den závozu')).toBeTruthy();
    expect(screen.getByText('Položky objednávky')).toBeTruthy();
    expect(screen.getByText('Originál zprávy')).toBeTruthy();
    expect(screen.getAllByText(/Seeberg čtvrtek/).length).toBeGreaterThan(0);
    expect(screen.getByText('Schválit a odeslat do objednávek')).toBeTruthy();
    expect(screen.getByText('Znovu parsovat')).toBeTruthy();
    expect(screen.getByText('Znovu načíst')).toBeTruthy();

    const dalsi = container.querySelector('[data-dalsi]') as HTMLElement;
    const stav = container.querySelector('[data-stav-zpracovani]') as HTMLElement;
    const karta = container.querySelector('[data-info-o-zprave]') as HTMLElement;
    expect(dalsi).toBeTruthy();
    expect(dalsi.contains(stav)).toBe(true);
    expect(dalsi.contains(karta)).toBe(true);
    expect(within(dalsi).getByText('Jak to funguje?')).toBeTruthy();
    expect(within(karta).getByText('UUID zprávy')).toBeTruthy();
    expect(within(karta).getByText('poradi-1')).toBeTruthy();

    const data = screen.getByText(/AI rozpoznalo z objednávky/);
    const original = screen.getByText('Originál zprávy');
    const schvalit = screen.getByText('Schválit a odeslat do objednávek');
    expect(jeZa(data, schvalit)).toBe(true);
    expect(jeZa(original, schvalit)).toBe(true);
    expect(jeZa(schvalit, dalsi)).toBe(true);
  });

  it('Znovu parsovat spustí nové čtení', async () => {
    renderModal(PARSOVANA);
    await waitFor(() => expect(screen.getByText('Znovu parsovat')).toBeTruthy());
    const cteni = parseWhatsAppOrderMessageWithAI as unknown as ReturnType<typeof vi.fn>;
    cteni.mockClear();
    fireEvent.click(screen.getByText('Znovu parsovat'));
    await waitFor(() => expect(cteni).toHaveBeenCalled());
  });

  it('Znovu načíst vytáhne zprávu ze serveru', async () => {
    renderModal(PARSOVANA);
    await waitFor(() => expect(screen.getByText('Znovu načíst')).toBeTruthy());
    const nacti = fetchWhatsAppMessage as unknown as ReturnType<typeof vi.fn>;
    nacti.mockClear();
    nacti.mockResolvedValue({ ...PARSOVANA });
    fireEvent.click(screen.getByText('Znovu načíst'));
    await waitFor(() => expect(nacti).toHaveBeenCalledWith('poradi-1'));
  });

  it('odesílatel, čas přijetí a typ zprávy zůstávají v kartě v Další', async () => {
    const { container } = renderModal(PARSOVANA);
    await waitFor(() => expect(container.querySelector('[data-info-o-zprave]')).toBeTruthy());

    const karta = container.querySelector('[data-info-o-zprave]') as HTMLElement;
    expect(within(karta).getByText(/Nová WhatsApp objednávka/)).toBeTruthy();
    expect(within(karta).getByText('Odesílatel')).toBeTruthy();
    expect(within(karta).getByText('Objednávky pivovar')).toBeTruthy();
    expect(within(karta).getByText('Čas přijetí')).toBeTruthy();
    expect(within(karta).getByText('Typ zprávy')).toBeTruthy();
    expect(within(karta).getByText(/Text/)).toBeTruthy();
  });

  it('čekající zpráva: Znovu parsovat je na první obrazovce, stav v Další', async () => {
    const { container } = renderModal({ ...PARSOVANA, id: 'poradi-2', status: 'pending', parsed_items: [], parsed_raw_text: null });
    await waitFor(() => expect(container.querySelector('[data-stav-zpracovani]')).toBeTruthy());

    const stav = container.querySelector('[data-stav-zpracovani]') as HTMLElement;
    expect(within(stav).getByText(/Čeká na parsování/)).toBeTruthy();
    expect(screen.getByText('Znovu parsovat')).toBeTruthy();
    expect(screen.queryByText('Parsovat ručně')).toBeNull();
    expect(screen.queryByText('Přečíst znovu (AI)')).toBeNull();
  });

  it('fotka, která nedorazila, je hlášená nahoře — před kontrolou čtení', async () => {
    const { container } = renderModal({
      ...PARSOVANA, id: 'poradi-3', message_type: 'image', message_text: '', media_url: null,
      parsed_items: [], parsed_raw_text: null,
    });
    await waitFor(() => expect(screen.getByText(/médium nebylo doručeno/)).toBeTruthy());

    const upozorneni = screen.getByText(/médium nebylo doručeno/);
    const kontrola = screen.getByText(/Kontrola čtení — originál vs\. přepis AI/);
    const karta = container.querySelector('[data-info-o-zprave]') as HTMLElement;
    expect(jeZa(upozorneni, kontrola)).toBe(true);
    expect(karta.contains(upozorneni)).toBe(false);
  });
});
