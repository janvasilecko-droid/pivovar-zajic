// Čtení z fotky → zápis stáčení lahví (BottlingScreen + lib/zapisStaceniLahvi.ts).
// 15. 10. 2026: „napřed dokonči to čtení z fotek… přiřadíš sud, množství sudů
// a počet lahví z nich stočený a importuješ do tabulky" — víc dnů najednou,
// každý řádek se svým dnem, až čtyři druhy lahví s tím samým sudem.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

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
      { id: 'keg-20', label: 'KEG 20l', kind: 'keg', volume_l: 20, sort_order: 6 },
    ],
    orders: [], order_items: [], inventory: [] as any[], fasovani: [], fasovani_private: [],
    writeoffs: [], kegging: [], keg_prefuk: [], zavoz_deductions: [], bottling_plans: [],
  } as Record<string, any[]>,
  vlozeno: [] as any[][],
  potvrd: vi.fn(),
  /** Řádky, které „dialog z fotky" předá obrazovce. */
  radkyZFotky: [] as any[],
}));

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const q: any = Promise.resolve({ data, error: null });
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.insert = vi.fn((payload: any) => {
      if (table === 'bottling') h.vlozeno.push(Array.isArray(payload) ? payload : [payload]);
      return Promise.resolve({ data: null, error: null });
    });
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
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
// Dialog z fotky se nahrazuje tlačítkem, které předá obrazovce připravené řádky
// (přesně tak, jak je předá skutečný dialog: s `datum` u řádku z tabulky).
vi.mock('../components/ImportBottlingFromImage', () => ({
  ImportBottlingFromImage: ({ onImport, onClose }: any) => (
    <button type="button" onClick={() => { onImport(h.radkyZFotky, '2026-10-13', ''); onClose(); }}>ZZ vložit z fotky</button>
  ),
}));
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

/** Řádek tak, jak ho předá dialog z fotky (jen vyplněná pole). */
const radekZFotky = (o: Record<string, unknown>) => ({
  beerId: 'beer-12', pkgId: '', qty: '', pkg2Id: '', qty2: '', pkg3Id: '', qty3: '', pkg4Id: '', qty4: '',
  kegPkgId: '', kegQty: '', keg2PkgId: '', keg2Qty: '', ...o,
});

const STARY_DEN = radekZFotky({ datum: '2026-10-06', kegPkgId: 'keg-50', kegQty: '3', pkgId: 'pkg-1', qty: '140' });
const CTYRI_DRUHY = radekZFotky({
  datum: '2026-10-13', kegPkgId: 'keg-50', kegQty: '1',
  pkgId: 'pkg-15', qty: '11', pkg2Id: 'pkg-1', qty2: '4', pkg3Id: 'pkg-05', qty3: '20', pkg4Id: 'pkg-033', qty4: '60',
});
const STEJNY_DEN_PODRUHE = radekZFotky({ datum: '2026-10-13', kegPkgId: 'keg-50', kegQty: '1', pkgId: 'pkg-1', qty: '45' });

const otevri = () => render(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);

async function vlozZFotky(radky: any[]) {
  h.radkyZFotky = radky;
  fireEvent.click(await screen.findByRole('button', { name: /Číst z fotky/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'ZZ vložit z fotky' }));
}
const ulozit = () => fireEvent.click(screen.getByRole('button', { name: /Uložit stáčení lahví/ }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.vlozeno.length = 0;
  h.DB.bottling = [];
  h.DB.inventory = [];
  h.potvrd.mockReset();
  h.potvrd.mockResolvedValue(true);
});

describe('Čtení z fotky → řádky zápisu', { timeout: 15_000 }, () => {
  it('víc dnů najednou: každý řádek je v zápisu se svým dnem, čtvrtá velikost lahví má taky svůj řádek se sudem', async () => {
    otevri();
    await vlozZFotky([STARY_DEN, CTYRI_DRUHY]);
    expect(await screen.findByText(/6\. 10\. · PET 1 l · 12° Světlá/)).toBeTruthy();
    expect(screen.getByText(/13\. 10\. · sklo 0,33 l · 12° Světlá/)).toBeTruthy();
    expect(screen.getByText(/13\. 10\. · PET 1,5 l · 12° Světlá/)).toBeTruthy();
    // sudy jsou řádky zápisu taky: 3× KEG 50 l (6. 10.) a 1× (13. 10.)
    expect(screen.getAllByText(/KEG 50l · 12° Světlá/)).toHaveLength(2);
  });

  it('datum formuláře se kvůli řádkům s vlastním dnem nemění', async () => {
    otevri();
    await vlozZFotky([STARY_DEN]);
    await screen.findByText(/6\. 10\. · PET 1 l/);
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-15');
  });

  it('řádky z fotky se přidají k tomu, co už je rozepsané — nic se nepřepíše', async () => {
    localStorage.setItem('rozepsane_staceni_lahve', JSON.stringify({
      entryRows: [{ beerId: 'beer-jan', pkgId: 'pkg-15', qty: '25', kegPkgId: 'keg-50', kegQty: '1' }],
      date: '2026-10-15', note: '',
    }));
    otevri();
    await screen.findByText(/Zápis stáčení/);
    await vlozZFotky([STARY_DEN]);
    expect(await screen.findByText(/6\. 10\. · PET 1 l · 12° Světlá/)).toBeTruthy();
    expect(screen.getByText(/PET 1,5 l · Jantar/)).toBeTruthy();
  });

  it('řádek z fotky nejde otevřít v dlaždici (dlaždice upravuje jen ruční řádek), počet se mění tlačítky', async () => {
    otevri();
    await vlozZFotky([STARY_DEN]);
    const radek = (await screen.findByText(/6\. 10\. · PET 1 l/)).closest('li') as HTMLElement;
    expect(radek.querySelector('button[title="Klikni pro úpravu v dlaždici"]')).toBeNull();
    const pole = radek.querySelector('input[type="number"]') as HTMLInputElement;
    expect(pole.value).toBe('140');
    fireEvent.click(within(radek).getByRole('button', { name: '+' }));
    expect((radek.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('141');
  });
});

describe('Rozepsané řádky z fotky se neztratí', () => {
  it('po odchodu z obrazovky a návratu zůstanou i s dnem a se čtvrtým druhem lahví', async () => {
    const prvni = otevri();
    await vlozZFotky([STARY_DEN, CTYRI_DRUHY]);
    await screen.findByText(/13\. 10\. · sklo 0,33 l/);
    const ulozeny = JSON.parse(localStorage.getItem('rozepsane_staceni_lahve') as string);
    expect(ulozeny.entryRows.filter((r: any) => r.beerId).map((r: any) => [r.datum, r.qty4])).toEqual([['2026-10-06', ''], ['2026-10-13', '60']]);
    prvni.unmount();

    otevri();
    expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    expect(await screen.findByText(/6\. 10\. · PET 1 l · 12° Světlá/)).toBeTruthy();
    expect(screen.getByText(/13\. 10\. · sklo 0,33 l · 12° Světlá/)).toBeTruthy();
    // …a uložit jde pořád na správné dny a se sudem.
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0].map((z) => z.entry_date)).toEqual(['2026-10-06', '2026-10-13', '2026-10-13', '2026-10-13', '2026-10-13']);
    expect(h.vlozeno[0].every((z) => z.kegs_used_package_id === 'keg-50')).toBe(true);
  });
});

describe('Uložení řádků z fotky', () => {
  it('každý řádek se zapíše na svůj den; čtyři druhy lahví nesou stejný sud', async () => {
    otevri();
    await vlozZFotky([STARY_DEN, CTYRI_DRUHY]);
    await screen.findByText(/6\. 10\. · PET 1 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    const zaznamy = h.vlozeno[0];
    // 1 záznam z 6. 10. + 4 záznamy z 13. 10.
    expect(zaznamy).toHaveLength(5);
    const stary = zaznamy.filter((z) => z.entry_date === '2026-10-06');
    expect(stary).toHaveLength(1);
    expect(stary[0]).toMatchObject({ package_id: 'pkg-1', quantity: 140, kegs_used: 3, kegs_used_package_id: 'keg-50', source_volume_l: 150 });
    const ctyri = zaznamy.filter((z) => z.entry_date === '2026-10-13');
    expect(ctyri.map((z) => [z.package_id, z.quantity])).toEqual([['pkg-15', 11], ['pkg-1', 4], ['pkg-05', 20], ['pkg-033', 60]]);
    for (const z of ctyri) {
      expect(z).toMatchObject({ beer_id: 'beer-12', kegs_used: 1, kegs_used_package_id: 'keg-50', source_volume_l: 50 });
    }
  });

  it('dávky mají různý čas vzniku, záznamy jedné dávky stejný — jinak by se sud druhé dávky neodečetl', async () => {
    otevri();
    await vlozZFotky([CTYRI_DRUHY, STEJNY_DEN_PODRUHE]);
    await screen.findByText(/13\. 10\. · sklo 0,33 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    const [prvniDavka, druhaDavka] = [h.vlozeno[0].slice(0, 4), h.vlozeno[0].slice(4)];
    expect(new Set(prvniDavka.map((z) => z.created_at)).size).toBe(1);
    expect(new Set(druhaDavka.map((z) => z.created_at)).size).toBe(1);
    expect(prvniDavka[0].created_at).not.toBe(druhaDavka[0].created_at);
    expect(Date.parse(druhaDavka[0].created_at)).toBeGreaterThan(Date.parse(prvniDavka[0].created_at));
  });

  it('jediný řádek dostane čas od databáze (created_at se neposílá)', async () => {
    otevri();
    await vlozZFotky([STARY_DEN]);
    await screen.findByText(/6\. 10\. · PET 1 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0][0]).not.toHaveProperty('created_at');
  });

  it('řádek bez vlastního dne se zapíše na datum formuláře', async () => {
    otevri();
    await vlozZFotky([{ ...STARY_DEN, datum: null }]);
    await screen.findByText(/PET 1 l · 12° Světlá/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    // (dialog předal datum 13. 10. — bez vlastního dne je to datum formuláře)
    expect(h.vlozeno[0][0].entry_date).toBe('2026-10-13');
  });

  it('po uložení je formulář i rozepsaný koncept prázdný', async () => {
    otevri();
    await vlozZFotky([STARY_DEN]);
    await screen.findByText(/6\. 10\. · PET 1 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/Zápis stáčení/)).toBeNull());
    expect(localStorage.getItem('rozepsane_staceni_lahve')).toBeNull();
  });
});

describe('Zdvojení a uzavřené měsíce u řádků z fotky', () => {
  it('den + pivo, které už je zapsané: appka se zeptá a po „ne" nic nezapíše', async () => {
    h.DB.bottling = [{ id: 'z1', entry_date: '2026-10-13', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 44, kegs_used: 1, kegs_used_package_id: 'keg-50' }];
    h.potvrd.mockResolvedValue(false);
    otevri();
    await vlozZFotky([CTYRI_DRUHY]);
    await screen.findByText(/13\. 10\. · PET 1,5 l/);
    ulozit();
    await waitFor(() => expect(h.potvrd).toHaveBeenCalled());
    expect(String(h.potvrd.mock.calls[0][0])).toMatch(/Tohle už ve stáčení lahví je/);
    expect(String(h.potvrd.mock.calls[0][0])).toMatch(/13\. 10\. · 12° Světlá — už zapsáno 44 ks/);
    expect(h.vlozeno).toHaveLength(0);
  });

  it('po souhlasu se řádky přidají', async () => {
    h.DB.bottling = [{ id: 'z1', entry_date: '2026-10-13', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 44 }];
    otevri();
    await vlozZFotky([CTYRI_DRUHY]);
    await screen.findByText(/13\. 10\. · PET 1,5 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0]).toHaveLength(4);
  });

  it('jiný den téhož piva zdvojení není', async () => {
    h.DB.bottling = [{ id: 'z1', entry_date: '2026-10-12', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 44 }];
    otevri();
    await vlozZFotky([CTYRI_DRUHY]);
    await screen.findByText(/13\. 10\. · PET 1,5 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.potvrd).not.toHaveBeenCalled();
  });

  it('ručně zadaný řádek (bez vlastního dne) se na zdvojení neptá', async () => {
    h.DB.bottling = [{ id: 'z1', entry_date: '2026-10-15', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 44 }];
    localStorage.setItem('rozepsane_staceni_lahve', JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-15', qty: '10', kegPkgId: 'keg-50', kegQty: '1' }],
      date: '2026-10-15', note: '',
    }));
    otevri();
    await screen.findByText(/Zápis stáčení/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.potvrd).not.toHaveBeenCalled();
  });

  it('řádky ve dvou napočítaných měsících: jedna otázka s oběma měsíci', async () => {
    h.DB.inventory = [
      { entry_date: '2026-09-30', note: 'Fyzická inventura' },
      { entry_date: '2026-10-31', note: 'Schválená inventura' },
    ];
    otevri();
    await vlozZFotky([{ ...STARY_DEN, datum: '2026-09-28' }, CTYRI_DRUHY]);
    await screen.findByText(/28\. 9\. · PET 1 l/);
    ulozit();
    await waitFor(() => expect(h.potvrd).toHaveBeenCalled());
    const dotaz = String(h.potvrd.mock.calls[0][0]);
    expect(dotaz).toMatch(/Měsíce 2026-09, 2026-10 už mají napočítanou inventuru/);
  });

  it('nenapočítaný měsíc se na uzamčení neptá', async () => {
    otevri();
    await vlozZFotky([STARY_DEN]);
    await screen.findByText(/6\. 10\. · PET 1 l/);
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.potvrd).not.toHaveBeenCalled();
  });
});
