// Lahve → Přehled jako tabulka (BottlingScreen + components/PrehledStaceniLahvi.tsx
// + lib/upravyStaceni.ts) proti „databázi" v paměti.
// 15. 10. 2026: „udělej přehled stáčení v takové tabulce jako ten excel — ať je
// vidět, kolik se stočilo z kolika sudů, výtrata, a šlo to editovat."
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
  entry_date: '2026-10-12', beer_id: 'beer-12', beer_name: '12° Světlá', note: null,
  created_at: '2026-10-12T08:00:00+00:00', created_by: 'u1',
  kegs_used: 2, kegs_used_package_id: 'keg-50', source_volume_l: 100,
  package_label: 'PET', ...o,
});

/** Pondělí: 12° Světlá (2× 50 l → 30× 1,5 l + 44× 1 l) a Jantar (1× 50 l → 44× 1 l). Úterý: 12° Světlá (1× 50 l → 20× 0,5 l). */
const zakladniData = () => [
  zaznam({ id: 'r1', package_id: 'pkg-15', quantity: 30 }),
  zaznam({ id: 'r2', package_id: 'pkg-1', quantity: 44 }),
  zaznam({ id: 'r3', beer_id: 'beer-jan', beer_name: 'Jantar', package_id: 'pkg-1', quantity: 44, kegs_used: 1, source_volume_l: 50, created_at: '2026-10-12T09:00:00+00:00' }),
  zaznam({ id: 'r4', entry_date: '2026-10-13', package_id: 'pkg-05', quantity: 20, kegs_used: 1, source_volume_l: 50, created_at: '2026-10-13T08:00:00+00:00' }),
];

const otevri = () => render(<BottlingScreen setPage={vi.fn()} initialSubTab="prehled" />);
/** Tabulka dne podle nadpisu (nejnovější den je nahoře). */
const den = (kde: 'utery' | 'pondeli') => screen.getAllByTestId('den-staceni')
  .find((d) => d.querySelector('h3')?.textContent?.includes(kde === 'utery' ? 'Úterý' : 'Pondělí'))!;
/** Buňka podle popisku, např. „12° Světlá · 1 L lahve: 44 ks" — výchozí je pondělí (12° Světlá je i v úterý). */
const bunka = (popisek: RegExp | string, kde: 'utery' | 'pondeli' = 'pondeli') =>
  within(den(kde)).getByRole('button', { name: popisek });
const enter = async (el: HTMLElement) => { await act(async () => { fireEvent.keyDown(el, { key: 'Enter' }); }); };

async function pockejNaTabulku() {
  await waitFor(() => expect(screen.getAllByTestId('den-staceni').length).toBeGreaterThan(0));
}

/** Přepíše číslo v buňce: klepnutí, napsání, Enter. */
async function prepis(popisek: RegExp | string, text: string) {
  fireEvent.click(bunka(popisek));
  const policko = await screen.findByLabelText(/— počet$/);
  fireEvent.change(policko, { target: { value: text } });
  await enter(policko);
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

describe('Lahve → Přehled: tabulka', () => {
  it('stáčení z databáze je v tabulkách po dnech, sudy a lahve ve svých sloupcích', async () => {
    otevri();
    await pockejNaTabulku();
    const dny = screen.getAllByTestId('den-staceni');
    expect(dny).toHaveLength(2);
    expect(within(dny[0]).getByRole('heading').textContent).toContain('Úterý 13. 10.');
    expect(within(dny[1]).getByRole('heading').textContent).toContain('Pondělí 12. 10.');
    // pondělí: dvě piva, 12° Světlá z 2× 50 l (30× 1,5 l + 44× 1 l), Jantar z 1× 50 l
    expect(within(dny[1]).getAllByTestId('radek-staceni')).toHaveLength(2);
    expect(bunka('12° Světlá · sud 50 L: 2×').textContent).toBe('2');
    expect(bunka('12° Světlá · 1,5 L lahve: 30 ks').textContent).toBe('30');
    expect(bunka('12° Světlá · 1 L lahve: 44 ks').textContent).toBe('44');
    expect(bunka('Jantar · 1 L lahve: 44 ks').textContent).toBe('44');
    // litry a výtrata: 30 × 1,5 + 44 = 89 l ze 100 l
    expect(within(dny[1]).getAllByTestId('souhrn-radku')[0].textContent).toContain('89 L z 100 L');
    expect(within(dny[1]).getAllByTestId('souhrn-radku')[0].textContent).toContain('výtrata 11 %');
  });
});

describe('Lahve → Přehled: přepsání čísla v buňce', () => {
  it('počet lahví: jeden záznam se přepíše v databázi i na obrazovce', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · 1 L lahve: 44 ks', '40');
    await waitFor(() => expect(bunka('12° Světlá · 1 L lahve: 40 ks').textContent).toBe('40'));
    expect(h.operace).toEqual([{ typ: 'update', zmena: { quantity: 40 }, ids: ['r2'] }]);
    expect(h.DB.bottling.find((r) => r.id === 'r2')!.quantity).toBe(40);
    expect(h.DB.bottling.find((r) => r.id === 'r1')!.quantity).toBe(30);
    expect(h.chyba).not.toHaveBeenCalled();
  });

  it('počet sudů: změní se na všech záznamech šarže i s litry ze sudů a výtrata se přepočítá', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · sud 50 L: 2×', '3');
    await waitFor(() => expect(bunka('12° Světlá · sud 50 L: 3×').textContent).toBe('3'));
    expect(h.operace).toEqual([{
      typ: 'update', zmena: { kegs_used: 3, kegs_used_package_id: 'keg-50', source_volume_l: 150 }, ids: ['r1', 'r2'],
    }]);
    // 89 l ze 150 l → výtrata 40,7 %
    expect(within(den('pondeli')).getAllByTestId('souhrn-radku')[0].textContent).toContain('89 L z 150 L');
    expect(within(den('pondeli')).getAllByTestId('souhrn-radku')[0].textContent).toContain('výtrata 40,7 %');
    // druhá šarže (Jantar) zůstala
    expect(h.DB.bottling.find((r) => r.id === 'r3')!.kegs_used).toBe(1);
  });

  it('číslo v jiné velikosti sudu sudy přesune: původní sloupec se vyprázdní', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · sud 30 L: prázdné', '2');
    await waitFor(() => expect(bunka('12° Světlá · sud 30 L: 2×').textContent).toBe('2'));
    expect(h.operace[0].zmena).toEqual({ kegs_used: 2, kegs_used_package_id: 'keg-30', source_volume_l: 60 });
    expect(within(den('pondeli')).queryByRole('button', { name: '12° Světlá · sud 50 L: 2×' })).toBeNull();
    expect(bunka('12° Světlá · sud 50 L: prázdné').textContent).toBe('·');
    // úterý se nedotklo
    expect(bunka('12° Světlá · sud 50 L: 1×', 'utery').textContent).toBe('1');
  });

  it('klepnout do jiné velikosti sudu a pustit nic nepřesune', async () => {
    otevri();
    await pockejNaTabulku();
    fireEvent.click(bunka('12° Světlá · sud 30 L: prázdné'));
    await act(async () => { fireEvent.blur(await screen.findByLabelText(/— počet$/)); });
    expect(h.operace).toEqual([]);
    expect(bunka('12° Světlá · sud 50 L: 2×').textContent).toBe('2');
  });

  it('nula smaže záznam; „Vrátit zpět" ho vrátí, i s původním id', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · 1 L lahve: 44 ks', '');
    await waitFor(() => expect(bunka('12° Světlá · 1 L lahve: prázdné').textContent).toBe('·'));
    expect(h.operace).toEqual([{ typ: 'delete', ids: ['r2'] }]);
    expect(h.DB.bottling.map((r) => r.id)).toEqual(['r1', 'r3', 'r4']);
    expect(h.toastZpet).toHaveBeenCalledTimes(1);

    await act(async () => { await h.toastZpet.mock.calls[0][1](); });
    expect(h.operace[1]).toMatchObject({ typ: 'insert', radky: [expect.objectContaining({ id: 'r2', quantity: 44 })] });
    await waitFor(() => expect(bunka('12° Světlá · 1 L lahve: 44 ks').textContent).toBe('44'));
  });

  it('nová velikost lahví se vloží do téže šarže (stejný čas a sudy), ne jako nová dávka', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · 0,5 L lahve: prázdné', '20');
    await waitFor(() => expect(bunka('12° Světlá · 0,5 L lahve: 20 ks').textContent).toBe('20'));
    expect(h.operace).toHaveLength(1);
    expect(h.operace[0].radky![0]).toMatchObject({
      entry_date: '2026-10-12', beer_id: 'beer-12', package_id: 'pkg-05', quantity: 20,
      kegs_used: 2, kegs_used_package_id: 'keg-50', source_volume_l: 100, created_at: '2026-10-12T08:00:00+00:00',
    });
    // pořád jeden řádek 12° Světlé v pondělí — nová velikost je v něm, ne v novém
    const pondeli = den('pondeli');
    expect(within(pondeli).getAllByTestId('radek-staceni')).toHaveLength(2);
    // 30 × 1,5 + 44 + 20 × 0,5 = 99 l ze 100 l
    expect(within(pondeli).getAllByTestId('souhrn-radku')[0].textContent).toContain('99 L z 100 L');
  });

  it('chyba databáze se ohlásí a číslo v buňce zůstane původní', async () => {
    otevri();
    await pockejNaTabulku();
    h.chybaDb = { message: 'spojení spadlo' };
    await prepis('12° Světlá · 1 L lahve: 44 ks', '40');
    await waitFor(() => expect(h.chyba).toHaveBeenCalledWith('Uložení se nepovedlo: spojení spadlo'));
    expect(bunka('12° Světlá · 1 L lahve: 44 ks').textContent).toBe('44');
    expect(h.DB.bottling.find((r) => r.id === 'r2')!.quantity).toBe(44);
  });

  it('neplatné číslo („4,5") se do databáze nedostane a řekne se proč', async () => {
    otevri();
    await pockejNaTabulku();
    await prepis('12° Světlá · 1 L lahve: 44 ks', '4,5');
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/celé číslo/);
    expect(h.operace).toEqual([]);
    expect(bunka('12° Světlá · 1 L lahve: 44 ks').textContent).toBe('44');
  });

  it('přehmat o řád (44 → 440) se zeptá; „ne" nezapíše nic', async () => {
    // dostatek historie téhož piva a obalu (týden se v testu skládá ze všeho)
    h.DB.bottling = [
      ...zakladniData(),
      ...[1, 2, 3, 4, 5].map((i) => zaznam({ id: `h${i}`, entry_date: `2026-10-0${i}`, package_id: 'pkg-1', quantity: 40, kegs_used: null, kegs_used_package_id: null, source_volume_l: null, created_at: `2026-10-0${i}T08:00:00+00:00` })),
    ];
    h.potvrd.mockResolvedValue(false);
    otevri();
    await pockejNaTabulku();
    await prepis(/^12° Světlá · 1 L lahve: 44 ks$/, '440');
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(h.potvrd.mock.calls[0][0]).toMatch(/zadáno 440 ks/);
    expect(h.operace).toEqual([]);
    expect(bunka(/^12° Světlá · 1 L lahve: 44 ks$/).textContent).toBe('44');
  });
});

describe('Lahve → Přehled: podrobnosti řádku', () => {
  const detail12 = () => fireEvent.click(screen.getAllByRole('button', { name: 'Podrobnosti: 12° Světlá' })[1]); // pondělí (úterý je nahoře)

  it('smazání celého řádku: všechny jeho záznamy najednou, s nabídkou vrácení', async () => {
    otevri();
    await pockejNaTabulku();
    detail12();
    fireEvent.click(await screen.findByRole('button', { name: /Smazat celý řádek/ }));
    await waitFor(() => expect(h.operace).toEqual([{ typ: 'delete', ids: ['r1', 'r2'] }]));
    expect(h.DB.bottling.map((r) => r.id)).toEqual(['r3', 'r4']);
    expect(h.toastZpet.mock.calls[0][0]).toBe('Smazáno: 12° Světlá (2 záznamy)');
    await act(async () => { await h.toastZpet.mock.calls[0][1](); });
    await waitFor(() => expect(h.DB.bottling.map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3', 'r4']));
  });

  it('den a pivo: celá šarže se přesune a tabulka se přeskupí', async () => {
    otevri();
    await pockejNaTabulku();
    detail12();
    fireEvent.change(await screen.findByLabelText('Datum'), { target: { value: '2026-10-14' } });
    fireEvent.change(screen.getByLabelText('Pivo'), { target: { value: 'beer-jan' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uložit den a pivo' })); });
    await waitFor(() => expect(h.operace).toEqual([{
      typ: 'update', zmena: { entry_date: '2026-10-14', beer_id: 'beer-jan', beer_name: 'Jantar' }, ids: ['r1', 'r2'],
    }]));
    await waitFor(() => expect(screen.getAllByTestId('den-staceni')).toHaveLength(3));
    expect(screen.getAllByTestId('den-staceni')[0].querySelector('h3')!.textContent).toContain('Středa 14. 10.');
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });

  it('±1 kus u záznamu dál funguje', async () => {
    otevri();
    await pockejNaTabulku();
    detail12();
    fireEvent.click(within((await screen.findAllByTestId('zaznam-staceni'))[1]).getByLabelText('Přidat kus')); // 1 L
    await waitFor(() => expect(h.operace).toEqual([{ typ: 'update', zmena: { quantity: 45 }, ids: ['r2'] }]));
  });

  it('tužka u záznamu otevře úpravu celého záznamu a podrobnosti zavře', async () => {
    otevri();
    await pockejNaTabulku();
    detail12();
    fireEvent.click(within((await screen.findAllByTestId('zaznam-staceni'))[0]).getByLabelText('Upravit záznam'));
    expect(await screen.findByText('Upravit záznam stáčení lahví')).toBeTruthy();
    expect(screen.queryByTestId('detail-radku')).toBeNull();
  });
});

describe('Lahve → Přehled: sud bez velikosti', () => {
  const SBEZ = () => [zaznam({ id: 'x1', package_id: 'pkg-1', quantity: 44, kegs_used: 2, kegs_used_package_id: null, source_volume_l: null })];

  it('řádek svítí poplachem a velikost se doplní číslem do sloupce', async () => {
    h.DB.bottling = SBEZ();
    otevri();
    await pockejNaTabulku();
    expect(screen.getAllByRole('alert').some((a) => /vyber velikost sudu/.test(a.textContent ?? ''))).toBe(true);
    await prepis('12° Světlá · sud 50 L: velikost sudu chybí', '2');
    await waitFor(() => expect(h.operace).toEqual([{
      typ: 'update', zmena: { kegs_used: 2, kegs_used_package_id: 'keg-50', source_volume_l: 100 }, ids: ['x1'],
    }]));
    await waitFor(() => expect(bunka('12° Světlá · sud 50 L: 2×').textContent).toBe('2'));
  });

  it('červený pruh nahoře dál umí doplnit velikost jedním klepnutím (stará cesta)', async () => {
    h.DB.bottling = SBEZ();
    otevri();
    await pockejNaTabulku();
    const pruh = (await screen.findAllByText(/Sudy bez velikosti — sklad je neodečte/))[0].closest('[role="alert"]') as HTMLElement;
    fireEvent.click(within(pruh).getByRole('radio', { name: 'KEG 30 L' }));
    await waitFor(() => expect(h.operace).toEqual([{
      typ: 'update', zmena: { kegs_used_package_id: 'keg-30', source_volume_l: 60 }, ids: ['x1'],
    }]));
  });
});
