// Limonády tank nemají (16. 10. 2026 majitel: „limonády celkově nemají tank").
// Citron se při ukládání stáčení hlásil jako řádek „bez tanku" a posílal do
// Sklepu → Stáčení bez tanku. Pivo bez tanku se hlásí dál.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    kegging: [],
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

const KLIC = 'rozepsane_staceni_keg';
const koncept = (radky: { beerId: string; qty: string }[]) => JSON.stringify({
  entryRows: radky.map((r) => ({ ...r, pkgId: 'pkg-30', tankId: '' })),
  date: '2026-01-05',
  note: '',
  ulozeno: '2026-01-06T10:05:00.000Z',
});

async function ulozStaceni(radky: { beerId: string; qty: string }[]) {
  localStorage.setItem(KLIC, koncept(radky));
  render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="zapis" />);
  await screen.findByTestId('rozepsany-zapis-pruh');
  fireEvent.click(screen.getByRole('button', { name: 'Uložit stáčení' }));
  await waitFor(() => expect(h.vlozeno.length).toBeGreaterThan(0));
  // Po uložení se formulář vyprázdní a rozepsaný koncept zmizí.
  await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
}

describe('Stáčení KEG — limonády nemají tank', () => {
  beforeEach(() => {
    localStorage.clear();
    h.vlozeno.length = 0;
    h.oznameni.length = 0;
    vi.clearAllMocks();
  });

  it('Citron se uloží bez tanku a bez upozornění „bez tanku"', async () => {
    await ulozStaceni([{ beerId: 'beer-cit', qty: '2' }]);
    expect(h.vlozeno).toHaveLength(1);
    expect(h.vlozeno[0]).toMatchObject({ beer_id: 'beer-cit', package_id: 'pkg-30', quantity: 2, cellar_tank_id: null, source_volume_l: null });
    expect(h.oznameni.filter((t) => /bez tanku/i.test(t))).toEqual([]);
  });

  it('pivo bez tanku se hlásí dál (kontrola, že test opravdu hlídá)', async () => {
    await ulozStaceni([{ beerId: 'beer-12', qty: '2' }]);
    expect(h.vlozeno[0]).toMatchObject({ beer_id: 'beer-12', cellar_tank_id: null });
    expect(h.oznameni).toEqual(['Uloženo. 1 řádek je bez tanku. Přiřadíš ve Sklepě → Stáčení bez tanku.']);
  });

  it('pivo a limonáda v jednom uložení: upozornění počítá jen pivo', async () => {
    await ulozStaceni([{ beerId: 'beer-12', qty: '4' }, { beerId: 'beer-cit', qty: '3' }]);
    expect(h.vlozeno).toHaveLength(2);
    expect(h.oznameni).toEqual(['Uloženo. 1 řádek je bez tanku. Přiřadíš ve Sklepě → Stáčení bez tanku.']);
  });
});
