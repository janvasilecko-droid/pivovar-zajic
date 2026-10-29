// Rozepsané stáčení KEG se neztratí (lib/rozepsanyZapis.ts).
// 15. 10. 2026: „když zadávám stáčení, tak ať se ta data, pokud je nepotvrdím,
// nevymažou… ať to tam je, než se to potvrdí, nebo se to musí ručně smazat."
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KeggingScreen from './Kegging';

const h = vi.hoisted(() => ({
  DB: {
    kegging: [],
    cellar_tanks: [],
    beers: [{ id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 }],
    packages: [{ id: 'pkg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 }],
    orders: [], order_items: [], inventory: [], fasovani: [], fasovani_private: [],
    writeoffs: [], keg_prefuk: [], zavoz_deductions: [],
  } as Record<string, any[]>,
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
    return q;
  }
  return {
    supabase: { from: vi.fn((t: string) => makeQuery(t)) },
    fetchAllRows: vi.fn((t: string) => makeQuery(t)),
    useRealtime: vi.fn(),
    beerBg: vi.fn(() => '#f59e0b'),
    beerBorder: vi.fn(() => '#d97706'),
    beerText: vi.fn(() => '#000'),
    beerName: vi.fn((b: any) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
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
  ...(await puvodni<any>()),
  businessDateISO: () => '2026-01-07',
}));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({
  isoWeekKey: vi.fn(() => '2026-02'),
  weekRange: vi.fn(() => ({ start: new Date('2026-01-05T00:00:00Z'), end: new Date('2026-01-11T00:00:00Z'), label: '5. 1. – 11. 1.' })),
  shiftWeek: vi.fn((k: string) => k),
}));

const KLIC = 'rozepsane_staceni_keg';
const koncept = (extra: object = {}) => JSON.stringify({
  entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-30', qty: '7', tankId: '' }],
  date: '2026-01-05',
  note: '',
  ulozeno: '2026-01-06T10:05:00.000Z',
  ...extra,
});

const otevri = () => render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);

describe('Stáčení KEG — rozepsaný zápis', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('uložený koncept se po otevření obrazovky vrátí i s datem a upozorněním', async () => {
    localStorage.setItem(KLIC, koncept());
    otevri();
    expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    expect(screen.getByTestId('rozepsany-zapis-pruh').textContent).toMatch(/6\. 1\. 11:05/);
    // Množství z konceptu je ve formuláři a datum taky.
    expect(screen.getAllByDisplayValue('7').length).toBeGreaterThan(0);
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-01-05');
  });

  it('bez konceptu žádné upozornění není', async () => {
    otevri();
    await waitFor(() => expect(screen.getByText(/Datum/)).toBeTruthy());
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
  });

  it('„Zahodit" vyprázdní formulář i uložený koncept', async () => {
    localStorage.setItem(KLIC, koncept());
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull());
    expect(localStorage.getItem(KLIC)).toBeNull();
    expect(screen.queryAllByDisplayValue('7')).toHaveLength(0);
  });

  it('„Vymazat vše" se zeptá a po „ano" smaže i uložený koncept', async () => {
    localStorage.setItem(KLIC, koncept());
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Vymazat vše/ }));
    await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
    expect(window.confirm).toHaveBeenCalled();
  });

  it('„Vymazat vše" po odmítnutí nic nesmaže', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    localStorage.setItem(KLIC, koncept());
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Vymazat vše/ }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(localStorage.getItem(KLIC)).not.toBeNull();
    expect(screen.getAllByDisplayValue('7').length).toBeGreaterThan(0);
  });

  it('rozbitý koncept se ignoruje — obrazovka se otevře prázdná', async () => {
    localStorage.setItem(KLIC, '{nedopsané');
    otevri();
    await waitFor(() => expect(screen.getByText(/Datum/)).toBeTruthy());
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
  });

  it('počty zadané v dlaždici jsou po zavření i po odchodu z obrazovky pořád rozepsané', async () => {
    const prvni = otevri();
    fireEvent.click((await screen.findAllByRole('button', { name: /Světlý ležák 12°/ }))[0]);
    const pole = document.querySelector('.fixed.inset-0 input[inputmode="numeric"]') as HTMLInputElement;
    fireEvent.change(pole, { target: { value: '9' } });
    // Zavřít klepnutím vedle — nic se neuložilo do databáze.
    fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement);
    await waitFor(() => expect(document.querySelector('.fixed.inset-0')).toBeNull());
    const ulozeny = JSON.parse(localStorage.getItem(KLIC) as string);
    expect(ulozeny.entryRows.find((r: any) => r.beerId === 'beer-12')).toMatchObject({ pkgId: 'pkg-30', qty: '9' });
    prvni.unmount();

    otevri();
    expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    expect(screen.getAllByDisplayValue('9').length).toBeGreaterThan(0);
  });
});
