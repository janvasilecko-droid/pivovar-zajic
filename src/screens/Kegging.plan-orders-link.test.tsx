// Denní plán stáčení („Co stočit na který den") — odkaz do Objednávek.
// Kliknutí na „Zobrazit objednávky" u chybějící položky přepne stránku na
// Objednávky a předá jednorázový požadavek na filtr (pivo + obal).
//
// Nahrazuje původní test bývalé záložky „Potřeba stočit KEGy", která byla
// odstraněna: počítala z měsíčního skladového modelu, a když ten spadl do
// mínusu (v srpnu 2026 devět druhů sudů), ořízl se na nulu a čerstvé stáčení
// se v čísle „chybí stočit" ztratilo. Plán počítá jen z dat aktuálního týdne.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KeggingScreen from './Kegging';
import { consumeOrdersItemFilter } from '../lib/ordersFilter';

const h = vi.hoisted(() => {
  const DB: Record<string, any[]> = {
    kegging: [],
    cellar_tanks: [],
    beers: [{ id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 }],
    packages: [{ id: 'pkg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 }],
    // Dovoz ve středu 7. 1. 2026 — uvnitř mockovaného týdne.
    orders: [{ id: 'order-1', order_date: '2026-01-05', delivery_date: '2026-01-07', delivery_day: null, place_name: 'U Zajíce', status: 'nova', is_delivered: false }],
    order_items: [{ id: 'oi-1', order_id: 'order-1', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 3 }],
    inventory: [],
    fasovani: [],
    fasovani_private: [],
    writeoffs: [],
    keg_prefuk: [],
    zavoz_deductions: [],
  };
  return { DB };
});

vi.mock('../lib/supabase', () => {
  function makeQuery(table: string) {
    const data = h.DB[table] ?? [];
    const result = { data, error: null };
    const q: any = Promise.resolve(result);
    q.select = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.in = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.maybeSingle = vi.fn().mockResolvedValue({ data: data[0] ?? null, error: null });
    return q;
  }
  const supabase = { from: vi.fn((t: string) => makeQuery(t)) };
  return {
    supabase,
    // Stránkovaná varianta se v testu chová stejně jako běžný dotaz —
    // testovací data se do jedné stránky vejdou.
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

vi.mock('../lib/auth', () => ({
  useAuth: vi.fn(() => ({ profile: { role: 'admin', display_name: 'Test' } })),
}));

vi.mock('../lib/kegSanitation', () => ({
  autoLogKegSanitationFromChecklist: vi.fn().mockResolvedValue(undefined),
  isLastWeekOfMonth: vi.fn(() => false),
}));

vi.mock('../components/KeggingChecklistModal', () => ({
  KeggingChecklistModal: () => null,
  isStartChecklistCompleteForKeg: vi.fn(() => true),
  isMonthlyChecklistCompleteForKeg: vi.fn(() => true),
}));

vi.mock('../components/ui', () => ({
  EmptyState: ({ text, icon }: any) => <div>{icon ?? '📦'} {text}</div>,
  Spinner: () => null,
  Modal: ({ open, children }: any) => (open ? <div>{children}</div> : null),
}));

vi.mock('../components/VoiceRecorder', () => ({ VoiceRecorder: () => null }));
vi.mock('../components/ImportKeggingFromImage', () => ({ ImportKeggingFromImage: () => null }));
vi.mock('../lib/excel', () => ({ exportKeggingToExcel: vi.fn() }));
vi.mock('../lib/orderParser', () => ({
  parseFreeTextEntries: vi.fn(() => []),
  loadAliasMap: vi.fn().mockResolvedValue({}),
  emptyAliasMap: vi.fn(() => ({})),
}));
vi.mock('../components/WeeklyOrderSummaryCard', () => ({
  isoWeekKey: vi.fn(() => '2026-02'),
  // Pondělí 5. 1. 2026 – neděle 11. 1. 2026 (skutečné pondělí, jako v provozu).
  weekRange: vi.fn(() => ({ start: new Date('2026-01-05T00:00:00Z'), end: new Date('2026-01-11T00:00:00Z'), label: '5. 1. – 11. 1.' })),
  shiftWeek: vi.fn((k: string) => k),
}));

describe('Plán stáčení — odkaz do Objednávek a odškrtnutí', () => {
  beforeEach(() => {
    consumeOrdersItemFilter();
    h.DB.kegging = [];
    h.DB.zavoz_deductions = [];
    vi.clearAllMocks();
  });

  async function otevriPlan() {
    render(<KeggingScreen mode="all" setPage={vi.fn()} initialSubTab="plan" />);
    return screen.findByText(/Stočit na St/);
  }

  it('chybějící položka → "Zobrazit objednávky" přepne na Objednávky s filtrem pivo+obal', async () => {
    const setPage = vi.fn();
    render(<KeggingScreen mode="all" setPage={setPage} initialSubTab="plan" />);

    const odkaz = await screen.findByRole('button', { name: /Zobrazit objednávky/ });
    fireEvent.click(odkaz);

    await waitFor(() => expect(setPage).toHaveBeenCalledWith('orders'));
    expect(consumeOrdersItemFilter()).toEqual({ beerId: 'beer-12', packageId: 'pkg-30' });
    // Požadavek je jednorázový — Orders ho spotřebuje při mountu a pak je null.
    expect(consumeOrdersItemFilter()).toBeNull();
  });

  it('den ukazuje, kolik sudů chybí, a nabídne odškrtnutí', async () => {
    await otevriPlan();
    expect(await screen.findByRole('button', { name: /Mám \(3\)/ })).toBeTruthy();
    expect(screen.getByText('0 / 3 ks')).toBeTruthy();
  });

  it('stočené sudy z tohoto týdne položku pokryjí — mizí tlačítko i odkaz', async () => {
    h.DB.kegging = [{ id: 'k1', entry_date: '2026-01-06', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 3 }];
    await otevriPlan();
    await waitFor(() => expect(screen.getByText('3 / 3 ks')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Mám \(/ })).toBeNull();
  });

  // Sudy nachystané a odečtené ze skladu se stáčet nemusí, i když objednávka
  // ještě není označená jako zavezená (25. 8. 2026 jich takhle čekalo 68).
  it('nachystané sudy s odečtem ze skladu položku pokryjí', async () => {
    h.DB.zavoz_deductions = [{ deduct_date: '2026-01-06', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 3, order_item_id: 'oi-1' }];
    await otevriPlan();
    await waitFor(() => expect(screen.getByText('3 / 3 ks')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Mám \(/ })).toBeNull();
  });

  it('"Celý týden" sečte všechny dny', async () => {
    await otevriPlan();
    fireEvent.click(screen.getByRole('button', { name: /Celý týden/ }));
    expect(await screen.findByText(/Stočit za celý týden/)).toBeTruthy();
    expect(screen.getByText('0 / 3 ks')).toBeTruthy();
  });
});
