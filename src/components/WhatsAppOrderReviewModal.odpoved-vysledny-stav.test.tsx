// ↩️ Odpověď, která upravuje objednávku, v kontrolním okně.
//
// 17. 11. 2026 (Malešice), majitel: „Objevilo se tam 2x50 jantar … zjisti
// proč a udělej to, ať se to neopakuje." Na objednávku
//   „Malesice
//    • SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)
//    • Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc."
// přišla odpověď „Bude bez pet 1,5l. 12cky". AI vrátila výsledný stav
// objednávky (čtyři položky) a ke každé přiložila CELOU citovanou zprávu.
// Slovo „Jantar" z jejího druhého řádku pak přepsalo pivo u všech položek —
// na serveru i tady v okně (pojistka „pivo napsané v řádku jménem") — a do
// objednávky přibylo 2× 50 l Jantar.
//
// Okno proto u řádků výsledného stavu, které nesou text CITOVANÉ zprávy,
// nechává pivo tak, jak ho určil server, počet u výsledného stavu z textu
// neopravuje vůbec (je to výsledek úpravy, ne opis) a značku „výsledný stav"
// (plny_stav) předá dál do importu, aby zápis počítal stejně jako náhled.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { updateWhatsAppParsedData, type WhatsAppIncoming } from '../lib/whatsappApi';
import { slozNavrh } from '../lib/whatsappAmendment';
import type { Beer, Package, Place } from '../lib/supabase';

type Polozka = NonNullable<WhatsAppIncoming['parsed_items']>[number];
type Objednavka = { place_name: string; items: { beer_id: string; package_id: string; quantity: number }[] };

const h = vi.hoisted(() => ({ objednavka: null as unknown }));

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  // Řetězitelný dotaz: upravovaná objednávka má obsah, ostatní tabulky jsou prázdné.
  const stub = (tabulka: string) => {
    const q: Record<string, unknown> = {
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko),
      maybeSingle: () => Promise.resolve({ data: tabulka === 'orders' ? h.objednavka : null, error: null }),
    };
    for (const m of ['select', 'eq', 'lt', 'in', 'order', 'limit']) q[m] = () => q;
    return q;
  };
  return { supabase: { from: vi.fn((tabulka: string) => stub(tabulka)) } };
});
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/whatsappParser', () => ({
  parseWhatsAppOrderMessageWithAI: vi.fn(),
}));

const beers = [
  { id: 'b-12', name: '12° Světlá', degree: '12°' },
  { id: 'b-jantar', name: 'Jantar', degree: null },
] as unknown as Beer[];
const packages = [
  { id: 'p50', label: '50l', kind: 'keg', volume_l: 50 },
  { id: 'p30', label: '30l', kind: 'keg', volume_l: 30 },
  { id: 'p15', label: '1.5l', kind: 'bottle', volume_l: 1.5 },
] as unknown as Package[];
const places = [{ id: 'pl-malesice', name: 'Malešice' }] as unknown as Place[];

const PUVODNI = 'Malesice\n•⁠  ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)\n•⁠  Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';
/** Tak AI přiložila citovanou zprávu k položkám — celou, na jednom řádku. */
const CITACE = 'Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) •⁠ Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';
const RADEK_SV = 'Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)';

const OBJEDNAVKA: Objednavka = {
  place_name: 'Malešice',
  items: [
    { beer_id: 'b-12', package_id: 'p50', quantity: 2 },
    { beer_id: 'b-12', package_id: 'p30', quantity: 2 },
    { beer_id: 'b-12', package_id: 'p15', quantity: 12 },
    { beer_id: 'b-jantar', package_id: 'p30', quantity: 2 },
    { beer_id: 'b-jantar', package_id: 'p15', quantity: 12 },
  ],
};

const odpoved = (text: string, polozky: Polozka[]): WhatsAppIncoming => ({
  id: 'odpoved-1',
  sender_name: 'Objednávky pivovar',
  message_text: text,
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-11-17T10:00:38+00:00',
  quoted_text: PUVODNI,
  amends_order_id: 'obj-malesice',
  amends_message_id: 'puvodni-zprava',
  parsed_place_id: 'pl-malesice',
  parsed_place_name: 'Malešice',
  parsed_raw_text: text,
  parsed_items: polozky.map((p) => ({ plny_stav: true, ...p })),
} as unknown as WhatsAppIncoming);

const sv = (qty: number, pkg: string, label: string, raw: string): Polozka =>
  ({ qty, degree: '12°', beer_id: 'b-12', pkg_id: pkg, beer_name: '12° Světlá', package_label: label, raw_line: raw });
const jantar = (qty: number, pkg: string, label: string, raw: string): Polozka =>
  ({ qty, degree: null, beer_id: 'b-jantar', pkg_id: pkg, beer_name: 'Jantar', package_label: label, raw_line: raw });

function renderModal(message: WhatsAppIncoming) {
  const onApprove = vi.fn<(zprava: WhatsAppIncoming) => Promise<void>>().mockResolvedValue(undefined);
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

const pivaVRadcich = () => (screen.getAllByTitle('Pivo') as HTMLSelectElement[]).map((s) => s.value);
const pocty = () => (screen.getAllByTitle('Počet kusů') as HTMLInputElement[]).map((i) => i.value);

/** Co import z předané zprávy složí — stejný výpočet jako handleApproveWhatsAppOrder v Orders.tsx. */
const polozky = (zprava: WhatsAppIncoming): Polozka[] => zprava.parsed_items ?? [];
const coZapiseImport = (zprava: WhatsAppIncoming) =>
  slozNavrh({
    soucasne: OBJEDNAVKA.items,
    zOdpovedi: polozky(zprava).map((i) => ({ beer_id: i.beer_id ?? null, package_id: i.pkg_id ?? null, quantity: i.qty ?? 0 })),
    text: zprava.message_text,
    obaly: packages,
    zOdpovediJePlnyStav: polozky(zprava).some((i) => i.plny_stav),
    zpusob: zprava.zpusob_napojeni,
  }).map((i) => `${i.quantity}× ${beers.find((b) => b.id === i.beer_id)?.name} ${packages.find((p) => p.id === i.package_id)?.label}`);
/** Položky, které okno při schválení zapsalo zpět do zprávy v databázi. */
const ulozenePolozky = (): Polozka[] => {
  const volani = vi.mocked(updateWhatsAppParsedData).mock.calls.find((c) => c[0] === 'odpoved-1' && Array.isArray(c[1]?.parsedItems));
  return (volani?.[1]?.parsedItems ?? []) as Polozka[];
};

describe('WhatsAppOrderReviewModal — odpověď s výsledným stavem objednávky', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    vi.clearAllMocks();
    h.objednavka = OBJEDNAVKA;
  });

  it('Malešice 17. 11.: „Jantar" z citované zprávy nepřepíše sudy 12° Světlé a nic nepřibude', async () => {
    const { onApprove } = renderModal(odpoved('Bude bez pet 1,5l. 12cky', [
      sv(2, 'p50', '50l', CITACE),
      sv(2, 'p30', '30l', CITACE),
      jantar(2, 'p30', '30l', CITACE),
      jantar(12, 'p15', '1.5l', CITACE),
    ]));

    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(4));
    expect(pivaVRadcich()).toEqual(['b-12', 'b-12', 'b-jantar', 'b-jantar']);
    expect(pocty()).toEqual(['2', '2', '2', '12']);

    // Náhled úpravy: odebere se jen 12× 1,5 l 12° Světlé, nic nového nepřibude.
    await waitFor(() => expect(screen.getByText('12 ks → odebrat')).toBeTruthy());
    expect(screen.queryByText(/— nově/)).toBeNull();

    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const zprava = onApprove.mock.calls[0][0];
    expect(zprava.amends_order_id).toBe('obj-malesice');
    expect(polozky(zprava).map((i) => `${i.qty}× ${i.beer_id} ${i.pkg_id}`)).toEqual([
      '2× b-12 p50', '2× b-12 p30', '2× b-jantar p30', '12× b-jantar p15',
    ]);
    expect(coZapiseImport(zprava)).toEqual(['2× 12° Světlá 50l', '2× 12° Světlá 30l', '2× Jantar 30l', '12× Jantar 1.5l']);
  });

  it('počet změněný odpovědí se nevrátí na číslo z citované zprávy', async () => {
    // „Těch padesátek budou 3" — AI vrátila 3× 50 l, ale k položce přiložila řádek citace s „2x50l".
    renderModal(odpoved('Tech padesatek budou 3', [
      sv(3, 'p50', '50l', RADEK_SV),
      sv(2, 'p30', '30l', RADEK_SV),
      sv(12, 'p15', '1.5l', RADEK_SV),
      jantar(2, 'p30', '30l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
      jantar(12, 'p15', '1.5l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
    ]));
    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(5));
    expect(pocty()).toEqual(['3', '2', '12', '2', '12']);
    expect(screen.queryByText(/Počet opraven podle textu zprávy/)).toBeNull();
  });

  it('pivo změněné odpovědí se nevrátí na jméno z citované zprávy', async () => {
    // „Misto jantaru v petkach dej svetlou" — řádek „Jantar 12 = …" z citace, pivo od serveru 12° Světlá.
    renderModal(odpoved('Misto jantaru v petkach dej svetlou', [
      sv(2, 'p50', '50l', RADEK_SV),
      sv(2, 'p30', '30l', RADEK_SV),
      jantar(2, 'p30', '30l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
      sv(24, 'p15', '1.5l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
    ]));
    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(4));
    expect(pivaVRadcich()).toEqual(['b-12', 'b-12', 'b-jantar', 'b-12']);
    expect(pocty()).toEqual(['2', '2', '2', '24']);
  });

  it('řádek z textu odpovědi samé: jméno piva se dál čte z textu', async () => {
    // Nová položka: server ji podle stupně uložil jako 12° Světlou, v odpovědi ale stojí „jantar".
    renderModal(odpoved('Plus 3x30l jantar', [
      sv(2, 'p50', '50l', RADEK_SV),
      sv(3, 'p30', '30l', 'Plus 3x30l jantar'),
    ]));
    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(2));
    expect(pivaVRadcich()).toEqual(['b-12', 'b-jantar']);
    expect(pocty()).toEqual(['2', '3']);
  });

  // 12. 10. 2026 (Malešice): „ještě plus 1x50l" dalo 5× 50 l a zdvojené
  // ostatní řádky — výsledný stav od AI se k objednávce přičetl. Značka
  // plny_stav to řeší, ale při schválení se ze zprávy ztrácela: náhled
  // v okně počítal správně a zápis jinak.
  it('„ještě plus 1x50l": počet zůstane výsledný a značka „výsledný stav" přežije schválení — zápis složí totéž co náhled', async () => {
    // AI podle pokynu sečetla 2 + 1 a vrátila jednu položku 3× 50 l; jako zdroj uvedla text odpovědi.
    const { onApprove } = renderModal(odpoved('Jeste plus 1x50l 12sv', [
      sv(3, 'p50', '50l', 'Jeste plus 1x50l 12sv'),
      sv(2, 'p30', '30l', RADEK_SV),
      sv(12, 'p15', '1.5l', RADEK_SV),
      jantar(2, 'p30', '30l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
      jantar(12, 'p15', '1.5l', 'Jantar 12 = 2x30l KEG + 12x1,5l PET'),
    ]));
    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(5));
    // „1x50l" v textu je přídavek, ne počet položky — ta zůstává 3 a náhled ukáže 2 → 3.
    expect(pocty()).toEqual(['3', '2', '12', '2', '12']);
    expect(screen.queryByText(/Počet opraven podle textu zprávy/)).toBeNull();
    await waitFor(() => expect(screen.getByText('3 ks')).toBeTruthy());
    expect(screen.queryByText(/— nově/)).toBeNull();
    expect(screen.queryByText(/→ odebrat/)).toBeNull();

    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const zprava = onApprove.mock.calls[0][0];
    expect(polozky(zprava)).toHaveLength(5);
    expect(polozky(zprava).every((i) => i.plny_stav === true)).toBe(true);
    expect(coZapiseImport(zprava)).toEqual(['3× 12° Světlá 50l', '2× 12° Světlá 30l', '12× 12° Světlá 1.5l', '2× Jantar 30l', '12× Jantar 1.5l']);
    // …a stejně se uloží do zprávy (po zavření a otevření okna platí totéž).
    expect(ulozenePolozky()).toHaveLength(5);
    expect(ulozenePolozky().every((i) => i.plny_stav === true)).toBe(true);
  });

  it('tlačítko Přidat: náhled ukáže přičtení — totéž, co se pak zapíše', async () => {
    const { onApprove } = renderModal(odpoved('Bude bez pet 1,5l. 12cky', [
      sv(2, 'p50', '50l', CITACE),
      sv(2, 'p30', '30l', CITACE),
      jantar(2, 'p30', '30l', CITACE),
      jantar(12, 'p15', '1.5l', CITACE),
    ]));
    await waitFor(() => expect(screen.getByText('12 ks → odebrat')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Přidat' }));
    // Přičíst znamená nic neodebrat a položky ze zprávy přidat k tomu, co v objednávce je.
    await waitFor(() => expect(screen.queryByText('12 ks → odebrat')).toBeNull());
    expect(screen.getAllByText('4 ks')).toHaveLength(3);
    expect(screen.getByText('24 ks')).toBeTruthy();

    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const zprava = onApprove.mock.calls[0][0];
    expect(zprava.zpusob_napojeni).toBe('pridat');
    expect(coZapiseImport(zprava)).toEqual(['4× 12° Světlá 50l', '4× 12° Světlá 30l', '12× 12° Světlá 1.5l', '4× Jantar 30l', '24× Jantar 1.5l']);
  });

  it('„vytvořit NOVOU objednávku z odpovědi" značku výsledného stavu nenese', async () => {
    const { onApprove } = renderModal(odpoved('Bude bez pet 1,5l. 12cky', [
      sv(2, 'p50', '50l', CITACE),
      jantar(2, 'p30', '30l', CITACE),
    ]));
    await waitFor(() => expect(screen.queryAllByTitle('Pivo')).toHaveLength(2));
    fireEvent.click(screen.getByText(/Místo úpravy vytvořit NOVOU objednávku z odpovědi/));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    const zprava = onApprove.mock.calls[0][0];
    expect(zprava.amends_order_id).toBeNull();
    expect(polozky(zprava)).toHaveLength(2);
    expect(polozky(zprava).some((i) => i.plny_stav)).toBe(false);
  });
});
