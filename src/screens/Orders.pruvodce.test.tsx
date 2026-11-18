// Obrazovka Objednávky: průvodce zadáním objednávky (18. 11. 2026).
//
// Majitel: „udělej ty objednávky tak jako první návrh". Okno průvodce samo
// neukládá — předá koncept obrazovce Objednávky, která ho uloží STEJNOU
// funkcí jako starý formulář. Tady se na skutečné obrazovce hlídá, že se
// objednávka ze všech tří kroků opravdu uloží (odběratel, místo závozu, den,
// položky), že na ni platí kontrola zdvojené objednávky a potvrzení „závoz
// v minulém týdnu" a že rozepsaný starý formulář po uložení z průvodce zůstane.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';

type Zapis = { tabulka: string; typ: 'insert' | 'update' | 'delete'; data?: any; ids?: string[] };

const h = vi.hoisted(() => ({
  DB: {} as Record<string, any[]>,
  zapisy: [] as Zapis[],
  dalsiId: 1,
  volba: vi.fn(),
  potvrd: vi.fn(),
  chyba: vi.fn(),
  ignorovatZpravu: vi.fn(),
  /** Co pošle zástupné okno čtení z fotky do onImport. */
  fotka: { items: [] as any[], meta: {} as any },
  /** Co pošle zástupné okno hromadného zpracování WhatsAppu do onImport. */
  whatsappHromadne: [] as any[],
  /** Zpráva, kterou zástupné okno kontroly WhatsAppu schvaluje. */
  zprava: {} as any,
}));

vi.mock('../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../lib/supabase')>();
  type Filtr = (r: any) => boolean;
  const radky = (t: string) => h.DB[t] ?? [];

  function dotaz(tabulka: string) {
    const filtry: Filtr[] = [];
    const vysledek = () => ({ data: radky(tabulka).filter((r) => filtry.every((f) => f(r))), error: null });
    const q: any = {
      then: (ok: any, ko: any) => Promise.resolve(vysledek()).then(ok, ko),
      single: () => Promise.resolve({ data: vysledek().data[0] ?? null, error: null }),
      maybeSingle: () => Promise.resolve({ data: vysledek().data[0] ?? null, error: null }),
      eq: (k: string, v: unknown) => { filtry.push((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { filtry.push((r) => vs.includes(r[k])); return q; },
    };
    for (const m of ['select', 'order', 'limit', 'not', 'or', 'neq', 'gte', 'lte', 'gt', 'lt', 'is', 'filter']) q[m] = () => q;
    return q;
  }

  /** update / delete: provede se, až se na výsledek počká (stejně jako v supabase-js). */
  function mutace(tabulka: string, typ: 'update' | 'delete', data?: unknown) {
    const filtry: Filtr[] = [];
    let hotovo = false;
    const proved = () => {
      if (hotovo) return { data: null, error: null };
      hotovo = true;
      const shoda = radky(tabulka).filter((r) => filtry.every((f) => f(r)));
      h.zapisy.push({ tabulka, typ, data, ids: shoda.map((r) => r.id) });
      h.DB[tabulka] = typ === 'update'
        ? radky(tabulka).map((r) => (shoda.includes(r) ? { ...r, ...(data as object) } : r))
        : radky(tabulka).filter((r) => !shoda.includes(r));
      return { data: null, error: null };
    };
    const m: any = {
      then: (ok: any, ko: any) => Promise.resolve(proved()).then(ok, ko),
      eq: (k: string, v: unknown) => { filtry.push((r) => r[k] === v); return m; },
      in: (k: string, vs: unknown[]) => { filtry.push((r) => vs.includes(r[k])); return m; },
    };
    return m;
  }

  function vloz(tabulka: string, payload: any) {
    const nove = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({
      id: `nove-${h.dalsiId++}`, created_at: '2026-10-15T08:00:00Z', ...r,
    }));
    h.zapisy.push({ tabulka, typ: 'insert', data: payload });
    h.DB[tabulka] = [...radky(tabulka), ...nove];
    const hotovo = { data: null, error: null };
    const c: any = {
      then: (ok: any, ko: any) => Promise.resolve(hotovo).then(ok, ko),
      select: () => ({
        single: () => Promise.resolve({ data: nove[0], error: null }),
        then: (ok: any, ko: any) => Promise.resolve({ data: nove, error: null }).then(ok, ko),
      }),
    };
    return c;
  }

  const tabulkaApi = (t: string) => {
    const q = dotaz(t);
    q.insert = (payload: any) => vloz(t, payload);
    q.update = (data: unknown) => mutace(t, 'update', data);
    q.delete = () => mutace(t, 'delete');
    q.upsert = (payload: any) => vloz(t, payload);
    return q;
  };

  return {
    ...skutecny,
    supabase: {
      from: vi.fn((t: string) => tabulkaApi(t)),
      rpc: vi.fn(async () => ({ data: null, error: null })),
      auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) },
    },
    fetchAllRows: vi.fn((t: string) => dotaz(t)),
    useRealtime: vi.fn(),
  };
});
vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: vi.fn(async (t: string) => ({ data: [...(h.DB[t] ?? [])], error: null })),
}));
vi.mock('../lib/toast', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/toast')>()),
  volba: h.volba,
  potvrd: h.potvrd,
  chyba: h.chyba,
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/businessDate')>()),
  businessDateISO: () => '2026-10-15',
}));
vi.mock('../lib/useMaleSudy', () => ({
  useMaleSudy: () => ({ zasoba: {}, zapocitatPlne: new Set<string>(), umiZapocitatPlne: false, nacteno: true, chybiMigrace: false, ulozit: vi.fn(), nastavZapocitatPlne: vi.fn() }),
  useHlidaniMalychSudu: () => ({ souhrn: [], nadPoPolozce: new Map(), poPolozce: new Map(), nacteno: true, jmenaPiv: new Map() }),
}));
vi.mock('../lib/whatsappApi', () => ({
  subscribeToWhatsAppMessages: () => () => {},
  fetchPendingWhatsAppMessages: async () => [],
  fetchWhatsAppMessage: async () => null,
  ignoreWhatsAppMessage: (...a: unknown[]) => h.ignorovatZpravu(...a),
  fetchWhatsAppSenders: async () => [],
  isSenderAllowed: () => true,
  triggerAutoParse: async () => {},
}));
vi.mock('../lib/tapReservations', () => ({
  autoReserveTapIfNeeded: vi.fn(async () => {}),
  isTapMentioned: () => false,
  detectTapType: () => null,
}));
vi.mock('../lib/reminders', () => ({ createReminder: vi.fn(async () => {}), getLocalReminders: () => [] }));

// Těžká okna se v produkci stahují líně; tady je nahrazují tlačítka, která
// pošlou domluvená data do stejných obsluh, jaké volají skutečná okna.
vi.mock('../components/ImportFromImage', async () => {
  const { createElement: e, useState } = await import('react');
  return {
    ImportFromImage: (props: any) => {
      const [text, setText] = useState('');
      return e('div', { 'data-testid': 'okno-fotka' },
        e('button', {
          onClick: () => { void props.onImport(h.fotka.items, h.fotka.meta).then(() => setText('hotovo'), (x: Error) => setText(x.message)); },
        }, 'Import z fotky'),
        e('output', { 'data-testid': 'fotka-vysledek' }, text));
    },
  };
});
vi.mock('../components/WhatsAppAutoProcessorModal', async () => {
  const { createElement: e, useState } = await import('react');
  return {
    WhatsAppAutoProcessorModal: (props: any) => {
      const [text, setText] = useState('');
      return e('div', { 'data-testid': 'okno-whatsapp-hromadne' },
        e('button', {
          onClick: () => { void props.onImport(h.whatsappHromadne).then(() => setText('hotovo'), (x: Error) => setText(x.message)); },
        }, 'Importovat zprávy'),
        e('button', { onClick: () => props.onOpenMessage(h.zprava) }, 'Otevřít zprávu'),
        e('output', { 'data-testid': 'whatsapp-hromadne-vysledek' }, text));
    },
  };
});
vi.mock('../components/WhatsAppOrderReviewModal', async () => {
  const { createElement: e, useState } = await import('react');
  return {
    WhatsAppOrderReviewModal: (props: any) => {
      const [text, setText] = useState('');
      return e('div', { 'data-testid': 'okno-whatsapp-kontrola' },
        e('button', {
          onClick: () => { void props.onApprove(props.message).then(() => setText('hotovo'), (x: Error) => setText(x.message)); },
        }, 'Schválit zprávu'),
        e('output', { 'data-testid': 'whatsapp-kontrola-vysledek' }, text));
    },
  };
});

import Orders from './Orders';

const PIVA = [
  { id: 'beer-12', name: '12° Světlá', degree: 12, is_active: true, sort_order: 1 },
  { id: 'beer-10', name: '10° Desítka', degree: 10, is_active: true, sort_order: 2 },
  { id: 'beer-jan', name: 'Jantar', degree: 13, is_active: true, sort_order: 3 },
];
const OBALY = [
  { id: 'pkg-15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5, sort_order: 1 },
  { id: 'keg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 2 },
  { id: 'keg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 3 },
];
const MISTA = [
  { id: 'p-rest', name: 'Restaurace' },
  { id: 'p-lipa', name: 'Hospoda U Lípy' },
];

/** Restaurace na neděli 11. 10. 2026 — zadaná ručně 11. 10. ve 12:10 (pražského času). */
const RESTAURACE_11_10 = {
  id: 'o-rest-11', order_date: '2026-10-11', delivery_date: '2026-10-11', delivery_day: 'ne',
  place_id: 'p-rest', place_name: 'Restaurace', status: 'nova', source: 'rucne',
  created_at: '2026-10-11T10:10:00Z', is_prepared: false, is_packaged: false, is_delivered: false, note: null,
};
const POLOZKY_RESTAURACE_11_10 = [
  { id: 'i-1', order_id: 'o-rest-11', beer_id: 'beer-12', beer_name: '12° Světlá', package_id: 'keg-50', package_label: 'KEG 50l', quantity: 1 },
  { id: 'i-2', order_id: 'o-rest-11', beer_id: 'beer-10', beer_name: '10° Desítka', package_id: 'keg-30', package_label: 'KEG 30l', quantity: 1 },
];

/** Restaurace na pondělí 12. 10. (aktuální týden) — Jantar 1,5 l × 5, do které se 15. 10. fotkou vložil Jantar podruhé. */
const RESTAURACE_12_10 = {
  ...RESTAURACE_11_10, id: 'o-rest-12', order_date: '2026-10-12', delivery_date: '2026-10-12', delivery_day: 'po',
  created_at: '2026-10-12T05:00:00Z',
};
const POLOZKY_RESTAURACE_12_10 = [
  { id: 'i-3', order_id: 'o-rest-12', beer_id: 'beer-jan', beer_name: 'Jantar', package_id: 'pkg-15', package_label: 'PET 1,5 l', quantity: 5 },
];

const zapsano = (tabulka: string, typ?: Zapis['typ']) => h.zapisy.filter((z) => z.tabulka === tabulka && (!typ || z.typ === typ));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  h.zapisy.length = 0;
  h.dalsiId = 1;
  h.DB = {
    orders: [{ ...RESTAURACE_11_10 }, { ...RESTAURACE_12_10 }],
    order_items: [...POLOZKY_RESTAURACE_11_10, ...POLOZKY_RESTAURACE_12_10].map((i) => ({ ...i })),
    places: MISTA.map((m) => ({ ...m })),
    beers: PIVA.map((p) => ({ ...p })),
    packages: OBALY.map((p) => ({ ...p })),
    price_list: [], bottling: [], kegging: [], inventory: [], writeoffs: [], zavoz_deductions: [],
    fasovani: [], fasovani_private: [], akce: [], keg_prefuk: [], inventory_adjustments: [],
  };
  h.fotka = { items: [], meta: {} };
  h.whatsappHromadne = [];
  h.zprava = {};
  h.volba.mockReset();
  h.volba.mockResolvedValue(null);
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
  h.chyba.mockReset();
  h.ignorovatZpravu.mockReset();
});


// Pomocné funkce starého formuláře (stejné jako v Orders.zdvojeni.test.tsx).
/** Vybere odběratele z okna „Odběratel". */
async function vyberOdberatele(jmeno: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Vybrat odběratele/ }));
  const nadpis = await screen.findByRole('heading', { name: 'Odběratel' });
  const okno = nadpis.closest('.card') as HTMLElement;
  fireEvent.click(within(okno).getAllByRole('button', { name: jmeno })[0]);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Odběratel' })).toBeNull());
}

/** Nastaví pivo, obal a počet kusů přes dlaždici piva. */
async function zadejPolozku(pivo: string, obal: string, kusu: number) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(pivo) }));
  const popisek = await screen.findByText(obal);
  const radek = popisek.parentElement!;
  const pole = within(radek).getByTitle('Napiš počet ručně');
  fireEvent.change(pole, { target: { value: String(kusu) } });
  fireEvent.click(screen.getByRole('button', { name: /Hotovo — potvrdit a zavřít/ }));
}

function nastavDatumZavozu(iso: string) {
  const pole = document.querySelector('input[type="date"]') as HTMLInputElement;
  fireEvent.change(pole, { target: { value: iso } });
}

const vytvorit = () => screen.getByRole('button', { name: /^Vytvořit objednávku/ });

// ---------------------------------------------------------------------------
// Průvodce zadáním objednávky
// ---------------------------------------------------------------------------

const otevriPruvodce = async () => {
  fireEvent.click(await screen.findByTestId('spustit-pruvodce'));
  return screen.findByRole('dialog', { name: 'Nová objednávka' });
};
/** Jen okno průvodce — pod ním je pořád starý formulář se stejnými dlaždicemi a dny. */
const okno = () => within(screen.getByRole('dialog', { name: 'Nová objednávka' }));
const dlazdiceOdberatele = (jmeno: string) => okno().getByRole('button', { name: new RegExp(`^${jmeno}`) });
const dal = () => fireEvent.click(okno().getByRole('button', { name: /Dál — vybrat pivo/ }));
const ulozitObjednavku = () => fireEvent.click(okno().getByRole('button', { name: /Uložit objednávku/ }));
const hledej = (text: string) => fireEvent.change(okno().getByLabelText('Hledat odběratele'), { target: { value: text } });

/** Pivo → panel → počet v předvoleném obalu → Hotovo. */
function pridejPivo(pivo: RegExp, pocet: string) {
  fireEvent.click(okno().getByRole('button', { name: pivo }));
  fireEvent.change(okno().getByRole('textbox', { name: 'Kolik kusů?' }), { target: { value: pocet } });
  fireEvent.click(okno().getByRole('button', { name: /^Hotovo/ }));
}

describe('průvodce zadáním objednávky na obrazovce Objednávky', () => {
  it('spouštěč je na stránce Zadávání objednávek, v přehledu objednávek ne', async () => {
    const { unmount } = render(<Orders mode="entry_only" />);
    expect(await screen.findByTestId('spustit-pruvodce')).toBeTruthy();
    unmount();
    render(<Orders mode="overviews_only" setPage={() => {}} />);
    await screen.findByText(/Zadávání objednávek/);
    expect(screen.queryByTestId('spustit-pruvodce')).toBeNull();
  });

  it('celý průchod uloží objednávku s položkami a výchozím dnem závozu odběratele', async () => {
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    // Odběratelé se do okna dostanou z databáze; „Hospoda U Lípy" ještě nikdy neobjednávala → přes hledání.
    hledej('u lipy');
    fireEvent.click(dlazdiceOdberatele('Hospoda U Lípy'));
    // Dnes je čtvrtek 15. 10. — výchozí den je nejbližší středa 21. 10.
    expect(okno().getByTestId('pruvodce-vychozi-den').textContent).toContain('St 21. 10.');
    dal();
    pridejPivo(/Světlá/, '2');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    fireEvent.change(okno().getByLabelText('Poznámka'), { target: { value: 'zavolat před závozem' } });
    await act(async () => { ulozitObjednavku(); });

    await screen.findByText('Objednávka uložena');
    expect(zapsano('orders', 'insert')).toHaveLength(1);
    const objednavka = zapsano('orders', 'insert')[0].data;
    expect(objednavka).toMatchObject({
      order_date: '2026-10-15', place_id: 'p-lipa', place_name: 'Hospoda U Lípy', source: 'rucne', status: 'nova',
      delivery_day: 'st', delivery_date: '2026-10-21', no_delivery: false, note: 'zavolat před závozem',
    });
    // Bez zvoleného místa se sloupec misto_zavozu do dotazu vůbec nedává (existuje až po migraci).
    expect(Object.keys(objednavka)).not.toContain('misto_zavozu');
    expect(zapsano('order_items', 'insert')).toHaveLength(1);
    expect(zapsano('order_items', 'insert')[0].data).toEqual([
      expect.objectContaining({ beer_id: 'beer-12', beer_name: '12° Světlá', package_id: 'keg-50', package_label: 'KEG 50l', quantity: 2 }),
    ]);
  });

  it('odběratel s víc místy se uloží se zvoleným místem závozu', async () => {
    h.DB.places = [
      ...MISTA.map((m) => ({ ...m })),
      { id: 'p-radek', name: 'Radek', mista_zavozu: [
        { id: 'sklad', nazev: 'Sklad', adresa: null, lat: null, lng: null },
        { id: 'drobak', nazev: 'Drobák', adresa: null, lat: null, lng: null },
      ] },
    ];
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    hledej('radek');
    fireEvent.click(dlazdiceOdberatele('Radek'));
    // Bez výběru místa se dál nejde.
    expect((okno().getByRole('button', { name: /Dál — vybrat pivo/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(okno().getByRole('button', { name: 'Drobák' }));
    dal();
    pridejPivo(/Světlá/, '1');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });

    await screen.findByText('Objednávka uložena');
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ place_id: 'p-radek', place_name: 'Radek', misto_zavozu: 'drobak' });
  });

  it('„sklad" najde Radka a uloží objednávku s místem Sklad; starý odběratel Sklad se nenabízí', async () => {
    h.DB.places = [
      ...MISTA.map((m) => ({ ...m })),
      { id: 'p-radek', name: 'Radek', mista_zavozu: [
        { id: 'misto-sklad', nazev: 'Sklad', adresa: null, lat: null, lng: null },
        { id: 'misto-drobak', nazev: 'Drobák', adresa: null, lat: null, lng: null },
      ] },
      { id: 'p-sklad-stary', name: 'Sklad' },
    ];
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    hledej('sklad');
    expect(okno().queryByRole('button', { name: /^Sklad/ })).toBeNull();
    fireEvent.click(dlazdiceOdberatele('Radek'));
    dal();
    pridejPivo(/Světlá/, '2');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });

    await screen.findByText('Objednávka uložena');
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ place_id: 'p-radek', place_name: 'Radek', misto_zavozu: 'misto-sklad' });
  });

  it('ručně vybraný den a „Bez závozu" se uloží tak, jak jsou', async () => {
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    hledej('restaurace');
    fireEvent.click(dlazdiceOdberatele('Restaurace'));
    // Restaurace je „bez závozu" automaticky; den vybírám na pátek 16. 10.
    fireEvent.click(okno().getByRole('button', { name: /^Pá/ }));
    dal();
    pridejPivo(/Světlá/, '1');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });

    await screen.findByText('Objednávka uložena');
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({
      place_id: 'p-rest', delivery_day: 'pa', delivery_date: '2026-10-16', no_delivery: true,
    });
  });

  it('zdvojená objednávka: průvodce se zeptá a výchozí odpověď nezaloží nic, „Přesto vytvořit" ano', async () => {
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    hledej('restaurace');
    fireEvent.click(dlazdiceOdberatele('Restaurace'));
    fireEvent.change(okno().getByLabelText(/Jiné datum závozu/), { target: { value: '2026-10-11' } });
    dal();
    pridejPivo(/Světlá/, '1');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });

    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    expect(h.volba.mock.calls[0][0]).toContain('Uložená objednávka: Restaurace, dodání 11. 10.');
    // Chyba je vidět v okně průvodce a nic se nezapsalo.
    expect((await screen.findByRole('alert')).textContent).toContain('Nic se neuložilo — Restaurace už má podobnou objednávku');
    expect(zapsano('orders', 'insert')).toHaveLength(0);
    expect(screen.queryByText('Objednávka uložena')).toBeNull();

    h.volba.mockResolvedValue('presto');
    await act(async () => { ulozitObjednavku(); });
    await screen.findByText('Objednávka uložena');
    expect(zapsano('orders', 'insert')).toHaveLength(1);
  });

  it('závoz v minulém týdnu: odmítnuté potvrzení nic neuloží a okno to řekne', async () => {
    h.DB.orders = [];
    h.potvrd.mockResolvedValue(false);
    render(<Orders mode="entry_only" />);
    await otevriPruvodce();
    hledej('u lipy');
    fireEvent.click(dlazdiceOdberatele('Hospoda U Lípy'));
    fireEvent.change(okno().getByLabelText(/Jiné datum závozu/), { target: { value: '2026-10-07' } });
    dal();
    pridejPivo(/Světlá/, '1');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });

    await waitFor(() => expect(h.potvrd).toHaveBeenCalledWith(expect.stringContaining('je v MINULÉM týdnu')));
    expect((await screen.findByRole('alert')).textContent).toContain('závoz v minulém týdnu jsi nepotvrdil');
    expect(zapsano('orders', 'insert')).toHaveLength(0);
  });

  it('rozepsaný starý formulář po uložení z průvodce zůstane, jak byl', async () => {
    render(<Orders mode="entry_only" />);
    // Ve starém formuláři je vybraný odběratel Restaurace a rozepsaná jedna položka…
    await vyberOdberatele('Restaurace');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    expect(screen.getByRole('button', { name: /Restaurace/ })).toBeTruthy();
    expect(screen.getByTestId('pruh-ulozeni').textContent).toContain('1 pol.');

    // …a mezitím se průvodcem založí objednávka pro jiného odběratele.
    await otevriPruvodce();
    hledej('u lipy');
    fireEvent.click(dlazdiceOdberatele('Hospoda U Lípy'));
    dal();
    pridejPivo(/Světlá/, '1');
    fireEvent.click(okno().getByRole('button', { name: /^Souhrn/ }));
    await act(async () => { ulozitObjednavku(); });
    await screen.findByText('Objednávka uložena');
    fireEvent.click(okno().getByRole('button', { name: 'Hotovo' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nová objednávka' })).toBeNull());
    expect(zapsano('orders', 'insert')).toHaveLength(1);
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ place_id: 'p-lipa' });
    // Formulář pořád drží Restauraci i rozepsanou položku (po uložení z formuláře by se vyčistil).
    expect(screen.getByRole('button', { name: /Restaurace/ })).toBeTruthy();
    expect(screen.getByTestId('pruh-ulozeni').textContent).toContain('1 pol.');
  });

  it('uložení ze starého formuláře funguje jako dřív a ruční výběr místa se nepřidává', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    nastavDatumZavozu('2026-10-20');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    const objednavka = zapsano('orders', 'insert')[0].data;
    expect(objednavka).toMatchObject({ place_id: 'p-lipa', delivery_date: '2026-10-20', source: 'rucne', status: 'nova' });
    expect(Object.keys(objednavka)).not.toContain('misto_zavozu');
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
  });
});
