// 📅 Konkrétní datum ve zprávě (6. 11. 2026, majitel ke zprávě „Na 13 .11.30l 12sv,
// děkuji": „aplikace tohle musí umět přečíst a přiřadit na daný den, může tam být
// taky třeba na příští středu, příští týden"). Dnes je pátek 6. 11. 2026.
//
// Server datum tehdy nepřečetl (za „13 .11." hned „30l") a okno ukázalo „Den závozu
// nevybráno". Teď si ho okno přečte ze zprávy samo — i u zpráv přečtených dřív.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-11-06',
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
const places: any[] = [{ id: 'pl-x', name: 'Restaurace' }];

const zprava = (text: string, extra: Record<string, unknown> = {}): any => ({
  id: 'z-1',
  sender_name: 'Objednávky pivovar',
  message_text: text,
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-11-06T09:30:00+00:00',
  message_timestamp: '2026-11-06T09:30:00+00:00',
  parsed_place_id: 'pl-x',
  parsed_place_name: 'Restaurace',
  parsed_delivery_day: null,
  parsed_delivery_date: null,
  parsed_items: [{ beer_id: 'b-12', pkg_id: 'p30', qty: 1, degree: '12', beer_name: '12° Světlá', package_label: '30l', raw_line: text }],
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

describe('WhatsAppOrderReviewModal — datum ze zprávy', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('„Na 13 .11.30l 12sv": pátek 13. 11. a schválení ho pošle', async () => {
    const { onApprove } = renderModal(zprava('Na 13 .11.30l 12sv, děkuji'));
    await waitFor(() => expect(screen.getByText(/pá 13\. 11\./)).toBeTruthy());
    expect(screen.queryByText(/nevybráno/)).toBeNull();
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'pa', parsed_delivery_date: '2026-11-13' });
  });

  it('kontrola čtení neukáže objem 11.30l', async () => {
    renderModal(zprava('Na 13 .11.30l 12sv, děkuji'));
    await screen.findByText(/pá 13\. 11\./);
    expect(screen.queryByText(/objem 11[.,]30/)).toBeNull();
  });

  it('„pozítří" od pátku = neděle 8. 11.', async () => {
    renderModal(zprava('na pozítří 1x30l 12sv'));
    await waitFor(() => expect(screen.getByText(/ne 8\. 11\./)).toBeTruthy());
  });

  it('„13. listopadu" i „13/11"', async () => {
    renderModal(zprava('na 13. listopadu 1x30l 12sv'));
    await waitFor(() => expect(screen.getByText(/pá 13\. 11\./)).toBeTruthy());
  });

  it('den, který doplnil server, má přednost; jiný den v okně dopočte datum jako dřív', async () => {
    renderModal(zprava('Na 13 .11.30l 12sv', { parsed_delivery_day: 'pa', parsed_delivery_date: '2026-11-13' }));
    await waitFor(() => expect(screen.getByText(/pá 13\. 11\./)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Čt' }));
    await waitFor(() => expect(screen.getByText(/čt 12\. 11\./)).toBeTruthy());
  });

  it('„na příští týden" bez dne: den se nevybere sám, ale vybraný den padne do příštího týdne', async () => {
    renderModal(zprava('na příští týden 1x30l 12sv'));
    await screen.findByText(/příští týden podle zprávy/);
    fireEvent.click(screen.getByRole('button', { name: 'St' }));
    await waitFor(() => expect(screen.getByText(/st 11\. 11\./)).toBeTruthy());
  });
});
