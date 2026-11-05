// Lahve → Zápis: už uložené stáčení se dá upravit přímo pod zápisem
// (BottlingScreen + components/UpravaUlozenehoStaceni.tsx + sdílená tabulka
// z Přehledu) proti „databázi" v paměti.
// 5. 11. 2026: „ve stáčení lahve: ověř, když jsem zadal stáčení, nešlo mi
// editovat stočené položky, uprav to." Seznam „Dnes stočeno do lahví" byl jen
// ke čtení — úprava byla k nalezení až v záložce Přehled.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  DB: {
    bottling: [] as any[],
    beers: [
      { id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 },
      { id: 'beer-jan', name: 'Jantar', is_active: true, sort_order: 2 },
    ],
    packages: [
      { id: 'pkg-15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5, sort_order: 1 },
      { id: 'pkg-1', label: 'PET 1 l', kind: 'bottle', volume_l: 1, sort_order: 2 },
      { id: 'pkg-05', label: 'PET 0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 3 },
      { id: 'pkg-033', label: 'sklo 0,33 l', kind: 'bottle', volume_l: 0.33, sort_order: 4 },
      { id: 'keg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 5 },
      { id: 'keg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 6 },
      { id: 'keg-20', label: 'KEG 20l', kind: 'keg', volume_l: 20, sort_order: 7 },
    ],
    orders: [], order_items: [], inventory: [] as any[], fasovani: [], fasovani_private: [],
    writeoffs: [], kegging: [], keg_prefuk: [], zavoz_deductions: [], bottling_plans: [],
  } as Record<string, any[]>,
  /** Příkazy do tabulky bottling, jak došly. */
  operace: [] as { typ: string; zmena?: any; ids?: string[]; radky?: any[] }[],
  chybaDb: null as { message: string } | null,
  dalsiId: 1,
  chyba: vi.fn(),
  toastZpet: vi.fn(),
  potvrd: vi.fn(),
}));

vi.mock('../lib/supabase', () => {
  function zapis(op: { typ: string; zmena?: any; ids?: string[]; radky?: any[] }, uprav: (op: any) => void) {
    h.operace.push(op);
    const c: any = Promise.resolve({ data: null, error: h.chybaDb });
    const hotovo = () => { if (!h.chybaDb) uprav(op); };
    c.in = vi.fn((_k: string, ids: string[]) => { op.ids = ids; hotovo(); return c; });
    c.eq = vi.fn((_k: string, id: string) => { op.ids = [id]; hotovo(); return c; });
    return { c, hotovo };
  }
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    if (table !== 'bottling') {
      q.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
      return q;
    }
    q.update = vi.fn((zmena: any) => zapis(
      { typ: 'update', zmena },
      (op) => { h.DB.bottling = h.DB.bottling.map((r) => (op.ids!.includes(r.id) ? { ...r, ...op.zmena } : r)); },
    ).c);
    q.delete = vi.fn(() => zapis(
      { typ: 'delete' },
      (op) => { h.DB.bottling = h.DB.bottling.filter((r) => !op.ids!.includes(r.id)); },
    ).c);
    q.insert = vi.fn((payload: any) => {
      const radky = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({ id: `nove-${h.dalsiId++}`, ...r }));
      h.operace.push({ typ: 'insert', radky: Array.isArray(payload) ? payload : [payload] });
      if (!h.chybaDb) h.DB.bottling = [...h.DB.bottling, ...radky];
      const c: any = Promise.resolve({ data: null, error: h.chybaDb });
      c.select = vi.fn(() => Promise.resolve({ data: h.chybaDb ? null : radky, error: h.chybaDb }));
      return c;
    });
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerBorder: vi.fn(() => '#d97706'),
    beerText: vi.fn(() => 'text-neutral-900'),
    beerName: vi.fn((b: any) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: vi.fn(async (t: string) => ({ data: h.DB[t] ?? [], error: null })),
}));
vi.mock('../lib/toast', async (puvodni) => ({
  ...(await puvodni<typeof import('../lib/toast')>()),
  potvrd: h.potvrd,
  chyba: h.chyba,
  toastZpet: h.toastZpet,
}));
vi.mock('../lib/auth', () => ({ useAuth: vi.fn(() => ({ profile: { role: 'admin', display_name: 'Test' } })) }));
vi.mock('../lib/checklistData', () => ({ synchronizuj: vi.fn().mockResolvedValue(undefined), ulozStav: vi.fn() }));
vi.mock('../lib/bottleSanitation', () => ({ autoLogBottleSanitationFromChecklist: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../components/BottlingChecklistModal', () => ({
  BottlingChecklistModal: () => null,
  DEFAULT_ITEMS: [],
  isStartChecklistCompleteForDate: vi.fn(() => true),
  isMonthlyChecklistCompleteForDate: vi.fn(() => true),
  MONTHLY_CATEGORY: '4. Měsíční údržba (1x měsíčně)',
}));
vi.mock('../components/VoiceRecorder', () => ({ VoiceRecorder: () => null }));
vi.mock('../components/ImportBottlingFromImage', () => ({ ImportBottlingFromImage: () => null }));
vi.mock('../components/ImportStaceniLahviExcel', () => ({ default: () => null }));
vi.mock('../lib/orderParser', () => ({
  parseFreeTextEntries: vi.fn(() => []),
  loadAliasMap: vi.fn().mockResolvedValue({}),
  emptyAliasMap: vi.fn(() => ({})),
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<any>()),
  businessDateISO: () => '2026-10-15',
}));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({
  isoWeekKey: vi.fn(() => '2026-42'),
  weekRange: vi.fn(() => ({ start: new Date('2026-10-12T00:00:00Z'), end: new Date('2026-10-18T00:00:00Z'), label: '12. 10. – 18. 10.' })),
  shiftWeek: vi.fn((k: string) => k),
}));

import BottlingScreen from './BottlingScreen';

const zaznam = (o: Record<string, unknown>) => ({
  entry_date: '2026-10-15', beer_id: 'beer-12', beer_name: '12° Světlá', note: null,
  created_at: '2026-10-15T08:00:00+00:00', created_by: 'u1',
  kegs_used: 2, kegs_used_package_id: 'keg-50', source_volume_l: 100,
  package_label: 'PET', ...o,
});

/**
 * Dnes (15. 10.): 12° Světlá (2× 50 l → 30× 1,5 l + 44× 1 l) a Jantar (1× 50 l → 44× 1 l).
 * Včera: 12° Světlá (1× 50 l → 20× 0,5 l) — do dnešní úpravy nepatří.
 */
const zakladniData = () => [
  zaznam({ id: 'r1', package_id: 'pkg-15', quantity: 30 }),
  zaznam({ id: 'r2', package_id: 'pkg-1', quantity: 44 }),
  zaznam({ id: 'r3', beer_id: 'beer-jan', beer_name: 'Jantar', package_id: 'pkg-1', quantity: 44, kegs_used: 1, source_volume_l: 50, created_at: '2026-10-15T09:00:00+00:00' }),
  zaznam({ id: 'r4', entry_date: '2026-10-14', package_id: 'pkg-05', quantity: 20, kegs_used: 1, source_volume_l: 50, created_at: '2026-10-14T08:00:00+00:00' }),
];

const otevri = () => render(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);
const TUZKA_SVETLA = /^Upravit uložené: 12° Světlá · 30× 1,5 l, 44× 1 l ze 2× sud 50 l$/;
const uprava = () => screen.getByTestId('uprava-ulozeneho');
/** Nadpis úpravy; tabulka uvnitř má ještě vlastní nadpis dne. */
const nadpisUpravy = () => within(uprava()).getByRole('heading', { name: /^Upravit uložené stáčení/ });
const enter = async (el: HTMLElement) => { await act(async () => { fireEvent.keyDown(el, { key: 'Enter' }); }); };

async function pockejNaSeznam() {
  await waitFor(() => expect(screen.getByText('Dnes stočeno do lahví')).toBeTruthy());
}

/** Otevře úpravu u 12° Světlé tužkou v seznamu pod zápisem. */
async function otevriUpravuSvetle() {
  await pockejNaSeznam();
  fireEvent.click(screen.getByRole('button', { name: TUZKA_SVETLA }));
  await screen.findByTestId('uprava-ulozeneho');
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.DB.bottling = zakladniData();
  h.DB.inventory = [];
  h.operace.length = 0;
  h.chybaDb = null;
  h.dalsiId = 1;
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
  h.chyba.mockReset();
  h.toastZpet.mockReset();
});

describe('Lahve → Zápis: úprava uloženého stáčení', { timeout: 15_000 }, () => {
  it('seznam „Dnes stočeno" má u každého stáčení tužku; úprava je zavřená, dokud se neklepne', async () => {
    otevri();
    await pockejNaSeznam();
    expect(screen.getAllByRole('button', { name: /^Upravit uložené: / })).toHaveLength(2);
    expect(screen.queryByTestId('uprava-ulozeneho')).toBeNull();
  });

  it('tužka otevře pod zápisem tabulku s tím pivem a dneškem — jiné pivo ani včerejšek v ní nejsou', async () => {
    otevri();
    await otevriUpravuSvetle();
    const u = within(uprava());
    expect(nadpisUpravy().textContent).toContain('12° Světlá');
    expect(u.getByRole('button', { name: '12° Světlá · 1 L lahve: 44 ks' })).toBeTruthy();
    expect(u.getByRole('button', { name: '12° Světlá · 1,5 L lahve: 30 ks' })).toBeTruthy();
    expect(u.getByRole('button', { name: '12° Světlá · sud 50 L: 2×' })).toBeTruthy();
    expect(u.queryByRole('button', { name: /Jantar/ })).toBeNull();
    // včerejší stáčení (20× 0,5 l) tu není: buňka 0,5 l je prázdná a je jen jeden den
    expect(u.queryByRole('button', { name: /0,5 L lahve: 20 ks/ })).toBeNull();
    expect(u.getAllByTestId('den-staceni')).toHaveLength(1);
    // klepnutí na tužku samo nic nezapsalo
    expect(h.operace).toEqual([]);
  });

  it('číslo lahví se přepíše klepnutím: zapíše se do databáze a seznam nahoře se přepočítá', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(within(uprava()).getByRole('button', { name: '12° Světlá · 1 L lahve: 44 ks' }));
    const policko = await screen.findByLabelText(/— počet$/);
    fireEvent.change(policko, { target: { value: '40' } });
    await enter(policko);
    await waitFor(() => expect(within(uprava()).getByRole('button', { name: '12° Světlá · 1 L lahve: 40 ks' })).toBeTruthy());
    expect(h.operace).toEqual([{ typ: 'update', zmena: { quantity: 40 }, ids: ['r2'] }]);
    expect(h.DB.bottling.find((r) => r.id === 'r2')!.quantity).toBe(40);
    expect(h.DB.bottling.find((r) => r.id === 'r1')!.quantity).toBe(30);
    expect(h.chyba).not.toHaveBeenCalled();
    // seznam „Dnes stočeno" ukazuje nové číslo a úprava zůstala otevřená
    expect(screen.getByText(/30× 1,5 l, 40× 1 l ze 2× sud 50 l/)).toBeTruthy();
    expect(screen.queryByTestId('uprava-ulozeneho')).toBeTruthy();
  });

  it('počet sudů se dá opravit taky (stejně jako v Přehledu): změní se na celé šarži', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(within(uprava()).getByRole('button', { name: '12° Světlá · sud 50 L: 2×' }));
    const policko = await screen.findByLabelText(/— počet$/);
    fireEvent.change(policko, { target: { value: '3' } });
    await enter(policko);
    await waitFor(() => expect(within(uprava()).getByRole('button', { name: '12° Světlá · sud 50 L: 3×' })).toBeTruthy());
    expect(h.operace).toEqual([{
      typ: 'update', zmena: { kegs_used: 3, kegs_used_package_id: 'keg-50', source_volume_l: 150 }, ids: ['r1', 'r2'],
    }]);
    expect(screen.getByText(/ze 3× sud 50 l/)).toBeTruthy();
  });

  it('prázdné políčko záznam smaže, „Vrátit zpět" ho vrátí', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(within(uprava()).getByRole('button', { name: '12° Světlá · 1 L lahve: 44 ks' }));
    const policko = await screen.findByLabelText(/— počet$/);
    fireEvent.change(policko, { target: { value: '' } });
    await enter(policko);
    await waitFor(() => expect(h.operace).toEqual([{ typ: 'delete', ids: ['r2'] }]));
    expect(h.DB.bottling.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
    expect(h.toastZpet).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/30× 1,5 l ze 2× sud 50 l/)).toBeTruthy());
    expect(screen.queryByText(/30× 1,5 l, 44× 1 l/)).toBeNull();

    await act(async () => { await h.toastZpet.mock.calls[0][1](); });
    await waitFor(() => expect(h.DB.bottling.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']));
    await waitFor(() => expect(screen.getByText(/30× 1,5 l, 44× 1 l ze 2× sud 50 l/)).toBeTruthy());
  });

  it('chyba databáze se ohlásí a číslo zůstane původní', async () => {
    otevri();
    await otevriUpravuSvetle();
    h.chybaDb = { message: 'síť spadla' };
    fireEvent.click(within(uprava()).getByRole('button', { name: '12° Světlá · 1 L lahve: 44 ks' }));
    const policko = await screen.findByLabelText(/— počet$/);
    fireEvent.change(policko, { target: { value: '40' } });
    await enter(policko);
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(h.DB.bottling.find((r) => r.id === 'r2')!.quantity).toBe(44);
    expect(within(uprava()).getByRole('button', { name: '12° Světlá · 1 L lahve: 44 ks' })).toBeTruthy();
  });

  it('podrobnosti → tužka u záznamu otevře úpravu celého záznamu; uložení změní řádek v databázi', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(within(uprava()).getByRole('button', { name: 'Podrobnosti: 12° Světlá' }));
    const zaznamy = await screen.findAllByTestId('zaznam-staceni');
    // 1,5 l je první (největší obal), 1 l druhý
    fireEvent.click(within(zaznamy[1]).getByLabelText('Upravit záznam'));
    expect(await screen.findByText('Upravit záznam stáčení lahví')).toBeTruthy();
    expect(screen.queryByTestId('detail-radku')).toBeNull();
    const mnozstvi = screen.getByText('Množství (ks)').parentElement!.querySelector('input') as HTMLInputElement;
    expect(mnozstvi.value).toBe('44');
    fireEvent.change(mnozstvi, { target: { value: '42' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uložit změny' })); });
    await waitFor(() => expect(h.operace).toHaveLength(1));
    expect(h.operace[0]).toMatchObject({ typ: 'update', ids: ['r2'], zmena: { quantity: 42, beer_id: 'beer-12', package_id: 'pkg-1', entry_date: '2026-10-15' } });
    await waitFor(() => expect(screen.getByText(/30× 1,5 l, 42× 1 l ze 2× sud 50 l/)).toBeTruthy());
    expect(screen.queryByText('Upravit záznam stáčení lahví')).toBeNull();
    expect(h.chyba).not.toHaveBeenCalled();
  });

  it('„Hotovo" úpravu zavře; seznam zůstane', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(within(uprava()).getByRole('button', { name: 'Hotovo' }));
    expect(screen.queryByTestId('uprava-ulozeneho')).toBeNull();
    expect(screen.getAllByRole('button', { name: /^Upravit uložené: / })).toHaveLength(2);
  });

  it('klepnutí na tužku u jiného piva přepne úpravu na to pivo', async () => {
    otevri();
    await otevriUpravuSvetle();
    fireEvent.click(screen.getByRole('button', { name: /^Upravit uložené: Jantar/ }));
    await waitFor(() => expect(nadpisUpravy().textContent).toContain('Jantar'));
    expect(within(uprava()).getByRole('button', { name: 'Jantar · 1 L lahve: 44 ks' })).toBeTruthy();
    expect(within(uprava()).queryByRole('button', { name: /12° Světlá/ })).toBeNull();
  });

  it('smaže-li se v úpravě poslední záznam piva, úprava to řekne větou a seznam to pivo ztratí', async () => {
    otevri();
    await pockejNaSeznam();
    fireEvent.click(screen.getByRole('button', { name: /^Upravit uložené: Jantar/ }));
    await screen.findByTestId('uprava-ulozeneho');
    fireEvent.click(within(uprava()).getByRole('button', { name: 'Jantar · 1 L lahve: 44 ks' }));
    const policko = await screen.findByLabelText(/— počet$/);
    fireEvent.change(policko, { target: { value: '0' } });
    await enter(policko);
    await waitFor(() => expect(within(uprava()).getByRole('status').textContent).toContain('nic uloženo'));
    expect(screen.queryByRole('button', { name: /^Upravit uložené: Jantar/ })).toBeNull();
  });

  it('po přepnutí na Přehled a zpět je úprava zavřená', async () => {
    const { rerender } = otevri();
    await otevriUpravuSvetle();
    rerender(<BottlingScreen setPage={vi.fn()} initialSubTab="prehled" />);
    await waitFor(() => expect(screen.queryByTestId('uprava-ulozeneho')).toBeNull());
    rerender(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);
    await pockejNaSeznam();
    expect(screen.queryByTestId('uprava-ulozeneho')).toBeNull();
  });

  it('v panelu piva je u „Už uloženo" tužka: panel se zavře a otevře se úprava toho piva', async () => {
    otevri();
    await pockejNaSeznam();
    fireEvent.click(await screen.findByRole('button', { name: /^12° Světlá/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: /^Upravit uložené: / }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await screen.findByTestId('uprava-ulozeneho');
    expect(nadpisUpravy().textContent).toContain('12° Světlá');
    expect(h.operace).toEqual([]);
  });
});
