// Kliknutí na „Chybí X ks sudů" v tabulce „Potřeba stočit KEGy" → přepne stránku
// na Objednávky a předá požadavek na filtr (pivo + obal), který Orders použije.
// Scénáře:
//  1. chybějící řádek → setPage('orders') + requestOrdersItemFilter = beer+package,
//     požadavek je jednorázový (druhé čtení vrátí null)
//  2. pokrytý řádek → žádné tlačítko „Chybí" se nezobrazí
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import KeggingScreen from './Kegging';
import { consumeOrdersItemFilter } from '../lib/ordersFilter';

const h = vi.hoisted(() => {
  const curMonth = new Date().toISOString().slice(0, 7);
  const DB: Record<string, any[]> = {
    kegging: [],
    cellar_tanks: [],
    beers: [{ id: 'beer-12', name: 'Světlý ležák 12°', is_active: true, sort_order: 1 }],
    packages: [{ id: 'pkg-30', label: 'KEG 30l', kind: 'keg', volume_l: 30, sort_order: 1 }],
    orders: [{ id: 'order-1', order_date: `${curMonth}-01`, delivery_date: `${curMonth}-15`, status: 'nova' }],
    order_items: [{ order_id: 'order-1', beer_id: 'beer-12', package_id: 'pkg-30', quantity: 3 }],
    inventory: [{ entry_date: `${curMonth}-01`, beer_id: 'beer-12', package_id: 'pkg-30', quantity: 0 }],
    fasovani: [],
    fasovani_private: [],
    writeoffs: [],
    keg_prefuk: [],
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
  isoWeekKey: vi.fn(() => '2026-W01'),
  weekRange: vi.fn(() => ({ start: '2026-01-01', end: '2026-01-07', label: 'Týden' })),
  shiftWeek: vi.fn((k: string) => k),
}));

describe('Kegging — kliknutí na „Chybí X ks sudů" otevře Objednávky s filtrem pivo+obal', () => {
  beforeEach(() => {
    consumeOrdersItemFilter(); // vyprázdni případný starý požadavek
    vi.clearAllMocks();
  });

  it('1. chybějící KEG → setPage("orders") a požadavek na filtr (pivo + obal), jednorázově', async () => {
    const setPage = vi.fn();
    render(<KeggingScreen mode="overviews_only" setPage={setPage} />);

    const chybiBtn = await screen.findByText(/Chybí 3 ks sudů/);
    expect(chybiBtn.closest('button')).toBeTruthy();

    fireEvent.click(chybiBtn);

    await waitFor(() => expect(setPage).toHaveBeenCalledWith('orders'));
    expect(consumeOrdersItemFilter()).toEqual({ beerId: 'beer-12', packageId: 'pkg-30' });
    // Požadavek je jednorázový — Orders ho spotřebuje při mountu a pak je null.
    expect(consumeOrdersItemFilter()).toBeNull();
  });

  it('3. kliknutí na RÁDEK chybějícího KEGu (mimo tlačítko) → setPage("orders") + filtr (pivo + obal)', async () => {
    h.DB.inventory = [{ entry_date: `${new Date().toISOString().slice(0, 7)}-01`, beer_id: 'beer-12', package_id: 'pkg-30', quantity: 0 }];
    const setPage = vi.fn();
    render(<KeggingScreen mode="overviews_only" setPage={setPage} />);

    const beerNameInRow = await screen.findByText('Světlý ležák 12°', { selector: 'td span' });
    const row = beerNameInRow.closest('tr');
    expect(row).toBeTruthy();

    // Kliknutí na buňku se jménem piva — celý řádek je klikatelný.
    fireEvent.click(beerNameInRow);

    await waitFor(() => expect(setPage).toHaveBeenCalledWith('orders'));
    expect(consumeOrdersItemFilter()).toEqual({ beerId: 'beer-12', packageId: 'pkg-30' });
  });

  it('2. pokrytý KEG → řádek má „✓ Pokryto" a žádné klikací tlačítko „Chybí"', async () => {
    h.DB.inventory = [{ entry_date: `${new Date().toISOString().slice(0, 7)}-01`, beer_id: 'beer-12', package_id: 'pkg-30', quantity: 5 }];
    const setPage = vi.fn();
    render(<KeggingScreen mode="overviews_only" setPage={setPage} />);

    // Přepínač „Jen chybějící (> 0)" je defaultně zapnutý → pokryté řádky se skryjí.
    fireEvent.click(await screen.findByRole('button', { name: /Jen chybějící/ }));

    // Mobilní karty i desktop tabulka se renderují zároveň (přepínají se jen CSS
    // třídou `md:` — jsdom bez layoutu obojí vidí), proto ověřujeme oba výskyty.
    await waitFor(() => expect(screen.getAllByText('✓ Pokryto').length).toBeGreaterThan(0));
    expect(screen.queryByText(/Chybí/)).toBeNull();
    // Pokrytý řádek NENÍ klikatelný — kliknutí na něj nepřepne stránku ani nevyžádá filtr.
    fireEvent.click(screen.getByText('Světlý ležák 12°', { selector: 'td span' }));
    expect(setPage).not.toHaveBeenCalled();
    expect(consumeOrdersItemFilter()).toBeNull();
  });
});
