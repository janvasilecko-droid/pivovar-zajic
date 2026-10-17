// Přehled stáčení KEG je tabulka po dnech (17. 10. 2026: „udělej takhle i přehled
// stáčení KEG"). Tady se hlídá napojení na obrazovku; tabulka sama je v
// components/PrehledStaceniKeg.test.tsx.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import KeggingScreen from './Kegging';

type Radek = Record<string, unknown>;
type Odpoved = Promise<{ data: unknown; error: null }>;
type Dotaz = Odpoved & {
  select: () => Dotaz; order: () => Dotaz; eq: () => Dotaz; in: () => Dotaz; limit: () => Dotaz;
  maybeSingle: () => Odpoved;
  insert: (radky: Radek[]) => Odpoved & { select: () => Odpoved };
};

const h = vi.hoisted(() => ({
  DB: {
    kegging: [
      { id: 'k1', entry_date: '2026-01-07', beer_id: 'beer-12', beer_name: 'Světlý ležák 12°', package_id: 'pkg-30', package_label: 'KEG 30l', quantity: 3, note: null, created_at: '2026-01-07T08:00:00Z', source_volume_l: 95, cellar_tank_id: null },
      { id: 'k2', entry_date: '2026-01-07', beer_id: 'beer-cit', beer_name: 'Citron', package_id: 'pkg-30', package_label: 'KEG 30l', quantity: 2, note: null, created_at: '2026-01-07T09:00:00Z', source_volume_l: null, cellar_tank_id: null },
    ],
    cellar_tanks: [],
    beers: [
      { id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 },
      { id: 'beer-cit', name: 'Citron', is_active: true, sort_order: 2 },
    ],
    packages: [{ id: 'pkg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 }],
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
    q.insert = vi.fn((radky: Radek[]) => {
      if (table === 'kegging') h.vlozeno.push(...radky);
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

describe('Stáčení KEG — Přehled jako tabulka', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });

  it('přehled ukáže den jako pás s tabulkou: řádek na pivo, kusy ve sloupci 30 L, Celkem', async () => {
    render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="prehled" />);
    const prehled = await screen.findByTestId('prehled-keg-po-dnech');
    const den = within(prehled).getByTestId('den-keg');
    expect(den.textContent).toContain('Středa 7. 1.');
    expect(den.textContent).toContain('5 ks · 150 L');
    expect(within(den).getAllByTestId('radek-keg')).toHaveLength(2);
    expect(within(den).getByRole('button', { name: 'Světlý ležák 12°, 30 L: 3 ks' })).toBeTruthy();
    expect(within(den).getByTestId('celkem-dne-keg').textContent).toBe('Celkem—5');
    // celkový součet pod tabulkou zůstal
    expect(screen.getAllByText('5 ks').length).toBeGreaterThanOrEqual(2);
  });
});
