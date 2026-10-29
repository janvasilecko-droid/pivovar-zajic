// 📅 „martin 1x10l 11sv“ (29. 10. 2026, čtvrtek) skončilo na středě 4. 11.
// Majitel: „musím výslovně napsat datum, nebo musí být ve čtené objednávce datum.“
//
// Zpráva den neuváděla. Kontrolní okno si ho doplnilo ze zvyklostí odběratele
// (Martin bere obvykle ve středu) a datum dopočetlo jako nejbližší středu od
// dneška — ve čtvrtek je to středa PŘÍŠTÍHO týdne. Den ani datum se z historie
// odběratele doplňovat nesmí; platí jen zpráva, AI nebo ruční volba.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

const h = vi.hoisted(() => ({ nactiZvyklosti: vi.fn() }));

vi.mock('../lib/businessDate', async (orig) => ({
  ...(await orig<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-29',
}));
vi.mock('../lib/zvyklostiOdberatele', async (orig) => ({
  ...(await orig<typeof import('../lib/zvyklostiOdberatele')>()),
  nactiZvyklosti: h.nactiZvyklosti,
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

const beers: any[] = [{ id: 'b-11', name: '11° Světlá' }];
const packages: any[] = [{ id: 'p10', label: '10l', kind: 'keg', volume_l: 10 }];
const places: any[] = [{ id: 'pl-martin', name: 'Martin' }];

const zprava = (extra: Record<string, unknown> = {}): any => ({
  id: 'martin-1',
  sender_name: 'Objednávky pivovar',
  message_text: 'martin 1x10l 11sv',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-29T08:10:00+00:00',
  parsed_place_id: 'pl-martin',
  parsed_place_name: 'Martin',
  parsed_delivery_day: null,
  parsed_delivery_date: null,
  parsed_items: [{ beer_id: 'b-11', pkg_id: 'p10', qty: 1, degree: null, beer_name: '11° Světlá', package_label: '10l', raw_line: '1x10l 11sv' }],
  parsed_raw_text: 'martin 1x10l 11sv',
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
const jeZmacknuto = (nazev: string) =>
  (screen.getByRole('button', { name: nazev }) as HTMLButtonElement).getAttribute('aria-pressed') === 'true';

describe('WhatsAppOrderReviewModal — den závozu se nedomýšlí ze zvyklostí odběratele', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    h.nactiZvyklosti.mockReset();
    h.nactiZvyklosti.mockResolvedValue({ obvyklyDen: 'st', obvyklyZavoz: null, obvykleMnozstvi: new Map(), objednavek: 8 });
  });

  it('zpráva bez dne + odběratel s obvyklou středou: den ani datum zůstane nevybráno', async () => {
    renderModal(zprava());
    await waitFor(() => expect(h.nactiZvyklosti).toHaveBeenCalled());
    // Zvyklosti jsou načtené; případné předvyplnění by se projevilo hned.
    await waitFor(() => expect(h.nactiZvyklosti).toHaveReturned());
    await new Promise((r) => setTimeout(r, 30));

    expect(screen.getByText('nevybráno')).toBeTruthy();
    expect(jeZmacknuto('St')).toBe(false);
    expect(screen.queryByText(/4\. 11\./)).toBeNull();
    expect(screen.queryByText(/obvyklý den odběratele/)).toBeNull();
  });

  it('schválení pošle bez dne i bez data (objednávka se nepřesune do příštího týdne)', async () => {
    const { onApprove } = renderModal(zprava());
    await waitFor(() => expect(h.nactiZvyklosti).toHaveReturned());
    await new Promise((r) => setTimeout(r, 30));

    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: null, parsed_delivery_date: null });
  });

  it('den napsaný ve zprávě platí dál (ve čtvrtek „na středu“ = 4. 11.)', async () => {
    renderModal(zprava({ message_text: 'martin na stredu 1x10l 11sv', parsed_delivery_day: 'st' }));
    await waitFor(() => expect(screen.getByText(/st 4\. 11\./)).toBeTruthy());
    expect(jeZmacknuto('St')).toBe(true);
  });

  it('den vybraný rukou platí dál', async () => {
    const { onApprove } = renderModal(zprava());
    await waitFor(() => expect(h.nactiZvyklosti).toHaveReturned());
    fireEvent.click(screen.getByRole('button', { name: 'Pá' }));
    await waitFor(() => expect(screen.getByText(/pá 30\. 10\./)).toBeTruthy());
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'pa', parsed_delivery_date: '2026-10-30' });
  });
});
