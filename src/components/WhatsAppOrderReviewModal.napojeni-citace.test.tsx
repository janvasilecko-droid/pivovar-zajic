// ↩️ Odpověď na NOVOU zprávu nesmí skončit u starší objednávky.
//
// Majitel 18. 11. 2026: „zkontroluj, jak to, že mi to chtělo přiřadit odpověď
// z WhatsAppu ke starší objednávce a ne k té z aktuálního týdne." Lužec posílá
// objednávku pořád stejným zněním. Odpověď na novou zprávu (ještě
// neschválenou) se napojila na objednávku z minulého týdne a schválením by se
// k ní přičetly lahve. Kontrola při otevření ověří, ke které zprávě odpověď
// podle citace opravdu patří:
//   • nová zpráva už má objednávku → odpověď se přepojí na ni,
//   • nová zpráva čeká na schválení → napojení na starou objednávku se zruší
//     a nahoře stojí, že odpověď čeká na schválení novější zprávy.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { napojNaObjednavku, type WhatsAppIncoming } from '../lib/whatsappApi';
import type { Beer, Package, Place } from '../lib/supabase';

const h = vi.hoisted(() => ({ zpravy: [] as unknown[] }));

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  // Řetězitelný dotaz: zprávy z chatu mají obsah, ostatní tabulky jsou prázdné.
  const stub = (tabulka: string) => {
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: tabulka === 'whatsapp_incoming' ? h.zpravy : [], error: null }).then(ok, ko),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    for (const m of ['select', 'eq', 'lt', 'in', 'order', 'limit', 'gte']) q[m] = () => q;
    return q;
  };
  return { supabase: { from: vi.fn((tabulka: string) => stub(tabulka)) } };
});
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
  napojNaObjednavku: vi.fn().mockResolvedValue(undefined),
  fetchWhatsAppMessage: vi.fn(),
}));
vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

const beers = [{ id: 'b-12', name: '12° Světlá', degree: '12°' }] as unknown as Beer[];
const packages = [{ id: 'p-033', label: '0.33l', kind: 'bottle', volume_l: 0.33 }] as unknown as Package[];
const places = [{ id: 'pl-luzec', name: 'Lužec' }] as unknown as Place[];

const TEXT = 'Luzec 2 *50 světlé pivo\n1x basa 0,33';
const CITACE = 'Luzec 2 *50 světlé pivo';

// Minulý týden: zpráva schválená, objednávka založená.
const MINULY = {
  id: 'm-26-10', created_at: '2026-10-26T08:10:00+00:00', message_text: TEXT, status: 'imported',
  imported_order_id: 'ord-26-10', parsed_place_id: 'pl-luzec', parsed_place_name: 'Lužec',
};
// Tento týden: totéž, zatím neschválené.
const TENTO = {
  id: 'm-03-11', created_at: '2026-11-03T13:45:00+00:00', message_text: TEXT, status: 'parsed',
  imported_order_id: null, parsed_place_id: 'pl-luzec', parsed_place_name: 'Lužec',
};
const TENTO_SCHVALENY = { ...TENTO, status: 'imported', imported_order_id: 'ord-03-11' };

const odpoved = (extra: Partial<WhatsAppIncoming> = {}): WhatsAppIncoming => ({
  id: 'odpoved-1',
  sender_name: 'Objednávky pivovar',
  message_text: 'Plus na další fakturu 2 basy 0,33',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-11-03T13:47:00+00:00',
  quoted_text: CITACE,
  amends_order_id: null,
  amends_message_id: null,
  parsed_place_id: 'pl-luzec',
  parsed_place_name: 'Lužec',
  parsed_raw_text: 'Plus na další fakturu 2 basy 0,33',
  parsed_items: [
    { qty: 40, degree: '12°', beer_id: 'b-12', pkg_id: 'p-033', beer_name: '12° Světlá', package_label: '0.33l', raw_line: 'Plus 2 basy 0,33' },
  ],
  ...extra,
} as unknown as WhatsAppIncoming);

function renderModal(message: WhatsAppIncoming) {
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

const upozorneniNaCekani = () => screen.queryByTestId('odpoved-ceka-na-zpravu');
const NAPOJENO_BANNER = /Tohle je odpověď — upraví už existující objednávku/;

describe('WhatsAppOrderReviewModal — odpověď a stejně znějící zprávy z minulých týdnů', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    vi.clearAllMocks();
    h.zpravy = [MINULY, TENTO];
  });

  it('Lužec 3. 11.: odpověď visí na objednávce z 26. 10., ale patří k nové zprávě, která čeká → napojení se zruší a nahoře to stojí', async () => {
    renderModal(odpoved({ amends_order_id: 'ord-26-10', amends_message_id: 'm-26-10' }));

    await waitFor(() => expect(napojNaObjednavku).toHaveBeenCalledWith('odpoved-1', null, 'm-03-11'));
    const upozorneni = await screen.findByTestId('odpoved-ceka-na-zpravu');
    expect(within(upozorneni).getByText(/patří k novější zprávě, která ještě není schválená/)).toBeTruthy();
    expect(within(upozorneni).getByText(/3\. 11\. 13:45/)).toBeTruthy();
    // Obsluha se dozví i to, že se napojení na starou objednávku zrušilo.
    expect(screen.getByText(/napojení jsem zrušil/)).toBeTruthy();
    // Odpověď už „neupravuje existující objednávku" — nepřidá se k žádné.
    await waitFor(() => expect(screen.queryByText(NAPOJENO_BANNER)).toBeNull());
    // Nikdy se nepřepojuje na starou objednávku.
    expect(napojNaObjednavku).not.toHaveBeenCalledWith('odpoved-1', 'ord-26-10', expect.anything());
  });

  it('nová zpráva už má objednávku → odpověď se přepojí na ni (ne na objednávku z minulého týdne)', async () => {
    h.zpravy = [MINULY, TENTO_SCHVALENY];
    renderModal(odpoved({ amends_order_id: 'ord-26-10', amends_message_id: 'm-26-10' }));

    await waitFor(() => expect(napojNaObjednavku).toHaveBeenCalledWith('odpoved-1', 'ord-03-11', 'm-03-11'));
    expect(upozorneniNaCekani()).toBeNull();
    expect(napojNaObjednavku).toHaveBeenCalledTimes(1);
  });

  it('server odpověď správně nenapojil (nová zpráva čeká) → nic se nezapisuje, nahoře stojí upozornění', async () => {
    renderModal(odpoved({ amends_order_id: null, amends_message_id: 'm-03-11' }));

    expect(await screen.findByTestId('odpoved-ceka-na-zpravu')).toBeTruthy();
    expect(napojNaObjednavku).not.toHaveBeenCalled();
  });

  it('napojení z citace sedí (citovaná je jen zpráva z minulého týdne) → nic se nemění a žádné upozornění', async () => {
    h.zpravy = [MINULY];
    renderModal(odpoved({ amends_order_id: 'ord-26-10', amends_message_id: 'm-26-10' }));

    await screen.findByText(NAPOJENO_BANNER);
    expect(napojNaObjednavku).not.toHaveBeenCalled();
    expect(upozorneniNaCekani()).toBeNull();
  });

  it('napojení vybrala obsluha ručně na jinou objednávku → nepřebíjí se', async () => {
    renderModal(odpoved({ amends_order_id: 'ord-jina', amends_message_id: 'm-26-10' }));

    await screen.findByText(NAPOJENO_BANNER);
    await waitFor(() => expect(napojNaObjednavku).not.toHaveBeenCalled());
    // Je napojená, tak se upozornění na čekající zprávu neukazuje.
    expect(upozorneniNaCekani()).toBeNull();
  });

  it('novější zpráva stejného znění je ignorovaná → odpověď patří k objednávce ze starší', async () => {
    h.zpravy = [MINULY, { ...TENTO, status: 'ignored' }];
    renderModal(odpoved({ amends_order_id: null }));

    await waitFor(() => expect(napojNaObjednavku).toHaveBeenCalledWith('odpoved-1', 'ord-26-10', 'm-26-10'));
    expect(upozorneniNaCekani()).toBeNull();
  });
});
