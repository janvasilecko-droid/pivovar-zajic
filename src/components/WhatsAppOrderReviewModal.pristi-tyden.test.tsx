// 📅 „Na příští týden na středu“ (14. 10. 2026, majitel: „Hladík Dobřichovice
// bylo v objednávce na příští středu, to znamená příští středa, ne tenhle týden,
// mělo to nasadit na středu 21. 10.“). Dnes je středa 14. 10. 2026.
//
// Kontrolní okno vzalo nejbližší takový den od dneška, tedy dnešek, a slovo
// „příští“ ignorovalo. Teď se den bere v příštím týdnu a datum jde i zadat rukou.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-14',
}));
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
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

const beers: any[] = [{ id: 'b-12', name: '12° Světlá' }];
const packages: any[] = [{ id: 'p30', label: '30l', kind: 'keg', volume_l: 30 }];
const places: any[] = [{ id: 'pl-hladik', name: 'Jakub Hladík z Dobřichovic' }];

const HLADIK = 'Jakub Hladík z Dobřichovic, Podpultovky na pristi tyden na stredu prosim 1x30l 12sv, vcetne zalohy, ale bude vracet sud nejspis, uz se mu tam vezlo. Diky';
const zprava = (text: string, extra: Record<string, unknown> = {}): any => ({
  id: 'hladik-1',
  sender_name: 'Objednávky pivovar',
  message_text: text,
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-14T09:23:00+00:00',
  parsed_place_id: 'pl-hladik',
  parsed_place_name: 'Jakub Hladík z Dobřichovic',
  parsed_delivery_day: 'st',
  parsed_delivery_date: null,
  parsed_items: [{ beer_id: 'b-12', pkg_id: 'p30', qty: 1, degree: null, beer_name: '12° Světlá', package_label: '30l', raw_line: '1x30l 12sv' }],
  parsed_raw_text: text,
  ...extra,
});

function renderModal(message: any) {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message}
      beers={beers}
      packages={packages}
      places={places}
      onApprove={onApprove}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />
  );
  return { onApprove };
}

const schvalit = () => fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));

describe('WhatsAppOrderReviewModal — „příští týden“ u dne závozu', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('Hladík: „na příští týden na středu“ ve středu 14. 10. = středa 21. 10., ne dnešek', async () => {
    renderModal(zprava(HLADIK));
    await waitFor(() => expect(screen.getByText(/st 21\. 10\./)).toBeTruthy());
    expect(screen.queryByText(/st 14\. 10\./)).toBeNull();
    expect(screen.getByText(/příští týden podle zprávy/)).toBeTruthy();
  });

  it('schválení pošle datum 21. 10. a den St', async () => {
    const { onApprove } = renderModal(zprava(HLADIK));
    await screen.findByText(/st 21\. 10\./);
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'st', parsed_delivery_date: '2026-10-21' });
  });

  it('„na příští středu“ bez slova týden platí stejně', async () => {
    renderModal(zprava('Hladík Dobřichovice na příští středu 1x30l 12sv'));
    await waitFor(() => expect(screen.getByText(/st 21\. 10\./)).toBeTruthy());
  });

  it('bez „příští“ zůstává nejbližší takový den, tedy dnes', async () => {
    renderModal(zprava('Hladík Dobřichovice na stredu 1x30l 12sv'));
    await waitFor(() => expect(screen.getByText(/st 14\. 10\./)).toBeTruthy());
    expect(screen.queryByText(/příští týden podle zprávy/)).toBeNull();
  });

  it('datum, které už doplnil server, platí', async () => {
    renderModal(zprava(HLADIK, { parsed_delivery_date: '2026-10-21' }));
    await waitFor(() => expect(screen.getByText(/st 21\. 10\./)).toBeTruthy());
  });

  it('přepnutí na jiný den v příštím týdnu: čtvrtek = 22. 10.', async () => {
    renderModal(zprava(HLADIK));
    await screen.findByText(/st 21\. 10\./);
    fireEvent.click(screen.getByRole('button', { name: 'Čt' }));
    await waitFor(() => expect(screen.getByText(/čt 22\. 10\./)).toBeTruthy());
  });

  it('pole „nebo datum“: datum zadané rukou přebije vše a nastaví i den', async () => {
    const { onApprove } = renderModal(zprava(HLADIK));
    await screen.findByText(/st 21\. 10\./);
    fireEvent.change(screen.getByLabelText('nebo datum'), { target: { value: '2026-10-29' } });
    await waitFor(() => expect(screen.getByText(/čt 29\. 10\./)).toBeTruthy());
    expect((screen.getByRole('button', { name: 'Čt' }) as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'ct', parsed_delivery_date: '2026-10-29' });
  });

  it('datum v minulosti: okno řekne, že se objednávka hned odečte ze skladu', async () => {
    renderModal(zprava(HLADIK));
    await screen.findByText(/st 21\. 10\./);
    fireEvent.change(screen.getByLabelText('nebo datum'), { target: { value: '2026-10-12' } });
    await waitFor(() => expect(screen.getByText(/Závoz už proběhl/)).toBeTruthy());
  });
});
