// 📅 Den závozu v kontrolním okně WhatsApp zprávy.
//
// 29. 10. 2026 (čtvrtek): „martin 1x10l 11sv“ skončilo na středě 4. 11. — okno si
// den doplnilo ze ZVYKLOSTÍ odběratele (Martin bere obvykle ve středu). Ze
// zvyklostí se den nedoplňuje dál.
//
// 17. 11. 2026, majitel: „u objednávek nastav primárně závoz středa, pokud není
// jinak označeno ve zprávě — objednávka typu 2x30 se automaticky označí středa,
// ale uživatel si ji může změnit; pokud tam bude 2x30 na pátek, označí se pátek.“
// Zpráva bez dne proto dostane VÝCHOZÍ den odběratele (středa; Seeberg a Lužec
// pátek — „u objednávek Seeberg, Lužec dávej automaticky objednávky na pátek";
// Restaurace a Prodejna žádný — stejné pravidlo jako databáze, která ho dosud
// doplnila potichu až po schválení). Je vidět předem a jde změnit.
//
// 23. 11. 2026: Martin, Egon, Jitka, Toužim, Mates, Restaurace a Terasa jsou
// automaticky BEZ ZÁVOZU — zpráva bez dne se u nich odečte dnes, ne ve výchozí
// den závozu (viz WhatsAppOrderReviewModal.bez-zavozu.test.tsx). Tenhle soubor
// proto zkouší výchozí den na odběrateli SE závozem („Hospoda U Lípy") a „bez
// výchozího dne" na Prodejně — dřív na Martinovi a Restauraci.
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
  // Řetězitelný dotaz bez dat (okno se u odpovědi na objednávku ptá i na ni).
  const stub = () => {
    const q: any = {
      then: (ok: any, ko: any) => Promise.resolve({ data: [], error: null }).then(ok, ko),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    for (const m of ['select', 'eq', 'lt', 'in', 'order', 'limit']) q[m] = () => q;
    return q;
  };
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
const places: any[] = [
  { id: 'pl-lipa', name: 'Hospoda U Lípy' },
  { id: 'pl-prodejna', name: 'Prodejna', vychozi_den_zavozu: 'zadny' },
  { id: 'pl-seeberg', name: 'Seeberg', vychozi_den_zavozu: 'pa' },
];

const zprava = (extra: Record<string, unknown> = {}): any => ({
  id: 'lipa-1',
  sender_name: 'Objednávky pivovar',
  message_text: 'lipa 1x10l 11sv',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-10-29T08:10:00+00:00',
  parsed_place_id: 'pl-lipa',
  parsed_place_name: 'Hospoda U Lípy',
  parsed_delivery_day: null,
  parsed_delivery_date: null,
  parsed_items: [{ beer_id: 'b-11', pkg_id: 'p10', qty: 1, degree: null, beer_name: '11° Světlá', package_label: '10l', raw_line: '1x10l 11sv' }],
  parsed_raw_text: 'lipa 1x10l 11sv',
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

describe('WhatsAppOrderReviewModal — výchozí den závozu (středa) a den ze zprávy', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    h.nactiZvyklosti.mockReset();
    // Zvyklost odběratele je PÁTEK — den z ní se brát nesmí.
    h.nactiZvyklosti.mockResolvedValue({ obvyklyDen: 'pa', obvyklyZavoz: null, obvykleMnozstvi: new Map(), objednavek: 8 });
  });

  const pockejNaZvyklosti = async () => {
    await waitFor(() => expect(h.nactiZvyklosti).toHaveReturned());
    await new Promise((r) => setTimeout(r, 30));
  };

  it('zpráva bez dne („1x10l 11sv“): označí se výchozí středa a je vidět, že jde o výchozí den', async () => {
    renderModal(zprava());
    await pockejNaZvyklosti();

    expect(jeZmacknuto('St')).toBe(true);
    // Ve čtvrtek 29. 10. je nejbližší středa 4. 11.
    expect(screen.getByText(/st 4\. 11\./)).toBeTruthy();
    expect(screen.getByText(/výchozí den, jde změnit/)).toBeTruthy();
    expect(screen.queryByText('nevybráno')).toBeNull();
  });

  it('zvyklosti odběratele (obvyklý pátek) den neurčují — platí výchozí středa', async () => {
    renderModal(zprava());
    await pockejNaZvyklosti();

    expect(jeZmacknuto('Pá')).toBe(false);
    expect(jeZmacknuto('St')).toBe(true);
    expect(screen.queryByText(/obvyklý den odběratele/)).toBeNull();
  });

  it('schválení pošle výchozí středu i s datem — stejně, jak by ji doplnila databáze', async () => {
    const { onApprove } = renderModal(zprava());
    await pockejNaZvyklosti();

    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-04' });
  });

  it('den napsaný ve zprávě má přednost: „2x30 na pátek“ označí pátek (i když ho server nepřečetl)', async () => {
    renderModal(zprava({ message_text: 'lipa 2x30 na pátek', parsed_raw_text: 'lipa 2x30 na pátek' }));
    await waitFor(() => expect(screen.getByText(/pá 30\. 10\./)).toBeTruthy());
    expect(jeZmacknuto('Pá')).toBe(true);
    expect(jeZmacknuto('St')).toBe(false);
    expect(screen.queryByText(/výchozí den/)).toBeNull();
  });

  it('den napsaný ve zprávě platí dál (ve čtvrtek „na středu“ = 4. 11.) a není označený jako výchozí', async () => {
    renderModal(zprava({ message_text: 'lipa na stredu 1x10l 11sv', parsed_delivery_day: 'st' }));
    await waitFor(() => expect(screen.getByText(/st 4\. 11\./)).toBeTruthy());
    expect(jeZmacknuto('St')).toBe(true);
    expect(screen.queryByText(/výchozí den/)).toBeNull();
  });

  it('den vybraný rukou platí a výchozí středu nahradí', async () => {
    const { onApprove } = renderModal(zprava());
    await pockejNaZvyklosti();
    fireEvent.click(screen.getByRole('button', { name: 'Pá' }));
    await waitFor(() => expect(screen.getByText(/pá 30\. 10\./)).toBeTruthy());
    expect(jeZmacknuto('St')).toBe(false);
    expect(screen.queryByText(/výchozí den/)).toBeNull();
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'pa', parsed_delivery_date: '2026-10-30' });
  });

  it('klepnutí na označenou výchozí středu ji nezruší — objednávka by ji stejně dostala', async () => {
    const { onApprove } = renderModal(zprava());
    await pockejNaZvyklosti();
    fireEvent.click(screen.getByRole('button', { name: 'St' }));
    expect(jeZmacknuto('St')).toBe(true);
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-04' });
  });

  it('odběratel bez výchozího dne (Prodejna): zůstane nevybráno a schválení pošle bez dne i data', async () => {
    const { onApprove } = renderModal(zprava({ parsed_place_id: 'pl-prodejna', parsed_place_name: 'Prodejna', message_text: 'prodejna 1x10l 11sv', parsed_raw_text: 'prodejna 1x10l 11sv' }));
    await pockejNaZvyklosti();

    expect(screen.getByText('nevybráno')).toBeTruthy();
    expect(jeZmacknuto('St')).toBe(false);
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: null, parsed_delivery_date: null });
  });

  // 17. 11. 2026: „u objednávek Seeberg, Lužec dávej automaticky objednávky na pátek".
  it('Seeberg bez dne ve zprávě: označí se výchozí pátek a schválení ho pošle i s datem', async () => {
    const seeberg = { parsed_place_id: 'pl-seeberg', parsed_place_name: 'Seeberg', message_text: 'seeberg 1x10l 11sv', parsed_raw_text: 'seeberg 1x10l 11sv' };
    const { onApprove } = renderModal(zprava(seeberg));
    await pockejNaZvyklosti();

    expect(jeZmacknuto('Pá')).toBe(true);
    expect(jeZmacknuto('St')).toBe(false);
    // Ve čtvrtek 29. 10. je nejbližší pátek 30. 10.
    expect(screen.getByText(/pá 30\. 10\./)).toBeTruthy();
    expect(screen.getByText(/výchozí den, jde změnit/)).toBeTruthy();
    schvalit();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    expect(onApprove.mock.calls[0][0]).toMatchObject({ parsed_delivery_day: 'pa', parsed_delivery_date: '2026-10-30' });
  });

  it('Seeberg s dnem ve zprávě („na úterý“): platí den ze zprávy, ne výchozí pátek', async () => {
    renderModal(zprava({ parsed_place_id: 'pl-seeberg', parsed_place_name: 'Seeberg', message_text: 'seeberg 1x10l 11sv na úterý', parsed_raw_text: 'seeberg 1x10l 11sv na úterý' }));
    await waitFor(() => expect(screen.getByText(/út 3\. 11\./)).toBeTruthy());
    expect(jeZmacknuto('Út')).toBe(true);
    expect(jeZmacknuto('Pá')).toBe(false);
    expect(screen.queryByText(/výchozí den/)).toBeNull();
  });

  it('odpověď, která doplňuje existující objednávku, výchozí den neukazuje (den objednávky se nemění)', async () => {
    renderModal(zprava({ amends_order_id: 'obj-1', message_text: 'plus 1x10l 11sv', parsed_raw_text: 'plus 1x10l 11sv' }));
    await pockejNaZvyklosti();
    expect(jeZmacknuto('St')).toBe(false);
    expect(screen.queryByText(/výchozí den/)).toBeNull();
  });
});
