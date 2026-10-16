// Čtení z fotky na víc dnů najednou i ve Fasování / Prodejně / Odpisu (majitel
// 16. 10. 2026: „ano udělej to pro všechno"). Řádky z víc dnů tabulky se odloží do
// seznamu „Řádky z fotky po dnech" a uloží se společně s formulářem, každý na svůj
// den. Z jednoho dne jdou do formuláře jako dosud.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';

type Radek = Record<string, unknown>;
type Odpoved = Promise<{ data: unknown; error: null }>;
type Dotaz = Odpoved & {
  select: () => Dotaz; order: () => Dotaz; eq: () => Dotaz; in: () => Dotaz; limit: () => Dotaz;
  maybeSingle: () => Odpoved; update: () => Dotaz; delete: () => Dotaz;
  insert: (radky: Radek | Radek[]) => Odpoved & { select: () => Odpoved };
};
type FotoRadek = { beerId: string; pkgId: string; qty: string; datum?: string | null };

const h = vi.hoisted(() => ({
  DB: {
    fasovani_private: [], fasovani: [], writeoffs: [],
    beers: [
      { id: 'beer-des', name: '10° Desítka', is_active: true, sort_order: 1 },
      { id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 2 },
    ],
    packages: [
      { id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 1 },
      { id: 'pkg-30', label: '30l', kind: 'keg', volume_l: 30, sort_order: 2 },
    ],
    inventory: [], parser_aliases: [],
  } as Record<string, Radek[]>,
  zapisy: [] as Radek[],
  fotoRadky: [] as FotoRadek[],
  fotoDatum: undefined as string | undefined,
  otazky: [] as string[],
  odpoved: true,
  /** První zápis do tabulky selže na sloupci `who` (starší databáze) — appka zkusí tvar bez něj. */
  chybaWho: false,
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
    q.insert = vi.fn((payload: Radek | Radek[]) => {
      const radky = Array.isArray(payload) ? payload : [payload];
      if (h.chybaWho && radky.some((r) => 'who' in r)) {
        const chyba = Promise.resolve({ data: null, error: { message: "Could not find the 'who' column of 'fasovani_private' in the schema cache" } }) as unknown as Odpoved & { select: () => Odpoved };
        chyba.select = vi.fn(() => chyba);
        return chyba;
      }
      h.zapisy.push(...radky.map((r) => ({ ...r, __tabulka: table })));
      const vlozeno = Promise.resolve({ data: radky.map((_, i) => ({ id: `novy-${i}` })), error: null }) as Odpoved & { select: () => Odpoved };
      vlozeno.select = vi.fn(() => vlozeno);
      return vlozeno;
    });
    q.update = vi.fn(() => q);
    q.delete = vi.fn(() => q);
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerText: vi.fn(() => '#000'),
    beerInk: vi.fn(() => '#000'),
    beerName: vi.fn((b: { name?: string } | null) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<Record<string, unknown>>()),
  businessDateISO: () => '2026-10-16',
}));
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
  potvrd: vi.fn(async (text: string) => { h.otazky.push(text); return h.odpoved; }),
  toastZpet: vi.fn(),
}));
// Okno čtení z fotky se nahrazuje tlačítkem, které „přečtené“ řádky rovnou předá obrazovce.
vi.mock('../components/ProdejnaFromImage', async () => {
  const React = await import('react');
  return {
    ProdejnaFromImage: (props: { onImport: (r: FotoRadek[], d?: string) => void; onClose: () => void }) =>
      React.createElement('button', { type: 'button', onClick: () => { props.onImport(h.fotoRadky, h.fotoDatum); props.onClose(); } }, 'Vložit z fotky (test)'),
  };
});

const TRI_DNY: FotoRadek[] = [
  { beerId: 'beer-des', pkgId: 'pkg-30', qty: '2', datum: '2026-10-12' },
  { beerId: 'beer-12', pkgId: 'pkg-05', qty: '20', datum: '2026-10-14' },
  { beerId: 'beer-des', pkgId: 'pkg-05', qty: '10', datum: '2026-10-14' },
];

async function otevriAVlozZFotky(radky: FotoRadek[], datum?: string, table = 'fasovani_private') {
  h.fotoRadky = radky;
  h.fotoDatum = datum;
  render(<ProdejnaScreen table={table} title="Fasování" />);
  fireEvent.click(await screen.findByRole('button', { name: /Číst z fotky/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Vložit z fotky (test)' }));
}

const ulozit = (jmeno = /Uložit fasování/) => fireEvent.click(screen.getByRole('button', { name: jmeno }));
const panel = () => screen.queryByTestId('radky-z-fotky-po-dnech');
const zapsano = () => h.zapisy.map((r) => [r.entry_date, r.beer_id, r.package_id, r.quantity]);

describe('Fasování / Prodejna / Odpis — čtení z fotky na víc dnů', () => {
  beforeEach(() => {
    localStorage.clear();
    h.zapisy.length = 0;
    h.otazky.length = 0;
    h.odpoved = true;
    h.chybaWho = false;
    h.DB.inventory = [];
    h.DB.fasovani_private = [];
    h.DB.fasovani = [];
    h.DB.writeoffs = [];
    vi.clearAllMocks();
  });

  it('řádky z víc dnů se odloží do seznamu po dnech; formulář a jeho datum zůstanou', async () => {
    // I kdyby okno předalo jediné datum, samé řádky po dnech datum formuláře nemění.
    await otevriAVlozZFotky(TRI_DNY, '2026-10-15');
    const p = await screen.findByTestId('radky-z-fotky-po-dnech');
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-16');
    expect(within(p).getByRole('heading')).toHaveTextContent('Řádky z fotky po dnech — 3 řádky z 2 dnů');
    expect(within(p).getAllByTestId(/^den-/).map((d) => d.getAttribute('data-testid'))).toEqual(['den-2026-10-12', 'den-2026-10-14']);
    expect(screen.queryByText('Zapsáno')).toBeNull();
  });

  it('uložení zapíše každý řádek do správné tabulky na jeho den a vyprázdní seznam i koncept', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(3));
    expect(zapsano()).toEqual([
      ['2026-10-12', 'beer-des', 'pkg-30', 2],
      ['2026-10-14', 'beer-12', 'pkg-05', 20],
      ['2026-10-14', 'beer-des', 'pkg-05', 10],
    ]);
    expect(h.zapisy.every((z) => z.__tabulka === 'fasovani_private')).toBe(true);
    await waitFor(() => expect(panel()).toBeNull());
    await waitFor(() => expect(localStorage.getItem('rozdelany_vydej_fasovani_private')).toBeNull());
  });

  it('počet jde opravit a řádek odstranit; nula se nezapíše', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    const p = await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.change(within(p).getByLabelText('Počet kusů — 10° Desítka · 30l, 12. 10. 2026'), { target: { value: '3' } });
    fireEvent.change(within(p).getByLabelText('Počet kusů — 10° Desítka · 0,5 l, 14. 10. 2026'), { target: { value: '0' } });
    fireEvent.click(within(p).getByLabelText('Odstranit řádek — 12° Světlá · 0,5 l, 14. 10. 2026'));
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(1));
    expect(zapsano()).toEqual([['2026-10-12', 'beer-des', 'pkg-30', 3]]);
  });

  it('řádky z fotky dostanou jméno „Pro koho“ z formuláře (Personál) a poznámku', async () => {
    await otevriAVlozZFotky(TRI_DNY, undefined, 'fasovani');
    await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.change(screen.getByPlaceholderText('nepovinná poznámka'), { target: { value: 'z tabulky' } });
    fireEvent.change(screen.getByPlaceholderText('Jméno — komu se fasuje'), { target: { value: 'Pavel' } });
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(3));
    expect(h.zapisy.every((z) => z.__tabulka === 'fasovani' && z.who === 'Pavel' && z.note === 'z tabulky')).toBe(true);
  });

  it('Odpis: řádky po dnech se zapíšou taky, bez sloupce note (tabulka writeoffs ho nemá)', async () => {
    await otevriAVlozZFotky(TRI_DNY, undefined, 'writeoffs');
    await screen.findByTestId('radky-z-fotky-po-dnech');
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(3));
    expect(h.zapisy.every((z) => z.__tabulka === 'writeoffs' && !('note' in z))).toBe(true);
    expect(zapsano().map((r) => r[0])).toEqual(['2026-10-12', '2026-10-14', '2026-10-14']);
  });

  it('„Odfasovat“ (vrátit na sklad) platí i pro řádky z fotky: záporné množství', async () => {
    await otevriAVlozZFotky(TRI_DNY);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    fireEvent.click(screen.getByLabelText(/Odfasovat/));
    expect(screen.getByText(/tlačítkem „Vrátit na sklad“/)).toBeTruthy();
    ulozit(/Vrátit na sklad/);
    await waitFor(() => expect(h.zapisy).toHaveLength(3));
    expect(zapsano().map((r) => r[3])).toEqual([-2, -20, -10]);
  });

  it('z jednoho dne jdou řádky do formuláře jako dosud a seznam po dnech není', async () => {
    await otevriAVlozZFotky([
      { beerId: 'beer-des', pkgId: 'pkg-30', qty: '2', datum: '2026-10-13' },
      { beerId: 'beer-12', pkgId: 'pkg-05', qty: '20', datum: '2026-10-13' },
    ], '2026-10-13');
    expect(await screen.findByText('Zapsáno')).toBeTruthy();
    expect(panel()).toBeNull();
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-10-13');
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(2));
    expect(h.zapisy.every((z) => z.entry_date === '2026-10-13')).toBe(true);
  });

  it('starší databáze bez sloupce who: náhradní zápis taky nese den každého řádku', async () => {
    h.chybaWho = true;
    await otevriAVlozZFotky(TRI_DNY);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(3));
    expect(zapsano()).toEqual([
      ['2026-10-12', 'beer-des', 'pkg-30', 2],
      ['2026-10-14', 'beer-12', 'pkg-05', 20],
      ['2026-10-14', 'beer-des', 'pkg-05', 10],
    ]);
    expect(h.zapisy.every((z) => !('who' in z))).toBe(true);
  });

  it('řádky z formuláře se na zdvojení neptají (dva zápisy téhož dne jsou běžné), ať je den zapsaný nebo ne', async () => {
    h.DB.fasovani_private = [{ id: 'z1', entry_date: '2026-10-16', beer_id: 'beer-12', package_id: 'pkg-05', quantity: 20, created_at: '2026-10-16T06:00:00Z' }];
    await otevriAVlozZFotky([{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '5' }]);
    await screen.findByText('Zapsáno');
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(1));
    expect(h.otazky.filter((o) => /už v prodejně je|zdvojení/.test(o))).toEqual([]);
  });

  it('řádek bez dne vedle víc dnů zůstane ve formuláři (na jeho datum)', async () => {
    await otevriAVlozZFotky([...TRI_DNY, { beerId: 'beer-12', pkgId: 'pkg-30', qty: '1' }]);
    await screen.findByTestId('radky-z-fotky-po-dnech');
    expect(await screen.findByText('Zapsáno')).toBeTruthy();
    ulozit();
    await waitFor(() => expect(h.zapisy).toHaveLength(4));
    const dnes = (document.querySelector('input[type="date"]') as HTMLInputElement)?.value;
    expect(zapsano().filter((r) => r[1] === 'beer-12' && r[2] === 'pkg-30')).toEqual([[dnes, 'beer-12', 'pkg-30', 1]]);
  });

  describe('rozepsaný koncept', () => {
    const KLIC = 'rozdelany_vydej_fasovani_private';

    it('řádky po dnech přežijí odchod z obrazovky a vrátí se', async () => {
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      await waitFor(() => expect(JSON.parse(localStorage.getItem(KLIC) as string).fotoDny).toHaveLength(3));
      document.body.innerHTML = '';
      render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
      const p = await screen.findByTestId('radky-z-fotky-po-dnech');
      expect(within(p).getByRole('heading')).toHaveTextContent('3 řádky z 2 dnů');
      expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    });

    it('v uloženém konceptu se zahodí řádky s neexistujícím dnem', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], who: '', note: '', date: '2026-10-16',
        fotoDny: [
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', vycep: false, who: '', datum: '2026-10-12' },
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', vycep: false, who: '', datum: '2026-02-31' },
          { beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', vycep: false, who: '', datum: '' },
        ],
      }));
      render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
      const p = await screen.findByTestId('radky-z-fotky-po-dnech');
      expect(within(p).getByRole('heading')).toHaveTextContent('1 řádek');
    });

    it('koncept jen s neexistujícími dny je prázdný: žádné upozornění na rozepsaný zápis', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], who: '', note: '', date: '2026-10-16',
        fotoDny: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '9', vycep: false, who: '', datum: '2026-02-31' }],
      }));
      render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
      await screen.findByRole('button', { name: /Uložit fasování/ });
      expect(panel()).toBeNull();
      expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
    });

    it('„Zahodit“ v upozornění na rozepsaný zápis vyhodí i řádky z fotky', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [], who: '', note: '', date: '2026-10-16',
        fotoDny: [{ beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', vycep: false, who: '', datum: '2026-10-12' }],
      }));
      render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      fireEvent.click(within(await screen.findByTestId('rozepsany-zapis-pruh')).getByRole('button', { name: /Zahodit/ }));
      await waitFor(() => expect(panel()).toBeNull());
      await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
    });

    it('„Vymazat vše“ se zeptá i když je rozepsaný jen seznam z fotky, a po souhlasu ho vyhodí', async () => {
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      fireEvent.click(screen.getByRole('button', { name: /Vymazat vše/ }));
      await waitFor(() => expect(h.otazky.some((o) => /Smazat všechny rozepsané řádky/.test(o))).toBe(true));
      await waitFor(() => expect(panel()).toBeNull());
    });

    it('koncept z dřívější verze (bez řádků po dnech) se otevře jako dřív', async () => {
      localStorage.setItem(KLIC, JSON.stringify({
        entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }], who: '', note: '', date: '2026-01-05',
      }));
      render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);
      expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
      expect(panel()).toBeNull();
    });

    it('„Zahodit řádky z fotky“ je vyhodí; nic se neuloží', async () => {
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      fireEvent.click(screen.getByRole('button', { name: 'Zahodit řádky z fotky' }));
      await waitFor(() => expect(panel()).toBeNull());
      expect(h.zapisy).toHaveLength(0);
      await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
    });
  });

  describe('před zápisem', () => {
    it('už napočítaný měsíc: jedna otázka s výčtem; po „ne“ nic, po „ano“ zapíše', async () => {
      h.DB.inventory = [{ entry_date: '2026-09-30', note: 'Schválená inventura' }];
      await otevriAVlozZFotky([
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '2', datum: '2026-09-28' },
        { beerId: 'beer-des', pkgId: 'pkg-30', qty: '3', datum: '2026-10-13' },
      ]);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      h.odpoved = false;
      ulozit();
      await waitFor(() => expect(h.otazky).toHaveLength(1));
      expect(h.otazky[0]).toMatch(/^Měsíc 2026-09 už má napočítanou inventuru/);
      expect(h.zapisy).toHaveLength(0);
      expect(panel()).toBeTruthy();
      h.odpoved = true;
      ulozit();
      await waitFor(() => expect(h.zapisy).toHaveLength(2));
    });

    it.each([
      ['fasovani_private', 'v prodejně'],
      ['fasovani', 've fasování personálu'],
      ['writeoffs', 'v odpisu'],
    ])('stejný den + pivo + obal už zapsané (%s): upozorní na zdvojení „%s“', async (table, kde) => {
      h.DB[table] = [{ id: 'z1', entry_date: '2026-10-14', beer_id: 'beer-12', package_id: 'pkg-05', quantity: 20, created_at: '2026-10-14T09:00:00Z' }];
      await otevriAVlozZFotky(TRI_DNY, undefined, table);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      h.odpoved = false;
      ulozit();
      await waitFor(() => expect(h.otazky).toHaveLength(1));
      expect(h.otazky[0]).toContain(`Tohle už ${kde} je:`);
      expect(h.otazky[0]).toContain('• 14. 10. · 12° Světlá · 0,5 l — už zapsáno 20 ks');
      expect(h.zapisy).toHaveLength(0);
    });

    it('jiný obal nebo den téhož piva není zdvojení', async () => {
      h.DB.fasovani_private = [
        { id: 'z1', entry_date: '2026-10-14', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 5, created_at: '2026-10-14T09:00:00Z' },
        { id: 'z2', entry_date: '2026-10-13', beer_id: 'beer-12', package_id: 'pkg-05', quantity: 5, created_at: '2026-10-13T09:00:00Z' },
      ];
      await otevriAVlozZFotky(TRI_DNY);
      await screen.findByTestId('radky-z-fotky-po-dnech');
      ulozit();
      await waitFor(() => expect(h.zapisy).toHaveLength(3));
      expect(h.otazky.filter((o) => /už v prodejně je/.test(o))).toEqual([]);
    });
  });
});
