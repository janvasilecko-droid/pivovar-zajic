// Oprava piva nebo obalu v kontrole přečtené zprávy nesmí potichu nic „učit".
//
// Do 23. 11. 2026 se z každé ruční změny uložila „naučená zkratka" (tabulka
// parser_aliases), i když šlo o záměnu jen pro tuhle objednávku: 3. 11. 2026
// (Sluhy) místo „10 petek Hazy" šel Winter → uložilo se „hazy spring day →
// winter"; 6. 10. 2026 (Maneo) místo dvacítky patnáctka → „20l → 15l".
// Čtečka ta pravidla dostávala jako nápovědu a další zprávy pak četla špatně.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

const stav = vi.hoisted(() => ({
  zapisy: [] as { tabulka: string; akce: string }[],
}));

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  const dotaz = (tabulka: string) => {
    const q: Record<string, any> = {};
    for (const m of ['select', 'eq', 'in', 'lt', 'gte', 'order', 'limit', 'range', 'not']) q[m] = () => q;
    for (const akce of ['insert', 'update', 'upsert', 'delete']) q[akce] = () => { stav.zapisy.push({ tabulka, akce }); return q; };
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.single = () => Promise.resolve({ data: null, error: null });
    q.then = (ok: (v: unknown) => unknown, chyba?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, chyba);
    return q;
  };
  const supabase = { from: vi.fn((tabulka: string) => dotaz(tabulka)) };
  return { supabase, fetchAllRows: (tabulka: string) => supabase.from(tabulka).select() };
});
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/whatsappParser', () => ({ parseWhatsAppOrderMessageWithAI: vi.fn() }));

const beers: any[] = [
  { id: 'b-hazy', name: 'Hazy Spring Day', degree: null, is_active: false },
  { id: 'b-winter', name: 'winter', degree: '12', is_active: true },
  { id: 'b-10', name: '10° Desítka', degree: '10°', is_active: true },
];
const packages: any[] = [
  { id: 'p-pet1', label: '1l', kind: 'bottle', volume_l: 1 },
  { id: 'p-keg20', label: '20l', kind: 'keg', volume_l: 20 },
  { id: 'p-keg15', label: ' 15l', kind: 'keg', volume_l: 15 },
];
const ZPRAVA: any = {
  id: 'zprava-1',
  sender_name: 'Objednávky pivovar',
  message_text: 'Sluhy 10 petek Hazy\n3x 20l desitka',
  message_type: 'text',
  status: 'parsed',
  created_at: '2026-11-03T13:05:00+00:00',
  parsed_place_id: 'm-sluhy',
  parsed_place_name: 'Sluhy',
  parsed_delivery_day: 'st',
  parsed_items: [
    { qty: 10, degree: null, beer_id: 'b-hazy', pkg_id: 'p-pet1', beer_name: 'Hazy Spring Day', package_label: '1l', raw_line: '10 petek Hazy' },
    { qty: 3, degree: '10°', beer_id: 'b-10', pkg_id: 'p-keg20', beer_name: '10° Desítka', package_label: '20l', raw_line: '3x 20l desitka' },
  ],
  parsed_raw_text: 'Sluhy 10 petek Hazy\n3x 20l desitka',
};

describe('WhatsAppOrderReviewModal — ruční oprava piva a obalu nic neučí', () => {
  beforeEach(() => {
    localStorage.clear();
    stav.zapisy = [];
    window.confirm = vi.fn(() => true);
    vi.clearAllMocks();
  });

  it('záměna piva (Hazy → Winter) a obalu (20 l → 15 l) se uloží do objednávky, ne jako pravidlo pro příště', async () => {
    const onApprove = vi.fn().mockResolvedValue(undefined);
    render(
      <WhatsAppOrderReviewModal
        isOpen
        onClose={vi.fn()}
        message={ZPRAVA}
        beers={beers}
        packages={packages}
        places={[{ id: 'm-sluhy', name: 'Sluhy' }] as any}
        onApprove={onApprove}
        onReject={vi.fn().mockResolvedValue(undefined)}
        onDecision={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(2));
    const piva = screen.getAllByTitle('Pivo') as HTMLSelectElement[];
    const obaly = screen.getAllByTitle('Obal / objem') as HTMLSelectElement[];
    expect(piva[0].value).toBe('b-hazy');
    expect(obaly[1].value).toBe('p-keg20');

    fireEvent.change(piva[0], { target: { value: 'b-winter' } });
    fireEvent.change(obaly[1], { target: { value: 'p-keg15' } });
    fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));

    // Objednávka dostane to, co člověk opravil…
    expect(onApprove.mock.calls[0][0].parsed_items).toMatchObject([
      { beer_id: 'b-winter', pkg_id: 'p-pet1', qty: 10 },
      { beer_id: 'b-10', pkg_id: 'p-keg15', qty: 3 },
    ]);
    // …ale žádné pravidlo pro příště z toho nevznikne — v databázi ani v prohlížeči.
    await new Promise((r) => setTimeout(r, 0));
    expect(stav.zapisy.filter((z) => z.tabulka === 'parser_aliases')).toEqual([]);
    expect(localStorage.getItem('user_learned_aliases')).toBeNull();
  });
});
