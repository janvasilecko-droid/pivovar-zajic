// Přehled objednávek — „bez závozu" (zadání 23. 11. 2026): „navrhni, ať jde
// v objednávkách líp vidět, jestli je objednávka bez závozu — Egon, Martin,
// Jitka, Toužim to jde automaticky bez závozu."
// Majitel vybral variantu A (černý štítek místo dne + tlačítko „Bez" v řádku
// Závoz) a C (vlastní skupina na konci seznamu a filtr nahoře) a „3 ano":
// platí i pro objednávky ze zpráv z WhatsAppu.
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
  propoj: vi.fn(async (..._a: unknown[]): Promise<string | null> => null),
  smaz: vi.fn(async (..._a: unknown[]): Promise<string | null> => null),
  /** Dnešek podle appky — test ho umí posunout (appka otevřená přes půlnoc). */
  dnes: '2026-11-16',
  /** Když je vyplněné, každý update/delete skončí touhle chybou. */
  chybaZapisu: null as string | null,
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
      if (h.chybaZapisu) return { data: null, error: { message: h.chybaZapisu } };
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
  businessDateISO: () => h.dnes,
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
  propojRezervaciSObjednavkou: (...a: unknown[]) => h.propoj(...a),
}));
vi.mock('../lib/vycepyData', () => ({
  smazRezervaci: (...a: unknown[]) => h.smaz(...a),
}));
// Skutečné okno má vlastní test (components/TapReservationModal.test.tsx); tady
// ho nahrazuje atrapa, která říká, s jakou objednávkou byla otevřena.
vi.mock('../components/TapReservationModal', async () => {
  const { createElement: e } = await import('react');
  return {
    TapReservationModal: (props: any) => e('div', { 'data-testid': 'okno-vycep', 'data-order-id': props.orderId ?? '', 'data-order-date': props.orderDate ?? '' },
      e('button', { onClick: () => props.onConfirm({ id: 'rez-1', tap_id: 't', tap_name: 'Výčep A', date_from: '', date_to: '', customer_name: '', order_id: props.orderId }) }, 'Potvrdit výčep'),
      e('button', { onClick: props.onSkip }, 'Zavřít okno výčepu')),
  };
});
vi.mock('../lib/reminders', () => ({ createReminder: vi.fn(async () => {}), getLocalReminders: () => [] }));
// Okna čtení WhatsAppu nahrazují tlačítka, která pošlou domluvená data do
// stejných obsluh, jaké volají skutečná okna (viz Orders.zdvojeni.test.tsx).
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
];
const OBALY = [
  { id: 'keg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 },
  { id: 'keg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 2 },
];
// Jména jako v katalogu odběratelů.
const MISTA = [
  { id: 'p-jitka', name: 'Jitka' },
  { id: 'p-lipa', name: 'Hospoda U Lípy' },
  { id: 'p-egon', name: 'EGON' },
];

const OBJ = (id: string, jmeno: string, extra: Record<string, unknown> = {}) => ({
  id, order_date: '2026-11-23', place_id: null, place_name: jmeno, source: 'rucne', status: 'nova', note: null,
  created_at: '2026-11-23T07:00:00Z', delivery_day: 'st', delivery_date: '2026-11-25', is_prepared: false,
  is_packaged: false, is_delivered: false, delivered_at: null, no_delivery: false, zavoz_cislo: 1, ...extra,
});
const POL = (id: string, orderId: string) => ({
  id, order_id: orderId, beer_id: 'beer-12', beer_name: '12° Světlá', package_id: 'keg-50', package_label: 'KEG 50l', quantity: 1,
});

const zapsano = (tabulka: string, typ?: Zapis['typ']) => h.zapisy.filter((z) => z.tabulka === tabulka && (!typ || z.typ === typ));
const karta = (id: string) => document.getElementById(`objednavka-${id}`) as HTMLElement;
const skupinaSe = () => screen.getByTestId('objednavky-se-zavozem');
const skupinaBez = () => screen.getByTestId('objednavky-bez-zavozu');
const vSkupine = (skupina: HTMLElement, id: string) => !!skupina.querySelector(`#objednavka-${id}`);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  h.zapisy.length = 0;
  h.dalsiId = 1;
  h.dnes = '2026-11-23';
  h.chybaZapisu = null;
  h.whatsappHromadne = [];
  h.zprava = {};
  const objednavky = [
    OBJ('o-zizkov', 'Žižkov'),
    OBJ('o-lipa', 'Hospoda U Lípy', { delivery_day: 'pa', delivery_date: '2026-11-27' }),
    OBJ('o-martin', 'MARTIN', { no_delivery: true, delivery_day: 'po', delivery_date: '2026-11-23' }),
    OBJ('o-egon', 'EGON', { no_delivery: true, delivery_day: 'ut', delivery_date: '2026-11-24' }),
  ];
  h.DB = {
    orders: objednavky,
    order_items: objednavky.map((o) => POL(`i-${o.id}`, o.id)),
    places: MISTA.map((m) => ({ ...m })),
    beers: PIVA.map((p) => ({ ...p })),
    packages: OBALY.map((p) => ({ ...p })),
    price_list: [], bottling: [], kegging: [], inventory: [], writeoffs: [], zavoz_deductions: [],
    fasovani: [], fasovani_private: [], akce: [], keg_prefuk: [], inventory_adjustments: [],
  };
  h.volba.mockReset();
  h.volba.mockResolvedValue(null);
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
  h.chyba.mockReset();
});

async function otevriPrehled() {
  render(<Orders initialViewMode="detail" />);
  await screen.findByTestId('objednavky-bez-zavozu');
}

describe('přehled objednávek — skupina „Bez závozu" na konci seznamu', () => {
  it('objednávky bez závozu stojí ve vlastní skupině POD objednávkami se závozem', async () => {
    await otevriPrehled();
    expect(vSkupine(skupinaSe(), 'o-zizkov')).toBe(true);
    expect(vSkupine(skupinaSe(), 'o-lipa')).toBe(true);
    expect(vSkupine(skupinaSe(), 'o-martin')).toBe(false);
    expect(vSkupine(skupinaBez(), 'o-martin')).toBe(true);
    expect(vSkupine(skupinaBez(), 'o-egon')).toBe(true);
    expect(vSkupine(skupinaBez(), 'o-zizkov')).toBe(false);
    expect(skupinaSe().compareDocumentPosition(skupinaBez()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nadpis skupiny říká počet a že si odběratel bere sám', async () => {
    await otevriPrehled();
    const nadpis = within(skupinaBez()).getByTestId('skupina-bez-zavozu');
    expect(nadpis.textContent).toContain('Bez závozu');
    expect(nadpis.textContent).toContain('2 objednávky');
    expect(nadpis.textContent).toContain('odběratel si bere sám');
  });

  it('karta v ní má černý štítek místo dne, objednávka se závozem štítek dne', async () => {
    await otevriPrehled();
    expect(within(karta('o-martin')).getByTestId('stitek-bez-zavozu')).toBeTruthy();
    expect(within(karta('o-martin')).queryByTestId('stitek-dne-zavozu')).toBeNull();
    expect(within(karta('o-zizkov')).getByTestId('stitek-dne-zavozu').textContent).toContain('St');
    expect(within(karta('o-zizkov')).queryByTestId('stitek-bez-zavozu')).toBeNull();
  });

  it('bez objednávek bez závozu žádná skupina ani nadpis není', async () => {
    h.DB.orders = h.DB.orders.map((o) => ({ ...o, no_delivery: false }));
    render(<Orders initialViewMode="detail" />);
    await screen.findByTestId('objednavky-se-zavozem');
    expect(screen.queryByTestId('objednavky-bez-zavozu')).toBeNull();
    expect(screen.queryByTestId('skupina-bez-zavozu')).toBeNull();
  });

  it('jen objednávky bez závozu: seznam se závozem se nevykreslí prázdný', async () => {
    h.DB.orders = h.DB.orders.filter((o) => o.no_delivery);
    render(<Orders initialViewMode="detail" />);
    await screen.findByTestId('objednavky-bez-zavozu');
    expect(screen.queryByTestId('objednavky-se-zavozem')).toBeNull();
  });

  it('v tabulce má každý řádek černý štítek místo dne', async () => {
    localStorage.setItem('objednavky_zobrazeni_v1', JSON.stringify('tabulka'));
    await otevriPrehled();
    const tabulka = within(skupinaBez()).getByTestId('objednavky-tabulka');
    expect(within(tabulka).getAllByTestId('radek-objednavky')).toHaveLength(2);
    expect(within(tabulka).getAllByTestId('stitek-bez-zavozu')).toHaveLength(2);
    // Tabulka se závozem má dny jako dřív.
    const se = within(skupinaSe()).getByTestId('objednavky-tabulka');
    expect(within(se).queryByTestId('stitek-bez-zavozu')).toBeNull();
  });

  it('„Seskupit dle dne": dny jen s objednávkami se závozem, bez závozu zvlášť na konci', async () => {
    await otevriPrehled();
    fireEvent.click(screen.getByRole('button', { name: /Filtry/ }));
    fireEvent.click(screen.getByLabelText(/Seskupit dle dne/));
    await waitFor(() => expect(screen.queryByTestId('objednavky-se-zavozem')).toBeNull());
    // MARTIN (po) a EGON (út) jsou jen ve skupině bez závozu, ne i ve „svém" dni.
    expect(document.querySelectorAll('#objednavka-o-martin')).toHaveLength(1);
    expect(document.querySelectorAll('#objednavka-o-egon')).toHaveLength(1);
    expect(vSkupine(skupinaBez(), 'o-martin')).toBe(true);
    // Žižkov (st) a Lípa (pá) jsou v dnech.
    expect(document.querySelectorAll('#objednavka-o-zizkov')).toHaveLength(1);
    expect(document.querySelectorAll('#objednavka-o-lipa')).toHaveLength(1);
  });
});

describe('přehled objednávek — filtr „Bez závozu" nahoře', () => {
  it('má počet a ukáže jen objednávky bez závozu; druhé klepnutí filtr zruší', async () => {
    await otevriPrehled();
    const filtr = screen.getByTestId('filtr-bez-zavozu');
    expect(filtr.textContent).toContain('Bez závozu');
    expect(filtr.textContent).toContain('2');
    expect(filtr.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(filtr);
    await waitFor(() => expect(karta('o-zizkov')).toBeNull());
    expect(karta('o-lipa')).toBeNull();
    expect(karta('o-martin')).toBeTruthy();
    expect(karta('o-egon')).toBeTruthy();
    expect(screen.getByTestId('filtr-bez-zavozu').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByTestId('filtr-bez-zavozu'));
    await waitFor(() => expect(karta('o-zizkov')).toBeTruthy());
    expect(karta('o-martin')).toBeTruthy();
  });

  it('filtr dne (Pá) objednávky bez závozu neukáže, filtr „Všechny dny" vrátí všechno', async () => {
    await otevriPrehled();
    fireEvent.click(screen.getByTestId('filtr-bez-zavozu'));
    await waitFor(() => expect(karta('o-zizkov')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: /Všechny dny/ }));
    await waitFor(() => expect(karta('o-zizkov')).toBeTruthy());
    expect(karta('o-martin')).toBeTruthy();
    expect(screen.getByTestId('filtr-bez-zavozu').getAttribute('aria-pressed')).toBe('false');
  });

  it('souhrn nad seznamem u filtru říká „bez závozu"', async () => {
    await otevriPrehled();
    expect(screen.queryByTestId('souhrn-zobrazenych')).toBeNull();
    fireEvent.click(screen.getByTestId('filtr-bez-zavozu'));
    const souhrn = await screen.findByTestId('souhrn-zobrazenych');
    expect(souhrn.textContent).toContain('bez závozu');
    expect(souhrn.textContent).toContain('2 objednávky');
  });

  it('bez objednávek bez závozu je filtr šedý a bez počtu', async () => {
    h.DB.orders = h.DB.orders.map((o) => ({ ...o, no_delivery: false }));
    render(<Orders initialViewMode="detail" />);
    await screen.findByTestId('objednavky-se-zavozem');
    const filtr = screen.getByTestId('filtr-bez-zavozu');
    expect(filtr.textContent).toBe('Bez závozu');
  });
});

describe('přehled objednávek — tlačítko „Bez" na kartě', () => {
  const tlacitko = (id: string) => within(karta(id)).getByTestId('prepni-bez-zavozu');

  it('uloží JEN příznak (den ani datum se nemění, sklad se nehýbe) a objednávka přejde do skupiny', async () => {
    await otevriPrehled();
    fireEvent.click(tlacitko('o-zizkov'));
    await waitFor(() => expect(zapsano('orders', 'update')).toHaveLength(1));
    const zapis = zapsano('orders', 'update')[0];
    expect(zapis.ids).toEqual(['o-zizkov']);
    expect(zapis.data).toEqual({ no_delivery: true });
    await waitFor(() => expect(vSkupine(skupinaBez(), 'o-zizkov')).toBe(true));
    expect(within(skupinaBez()).getByTestId('skupina-bez-zavozu').textContent).toContain('3 objednávky');
    expect(within(karta('o-zizkov')).getByTestId('stitek-bez-zavozu')).toBeTruthy();
  });

  it('klepnutí na zmáčknuté „Bez" objednávku vrátí do závozu — se svým dnem', async () => {
    await otevriPrehled();
    fireEvent.click(tlacitko('o-martin'));
    await waitFor(() => expect(zapsano('orders', 'update')).toHaveLength(1));
    expect(zapsano('orders', 'update')[0]).toMatchObject({ ids: ['o-martin'], data: { no_delivery: false } });
    expect(Object.keys(zapsano('orders', 'update')[0].data)).toEqual(['no_delivery']);
    await waitFor(() => expect(vSkupine(skupinaSe(), 'o-martin')).toBe(true));
    expect(within(karta('o-martin')).getByTestId('stitek-dne-zavozu').textContent).toContain('Po');
  });

  it('klepnutí na den u objednávky bez závozu ji vrátí do závozu právě v ten den', async () => {
    await otevriPrehled();
    fireEvent.click(within(karta('o-martin')).getByTitle('Pojede závozem: Čt'));
    await waitFor(() => expect(zapsano('orders', 'update')).toHaveLength(1));
    expect(zapsano('orders', 'update')[0].data).toMatchObject({ no_delivery: false, delivery_day: 'ct', delivery_date: '2026-11-26' });
    await waitFor(() => expect(vSkupine(skupinaSe(), 'o-martin')).toBe(true));
  });

  it('klepnutí na den u objednávky se závozem příznak „bez závozu" nepřidá', async () => {
    await otevriPrehled();
    fireEvent.click(within(karta('o-zizkov')).getByTitle('Nastavit den závozu: Út'));
    await waitFor(() => expect(zapsano('orders', 'update')).toHaveLength(1));
    expect(zapsano('orders', 'update')[0].data).not.toHaveProperty('no_delivery');
    expect(zapsano('orders', 'update')[0].data).toMatchObject({ delivery_day: 'ut' });
  });

  it('když se uložení nepovede, objednávka se vrátí na původní místo a appka to řekne', async () => {
    await otevriPrehled();
    h.chybaZapisu = 'boom';
    fireEvent.click(tlacitko('o-zizkov'));
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(h.chyba.mock.calls[0][0]).toBe('Nepovedlo se uložit: boom');
    await waitFor(() => expect(vSkupine(skupinaSe(), 'o-zizkov')).toBe(true));
    expect(vSkupine(skupinaBez(), 'o-zizkov')).toBe(false);
    expect(tlacitko('o-zizkov').getAttribute('aria-pressed')).toBe('false');
  });
});

// „To co posledně" — kopie objednávky odběratele (zadání 23. 11. 2026: jmenovaní
// odběratelé jsou bez závozu vždycky).
describe('„To co posledně" a bez závozu', () => {
  async function kopieOdberatele(jmeno: string, posledni: Record<string, unknown>) {
    const predloha = OBJ('o-posledni', jmeno, {
      order_date: '2026-11-12', delivery_date: '2026-11-13', delivery_day: 'ct', place_id: MISTA.find((m) => m.name === jmeno)!.id, ...posledni,
    });
    h.DB.orders = [predloha];
    h.DB.order_items = [POL('i-posledni', 'o-posledni')];
    render(<Orders openOrderId="o-posledni" initialViewMode="detail" />);
    fireEvent.change(await screen.findByPlaceholderText('Hledat odběratele, pivo nebo poznámku'), { target: { value: jmeno } });
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: /To co posledně/ })); });
    await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
    return zapsano('orders', 'insert')[0].data as Record<string, unknown>;
  }

  it('kopie objednávky bez závozu je bez závozu a bez dne předlohy — databáze doplní dnešek', async () => {
    const nova = await kopieOdberatele('Hospoda U Lípy', { no_delivery: true });
    expect(nova).toMatchObject({ source: 'duplikat', no_delivery: true, delivery_day: null, delivery_date: null });
  });

  it('kopie objednávky jmenovaného odběratele (Jitka) je bez závozu, i když předloha jela závozem', async () => {
    const nova = await kopieOdberatele('Jitka', { no_delivery: false });
    expect(nova).toMatchObject({ place_id: 'p-jitka', no_delivery: true, delivery_day: null });
  });

  it('kopie jiného odběratele se závozem zůstává se závozem a s dnem předlohy', async () => {
    const nova = await kopieOdberatele('Hospoda U Lípy', { no_delivery: false });
    expect(nova).toMatchObject({ no_delivery: false, delivery_day: 'ct', delivery_date: null });
  });
});

// ---------------------------------------------------------------------------
// WhatsApp — „3 ano": bez závozu platí i pro objednávky ze zpráv
// ---------------------------------------------------------------------------

const zprava = (extra: Record<string, unknown> = {}) => ({
  id: 'm1', status: 'parsed', sender_name: 'Jitka', message_text: '2x30 12sv',
  parsed_place_id: 'p-jitka', parsed_place_name: 'Jitka', parsed_note: null,
  parsed_delivery_day: 'po', parsed_delivery_date: '2026-11-23',
  parsed_items: [{ beer_id: 'beer-12', pkg_id: 'keg-30', qty: 2 }],
  ...extra,
});

async function otevriHromadneZpracovani() {
  const { ORDERS_AUTO_IMPORT_EVENT } = await import('../lib/ordersFilter');
  render(<Orders />);
  await screen.findByTitle('Načíst z fotky/e-mailu');
  act(() => { window.dispatchEvent(new Event(ORDERS_AUTO_IMPORT_EVENT)); });
  return screen.findByRole('button', { name: 'Importovat zprávy' });
}

async function schvalZpravu(z: Record<string, unknown>) {
  h.zprava = z;
  await otevriHromadneZpracovani();
  fireEvent.click(await screen.findByRole('button', { name: 'Otevřít zprávu' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Schválit zprávu' }));
  await waitFor(() => expect(screen.getByTestId('whatsapp-kontrola-vysledek').textContent).toBe('hotovo'));
  return zapsano('orders', 'insert')[0].data as Record<string, unknown>;
}

describe('WhatsApp — schválení zprávy z kontrolního okna', () => {
  it('zaškrtnuté „Bez závozu" z okna se uloží', async () => {
    const o = await schvalZpravu(zprava({ bez_zavozu: true }));
    expect(o).toMatchObject({ source: 'whatsapp', place_id: 'p-jitka', no_delivery: true, delivery_day: 'po', delivery_date: '2026-11-23' });
  });

  it('člověk „Bez závozu" u jmenovaného odběratele odškrtl — uloží se se závozem', async () => {
    const o = await schvalZpravu(zprava({ bez_zavozu: false }));
    expect(o).toMatchObject({ place_id: 'p-jitka', no_delivery: false });
  });

  it('zpráva bez příznaku (jiná cesta): rozhodne jméno — Jitka ano, Hospoda U Lípy ne', async () => {
    const jitka = await schvalZpravu(zprava());
    expect(jitka).toMatchObject({ no_delivery: true });
  });

  it('zpráva odběratele se závozem bez příznaku je se závozem', async () => {
    const o = await schvalZpravu(zprava({ parsed_place_id: 'p-lipa', parsed_place_name: 'Hospoda U Lípy', parsed_delivery_day: 'st', parsed_delivery_date: '2026-11-25' }));
    expect(o).toMatchObject({ place_id: 'p-lipa', no_delivery: false, delivery_day: 'st' });
  });

  it('2. závoz se u objednávky bez závozu nezapisuje, u objednávky se závozem ano', async () => {
    await schvalZpravu(zprava({ bez_zavozu: true, zavoz_cislo: 2 }));
    expect(zapsano('orders', 'update').filter((z) => 'zavoz_cislo' in (z.data ?? {}))).toHaveLength(0);
  });

  it('2. závoz u objednávky se závozem se zapíše jako dřív', async () => {
    await schvalZpravu(zprava({ parsed_place_id: 'p-lipa', parsed_place_name: 'Hospoda U Lípy', bez_zavozu: false, zavoz_cislo: 2 }));
    const z = zapsano('orders', 'update').filter((x) => 'zavoz_cislo' in (x.data ?? {}));
    expect(z).toHaveLength(1);
    expect(z[0].data).toEqual({ zavoz_cislo: 2 });
  });
});

describe('WhatsApp — hromadný import ze seznamu zpráv', () => {
  const hromadna = (extra: Record<string, unknown> = {}) => ({
    placeId: 'p-egon', placeNameFree: 'EGON', orderDate: '2026-11-23', deliveryDay: 'po', deliveryDate: '2026-11-23',
    note: '', whatsappMessageId: 'm2', items: [{ beerId: 'beer-12', pkgId: 'keg-30', qty: 2 }], ...extra,
  });

  it('s příznakem bezZavozu se objednávka založí bez závozu', async () => {
    h.whatsappHromadne = [hromadna({ bezZavozu: true })];
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).toBe('hotovo'));
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ source: 'whatsapp', place_id: 'p-egon', no_delivery: true, delivery_day: 'po', delivery_date: '2026-11-23' });
  });

  it('bez příznaku je se závozem', async () => {
    h.whatsappHromadne = [hromadna({ placeId: 'p-lipa', placeNameFree: 'Hospoda U Lípy' })];
    fireEvent.click(await otevriHromadneZpracovani());
    await waitFor(() => expect(screen.getByTestId('whatsapp-hromadne-vysledek').textContent).toBe('hotovo'));
    expect(zapsano('orders', 'insert')[0].data).toMatchObject({ place_id: 'p-lipa', no_delivery: false });
  });
});
