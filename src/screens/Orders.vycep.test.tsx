// Formulář nové objednávky: pole „Půjčení výčepu“ (test výčepů 5. 11. 2026).
//
// Zaškrtnutí otevře okno rezervace ještě PŘED uložením objednávky (objednávka
// zatím nemá ID). Rezervace z okna je hned v databázi a po uložení objednávky se
// na ni navazuje. Dřív se vazba hledala heuristikou („nejnovější rezervace bez
// objednávky“) a jen v kopii v prohlížeči — do databáze se nezapsala vůbec.
// Odškrtnutí po potvrzení rezervaci zase zruší, aby výčep zbytečně neblokovala.
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
    TapReservationModal: (props: any) => e('div', { 'data-testid': 'okno-vycep', 'data-order-id': props.orderId ?? '' },
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
  { id: 'p-rest', name: 'Restaurace' },
  { id: 'p-lipa', name: 'Hospoda U Lípy' },
];

/** Restaurace na neděli 11. 10. 2026 — zadaná ručně 11. 10. ve 12:10 (pražského času). */

import Orders from './Orders';

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

const pole = () => screen.getByRole('checkbox', { name: /Půjčení výčepu/ });
const vytvorit = () => screen.getByRole('button', { name: /^Vytvořit objednávku/ });
const zapsano = (tabulka: string, typ?: Zapis['typ']) => h.zapisy.filter((z) => z.tabulka === tabulka && (!typ || z.typ === typ));

async function zalozObjednavku() {
  await vyberOdberatele('Hospoda U Lípy');
  await zadejPolozku('Světlá', 'KEG 50 L', 1);
  await act(async () => { fireEvent.click(vytvorit()); });
  await waitFor(() => expect(zapsano('orders', 'insert')).toHaveLength(1));
}

describe('formulář objednávky — „Půjčení výčepu“', () => {
  it('zaškrtnutí otevře okno rezervace ještě bez objednávky', async () => {
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    const okno = await screen.findByTestId('okno-vycep');
    expect(okno.getAttribute('data-order-id')).toBe('');
  });

  it('rezervace potvrzená před uložením se po uložení naváže na novou objednávku (podle jejího ID)', async () => {
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Potvrdit výčep' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());

    await zalozObjednavku();
    await waitFor(() => expect(h.propoj).toHaveBeenCalledTimes(1));
    const nova = zapsano('orders', 'insert')[0];
    expect(h.propoj).toHaveBeenCalledWith('rez-1', expect.stringMatching(/^nove-\d+$/));
    // druhý argument je ID právě založené objednávky
    expect(String(h.propoj.mock.calls[0][1])).toBe(String((h.DB.orders[0] as { id: string }).id));
    expect(nova.data).toMatchObject({ place_id: 'p-lipa' });
    // Okno se po uložení znovu neotevírá — rezervace už je hotová.
    expect(screen.queryByTestId('okno-vycep')).toBeNull();
  });

  it('chyba při navázání rezervace se ohlásí, objednávka zůstane uložená', async () => {
    h.propoj.mockResolvedValue('permission denied');
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Potvrdit výčep' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());

    await zalozObjednavku();
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/navázat.*permission denied/);
    expect(zapsano('orders', 'insert')).toHaveLength(1);
  });

  it('odškrtnutí po potvrzení rezervaci zruší — výčep nezůstane zbytečně obsazený', async () => {
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Potvrdit výčep' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());

    fireEvent.click(pole());
    await waitFor(() => expect(h.smaz).toHaveBeenCalledWith('rez-1'));

    await zalozObjednavku();
    // Bez výčepu se nic nenavazuje a okno se neotevírá.
    expect(h.propoj).not.toHaveBeenCalled();
    expect(screen.queryByTestId('okno-vycep')).toBeNull();
  });

  it('odškrtnutí bez potvrzené rezervace nic nemaže', async () => {
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zavřít okno výčepu' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());
    fireEvent.click(pole());
    expect(h.smaz).not.toHaveBeenCalled();
  });

  it('zavřené okno bez rezervace: po uložení se zeptá znovu, už s ID nové objednávky', async () => {
    render(<Orders mode="entry_only" />);
    fireEvent.click(await screen.findByRole('checkbox', { name: /Půjčení výčepu/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Zavřít okno výčepu' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());

    await zalozObjednavku();
    const okno = await screen.findByTestId('okno-vycep');
    expect(okno.getAttribute('data-order-id')).toBe(String((h.DB.orders[0] as { id: string }).id));
    expect(h.propoj).not.toHaveBeenCalled();
    // Rezervaci tentokrát zakládá okno samo (u objednávky, která už existuje).
    fireEvent.click(within(okno).getByRole('button', { name: 'Potvrdit výčep' }));
    await waitFor(() => expect(screen.queryByTestId('okno-vycep')).toBeNull());
    expect(h.propoj).not.toHaveBeenCalled();
  });
});
