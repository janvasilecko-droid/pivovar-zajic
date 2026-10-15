// Obrazovka Objednávky: zdvojená objednávka ani zdvojený řádek se nesmí založit
// potichu (lib/duplicityObjednavek.ts, lib/orderDuplicates.ts, lib/duplicityDialog.ts).
//
// Z provozu 15. 10. 2026: „duplicitní objednávka nebo odečtení se nesmí
// opakovat." Restaurace na 11. 10. byla v objednávkách dvakrát (podruhé zadaná
// ručně a zpětně) a do objednávky Restaurace na 12. 10. se fotkou vložil Jantar
// 1,5 l × 5 podruhé — sklad se z obou odepsal dvakrát. Tady se na skutečné
// obrazovce hlídá, že každá cesta, kudy se objednávka zakládá, se na duplicitu
// zeptá PŘED zápisem a že výchozí odpověď (zavřený dialog) nezaloží nic.
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

// ---------------------------------------------------------------------------
// Ruční zadání
// ---------------------------------------------------------------------------

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

describe('ruční zadání objednávky', () => {
  it('Restaurace na 11. 10. podruhé: zeptá se a výchozí odpověď (zavřít) nezaloží nic', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    nastavDatumZavozu('2026-10-11');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    const [text, moznosti, nastaveni] = h.volba.mock.calls[0];
    expect(text).toContain('Uložená objednávka: Restaurace, dodání 11. 10., zadaná ručně 11. 10. v 12:10.');
    expect(text).toContain('12° Světlá KEG 50 L ×1');
    expect(text).toContain('Druhá objednávka by sklad odečetla podruhé');
    expect(moznosti.map((m: { klic: string }) => m.klic)).toEqual(['zrusit', 'presto']);
    expect(nastaveni.titulek).toBe('Tahle objednávka už nejspíš existuje');

    // chyba je na obrazovce vidět (formulář ji ukazuje u tlačítek i pod nimi)
    await waitFor(() => expect(screen.getAllByText(/Nic se neuložilo — Restaurace už má podobnou objednávku/).length).toBeGreaterThan(0));
    expect(zapsano('orders', 'insert')).toHaveLength(0);
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
    // formulář zůstal vyplněný — nic se neztratilo
    expect(vytvorit().textContent).toContain('1 pol.');
  });

  it('„Přesto vytvořit" objednávku založí, jako dřív', async () => {
    h.volba.mockResolvedValue('presto');
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    nastavDatumZavozu('2026-10-11');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({
      place_id: 'p-rest', place_name: 'Restaurace', source: 'rucne', delivery_date: '2026-10-11', status: 'nova',
    });
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
    expect(zapsano('order_items', 'insert')[0].data).toEqual([
      expect.objectContaining({ beer_id: 'beer-12', package_id: 'keg-50', quantity: 1 }),
    ]);
  });

  it('jiný odběratel se stejným pivem se nezdržuje otázkou', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    nastavDatumZavozu('2026-10-11');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
  });

  it('táž Restaurace jiný týden se stejným pivem se neptá (pravidelná týdenní objednávka)', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    nastavDatumZavozu('2026-10-20');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
  });

  it('stornovaná objednávka se za duplicitu nepočítá', async () => {
    h.DB.orders = [{ ...RESTAURACE_11_10, status: 'storno' }];
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    nastavDatumZavozu('2026-10-11');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await act(async () => { fireEvent.click(vytvorit()); });

    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Čtení objednávky z fotky
// ---------------------------------------------------------------------------

const fotkaRestaurace = () => {
  h.fotka.items = [{ beer_id: 'beer-12', package_id: 'keg-50', quantity: 1, place_name: 'Restaurace', date: null }];
  h.fotka.meta = { placeId: '', placeName: 'Restaurace', date: '2026-10-13', note: '', den: 'ne', datumZavozu: '2026-10-11' };
};

/** Otevře okno čtení z fotky (zástupné) a pošle do Objednávek domluvená data. */
async function importujZFotky() {
  fireEvent.click(await screen.findByTitle('Načíst z fotky/e-mailu'));
  fireEvent.click(await screen.findByRole('button', { name: 'Import z fotky' }));
  await waitFor(() => expect(screen.getByTestId('fotka-vysledek').textContent).not.toBe(''));
  return screen.getByTestId('fotka-vysledek').textContent;
}

describe('čtení objednávky z fotky — nové objednávky', () => {
  it('Restaurace na 11. 10. z fotky podruhé: zeptá se, výchozí odpověď nezaloží nic', async () => {
    fotkaRestaurace();
    render(<Orders />);
    const vysledek = await importujZFotky();

    expect(vysledek).toBe('Import zrušen — Restaurace už má podobnou objednávku. Nic se nezaložilo.');
    expect(h.volba).toHaveBeenCalledTimes(1);
    expect(h.volba.mock.calls[0][0]).toContain('Uložená objednávka: Restaurace, dodání 11. 10., zadaná ručně 11. 10. v 12:10.');
    expect(zapsano('orders', 'insert')).toHaveLength(0);
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
  });

  it('„Přesto vytvořit" objednávku z fotky založí', async () => {
    fotkaRestaurace();
    h.volba.mockResolvedValue('presto');
    render(<Orders />);
    expect(await importujZFotky()).toBe('hotovo');

    expect(zapsano('orders', 'insert')).toHaveLength(1);
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ source: 'fotka', place_name: 'Restaurace', order_date: '2026-10-13', delivery_date: '2026-10-11' });
    expect(zapsano('order_items', 'insert')[0].data).toEqual([expect.objectContaining({ beer_id: 'beer-12', package_id: 'keg-50', quantity: 1 })]);
  });

  it('fotka s novým odběratelem se neptá', async () => {
    h.fotka.items = [{ beer_id: 'beer-12', package_id: 'keg-50', quantity: 1, place_name: 'Hospoda U Lípy', date: null }];
    h.fotka.meta = { placeId: '', placeName: 'Hospoda U Lípy', date: '2026-10-13', note: '', den: 'ne', datumZavozu: '2026-10-11' };
    render(<Orders />);
    expect(await importujZFotky()).toBe('hotovo');
    expect(h.volba).not.toHaveBeenCalled();
    expect(zapsano('orders', 'insert')).toHaveLength(1);
  });

  it('dva odběratelé na jedné fotce a jeden z nich už existuje: nezaloží se ani ten druhý', async () => {
    h.fotka.items = [
      { beer_id: 'beer-12', package_id: 'keg-50', quantity: 1, place_name: 'Hospoda U Lípy', date: null },
      { beer_id: 'beer-12', package_id: 'keg-50', quantity: 1, place_name: 'Restaurace', date: null },
    ];
    h.fotka.meta = { placeId: '', placeName: '', date: '2026-10-13', note: '', den: 'ne', datumZavozu: '2026-10-11' };
    render(<Orders />);
    expect(await importujZFotky()).toBe('Import zrušen — Restaurace už má podobnou objednávku. Nic se nezaložilo.');
    // Lípa je první na fotce, a přesto se nezaložila: kontrola proběhne PŘED zápisem
    expect(zapsano('orders', 'insert')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Fotka do už uložené objednávky
// ---------------------------------------------------------------------------

/** Otevře detail objednávky Restaurace na 12. 10. a v něm okno čtení z fotky. */
async function otevriFotkuVUlozene() {
  render(<Orders openOrderId="o-rest-12" initialViewMode="detail" />);
  fireEvent.click(await screen.findByRole('button', { name: /Načíst z fotky/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Import z fotky' }));
  await waitFor(() => expect(screen.getByTestId('fotka-vysledek').textContent).not.toBe(''));
  return screen.getByTestId('fotka-vysledek').textContent;
}

describe('čtení z fotky do uložené objednávky', () => {
  const JANTAR_5 = { beer_id: 'beer-jan', package_id: 'pkg-15', quantity: 5, place_name: null };
  const SVETLA_2 = { beer_id: 'beer-12', package_id: 'keg-30', quantity: 2, place_name: null };
  const meta = { placeId: '', placeName: 'Restaurace', date: '2026-10-12', note: 'Poznámka z fotky', den: null, datumZavozu: null };

  it('Jantar 1,5 l × 5 podruhé: zeptá se; výchozí odpověď nepřidá nic a nezmění ani poznámku', async () => {
    h.fotka.items = [JANTAR_5];
    h.fotka.meta = meta;
    const vysledek = await otevriFotkuVUlozene();

    expect(vysledek).toBe('Import zrušen — některé řádky už v objednávce jsou. Nic se nepřidalo.');
    expect(h.volba).toHaveBeenCalledTimes(1);
    const [text, moznosti] = h.volba.mock.calls[0];
    expect(text).toContain('• Jantar PET 1,5 L ×5 — v objednávce už je přesně takový řádek');
    expect(moznosti.map((m: { klic: string }) => m.klic)).toEqual(['zrusit', 'preskocit', 'pridat']);
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
    expect(zapsano('orders', 'update')).toHaveLength(0);
  });

  it('„Přidat jen ostatní řádky" přidá nové řádky a zdvojený vynechá', async () => {
    h.fotka.items = [JANTAR_5, SVETLA_2];
    h.fotka.meta = meta;
    h.volba.mockResolvedValue('preskocit');
    expect(await otevriFotkuVUlozene()).toBe('hotovo');

    const vlozeno = zapsano('order_items', 'insert');
    expect(vlozeno).toHaveLength(1);
    expect(vlozeno[0].data).toEqual([expect.objectContaining({ order_id: 'o-rest-12', beer_id: 'beer-12', package_id: 'keg-30', quantity: 2 })]);
    expect(zapsano('orders', 'update')[0].data).toEqual({ note: 'Poznámka z fotky' });
  });

  it('když jsou zdvojené všechny řádky, „přidat jen ostatní" nepřidá nic', async () => {
    h.fotka.items = [JANTAR_5];
    h.fotka.meta = meta;
    h.volba.mockResolvedValue('preskocit');
    expect(await otevriFotkuVUlozene()).toBe('Všechny řádky už v objednávce jsou — nic se nepřidalo.');
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
  });

  it('„Přidat i zdvojené" přidá všechno, jak to člověk výslovně chce', async () => {
    h.fotka.items = [JANTAR_5, SVETLA_2];
    h.fotka.meta = meta;
    h.volba.mockResolvedValue('pridat');
    expect(await otevriFotkuVUlozene()).toBe('hotovo');
    expect(zapsano('order_items', 'insert')[0].data).toHaveLength(2);
  });

  it('řádek, který v objednávce není, se neptá', async () => {
    h.fotka.items = [SVETLA_2];
    h.fotka.meta = meta;
    expect(await otevriFotkuVUlozene()).toBe('hotovo');
    expect(h.volba).not.toHaveBeenCalled();
    expect(zapsano('order_items', 'insert')).toHaveLength(1);
  });

  it('porovnává s tím, co je v databázi TEĎ, ne s obrazovkou (řádek mezitím přidal někdo jiný)', async () => {
    h.fotka.items = [SVETLA_2];
    h.fotka.meta = meta;
    render(<Orders openOrderId="o-rest-12" initialViewMode="detail" />);
    const nacist = await screen.findByRole('button', { name: /Načíst z fotky/ });
    // Obrazovka má objednávku načtenou; druhý telefon do ní mezitím přidal totéž.
    h.DB.order_items.push({ id: 'i-cizi', order_id: 'o-rest-12', beer_id: 'beer-12', beer_name: '12° Světlá', package_id: 'keg-30', package_label: 'KEG 30l', quantity: 2 });
    fireEvent.click(nacist);
    fireEvent.click(await screen.findByRole('button', { name: 'Import z fotky' }));
    await waitFor(() => expect(screen.getByTestId('fotka-vysledek').textContent).not.toBe(''));

    expect(h.volba).toHaveBeenCalledTimes(1);
    expect(h.volba.mock.calls[0][0]).toContain('• 12° Světlá KEG 30 L ×2 — v objednávce už je přesně takový řádek');
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

const zpravaRestaurace = () => ({
  id: 'm1', status: 'parsed', sender_name: 'Restaurace', message_text: 'Světlá 50l 1x',
  parsed_place_id: 'p-rest', parsed_place_name: 'Restaurace',
  parsed_delivery_date: '2026-10-11', parsed_delivery_day: 'ne', parsed_note: null,
  parsed_items: [{ beer_id: 'beer-12', pkg_id: 'keg-50', qty: 1 }],
});

const hromadnaRestaurace = () => ({
  placeId: 'p-rest', placeNameFree: 'Restaurace', orderDate: '2026-10-15', deliveryDay: 'ne', deliveryDate: '2026-10-11',
  note: '', whatsappMessageId: 'm1', items: [{ beerId: 'beer-12', pkgId: 'keg-50', qty: 1 }],
});

async function otevriHromadneZpracovani() {
  const { ORDERS_AUTO_IMPORT_EVENT } = await import('../lib/ordersFilter');
  render(<Orders />);
  await screen.findByTitle('Načíst z fotky/e-mailu');
  act(() => { window.dispatchEvent(new Event(ORDERS_AUTO_IMPORT_EVENT)); });
  return screen.findByRole('button', { name: 'Importovat zprávy' });
}

describe('WhatsApp — hromadné zpracování zpráv', () => {
  it('zpráva, která je kopií uložené objednávky: zeptá se a výchozí odpověď nezaloží nic', async () => {
    h.whatsappHromadne = [hromadnaRestaurace()];
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).not.toBe(''));

    expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).toBe('Import zrušen — objednávka je duplicitní (Restaurace).');
    expect(zapsano('orders', 'insert')).toHaveLength(0);
  });

  it('zpráva, ve které je jen část uložené objednávky s jiným množstvím, se taky zeptá', async () => {
    // Dřív kontrola hledala jen objednávku, jejíž VŠECHNY řádky už existují.
    const zprava = hromadnaRestaurace();
    zprava.items = [{ beerId: 'beer-12', pkgId: 'keg-50', qty: 2 }, { beerId: 'beer-jan', pkgId: 'keg-50', qty: 3 }];
    h.whatsappHromadne = [zprava];
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    expect(h.volba.mock.calls[0][0]).toContain('uloženo ×1, zadáváš ×2');
  });

  it('„Přesto vytvořit" zprávu založí', async () => {
    h.whatsappHromadne = [hromadnaRestaurace()];
    h.volba.mockResolvedValue('presto');
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).toBe('hotovo'));
    expect(zapsano('orders', 'insert')).toHaveLength(1);
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ source: 'whatsapp', place_id: 'p-rest', delivery_date: '2026-10-11' });
  });

  it('víc zpráv najednou, jedna z nich zdvojená: nezaloží se žádná', async () => {
    h.whatsappHromadne = [
      { ...hromadnaRestaurace(), placeId: 'p-lipa', placeNameFree: 'Hospoda U Lípy', whatsappMessageId: 'm0' },
      hromadnaRestaurace(),
    ];
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).not.toBe(''));
    expect(zapsano('orders', 'insert')).toHaveLength(0);
  });
});

async function otevriKontroluZpravy() {
  h.zprava = zpravaRestaurace();
  await otevriHromadneZpracovani();
  fireEvent.click(await screen.findByRole('button', { name: 'Otevřít zprávu' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Schválit zprávu' }));
  await waitFor(() => expect(screen.getByTestId('whatsapp-kontrola-vysledek').textContent).not.toBe(''));
  return screen.getByTestId('whatsapp-kontrola-vysledek').textContent;
}

describe('WhatsApp — schválení jedné zprávy', () => {
  it('zdvojená zpráva: nabídne Nezakládat / Ignorovat zprávu / Přesto vytvořit; výchozí nezaloží nic', async () => {
    expect(await otevriKontroluZpravy()).toBe('Objednávka je duplicitní — nebyla vytvořena.');
    const moznosti = h.volba.mock.calls[0][1] as { klic: string; label: string }[];
    expect(moznosti.map((m) => m.klic)).toEqual(['zrusit', 'ignorovat', 'presto']);
    expect(moznosti.map((m) => m.label)).toEqual(['Nezakládat', 'Ignorovat zprávu', 'Přesto vytvořit']);
    expect(zapsano('orders', 'insert')).toHaveLength(0);
    expect(h.ignorovatZpravu).not.toHaveBeenCalled();
  });

  it('„Ignorovat zprávu" ji označí jako vyřízenou a nic nezaloží', async () => {
    h.volba.mockResolvedValue('ignorovat');
    expect(await otevriKontroluZpravy()).toBe('hotovo');
    expect(h.ignorovatZpravu).toHaveBeenCalledWith('m1');
    expect(zapsano('orders', 'insert')).toHaveLength(0);
  });

  it('„Přesto vytvořit" objednávku ze zprávy založí', async () => {
    h.volba.mockResolvedValue('presto');
    expect(await otevriKontroluZpravy()).toBe('hotovo');
    expect(zapsano('orders', 'insert')).toHaveLength(1);
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ source: 'whatsapp', place_id: 'p-rest', whatsapp_message_id: 'm1' });
  });

  it('zpráva bez rozpoznaného odběratele se s jinou „Neznámý odběratel" neporovnává', async () => {
    h.DB.orders = [{ ...RESTAURACE_11_10, id: 'o-nezn', place_id: null, place_name: 'Neznámý odběratel' }];
    h.DB.order_items = [{ ...POLOZKY_RESTAURACE_11_10[0], order_id: 'o-nezn' }];
    h.zprava = { ...zpravaRestaurace(), parsed_place_id: null, parsed_place_name: null };
    const { ORDERS_AUTO_IMPORT_EVENT } = await import('../lib/ordersFilter');
    render(<Orders />);
    await screen.findByTitle('Načíst z fotky/e-mailu');
    act(() => { window.dispatchEvent(new Event(ORDERS_AUTO_IMPORT_EVENT)); });
    fireEvent.click(await screen.findByRole('button', { name: 'Otevřít zprávu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Schválit zprávu' }));
    await waitFor(() => expect(screen.getByTestId('whatsapp-kontrola-vysledek').textContent).toBe('hotovo'));
    expect(h.volba).not.toHaveBeenCalled();
    expect(zapsano('orders', 'insert')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Přidání řádku do uložené objednávky (detail)
// ---------------------------------------------------------------------------

async function pridejRadekVDetailu(pivo: string, obal: string, kusu: number) {
  render(<Orders openOrderId="o-rest-12" initialViewMode="detail" />);
  fireEvent.click(await screen.findByRole('button', { name: /\+ Přidat položku/ }));
  const pivoSelect = (await screen.findByText('Pivo', { selector: 'label' })).parentElement!.querySelector('select')!;
  fireEvent.change(pivoSelect, { target: { value: PIVA.find((p) => p.name === pivo)!.id } });
  fireEvent.change(screen.getByPlaceholderText('ks'), { target: { value: String(kusu) } });
  const obalSelect = screen.getByText('Obal', { selector: 'label' }).parentElement!.querySelector('select')!;
  fireEvent.change(obalSelect, { target: { value: OBALY.find((o) => o.label === obal)!.id } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Přidat$/ })); });
}

describe('přidání položky do uložené objednávky', () => {
  it('stejné pivo a obal, které v objednávce je: zeptá se a výchozí odpověď nic nepřidá', async () => {
    await pridejRadekVDetailu('Jantar', 'PET 1,5 l', 5);
    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    expect(h.volba.mock.calls[0][0]).toContain('• Jantar PET 1,5 L ×5 — v objednávce už je přesně takový řádek');
    expect((h.volba.mock.calls[0][1] as { klic: string }[]).map((m) => m.klic)).toEqual(['zrusit', 'pridat']);
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
  });

  it('jiné množství téhož řádku taky upozorní, ať se nemění po překlepu dvěma řádky', async () => {
    await pridejRadekVDetailu('Jantar', 'PET 1,5 l', 3);
    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    expect(h.volba.mock.calls[0][0]).toContain('v objednávce už je ×5');
    expect(zapsano('order_items', 'insert')).toHaveLength(0);
  });

  it('„Přidat i tak" řádek přidá', async () => {
    h.volba.mockResolvedValue('pridat');
    await pridejRadekVDetailu('Jantar', 'PET 1,5 l', 5);
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
    expect(zapsano('order_items', 'insert')[0].data).toMatchObject({ order_id: 'o-rest-12', beer_id: 'beer-jan', package_id: 'pkg-15', quantity: 5 });
  });

  it('jiné pivo se neptá', async () => {
    await pridejRadekVDetailu('12° Světlá', 'KEG 30l', 2);
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// „To co posledně" (kopie objednávky)
// ---------------------------------------------------------------------------

/** Poslední objednávka Restaurace je z minulého týdne (11. 10.); karta odběratele se ukáže po hledání. */
async function otevriKartuRestaurace() {
  h.DB.orders = [{ ...RESTAURACE_11_10 }];
  h.DB.order_items = POLOZKY_RESTAURACE_11_10.map((i) => ({ ...i }));
  render(<Orders openOrderId="o-rest-11" initialViewMode="detail" />);
  fireEvent.change(await screen.findByPlaceholderText('Hledat odběratele, pivo nebo poznámku'), { target: { value: 'Restaurace' } });
  return screen.findByRole('button', { name: /To co posledně/ });
}

describe('„To co posledně" — kopie objednávky', () => {
  it('první kopie z minulého týdne se založí bez ptaní', async () => {
    fireEvent.click(await otevriKartuRestaurace());
    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ source: 'duplikat', place_id: 'p-rest', order_date: '2026-10-15', delivery_date: null });
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
    expect(zapsano('order_items', 'insert')[0].data).toHaveLength(2);
  });

  it('dvojklik založí jedinou kopii', async () => {
    const tlacitko = await otevriKartuRestaurace();
    await act(async () => { fireEvent.click(tlacitko); fireEvent.click(tlacitko); });
    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    expect(h.volba).not.toHaveBeenCalled();
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));
  });

  it('druhé klepnutí potom (poslední je teď čerstvá kopie) se zeptá a výchozí odpověď nic nezaloží', async () => {
    const tlacitko = await otevriKartuRestaurace();
    await act(async () => { fireEvent.click(tlacitko); });
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));

    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /To co posledně/ })); });
    await waitFor(() => expect(h.volba).toHaveBeenCalledTimes(1));
    expect(h.volba.mock.calls[0][0]).toContain('zadaná kopií jiné objednávky');
    expect(zapsano('orders', 'insert')).toHaveLength(1);
  });

  it('„Přesto vytvořit" druhou kopii založí', async () => {
    const tlacitko = await otevriKartuRestaurace();
    await act(async () => { fireEvent.click(tlacitko); });
    await waitFor(() => expect(zapsano('order_items', 'insert')).toHaveLength(1));

    h.volba.mockResolvedValue('presto');
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /To co posledně/ })); });
    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(2));
  });
});
