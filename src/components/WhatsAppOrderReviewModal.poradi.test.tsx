// Pořadí oken v kontrole WhatsApp objednávky (14. 10. 2026, majitel:
// „Nová objednávka WhatsApp, čas — dej úplně dolů, to nepotřebuju vidět,
// zajímá mě, jestli je to parsovaný, přečtený a ty data“).
//
// Nahoře: stav zpracování (rozparsováno) → kontrola čtení → rozpoznaná data.
// Úplně dole (pod „Jak to funguje?“): karta s odesílatelem, časem přijetí
// a typem zprávy.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

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
  message_text: '2x 12° 30l',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-14T07:50:00+00:00',
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

  it('nahoře stav zpracování → kontrola čtení → data, karta zprávy až úplně dole', async () => {
    const { container } = renderModal(PARSOVANA);

    await waitFor(() => expect(screen.getByText(/AI rozpoznalo z objednávky/)).toBeTruthy());

    const stav = container.querySelector('[data-stav-zpracovani]') as HTMLElement;
    const karta = container.querySelector('[data-info-o-zprave]') as HTMLElement;
    expect(stav).toBeTruthy();
    expect(karta).toBeTruthy();

    // „Rozparsováno AI“ je v pruhu nahoře, ne v kartě dole.
    expect(within(stav).getByText(/Rozparsováno AI/)).toBeTruthy();
    expect(within(karta).queryByText(/Rozparsováno AI/)).toBeNull();
    expect(within(karta).queryByText('Stav zpracování')).toBeNull();

    const kontrola = screen.getByText(/Kontrola čtení — originál vs\. přepis AI/);
    const data = screen.getByText(/AI rozpoznalo z objednávky/);
    const jakTo = screen.getByText('Jak to funguje?');

    expect(jeZa(stav, kontrola)).toBe(true);
    expect(jeZa(kontrola, data)).toBe(true);
    expect(jeZa(data, jakTo)).toBe(true);
    // Karta s odesílatelem a časem je až za „Jak to funguje?“ …
    expect(jeZa(jakTo, karta)).toBe(true);
    // … a je úplně poslední v těle okna.
    expect(karta.nextElementSibling).toBeNull();
  });

  it('odesílatel, čas přijetí a typ zprávy zůstávají v kartě dole', async () => {
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

  it('čekající zpráva: nahoře „Čeká na parsování“ + tlačítko Parsovat ručně', async () => {
    const { container } = renderModal({ ...PARSOVANA, id: 'poradi-2', status: 'pending', parsed_items: [], parsed_raw_text: null });
    await waitFor(() => expect(container.querySelector('[data-stav-zpracovani]')).toBeTruthy());

    const stav = container.querySelector('[data-stav-zpracovani]') as HTMLElement;
    expect(within(stav).getByText(/Čeká na parsování/)).toBeTruthy();
    expect(within(stav).getByText('Parsovat ručně')).toBeTruthy();
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
