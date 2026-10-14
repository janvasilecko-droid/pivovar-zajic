// 🛢️ „Egon od důchodců prosím 20l 12sv do jejich sudu“ (14. 10. 2026, majitel:
// „v objednávce Egon je napsáno do vlastního sudu, v tom případě logicky
// nemusíš psát, že není malý sud — to se děje u některých zákazníků, že si
// donesou vlastní sud, je to v objednávce napsané“).
//
// Okno kontroly nesmí u takové zprávy hlásit „Nejsou sudy“ (malé sudy
// pivovaru se pro ni nepočítají) a při schválení má k objednávce připsat
// poznámku „do vlastního sudu“, podle které to pozná zbytek appky.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

// Pivovar nemá žádný prázdný 20l sud — obyčejná objednávka na 1× 20 l by dostala „Nejsou sudy“.
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: { p20: 0 }, zapocitatPlne: new Set(), nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({
    souhrn: [{ package_id: 'p20', mame: 0, objednano: 0, nad: 0 }],
    nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true, jmenaPiv: new Map(),
  }),
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
const packages: any[] = [{ id: 'p20', label: '20l', kind: 'keg', volume_l: 20 }];
const places: any[] = [{ id: 'pl-egon', name: 'EGON' }];

const EGON = 'Egon od duchodcu prosim 20l 12sv do jejich sudu';
const zprava = (text: string, extra: Record<string, unknown> = {}): any => ({
  id: 'egon-1',
  sender_name: 'Objednávky pivovar',
  message_text: text,
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-14T07:50:00+00:00',
  parsed_place_id: 'pl-egon',
  parsed_place_name: 'EGON',
  parsed_items: [{ beer_id: 'b-12', pkg_id: 'p20', qty: 1, degree: null, beer_name: '12° Světlá', package_label: '20l', raw_line: text }],
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

describe('WhatsAppOrderReviewModal — „do jejich sudu“', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
  });

  it('bez zmínky o vlastním sudu hlásí, že pro 20l nejsou sudy (kontrola, že mock funguje)', async () => {
    renderModal(zprava('Egon prosim 20l 12sv'));
    await waitFor(() => expect(screen.getByText(/Nejsou sudy/)).toBeTruthy());
    expect(screen.queryByText('Do vlastního sudu odběratele')).toBeNull();
  });

  it('„do jejich sudu“: žádné „Nejsou sudy“ a zaškrtnuté „Do vlastního sudu odběratele“', async () => {
    renderModal(zprava(EGON));
    await waitFor(() => expect(screen.getByText('Do vlastního sudu odběratele')).toBeTruthy());
    expect(screen.queryByText(/Nejsou sudy/)).toBeNull();
    const zaskrtavatko = screen.getByRole('checkbox', { name: /Do vlastního sudu odběratele/ }) as HTMLInputElement;
    expect(zaskrtavatko.checked).toBe(true);
  });

  it('odškrtnutí vrátí hlídání malých sudů', async () => {
    renderModal(zprava(EGON));
    const zaskrtavatko = (await screen.findByRole('checkbox', { name: /Do vlastního sudu odběratele/ })) as HTMLInputElement;
    fireEvent.click(zaskrtavatko);
    await waitFor(() => expect(screen.getByText(/Nejsou sudy/)).toBeTruthy());
  });

  it('fotka: „do jejich sudu“ v přepisu od AI stačí', async () => {
    renderModal(zprava('', { message_type: 'image', media_url: null, parsed_raw_text: 'Egon 20l 12sv do jejich sudu' }));
    await waitFor(() => expect(screen.getByText('Do vlastního sudu odběratele')).toBeTruthy());
    expect(screen.queryByText(/Nejsou sudy/)).toBeNull();
  });

  it('schválení připíše k objednávce poznámku „do vlastního sudu“', async () => {
    const { onApprove } = renderModal(zprava(EGON, { parsed_note: '+ výčep jednokohout' }));
    await screen.findByText('Do vlastního sudu odběratele');
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0].parsed_note).toBe('+ výčep jednokohout; do vlastního sudu');
  });

  it('po odškrtnutí se poznámka nepřipisuje', async () => {
    const { onApprove } = renderModal(zprava(EGON, { parsed_note: null }));
    fireEvent.click(await screen.findByRole('checkbox', { name: /Do vlastního sudu odběratele/ }));
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    // „Nejsou sudy“ není důvod k dotazu při schválení — jen nesoulad čtení; ten tu není.
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0].parsed_note ?? null).toBeNull();
  });

  it('obyčejná objednávka dostane poznámku beze změny', async () => {
    const { onApprove } = renderModal(zprava('Egon prosim 20l 12sv', { parsed_note: 'vratný sud' }));
    await screen.findByText(/Nejsou sudy/);
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0].parsed_note).toBe('vratný sud');
  });
});
