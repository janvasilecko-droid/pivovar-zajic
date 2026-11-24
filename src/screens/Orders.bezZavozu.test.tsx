// Formulář nové objednávky: „Bez závozu" bez vybraného dne a datum objednávky.
//
// Z provozu 16. 11. 2026: „V objednávkách mám 1x50 Restaurace a nevidím ji
// v rozboru." Objednávka Restaurace (bez závozu) zapsaná bez vybraného dne se
// ze skladu neodečetla — databáze objednávce bez dne dává pátek, tady až pátek
// příštího týdne. A měla včerejší datum: formulář si držel datum z doby, kdy se
// obrazovka otevřela (appka zůstala otevřená přes půlnoc).
//
// Teď: „bez závozu" bez dne se uloží s dnešním dnem a datem (odečte se hned)
// a datum objednávky se bere až při uložení.
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
  // Restaurace nemá výchozí den závozu (migrace 20261231260000).
  { id: 'p-rest', name: 'Restaurace', vychozi_den_zavozu: 'zadny' },
  { id: 'p-lipa', name: 'Hospoda U Lípy' },
  { id: 'p-prod', name: 'Prodejna' },
];


beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  h.zapisy.length = 0;
  h.dalsiId = 1;
  h.DB = {
    orders: [], order_items: [],
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
  h.propoj.mockReset();
  h.propoj.mockResolvedValue(null);
  h.smaz.mockReset();
  h.smaz.mockResolvedValue(null);
  h.dnes = '2026-11-16';
});

async function vyberOdberatele(jmeno: string) {
  fireEvent.click(await screen.findByRole('button', { name: /Vybrat odběratele/ }));
  const nadpis = await screen.findByRole('heading', { name: 'Odběratel' });
  const okno = nadpis.closest('.card') as HTMLElement;
  fireEvent.click(within(okno).getAllByRole('button', { name: jmeno })[0]);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Odběratel' })).toBeNull());
}

async function zadejPolozku(pivo: string, obal: string, kusu: number) {
  fireEvent.click(await screen.findByRole('button', { name: new RegExp(pivo) }));
  const popisek = await screen.findByText(obal);
  const radek = popisek.parentElement!;
  const pole = within(radek).getByTitle('Napiš počet ručně');
  fireEvent.change(pole, { target: { value: String(kusu) } });
  fireEvent.click(screen.getByRole('button', { name: /Hotovo — potvrdit a zavřít/ }));
}

const bezZavozu = () => screen.getByRole('checkbox', { name: /Bez závozu/ }) as HTMLInputElement;
const vytvorit = () => screen.getByRole('button', { name: /^Vytvořit objednávku/ });
const zapsano = (tabulka: string, typ?: Zapis['typ']) => h.zapisy.filter((z) => z.tabulka === tabulka && (!typ || z.typ === typ));
const ulozena = () => zapsano('orders', 'insert')[0].data as Record<string, unknown>;

async function uloz() {
  await act(async () => { fireEvent.click(vytvorit()); });
  await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
}

describe('formulář objednávky — „Bez závozu" bez vybraného dne', () => {
  it('Restaurace bez vybraného dne: uloží se s dnešním dnem a datem (pondělí 16. 11.), ať se ze skladu odečte hned', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    await waitFor(() => expect(bezZavozu().checked).toBe(true));
    expect(screen.getByTestId('bez-zavozu-dnes').textContent).toContain('odečte ze skladu dnes (16. 11.)');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({
      place_id: 'p-rest', order_date: '2026-11-16', delivery_day: 'po', delivery_date: '2026-11-16', no_delivery: true, source: 'rucne',
    });
  });

  it('vybraný den se nepřepisuje a nápověda zmizí', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    await waitFor(() => expect(bezZavozu().checked).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: 'St' })[0]);
    expect(screen.queryByTestId('bez-zavozu-dnes')).toBeNull();
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: 'st', delivery_date: '2026-11-18', no_delivery: true, order_date: '2026-11-16' });
  });

  it('ručně zaškrtnuté „bez závozu" appka dál sama nepřepisuje, ani když se potom vybere jiný odběratel', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    expect(bezZavozu().checked).toBe(false); // U Lípy nejsou mezi jmenovanými
    fireEvent.click(bezZavozu());
    expect(bezZavozu().checked).toBe(true);
    // Jiný odběratel: tlačítko už ukazuje jméno vybraného, ne „Vybrat odběratele".
    fireEvent.click(screen.getByRole('button', { name: /Hospoda U Lípy/ }));
    const nadpis = await screen.findByRole('heading', { name: 'Odběratel' });
    fireEvent.click(within(nadpis.closest('.card') as HTMLElement).getAllByRole('button', { name: 'Prodejna' })[0]);
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Odběratel' })).toBeNull());
    expect(screen.getByRole('button', { name: /Prodejna/ })).toBeTruthy();
    expect(bezZavozu().checked).toBe(true); // ručně zapnuté zůstalo — Prodejna by samo vypnula
  });

  it('ručně odškrtnuté „bez závozu" u Restaurace den nedoplní (Restaurace výchozí den nemá)', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    await waitFor(() => expect(bezZavozu().checked).toBe(true));
    fireEvent.click(bezZavozu());
    expect(screen.queryByTestId('bez-zavozu-dnes')).toBeNull();
    expect(screen.queryByTestId('vychozi-den-zavozu')).toBeNull();
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: null, delivery_date: null, no_delivery: false });
  });
});

// 17. 11. 2026, majitel: „u objednávek nastav primárně závoz středa, pokud není
// jinak označeno — automaticky se označí středa, ale uživatel si ji může změnit."
describe('formulář objednávky — výchozí den závozu středa', () => {
  const tlacitkoDne = (nazev: string) => screen.getAllByRole('button', { name: nazev })[0];

  it('objednávka se závozem bez vybraného dne: středa je označená jako výchozí a uloží se i s datem', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    expect(bezZavozu().checked).toBe(false);
    expect(screen.queryByTestId('bez-zavozu-dnes')).toBeNull();
    expect(screen.getByTestId('vychozi-den-zavozu').textContent).toContain('závoz bude ve středu 18. 11. (výchozí den)');
    expect(tlacitkoDne('St').className).toContain('border-dashed');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: 'st', delivery_date: '2026-11-18', no_delivery: false, order_date: '2026-11-16' });
  });

  it('vybraný jiný den (pátek) výchozí středu nahradí', async () => {
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    fireEvent.click(tlacitkoDne('Pá'));
    expect(screen.queryByTestId('vychozi-den-zavozu')).toBeNull();
    expect(tlacitkoDne('St').className).not.toContain('border-dashed');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: 'pa', delivery_date: '2026-11-20' });
  });

  it('ve čtvrtek je výchozí středa až příští týden — a klepnutí na označenou středu vybere tu samou, ne včerejšek', async () => {
    h.dnes = '2026-11-19';
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    expect(screen.getByTestId('vychozi-den-zavozu').textContent).toContain('ve středu 25. 11.');
    fireEvent.click(tlacitkoDne('St'));
    expect(screen.queryByTestId('vychozi-den-zavozu')).toBeNull();
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: 'st', delivery_date: '2026-11-25', order_date: '2026-11-19' });
  });

  it('ve čtvrtek bez klepnutí se uloží středa příštího týdne', async () => {
    h.dnes = '2026-11-19';
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Hospoda U Lípy');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    expect(ulozena()).toMatchObject({ delivery_day: 'st', delivery_date: '2026-11-25' });
  });
});

describe('formulář objednávky — datum objednávky se bere při uložení', () => {
  it('appka otevřená přes půlnoc: objednávka zapsaná v pondělí má pondělní datum, ne nedělní', async () => {
    h.dnes = '2026-11-15';
    render(<Orders mode="entry_only" />);
    await vyberOdberatele('Restaurace');
    await waitFor(() => expect(bezZavozu().checked).toBe(true));
    // Obrazovka zůstala otevřená do pondělí.
    h.dnes = '2026-11-16';
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    expect(screen.getByTestId('bez-zavozu-dnes').textContent).toContain('(16. 11.)');
    await uloz();
    expect(ulozena()).toMatchObject({ order_date: '2026-11-16', delivery_day: 'po', delivery_date: '2026-11-16' });
  });

  it('okno rezervace výčepu po uložení dostane dnešní datum (ne datum z otevření obrazovky)', async () => {
    h.dnes = '2026-11-15';
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zavřít okno výčepu' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());
    h.dnes = '2026-11-16';
    await vyberOdberatele('Hospoda U Lípy');
    await zadejPolozku('Světlá', 'KEG 50 L', 1);
    await uloz();
    const okno = await screen.findByTestId('okno-vycep');
    expect(okno.getAttribute('data-order-date')).toBe('2026-11-16');
  });
});
