// Přefuk KEG „do řezu" (16. 10. 2026): 11° se řezala ze sudů Desítky 1×30, 1×20
// a 1×10 místo z tanku a v appce to chybělo — formulář vyžadoval sud „DO".
// Teď jde sudy dodatečně odečíst bez přičtení (stejný tvar řádku jako při řezání).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KeggingScreen from './Kegging';

type Radek = Record<string, unknown>;
type Odpoved = Promise<{ data: unknown; error: null }>;
type Dotaz = Odpoved & {
  select: () => Dotaz; order: () => Dotaz; eq: () => Dotaz; in: () => Dotaz; limit: () => Dotaz;
  maybeSingle: () => Odpoved;
  insert: (radky: Radek | Radek[]) => Odpoved & { select: () => Odpoved };
};

const h = vi.hoisted(() => ({
  DB: {
    kegging: [],
    cellar_tanks: [],
    beers: [
      { id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 },
      { id: 'beer-10', name: '10° Desítka', is_active: true, sort_order: 2 },
    ],
    packages: [
      { id: 'pkg-30', label: '30l', kind: 'keg', volume_l: 30, sort_order: 1 },
      { id: 'pkg-20', label: '20l', kind: 'keg', volume_l: 20, sort_order: 2 },
    ],
    orders: [], order_items: [], inventory: [], fasovani: [], fasovani_private: [],
    writeoffs: [], keg_prefuk: [], zavoz_deductions: [],
  } as Record<string, Radek[]>,
  vlozeno: [] as Radek[],
  oznameni: [] as string[],
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
    q.insert = vi.fn((vstup: Radek | Radek[]) => {
      const radky = Array.isArray(vstup) ? vstup : [vstup];
      if (table === 'keg_prefuk') h.vlozeno.push(...radky);
      const vysledek = Promise.resolve({ data: radky.map((r, i) => ({ id: `novy-${i}`, ...r })), error: null }) as Odpoved & { select: () => Odpoved };
      vysledek.select = vi.fn(() => vysledek);
      return vysledek;
    });
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)), rpc: vi.fn().mockResolvedValue({ data: null, error: null }) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerBorder: vi.fn(() => '#d97706'),
    beerText: vi.fn(() => '#000'),
    beerName: vi.fn((b: { name?: string } | null) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/toast', async (puvodni) => ({
  ...(await puvodni<Record<string, unknown>>()),
  oznam: (text: string) => { h.oznameni.push(text); },
  potvrd: vi.fn(async () => true),
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
vi.mock('../components/ImportKeggingFromImage', () => ({ ImportKeggingFromImage: () => null }));
vi.mock('../lib/excel', () => ({ exportKeggingToExcel: vi.fn() }));
vi.mock('../lib/orderParser', () => ({
  parseFreeTextEntries: vi.fn(() => []),
  loadAliasMap: vi.fn().mockResolvedValue({}),
  emptyAliasMap: vi.fn(() => ({})),
}));
vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<Record<string, unknown>>()),
  businessDateISO: () => '2026-01-07',
}));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({
  isoWeekKey: vi.fn(() => '2026-02'),
  weekRange: vi.fn(() => ({ start: new Date('2026-01-05T00:00:00Z'), end: new Date('2026-01-11T00:00:00Z'), label: '5. 1. – 11. 1.' })),
  shiftWeek: vi.fn((k: string) => k),
}));

const otevri = () => render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="prefuk" />);

/** Vyplní pivo, sud ZE a počet; „DO" nechá, jak je. */
async function vyplnZe(pivo: string, sud: string, kusu: string) {
  const formular = (await screen.findByRole('button', { name: 'Uložit přefuk' })).closest('form') as HTMLFormElement;
  const [pivoSelect, zeSelect] = Array.from(formular.querySelectorAll('select')) as HTMLSelectElement[];
  fireEvent.change(pivoSelect, { target: { value: pivo } });
  fireEvent.change(zeSelect, { target: { value: sud } });
  const pocty = formular.querySelectorAll('input[type="number"]');
  fireEvent.change(pocty[0], { target: { value: kusu } });
  return formular;
}

describe('Přefuk KEG — do řezu', () => {
  beforeEach(() => {
    localStorage.clear();
    h.vlozeno.length = 0;
    vi.clearAllMocks();
  });

  it('bez „Do řezu" se sud DO dál vyžaduje', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-30', '1');
    expect(formular.querySelectorAll('select')).toHaveLength(3);
    fireEvent.submit(formular);
    expect(await screen.findByText('Vyber velikost sudu DO (přičítá se na sklad).')).toBeTruthy();
    expect(h.vlozeno).toHaveLength(0);
  });

  it('„Do řezu" schová sud DO a uloží řádek, který nic nepřičte', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-30', '1');
    fireEvent.click(screen.getByLabelText('Do řezu (nic se nepřičte)'));
    expect(formular.querySelectorAll('select')).toHaveLength(2);
    expect(formular.querySelectorAll('input[type="number"]')).toHaveLength(1);
    fireEvent.submit(formular);
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0]).toMatchObject({
      beer_id: 'beer-10', beer_name: '10° Desítka', from_package_id: 'pkg-30', from_package_label: '30l', from_count: 1,
      to_package_id: null, to_package_label: null, to_count: 0,
      note: 'Do řezu: dodatečně zapsáno',
    });
  });

  it('poznámka se připojí za „Do řezu:"', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-20', '2');
    fireEvent.click(screen.getByLabelText('Do řezu (nic se nepřičte)'));
    fireEvent.change(screen.getByPlaceholderText(/na akci, na výčep/), { target: { value: '11° z 14. 10.' } });
    fireEvent.submit(formular);
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0]).toMatchObject({ from_package_id: 'pkg-20', from_count: 2, note: 'Do řezu: 11° z 14. 10.' });
  });

  it('po uložení se volba „Do řezu" vrátí na výchozí', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-30', '1');
    fireEvent.click(screen.getByLabelText('Do řezu (nic se nepřičte)'));
    fireEvent.submit(formular);
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    await waitFor(() => expect((screen.getByLabelText('Do řezu (nic se nepřičte)') as HTMLInputElement).checked).toBe(false));
  });

  it('obyčejný přefuk (30 l → 20 l) se ukládá jako dřív, bez „Do řezu"', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-30', '1');
    const selecty = formular.querySelectorAll('select');
    fireEvent.change(selecty[2], { target: { value: 'pkg-20' } });
    fireEvent.change(formular.querySelectorAll('input[type="number"]')[1], { target: { value: '1' } });
    fireEvent.submit(formular);
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    expect(h.vlozeno[0]).toMatchObject({ from_package_id: 'pkg-30', to_package_id: 'pkg-20', to_count: 1, note: null });
  });

  it('stejný sud ZE a DO se dál odmítne; při „Do řezu" se to nehlídá', async () => {
    otevri();
    const formular = await vyplnZe('beer-10', 'pkg-30', '1');
    fireEvent.change(formular.querySelectorAll('select')[2], { target: { value: 'pkg-30' } });
    fireEvent.change(formular.querySelectorAll('input[type="number"]')[1], { target: { value: '1' } });
    fireEvent.submit(formular);
    expect(await screen.findByText('Velikost sudu ZE a DO nemůže být stejná.')).toBeTruthy();
    expect(h.vlozeno).toHaveLength(0);
    fireEvent.click(screen.getByLabelText('Do řezu (nic se nepřičte)'));
    fireEvent.submit(formular);
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
  });
});
