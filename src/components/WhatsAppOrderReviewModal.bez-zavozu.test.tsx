// „Bez závozu" v kontrole zprávy z WhatsAppu (23. 11. 2026): „egon, martin, jitka,
// toužim — to jde automaticky bez závozu", Mates, Restaurace a Terasa taky
// („2 ano") a platí i pro objednávky ze zpráv („3 ano"). Do té doby objednávka
// ze zprávy bez závozu být nemohla — pole bylo jen v ručním zadání.
//
// Zpráva bez napsaného dne se u takového odběratele neodečte ve výchozí den
// závozu (středa), ale dnes — v den objednávky, kdy si pivo odveze.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhatsAppOrderReviewModal } from './WhatsAppOrderReviewModal';

const { insertCalls } = vi.hoisted(() => ({ insertCalls: [] as { table: string; payload: any }[] }));

vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, nacteno: true, chybiMigrace: false, ulozit: async () => null }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true }),
}));
vi.mock('../lib/supabase', () => {
  const dotaz = (table: string) => {
    const q: Record<string, any> = {};
    for (const m of ['select', 'eq', 'in', 'lt', 'gte', 'order', 'limit', 'range', 'not']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    q.insert = (payload: any) => {
      insertCalls.push({ table, payload });
      if (table === 'orders') return { select: () => ({ single: () => Promise.resolve({ data: { id: 'nova-druha' }, error: null }) }) };
      return Promise.resolve({ data: null, error: null });
    };
    q.update = () => {
      const u: Record<string, any> = { eq: () => u };
      u.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok, ko);
      return u;
    };
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    return q;
  };
  const supabase = { from: vi.fn((t: string) => dotaz(t)) };
  return { supabase, fetchAllRows: () => supabase.from('x').select(), formatPackageLabel: (l: string | null | undefined) => l ?? '' };
});
vi.mock('../lib/orderDuplicates', () => ({ najdiDuplicitniObjednavky: async () => [] }));
vi.mock('../lib/whatsappApi', () => ({
  ignoreWhatsAppMessage: vi.fn().mockResolvedValue(undefined),
  updateWhatsAppParsedData: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../lib/whatsappParser', () => ({ parseWhatsAppOrderMessageWithAI: vi.fn() }));

const beers: any[] = [
  { id: 'b-12', name: '12° Světlá', degree: '12°' },
  { id: 'b-10', name: '10° Desítka', degree: '10°' },
];
const packages: any[] = [{ id: 'p30', label: 'KEG 30l', kind: 'keg', volume_l: 30 }];
const places: any[] = [
  { id: 'pl-jitka', name: 'Jitka' },
  { id: 'pl-lipa', name: 'Hospoda U Lípy' },
  { id: 'pl-egon', name: 'EGON' },
  { id: 'pl-seeberg', name: 'Seeberg', vychozi_den_zavozu: 'pa' },
];

const polozky = [
  { beer_id: 'b-12', pkg_id: 'p30', qty: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '2x30 12sv' },
  { beer_id: 'b-10', pkg_id: 'p30', qty: 4, degree: '10°', beer_name: '10° Desítka', package_label: 'KEG 30l', raw_line: '4x30 desitka' },
];
const zprava = (navic: Record<string, unknown> = {}): any => ({
  id: 'msg-bez-zavozu', sender_name: 'Pivovar', message_text: 'Jitka\n2x30 12sv', message_type: 'text', status: 'parsed',
  created_at: '2026-11-23T07:42:00+00:00', parsed_place_id: 'pl-jitka', parsed_place_name: 'Jitka',
  parsed_items: polozky.slice(0, 1), parsed_raw_text: 'Jitka\n2x30 12sv',
  ...navic,
});
const zHospody = (navic: Record<string, unknown> = {}) => zprava({
  message_text: 'Hospoda U Lípy\n2x30 12sv', parsed_raw_text: 'Hospoda U Lípy\n2x30 12sv',
  parsed_place_id: 'pl-lipa', parsed_place_name: 'Hospoda U Lípy', ...navic,
});

function otevri(message: any, mista: any[] = places) {
  const onApprove = vi.fn().mockResolvedValue(undefined);
  render(
    <WhatsAppOrderReviewModal
      isOpen onClose={vi.fn()} message={message} beers={beers} packages={packages} places={mista}
      onApprove={onApprove} onReject={vi.fn().mockResolvedValue(undefined)} onDecision={vi.fn()}
    />,
  );
  return { onApprove };
}
const nacteno = (pocet = 1) => waitFor(() => expect(screen.queryAllByRole('spinbutton')).toHaveLength(pocet));
const bezZavozu = () => screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement;
const den = (zkratka: string) => screen.getByRole('button', { name: zkratka });
const schval = () => fireEvent.click(screen.getByText('Schválit a odeslat do objednávek'));
async function schvalena(message: any) {
  const { onApprove } = otevri(message);
  await nacteno();
  return { onApprove, schvalit: async () => { schval(); await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1)); return onApprove.mock.calls[0][0]; } };
}

beforeEach(() => {
  localStorage.clear();
  window.confirm = vi.fn(() => true);
  insertCalls.length = 0;
  vi.clearAllMocks();
  // Pondělí 23. 11. 2026 — středa je 25. 11., pátek 27. 11.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-23T08:30:00+01:00'));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('kontrola zprávy — „Bez závozu" podle odběratele', () => {
  it('Jitka: zaškrtnuto samo, den je dnes (pondělí 23. 11.), nadpis „Den odběru", bez 1. a 2. závozu', async () => {
    otevri(zprava());
    await nacteno();
    expect(bezZavozu().checked).toBe(true);
    expect(screen.getByText(/Zaškrtnuto samo podle odběratele/)).toBeTruthy();
    expect(screen.getByText(/pivo se odečte ze skladu dnes/)).toBeTruthy();
    expect(screen.getByText(/Den odběru/)).toBeTruthy();
    expect(screen.getByText(/→ po 23\. 11\./)).toBeTruthy();
    expect(den('Po').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('1.z')).toBeNull();
    expect(screen.queryByText('2.z')).toBeNull();
  });

  it('Hospoda U Lípy: nezaškrtnuto, výchozí den je středa 25. 11., nadpis „Den závozu", závoz 1. / 2. je', async () => {
    otevri(zHospody());
    await nacteno();
    expect(bezZavozu().checked).toBe(false);
    expect(screen.getByText(/Zaškrtni, když si odběratel bere pivo sám/)).toBeTruthy();
    expect(screen.queryByText(/Den odběru/)).toBeNull();
    expect(screen.getByText(/→ st 25\. 11\./)).toBeTruthy();
    expect(den('St').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('1.z')).toBeTruthy();
    expect(screen.getByText('2.z')).toBeTruthy();
  });

  it.each([
    ['EGON'], ['MARTIN'], ['Jitka'], ['Chlapy z Toužimi'], ['Mates Rybárna'], ['Restaurace'], ['Terasa'],
  ])('%s je automaticky bez závozu (jméno z katalogu)', async (jmeno) => {
    otevri(zprava({ parsed_place_id: null, parsed_place_name: jmeno }), []);
    await nacteno();
    expect(bezZavozu().checked).toBe(true);
  });

  it.each([['Seeberg'], ['Restaurace Na Růžku'], ['Martin Novák']])('%s se automaticky nezaškrtne', async (jmeno) => {
    otevri(zprava({ parsed_place_id: null, parsed_place_name: jmeno }), []);
    await nacteno();
    expect(bezZavozu().checked).toBe(false);
  });
});

describe('kontrola zprávy — ruční přepnutí a výběr dne', () => {
  it('zaškrtnutí u Hospody U Lípy přepne den ze středy na dnešek a schová 1. / 2. závoz; odškrtnutí vrátí středu', async () => {
    otevri(zHospody());
    await nacteno();
    fireEvent.click(bezZavozu());
    expect(bezZavozu().checked).toBe(true);
    expect(screen.queryByText(/Zaškrtnuto samo/)).toBeNull();
    expect(screen.getByText(/→ po 23\. 11\./)).toBeTruthy();
    expect(screen.getByText(/Den odběru/)).toBeTruthy();
    expect(screen.queryByText('2.z')).toBeNull();

    fireEvent.click(bezZavozu());
    expect(screen.getByText(/→ st 25\. 11\./)).toBeTruthy();
    expect(screen.getByText('2.z')).toBeTruthy();
  });

  it('odškrtnutí u Jitky: pojede závozem ve výchozí den (středa)', async () => {
    otevri(zprava());
    await nacteno();
    fireEvent.click(bezZavozu());
    expect(bezZavozu().checked).toBe(false);
    expect(screen.getByText(/→ st 25\. 11\./)).toBeTruthy();
    expect(screen.queryByText(/Den odběru/)).toBeNull();
  });

  it('ručně vybraný den (pátek) má přednost před dneškem i u bez závozu', async () => {
    otevri(zprava());
    await nacteno();
    fireEvent.click(den('Pá'));
    expect(screen.getByText(/→ pá 27\. 11\./)).toBeTruthy();
    expect(bezZavozu().checked).toBe(true);
    expect(screen.queryByText(/pivo se odečte ze skladu dnes/)).toBeNull();
    expect(screen.getByText(/Odběratel si bere pivo sám, nejde do trasy/)).toBeTruthy();
  });

  it('den ze zprávy (čtvrtek) má přednost před dneškem', async () => {
    otevri(zprava({ parsed_delivery_day: 'ct' }));
    await nacteno();
    expect(bezZavozu().checked).toBe(true);
    expect(den('Čt').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/→ čt 26\. 11\./)).toBeTruthy();
    expect(screen.queryByText(/pivo se odečte ze skladu dnes/)).toBeNull();
  });

  it('odpověď upravující existující objednávku „Bez závozu" nenabízí — hlavičku objednávky nemění', async () => {
    otevri(zprava({ amends_order_id: 'o-puvodni' }));
    await waitFor(() => expect(screen.getAllByRole('spinbutton').length).toBeGreaterThan(0));
    expect(screen.queryByRole('checkbox', { name: /Bez závozu/ })).toBeNull();
  });
});

describe('kontrola zprávy — co se pošle při schválení', () => {
  it('Jitka: bez_zavozu, den i datum dnes, 1. závoz', async () => {
    const { schvalit } = await schvalena(zprava());
    expect(await schvalit()).toMatchObject({
      bez_zavozu: true, parsed_delivery_day: 'po', parsed_delivery_date: '2026-11-23', zavoz_cislo: 1,
      parsed_place_id: 'pl-jitka',
    });
  });

  it('Hospoda U Lípy: bez_zavozu je false, den i datum výchozí středa', async () => {
    const { schvalit } = await schvalena(zHospody());
    expect(await schvalit()).toMatchObject({
      bez_zavozu: false, parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-25', zavoz_cislo: 1,
    });
  });

  it('Jitka odškrtnutá rukou: bez_zavozu false a středa', async () => {
    const { schvalit } = await schvalena(zprava());
    fireEvent.click(bezZavozu());
    expect(await schvalit()).toMatchObject({ bez_zavozu: false, parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-25' });
  });

  it('2. závoz zvolený před zaškrtnutím „Bez závozu" se neposílá — objednávka bez závozu jede jako 1.', async () => {
    const { schvalit } = await schvalena(zHospody());
    fireEvent.click(screen.getByText('2.z'));
    fireEvent.click(bezZavozu());
    expect((await schvalit()).zavoz_cislo).toBe(1);
  });

  it('2. závoz u objednávky se závozem se pošle jako dřív', async () => {
    const { schvalit } = await schvalena(zHospody());
    fireEvent.click(screen.getByText('2.z'));
    expect(await schvalit()).toMatchObject({ bez_zavozu: false, zavoz_cislo: 2 });
  });

  it('vybraný pátek u Jitky: bez závozu zůstává a den je pátek', async () => {
    const { schvalit } = await schvalena(zprava());
    fireEvent.click(den('Pá'));
    expect(await schvalit()).toMatchObject({ bez_zavozu: true, parsed_delivery_day: 'pa', parsed_delivery_date: '2026-11-27' });
  });
});

// ✂️ Rozdělení zprávy na dva odběratele: druhý má vlastní „bez závozu" i vlastní výchozí den.
describe('kontrola zprávy — rozdělení na dva odběratele a „bez závozu"', () => {
  async function rozdel(message: any, druhy: string) {
    const { onApprove } = otevri(message);
    await nacteno(2);
    fireEvent.click(screen.getByText('✂️ Rozdělit na dva odběratele'));
    const zaskrtavatka = await screen.findAllByRole('checkbox', { name: '2.' });
    fireEvent.click(zaskrtavatka[1]);
    const comboboxy = await screen.findAllByPlaceholderText('Napiš nebo vyber odběratele…');
    fireEvent.change(comboboxy[1], { target: { value: druhy } });
    fireEvent.click(await screen.findByRole('button', { name: new RegExp(druhy) }));
    schval();
    await waitFor(() => expect(onApprove).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(insertCalls.some((c) => c.table === 'orders')).toBe(true));
    return { prvni: onApprove.mock.calls[0][0], druha: insertCalls.find((c) => c.table === 'orders')!.payload };
  }

  it('první Jitka (bez závozu, dnes), druhá Hospoda U Lípy (se závozem, středa) — každá podle sebe', async () => {
    const { prvni, druha } = await rozdel(zprava({ parsed_items: polozky }), 'Hospoda U Lípy');
    expect(prvni).toMatchObject({ bez_zavozu: true, parsed_delivery_day: 'po', parsed_delivery_date: '2026-11-23' });
    expect(druha).toMatchObject({ place_id: 'pl-lipa', no_delivery: false, delivery_day: 'st', delivery_date: '2026-11-25' });
  });

  it('první Hospoda U Lípy (středa), druhý EGON (bez závozu, dnes)', async () => {
    const { prvni, druha } = await rozdel(zHospody({ parsed_items: polozky }), 'EGON');
    expect(prvni).toMatchObject({ bez_zavozu: false, parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-25' });
    expect(druha).toMatchObject({ place_id: 'pl-egon', no_delivery: true, delivery_day: 'po', delivery_date: '2026-11-23' });
  });

  it('den výslovně uvedený ve zprávě (čtvrtek) platí pro obě objednávky; druhá je dál bez závozu, je-li jmenovaná', async () => {
    const { prvni, druha } = await rozdel(zHospody({ parsed_items: polozky, parsed_delivery_day: 'ct' }), 'EGON');
    expect(prvni).toMatchObject({ bez_zavozu: false, parsed_delivery_day: 'ct', parsed_delivery_date: '2026-11-26' });
    expect(druha).toMatchObject({ no_delivery: true, delivery_day: 'ct', delivery_date: '2026-11-26' });
  });
});
