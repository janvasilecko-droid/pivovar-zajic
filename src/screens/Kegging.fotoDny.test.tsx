// Čtení z fotky na víc dnů najednou i ve Stáčení KEG (majitel 16. 10. 2026:
// „ano udělej to pro všechno"). Lahve to uměly od 15. 10. — tady se řádky z víc dnů
// tabulky odloží do seznamu „Řádky z fotky po dnech" a uloží se společně
// s formulářem, každý na svůj den. Z jednoho dne jdou do formuláře jako dosud.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import KeggingScreen from './Kegging';

type Radek = Record<string, unknown>;
type Odpoved = Promise<{ data: unknown; error: null }>;
type Dotaz = Odpoved & {
  select: () => Dotaz; order: () => Dotaz; eq: () => Dotaz; in: () => Dotaz; limit: () => Dotaz;
  maybeSingle: () => Odpoved; update: () => Dotaz; delete: () => Dotaz;
  insert: (radky: Radek | Radek[]) => Odpoved & { select: (sloupce?: string) => Odpoved };
};
type FotoRadek = { beerId: string; pkgId: string; qty: string; datum?: string | null };

const h = vi.hoisted(() => ({
  DB: {
    kegging: [],
    cellar_tanks: [],
    beers: [
      { id: 'beer-des', name: '10° Desítka', is_active: true, sort_order: 1 },
      { id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 2 },
      { id: 'beer-tm', name: '12° Tmavá', is_active: true, sort_order: 3 },
      { id: 'beer-jan', name: 'Jantar', is_active: true, sort_order: 4 },
    ],
    packages: [
      { id: 'pkg-30', label: '30l', kind: 'keg', volume_l: 30, sort_order: 1 },
      { id: 'pkg-50', label: '50l', kind: 'keg', volume_l: 50, sort_order: 2 },
    ],
    orders: [], order_items: [], inventory: [], fasovani: [], fasovani_private: [],
    writeoffs: [], keg_prefuk: [], zavoz_deductions: [],
  } as Record<string, Radek[]>,
  vlozeno: [] as Radek[],
  prelevy: [] as Radek[],
  rpc: [] as [string, Radek][],
  fotoRadky: [] as FotoRadek[],
  fotoDatum: '2026-10-16',
  otazky: [] as string[],
  odpovedNaOtazku: true,
}));

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string): Dotaz {
    const data = h.DB[table] ?? [];
    const q = Promise.resolve({ data, error: null }) as Dotaz;
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    q.update = vi.fn(() => q);
    q.delete = vi.fn(() => q);
    q.insert = vi.fn((payload: Radek | Radek[]) => {
      const radky = Array.isArray(payload) ? payload : [payload];
      if (table === 'kegging') h.vlozeno.push(...radky);
      if (table === 'cellar_transfers') h.prelevy.push(...radky);
      const vlozene = radky.map((r, i) => ({ id: `novy-${i}`, ...r }));
      const vysledek = Promise.resolve({ data: vlozene, error: null }) as Odpoved & { select: (sloupce?: string) => Odpoved };
      // Jako PostgREST: select vrací jen vyžádané sloupce — kód nesmí spoléhat na ty, které si nevyžádal.
      vysledek.select = vi.fn((sloupce?: string) => {
        if (!sloupce) return Promise.resolve({ data: vlozene, error: null });
        const klice = sloupce.split(',').map((k) => k.trim());
        return Promise.resolve({ data: vlozene.map((r) => Object.fromEntries(klice.map((k) => [k, (r as Radek)[k]]))), error: null });
      });
      return vysledek;
    });
    return q;
  }
  return {
    supabase: {
      from: vi.fn((t: string) => makeQuery(t)),
      rpc: vi.fn(async (fn: string, args: Radek) => { h.rpc.push([fn, args]); return { data: null, error: null }; }),
    },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
    beerName: vi.fn((b: { name?: string } | null) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/toast', async (puvodni) => ({
  ...(await puvodni<Record<string, unknown>>()),
  oznam: vi.fn(),
  potvrd: vi.fn(async (text: string) => { h.otazky.push(text); return h.odpovedNaOtazku; }),
}));
vi.mock('../lib/auth', () => ({ useAuth: vi.fn(() => ({ profile: { role: 'admin', display_name: 'Test' } })) }));
vi.mock('../lib/kegSanitation', () => ({
  autoLogKegSanitationFromChecklist: vi.fn().mockResolvedValue(undefined),
  isLastWeekOfMonth: vi.fn(() => false),
}));
vi.mock('../components/KeggingChecklistModal', () => ({
  KeggingChecklistModal: () => null,
  isStartChecklistCompleteForKeg: vi.fn(() => true),
  isMonthlyChecklistCompleteForKeg: vi.fn(() => true),
}));
vi.mock('../components/VoiceRecorder', () => ({ VoiceRecorder: () => null }));
// Okno čtení z fotky se nahrazuje tlačítkem, které „přečtené“ řádky rovnou předá obrazovce.
vi.mock('../components/ImportKeggingFromImage', async () => {
  const React = await import('react');
  return {
    ImportKeggingFromImage: (props: { onImport: (r: FotoRadek[], d: string, n: string) => void; onClose: () => void }) =>
      React.createElement('button', { type: 'button', onClick: () => { props.onImport(h.fotoRadky, h.fotoDatum, ''); props.onClose(); } }, 'Vložit z fotky (test)'),
  };
});
vi.mock('../lib/excel', () => ({ exportKeggingToExcel: vi.fn() }));
vi.mock('../lib/orderParser', () => ({
  parseFreeTextEntries: vi.fn(() => []),
  loadAliasMap: vi.fn().mockResolvedValue({}),
  emptyAliasMap: vi.fn(() => ({})),
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<Record<string, unknown>>()),
  businessDateISO: () => '2026-10-16',
}));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({
  isoWeekKey: vi.fn(() => '2026-42'),
  weekRange: vi.fn(() => ({ start: new Date('2026-10-12T00:00:00Z'), end: new Date('2026-10-18T00:00:00Z'), label: '12. 10. – 18. 10.' })),
  shiftWeek: vi.fn((k: string) => k),
}));

const KLIC = 'rozepsane_staceni_keg';
const TRI_DNY: FotoRadek[] = [
  { beerId: 'beer-des', pkgId: 'pkg-30', qty: '6', datum: '2026-10-12' },
  { beerId: 'beer-12', pkgId: 'pkg-50', qty: '2', datum: '2026-10-14' },
  { beerId: 'beer-des', pkgId: 'pkg-30', qty: '4', datum: '2026-10-14' },
];

async function otevriAVlozZFotky(radky: FotoRadek[], datum = '2026-10-16') {
  h.fotoRadky = radky;
  h.fotoDatum = datum;
  render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
  fireEvent.click(await screen.findByRole('button', { name: /Číst z fotky/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Vložit z fotky (test)' }));
}

const ulozit = () => fireEvent.click(screen.getByRole('button', { name: 'Uložit stáčení' }));
const panel = () => screen.queryByTestId('radky-z-fotky-po-dnech');
const dnyZapisu = () => h.vlozeno.map((r) => [r.entry_date, r.beer_id, r.package_id, r.quantity]);

describe('Stáčení KEG — čtení z fotky na víc dnů', () => {
  beforeEach(() => {
    localStorage.clear();
    h.vlozeno.length = 0;
    h.prelevy.length = 0;
    h.rpc.length = 0;
    h.otazky.length = 0;
    h.odpovedNaOtazku = true;
    h.DB.inventory = [];
    h.DB.kegging = [];
    h.DB.cellar_tanks = [];
    vi.clearAllMocks();
  });

  it('řádky z víc dnů se odloží do seznamu po dnech; formulář a jeho datum zůstanou', async () => {
    // Datum okna (15. 10.) se od dnešního data formuláře (16. 10.) liší — víc dnů ho nemění.
    await otevriAVlozZFotky(TRI_DNY, '2026-10-15');
    const p = await screen.findByTestId('radky-z-fotky-po-dnech');
    expect(within(p).getByRole('heading')).toHaveTextContent('Řádky z fotky po dnech — 3 řádky z 2 dnů');
    expect(within(p).getAllByTestId(/^den-/).map((d) => d.getAttribute('data-testid'))).toEqual(['den-2026-10-12', 'den-2026-10-14']);
    expect(within(p).getByText('12. 10. 2026')).toBeTruthy();
    // Datum formuláře se nezměnilo (dnes) — a nic z fotky v něm není.
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-16');
    expect(screen.queryByText(/Zápis stáčení \(/)).toBeNull();
  });

  it('uložení zapíše každý řádek na jeho den a vyprázdní seznam i rozepsaný koncept', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(3));
    expect(dnyZapisu()).toEqual([
      ['2026-10-12', 'beer-des', 'pkg-30', 6],
      ['2026-10-14', 'beer-12', 'pkg-50', 2],
      ['2026-10-14', 'beer-des', 'pkg-30', 4],
    ]);
    await waitFor(() => expect(panel()).toBeNull());
    await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
  });

  it('počet v seznamu jde opravit a řádek odstranit — do databáze jde to, co je vidět', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    const p = await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.change(within(p).getByLabelText('Počet kusů — 30l · 10° Desítka, 12. 10. 2026'), { target: { value: '7' } });
    fireEvent.click(within(p).getByLabelText('Odstranit řádek — 50l · 12° Světlá, 14. 10. 2026'));
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(2));
    expect(dnyZapisu()).toEqual([
      ['2026-10-12', 'beer-des', 'pkg-30', 7],
      ['2026-10-14', 'beer-des', 'pkg-30', 4],
    ]);
  });

  it('řádek s nulou se nezapíše', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    const p = await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.change(within(p).getByLabelText('Počet kusů — 30l · 10° Desítka, 12. 10. 2026'), { target: { value: '0' } });
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(2));
    expect(dnyZapisu().map((r) => r[0])).toEqual(['2026-10-14', '2026-10-14']);
  });

  it('„Zahodit řádky z fotky" je vyhodí, nic se neuloží a koncept zmizí', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.click(screen.getByRole('button', { name: 'Zahodit řádky z fotky' }));
    await waitFor(() => expect(panel()).toBeNull());
    expect(h.vlozeno).toHaveLength(0);
    await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
  });

  it('z jednoho dne jdou řádky do formuláře jako dosud (datum formuláře = ten den) a seznam po dnech není', async () => {
    await otevriAVlozZFotky([
      { beerId: 'beer-des', pkgId: 'pkg-30', qty: '6', datum: '2026-10-13' },
      { beerId: 'beer-12', pkgId: 'pkg-50', qty: '2', datum: '2026-10-13' },
    ], '2026-10-13');
    expect(await screen.findByText(/Zápis stáčení \(8 ks\)/)).toBeTruthy();
    expect(panel()).toBeNull();
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-13');
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(2));
    expect(h.vlozeno.every((r) => r.entry_date === '2026-10-13')).toBe(true);
  });

  it('ze seznamu / zprávy (řádky bez dne) se nic nemění: do formuláře, bez seznamu po dnech', async () => {
    await otevriAVlozZFotky([{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '5' }], '2026-10-16');
    expect(await screen.findByText(/Zápis stáčení \(5 ks\)/)).toBeTruthy();
    expect(panel()).toBeNull();
  });

  it('řádek bez dne vedle víc dnů zůstane ve formuláři a zapíše se na datum formuláře', async () => {
    await otevriAVlozZFotky([
      { beerId: 'beer-des', pkgId: 'pkg-30', qty: '6', datum: '2026-10-12' },
      { beerId: 'beer-12', pkgId: 'pkg-50', qty: '2', datum: '2026-10-14' },
      { beerId: 'beer-des', pkgId: 'pkg-50', qty: '1' },
    ], '2026-10-15');
    await screen.findByTestId('radky-z-fotky-po-dnech');
    expect(await screen.findByText(/Zápis stáčení \(1 ks\)/)).toBeTruthy();
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-15');
    ulozit();
    await waitFor(() => expect(h.vlozeno).toHaveLength(3));
    expect(dnyZapisu()).toEqual([
      ['2026-10-15', 'beer-des', 'pkg-50', 1],
      ['2026-10-12', 'beer-des', 'pkg-30', 6],
      ['2026-10-14', 'beer-12', 'pkg-50', 2],
    ]);
  });

  describe('tanky', () => {
    const tank = (id: string, label: string, beer: string, litry: number) =>
      ({ id, label, current_beer_id: beer, current_volume_l: litry, kegging_active: true, status: 'active' });

    it('řádky z fotky se odečtou z tanku stejně jako řádky formuláře; náhled ukáže litry i s nimi', async () => {
      h.DB.cellar_tanks = [tank('t-des', 'Tank 4', 'beer-des', 5000)];
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      // 6 + 4 sudů po 30 l z fotky = 300 l z Tanku 4 (Světlá tank nemá, to se neodečte)
      expect(await screen.findByText(/Tank 4 · 300 L/)).toBeTruthy();
      // Po opravě počtu v seznamu se náhled přepočítá (7 + 4 sudů = 330 l).
      fireEvent.change(screen.getByLabelText('Počet kusů — 30l · 10° Desítka, 12. 10. 2026'), { target: { value: '7' } });
      expect(await screen.findByText(/Tank 4 · 330 L/)).toBeTruthy();
      fireEvent.change(screen.getByLabelText('Počet kusů — 30l · 10° Desítka, 12. 10. 2026'), { target: { value: '6' } });
      ulozit();
      await waitFor(() => expect(h.vlozeno).toHaveLength(3));
      expect(h.vlozeno.filter((r) => r.beer_id === 'beer-des').map((r) => [r.entry_date, r.cellar_tank_id, r.source_volume_l]))
        .toEqual([['2026-10-12', 't-des', 180], ['2026-10-14', 't-des', 120]]);
      expect(h.vlozeno.find((r) => r.beer_id === 'beer-12')).toMatchObject({ cellar_tank_id: null });
      await waitFor(() => expect(h.rpc).toContainEqual(['adjust_tank_volume', { p_tank_id: 't-des', p_delta_l: -300 }]));
    });

    it('Jantar z fotky: tmavá složka se zapíše na den řádku, ne na datum formuláře', async () => {
      h.DB.cellar_tanks = [tank('t-sv', 'Tank 7', 'beer-12', 6000), tank('t-tm', 'Tank 1', 'beer-tm', 6000)];
      await otevriAVlozZFotky([
        { beerId: 'beer-jan', pkgId: 'pkg-30', qty: '2', datum: '2026-10-12' },
        { beerId: 'beer-jan', pkgId: 'pkg-30', qty: '1', datum: '2026-10-14' },
      ]);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      ulozit();
      await waitFor(() => expect(h.prelevy).toHaveLength(2));
      expect(h.vlozeno.map((r) => [r.entry_date, r.cellar_tank_id, r.source_volume_l])).toEqual([
        ['2026-10-12', 't-sv', 48],
        ['2026-10-14', 't-sv', 24],
      ]);
      expect(h.prelevy.map((r) => [r.transfer_date, r.from_tank_id, r.volume_l])).toEqual([
        ['2026-10-12', 't-tm', 12],
        ['2026-10-14', 't-tm', 6],
      ]);
    });
  });

  describe('rozepsaný koncept', () => {
    it('„Zahodit“ v upozornění na rozepsaný zápis vyhodí i řádky z fotky', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], date: '2026-10-16', note: '',
        fotoDny: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', tankId: '', datum: '2026-10-12' }],
      }));
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      fireEvent.click(within(await screen.findByTestId('rozepsany-zapis-pruh')).getByRole('button', { name: /Zahodit/ }));
      await waitFor(() => expect(panel()).toBeNull());
      await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
    });

    it('„Vymazat vše“ se zeptá i když je rozepsaný jen seznam z fotky, a po souhlasu ho vyhodí', async () => {
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      fireEvent.click(screen.getByRole('button', { name: /Vymazat vše/ }));
      await waitFor(() => expect(h.otazky.some((o) => /Smazat všechny rozepsané řádky/.test(o))).toBe(true));
      await waitFor(() => expect(panel()).toBeNull());
    });

    it('řádky po dnech přežijí odchod z obrazovky a vrátí se', async () => {
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      await waitFor(() => expect(JSON.parse(localStorage.getItem(KLIC) as string).fotoDny).toHaveLength(3));
      document.body.innerHTML = '';
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      const p = await screen.findByTestId('radky-z-fotky-po-dnech');
      expect(within(p).getByRole('heading')).toHaveTextContent('3 řádky z 2 dnů');
      expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    });

    it('v uloženém konceptu se zahodí řádky s neexistujícím dnem', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], date: '2026-10-16', note: '',
        fotoDny: [
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', tankId: '', datum: '2026-10-12' },
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', tankId: '', datum: '2026-02-31' },
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', tankId: '', datum: '' },
        ],
      }));
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      const p = await screen.findByTestId('radky-z-fotky-po-dnech');
      expect(within(p).getByRole('heading')).toHaveTextContent('1 řádek');
    });

    it('koncept jen s neexistujícími dny je prázdný: žádné upozornění na rozepsaný zápis', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], date: '2026-10-16', note: '',
        fotoDny: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', tankId: '', datum: '2026-02-31' }],
      }));
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      await screen.findByRole('button', { name: 'Uložit stáčení' });
      expect(panel()).toBeNull();
      expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
    });

    it('koncept uložený starou verzí (bez řádků po dnech) se otevře jako dřív', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '7', tankId: '' }], date: '2026-10-15', note: '',
      }));
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
      expect(panel()).toBeNull();
    });

    it('koncept jen s řádky po dnech se vrací taky (formulář je prázdný)', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], date: '2026-10-16', note: '',
        fotoDny: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', tankId: '', datum: '2026-10-12' }],
      }));
      render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
      expect(await screen.findByTestId('radky-z-fotky-po-dnech')).toBeTruthy();
      expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    });
  });

  describe('před zápisem', () => {
    it('už napočítaný měsíc: jedna otázka s výčtem měsíců; po „ne“ se nic nezapíše, po „ano“ ano', async () => {
      h.DB.inventory = [{ entry_date: '2026-09-30', note: 'Schválená inventura' }];
      await otevriAVlozZFotky([
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '6', datum: '2026-09-28' },
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', datum: '2026-10-13' },
      ]);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      h.odpovedNaOtazku = false;
      ulozit();
      await waitFor(() => expect(h.otazky).toHaveLength(1));
      expect(h.otazky[0]).toMatch(/^Měsíc 2026-09 už má napočítanou inventuru/);
      expect(h.vlozeno).toHaveLength(0);
      expect(panel()).toBeTruthy(); // nic se neztratilo
      h.odpovedNaOtazku = true;
      ulozit();
      await waitFor(() => expect(h.vlozeno).toHaveLength(2));
    });

    it('zápis jen do nenapočítaného měsíce se na uzamčení neptá', async () => {
      h.DB.inventory = [{ entry_date: '2026-09-30', note: 'Schválená inventura' }];
      await otevriAVlozZFotky([
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '6', datum: '2026-10-12' },
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', datum: '2026-10-13' },
      ]);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      ulozit();
      await waitFor(() => expect(h.vlozeno).toHaveLength(2));
      expect(h.otazky.filter((o) => /napočítanou inventuru/.test(o))).toEqual([]);
    });

    it('stejný den + pivo + obal už zapsané: upozorní na zdvojení; po „ne“ nic', async () => {
      h.DB.kegging = [{ id: 'k1', entry_date: '2026-10-14', beer_id: 'beer-des', package_id: 'pkg-30', quantity: 4, created_at: '2026-10-14T09:00:00Z' }];
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      h.odpovedNaOtazku = false;
      ulozit();
      await waitFor(() => expect(h.otazky).toHaveLength(1));
      expect(h.otazky[0]).toContain('Tohle už ve stáčení KEG je:');
      expect(h.otazky[0]).toContain('• 14. 10. · 10° Desítka · 30l — už zapsáno 4 ks');
      expect(h.otazky[0]).not.toContain('12° Světlá');
      expect(h.vlozeno).toHaveLength(0);
    });

    it('jiný obal nebo jiný den téhož piva není zdvojení', async () => {
      h.DB.kegging = [
        { id: 'k1', entry_date: '2026-10-14', beer_id: 'beer-des', package_id: 'pkg-50', quantity: 4, created_at: '2026-10-14T09:00:00Z' },
        { id: 'k2', entry_date: '2026-10-13', beer_id: 'beer-des', package_id: 'pkg-30', quantity: 4, created_at: '2026-10-13T09:00:00Z' },
      ];
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      ulozit();
      await waitFor(() => expect(h.vlozeno).toHaveLength(3));
      expect(h.otazky.filter((o) => /Možné zdvojení|už ve stáčení KEG je/.test(o))).toEqual([]);
    });

    it('řádky z formuláře se na zdvojení neptají (stáčí se průběžně, dvě várky za den jsou běžné)', async () => {
      h.DB.kegging = [{ id: 'k1', entry_date: '2026-10-16', beer_id: 'beer-des', package_id: 'pkg-30', quantity: 4, created_at: '2026-10-16T06:00:00Z' }];
      await otevriAVlozZFotky([{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '5' }], '2026-10-16');
      await screen.findByText(/Zápis stáčení \(5 ks\)/);
      ulozit();
      await waitFor(() => expect(h.vlozeno).toHaveLength(1));
      expect(h.otazky.filter((o) => /zdvojení|už ve stáčení KEG je/.test(o))).toEqual([]);
    });
  });
});
