// „Naučit" u opravené položky (23. 11. 2026, majitel: „pokud se něco přečte
// nesprávně, přidej tam možnost tlačítko naučit; pokud to uživatel opraví a bude
// chtít, aby si AI pamatovala tu opravu, tak to může zakliknout a appka si to
// bude na příště pamatovat").
//
// Zaškrtávátko se nabídne jen u položky, kterou člověk změnil proti přečtenému,
// a jen když jde o chybu čtení — ne o záměnu proti tomu, co v řádku výslovně
// stojí. Zapamatuje se až po schválení, pro odběratele, u kterého objednávka skončila.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';
import { ulozNauceneOpravy } from '../lib/nauceneOpravy';
import { chyba, uspech } from '../lib/toast';

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  const dotaz = () => {
    const q: Record<string, any> = {};
    for (const m of ['select', 'eq', 'in', 'lt', 'gte', 'order', 'limit', 'range', 'not']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    return q;
  };
  const supabase = { from: vi.fn(() => dotaz()) };
  return { supabase, fetchAllRows: () => supabase.from().select() };
});
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/whatsappParser', () => ({ parseWhatsAppOrderMessageWithAI: vi.fn() }));
vi.mock('../lib/nauceneOpravy', async () => ({
  ...(await vi.importActual<typeof import('../lib/nauceneOpravy')>('../lib/nauceneOpravy')),
  ulozNauceneOpravy: vi.fn(),
}));
vi.mock('../lib/toast', async () => ({
  ...(await vi.importActual<typeof import('../lib/toast')>('../lib/toast')),
  chyba: vi.fn(),
  uspech: vi.fn(),
}));

const beers: any[] = [
  { id: 'b-12', name: '12° Světlá', degree: '12°' },
  { id: 'b-10', name: '10° Desítka', degree: '10°' },
  { id: 'b-hazy', name: 'Hazy Spring Day', degree: null },
  { id: 'b-winter', name: 'winter', degree: '12' },
];
const packages: any[] = [
  { id: 'p-05', label: '0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'p-033', label: '0.33l', kind: 'bottle', volume_l: 0.33 },
  { id: 'p-20', label: '20l', kind: 'keg', volume_l: 20 },
  { id: 'p-15', label: ' 15l', kind: 'keg', volume_l: 15 },
  { id: 'p-1', label: '1l', kind: 'bottle', volume_l: 1 },
];
const zprava = (navic: Record<string, unknown> = {}): any => ({
  id: 'zprava-naucit',
  sender_name: 'Objednávky pivovar',
  message_text: 'Lužec\n5 beden světlého\n3x 20l desitka\n10 petek Hazy\n10x zajíc 1l',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-11-09T07:42:00+00:00',
  parsed_place_id: 'm-luzec',
  parsed_place_name: 'Lužec',
  parsed_delivery_day: 'pa',
  parsed_items: [
    { qty: 100, degree: '12°', beer_id: 'b-12', pkg_id: 'p-05', beer_name: '12° Světlá', package_label: '0.5l', raw_line: '5 beden světlého' },
    { qty: 3, degree: '10°', beer_id: 'b-10', pkg_id: 'p-20', beer_name: '10° Desítka', package_label: '20l', raw_line: '3x 20l desitka' },
    { qty: 10, degree: null, beer_id: 'b-hazy', pkg_id: 'p-1', beer_name: 'Hazy Spring Day', package_label: '1l', raw_line: '10 petek Hazy' },
    { qty: 10, degree: null, beer_id: null, pkg_id: 'p-1', beer_name: null, package_label: '1l', raw_line: '10x zajíc 1l' },
  ],
  parsed_raw_text: 'Lužec\n5 beden světlého\n3x 20l desitka\n10 petek Hazy\n10x zajíc 1l',
  ...navic,
});

function otevri(message = zprava()) {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  render(
    <WhatsAppOrderReviewModal
      isOpen
      onClose={vi.fn()}
      message={message}
      beers={beers}
      packages={packages}
      places={[{ id: 'm-luzec', name: 'Lužec' }] as any}
      onApprove={onApprove}
      onReject={vi.fn().mockResolvedValue(undefined)}
      onDecision={vi.fn()}
    />,
  );
  return { onApprove };
}
const nacteno = () => waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(4));
const piva = () => screen.getAllByTitle('Pivo') as HTMLSelectElement[];
const obaly = () => screen.getAllByTitle('Obal / objem') as HTMLSelectElement[];
const naucit = () => screen.queryAllByRole('checkbox', { name: /Naučit/ }) as HTMLInputElement[];
const schval = () => fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
const uloz = ulozNauceneOpravy as unknown as ReturnType<typeof vi.fn>;

describe('WhatsAppOrderReviewModal — „Naučit" u opravené položky', () => {
  beforeEach(() => {
    localStorage.clear();
    window.confirm = vi.fn(() => true);
    vi.clearAllMocks();
    uloz.mockResolvedValue({ ulozeno: 0, chyba: null });
  });

  it('dokud člověk nic neopraví, žádné „Naučit" v okně není', async () => {
    otevri();
    await nacteno();
    expect(naucit()).toHaveLength(0);
    expect(screen.queryByTestId('naucit-nelze')).toBeNull();
  });

  it('oprava velikosti lahve: nabídne se „Naučit" (nezaškrtnuté) se jménem odběratele; po vrácení zmizí', async () => {
    otevri();
    await nacteno();
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });
    expect(naucit()).toHaveLength(1);
    expect(naucit()[0].checked).toBe(false);
    expect(screen.getByText(/příště takhle číst u odběratele Lužec/)).toBeTruthy();

    fireEvent.click(naucit()[0]);
    expect(naucit()[0].checked).toBe(true);
    // zpátky na přečtený obal → není co učit a zaškrtnutí se nepřenese na příští opravu
    fireEvent.change(obaly()[0], { target: { value: 'p-05' } });
    expect(naucit()).toHaveLength(0);
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });
    expect(naucit()[0].checked).toBe(false);
  });

  it('bez zaškrtnutí se po schválení nic nezapamatuje', async () => {
    const { onApprove } = otevri();
    await nacteno();
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });
    schval();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(uloz).toHaveBeenCalledTimes(1));
    expect(uloz).toHaveBeenCalledWith([]);
    expect(uspech).not.toHaveBeenCalled();
  });

  it('se zaškrtnutím se po schválení zapamatuje právě ta oprava — pro odběratele objednávky a jen to, co se změnilo', async () => {
    uloz.mockResolvedValue({ ulozeno: 2, chyba: null });
    const { onApprove } = otevri();
    await nacteno();
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });   // bedny → třetinky
    fireEvent.change(piva()[3], { target: { value: 'b-12' } });      // zajíc → 12° Světlá
    fireEvent.change(obaly()[1], { target: { value: 'p-15' } });     // záměna 20 l → 15 l (neučí se)
    for (const z of naucit()) fireEvent.click(z);
    expect(uloz).not.toHaveBeenCalled(); // až po schválení

    schval();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(uloz).toHaveBeenCalledTimes(1));
    expect(uloz.mock.calls[0][0]).toEqual([
      { misto_klic: 'm-luzec', place_id: 'm-luzec', place_name: 'Lužec', radek: '5 beden světlého', klic: 'beden svetleho', beer_id: null, package_id: 'p-033', created_by: null },
      { misto_klic: 'm-luzec', place_id: 'm-luzec', place_name: 'Lužec', radek: '10x zajíc 1l', klic: 'zajic 1l', beer_id: 'b-12', package_id: null, created_by: null },
    ]);
    // Objednávka dostala všechny tři změny, i tu, která se neučí.
    expect(onApprove.mock.calls[0][0].parsed_items).toMatchObject([
      { pkg_id: 'p-033' }, { pkg_id: 'p-15' }, { beer_id: 'b-hazy' }, { beer_id: 'b-12' },
    ]);
    expect(uspech).toHaveBeenCalledWith('Zapamatováno pro příště: 2 opravy.');
  });

  it('záměna proti tomu, co v řádku stojí (20 l → 15 l, Hazy → Winter), se naučit nedá — okno řekne proč', async () => {
    otevri();
    await nacteno();
    fireEvent.change(obaly()[1], { target: { value: 'p-15' } });
    fireEvent.change(piva()[2], { target: { value: 'b-winter' } });
    expect(naucit()).toHaveLength(0);
    const duvody = screen.getAllByTestId('naucit-nelze').map((e) => e.textContent);
    expect(duvody).toEqual([
      'V řádku stojí 20 l — oprava platí jen pro tuhle objednávku.',
      'V řádku stojí Hazy Spring Day — oprava platí jen pro tuhle objednávku.',
    ]);
  });

  it('odpověď upravující objednávku (výsledný stav s textem citované zprávy) se neučí', async () => {
    const m = zprava({ amends_order_id: 'obj-1', quoted_text: 'Lužec 5 beden světlého' });
    m.parsed_items = m.parsed_items.map((p: Record<string, unknown>) => ({ ...p, plny_stav: true }));
    otevri(m);
    await nacteno();
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });
    expect(naucit()).toHaveLength(0);
    expect(screen.getByTestId('naucit-nelze').textContent).toMatch(/citované/);
  });

  it('zapamatování selže (chybí migrace) → objednávka je schválená a člověk se to dozví', async () => {
    uloz.mockResolvedValue({ ulozeno: 0, chyba: 'v databázi chybí tabulka pro naučené opravy' });
    const { onApprove } = otevri();
    await nacteno();
    fireEvent.change(obaly()[0], { target: { value: 'p-033' } });
    fireEvent.click(naucit()[0]);
    schval();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(chyba).toHaveBeenCalledWith('Objednávka je schválená, ale zapamatování oprav se nepovedlo: v databázi chybí tabulka pro naučené opravy'));
    expect(screen.getByText('Objednávka byla schválena a importována!')).toBeTruthy();
  });

  it('ručně přidaný řádek „Naučit" nenabízí — nic se u něj nečetlo', async () => {
    otevri();
    await nacteno();
    fireEvent.click(screen.getByText('Přidat řádek'));
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(5));
    fireEvent.change(piva()[4], { target: { value: 'b-12' } });
    fireEvent.change(obaly()[4], { target: { value: 'p-20' } });
    expect(naucit()).toHaveLength(0);
    expect(screen.queryByTestId('naucit-nelze')).toBeNull();
  });
});
