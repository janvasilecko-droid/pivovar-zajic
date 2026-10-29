// Stáčení KEG: krokové zadávání (29. 10. 2026) — klepnutí na pivo otevře
// otázku „Kolik sudů?", nahoře velikost sudu (padesátka předvolená), pod
// polem pět nejčastějších čísel a pod nimi to, co se dnes už uložilo.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import KeggingScreen from './Kegging';

const h = vi.hoisted(() => ({
  DB: {
    kegging: [
      { id: 'k1', entry_date: '2026-01-07', created_at: '2026-01-07T07:15:00Z', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 2 },
      { id: 'k2', entry_date: '2026-01-06', created_at: '2026-01-06T07:15:00Z', beer_id: 'beer-12', package_id: 'pkg-50', quantity: 12 },
      { id: 'k3', entry_date: '2026-01-05', created_at: '2026-01-05T07:15:00Z', beer_id: 'beer-12', package_id: 'pkg-50', quantity: 12 },
      { id: 'k4', entry_date: '2026-01-04', created_at: '2026-01-04T07:15:00Z', beer_id: 'beer-12', package_id: 'pkg-50', quantity: 6 },
    ],
    cellar_tanks: [],
    beers: [{ id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 }],
    packages: [
      { id: 'pkg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 1 },
      { id: 'pkg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 2 },
    ],
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


const otevri = () => render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
const pole = (panel: HTMLElement) => within(panel).getByRole('textbox') as HTMLInputElement;

describe('Stáčení KEG — krokové zadávání', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('klepnutí na pivo otevře otázku s polem a vybranou padesátkou, pět čísel je z historie', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Světlý ležák 12°/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Kolik sudů?')).toBeTruthy();
    expect(within(panel).getByRole('radio', { name: /50 l/ }).getAttribute('aria-checked')).toBe('true');
    expect(document.activeElement).toBe(pole(panel));
    // 50 l: historie 12, 12, 6 → nabídne jen to, co se opravdu zadávalo
    expect(within(panel).getByRole('button', { name: '12' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '6' })).toBeTruthy();
  });

  it('velikost a počet: 6× 50 l, + další velikost, 3× 30 l → oba řádky v zápisu, nic se neuložilo', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Světlý ležák 12°/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.change(pole(panel), { target: { value: '6' } });
    fireEvent.click(within(panel).getByRole('button', { name: /\+ další velikost/ }));
    expect(within(panel).getByRole('radio', { name: /30 l/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(pole(panel), { target: { value: '3' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Hotovo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Zápis stáčení \(9 ks\)/)).toBeTruthy();
    const ulozeny = JSON.parse(localStorage.getItem('rozepsane_staceni_keg') as string);
    expect(ulozeny.entryRows.filter((r: any) => r.beerId === 'beer-12' && Number(r.qty) > 0))
      .toMatchObject([{ pkgId: 'pkg-50', qty: '6' }, { pkgId: 'pkg-30', qty: '3' }]);
  });

  it('klepnutí na rychlé číslo zadá počet a zavře panel', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Světlý ležák 12°/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getByRole('button', { name: '12' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Zápis stáčení \(12 ks\)/)).toBeTruthy();
  });

  it('pod polem je vidět, co se ten den už uložilo u tohohle piva', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Světlý ležák 12°/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText(/Už uloženo dnes u Světlý ležák 12°/)).toBeTruthy();
    expect(within(panel).getByText('2× 30 l')).toBeTruthy();
    // včerejší záznam tam není
    expect(within(panel).queryByText('12× 50 l')).toBeNull();
  });

  it('dnešní uložené je i na hlavní obrazovce pod zápisem', async () => {
    otevri();
    expect(await screen.findByText(/Dnes stočeno KEG/)).toBeTruthy();
  });
});
