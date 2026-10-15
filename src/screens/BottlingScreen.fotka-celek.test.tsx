// Celá cesta od fotky po databázi: skutečné okno „Zadání stočení lahví z fotky"
// uvnitř obrazovky Lahve (bez náhrady okna), odpovědi funkce parse-order-image
// podvržené. 15. 10. 2026: „přiřadíš sud, množství sudů a počet lahví z nich
// stočený a importuješ do tabulky" — víc dnů najednou.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  DB: {
    bottling: [] as any[],
    beers: [
      { id: 's12', name: '12° Světlá', degree: '12°', is_active: true, sort_order: 1 },
      { id: 'jan', name: 'Jantar', degree: null, is_active: true, sort_order: 2 },
    ],
    packages: [
      { id: 'p15', label: '1.5l', kind: 'bottle', volume_l: 1.5, sort_order: 1 },
      { id: 'p1', label: '1l', kind: 'bottle', volume_l: 1, sort_order: 2 },
      { id: 'p05', label: '0.5l', kind: 'bottle', volume_l: 0.5, sort_order: 3 },
      { id: 'p033', label: '0.33l', kind: 'bottle', volume_l: 0.33, sort_order: 4 },
      { id: 'k50', label: ' 50l', kind: 'keg', volume_l: 50, sort_order: 5 },
      { id: 'k20', label: '20l', kind: 'keg', volume_l: 20, sort_order: 6 },
    ],
    orders: [], order_items: [], inventory: [], fasovani: [], fasovani_private: [],
    writeoffs: [], kegging: [], keg_prefuk: [], zavoz_deductions: [], bottling_plans: [],
  } as Record<string, any[]>,
  vlozeno: [] as any[][],
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
vi.mock('../lib/auth', () => ({ useAuth: vi.fn(() => ({ profile: { role: 'admin', display_name: 'Test' } })) }));
vi.mock('../lib/functionAuth', () => ({
  authenticatedFunctionHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
}));
vi.mock('../lib/obrazek', async (orig) => ({
  ...(await orig<typeof import('../lib/obrazek')>()),
  zmensenyDataUrl: vi.fn(async () => 'data:image/png;base64,ANALYZA'),
  oriznutyDataUrl: vi.fn(async () => 'data:image/jpeg;base64,VYREZ'),
}));
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
vi.mock('../components/ImportStaceniLahviExcel', () => ({ default: () => null }));
vi.mock('../components/ImageEditor', () => ({ ImageEditorOverlay: () => null }));
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
import { prepisTabulky, type RadekTabulky } from '../../supabase/functions/_shared/tabulka-staceni';
import { VISION_TABULKA_PUVODNI } from '../../supabase/functions/_shared/tabulka-vision.fixture';

const prepis = JSON.parse(JSON.stringify(prepisTabulky(VISION_TABULKA_PUVODNI)));
const r = (p: Partial<RadekTabulky>): RadekTabulky => ({
  cislo: 555, datumVBunce: null, datum: '2026-10-13', pivo: '12 Světlá', pivoId: 's12', sudy: [], lahve: [], varovani: [], ...p,
});
/** Tabulka z fotky: pondělí 12. 10. a úterý 13. 10. (čtyři druhy lahví a dva sudy na jednom řádku). */
const RADKY = [
  r({ cislo: 540, datum: '2026-10-12', datumVBunce: '2026-10-12', sudy: [{ objemL: 50, ks: 2 }], lahve: [{ objemL: 1, ks: 88 }] }),
  r({ cislo: 541, datum: '2026-10-12', pivo: 'Jantar', pivoId: 'jan', sudy: [{ objemL: 50, ks: 1 }], lahve: [{ objemL: 1.5, ks: 25 }, { objemL: 0.5, ks: 20 }] }),
  r({ cislo: 544, datum: '2026-10-13', datumVBunce: '2026-10-13', sudy: [{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }], lahve: [{ objemL: 1.5, ks: 12 }, { objemL: 1, ks: 10 }, { objemL: 0.5, ks: 28 }, { objemL: 0.33, ks: 12 }] }),
];
const DNY = [{ datum: '2026-10-12', radku: 2 }, { datum: '2026-10-13', radku: 1 }];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  h.vlozeno.length = 0;
  h.DB.bottling = [];
  fetchMock = vi.fn().mockImplementation(async (_url: string, init: any) => {
    const telo = JSON.parse(init.body);
    const data = telo.rezim === 'tabulka-okno'
      ? { tabulka: { prepis } }
      : { tabulka: { radky: RADKY, dny: DNY, varovani: [], vynechano: 0, bezData: 0, ocr: true } };
    return new Response(JSON.stringify(data), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Fotka s tabulkou o dvou dnech → zápis stáčení lahví', () => {
  it('všechny dny najednou, každý řádek na svůj den a se svým sudem; čtyři druhy lahví z jednoho sudu', async () => {
    render(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);
    fireEvent.click(await screen.findByRole('button', { name: /Číst z fotky/ }));
    const vstupy = await waitFor(() => {
      const v = document.querySelectorAll('input[type="file"]');
      expect(v.length).toBeGreaterThan(0);
      return v;
    });
    fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [new File(['x'], 'tabulka.png', { type: 'image/png' })] } });

    await screen.findByText(/Rozpoznané řádky stočení/);
    expect(screen.getAllByTestId('radek-z-tabulky')).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /Vložit 3 řádky z 2 dnů do tabulky stočení lahví/ }));

    // Okno se zavřelo a řádky jsou v zápisu pod dlaždicemi, každý s dnem.
    expect(await screen.findByText(/Zápis stáčení/)).toBeTruthy();
    expect(screen.getByText(/12\. 10\. · PET 1 l|12\. 10\. · 1l · 12° Světlá/)).toBeTruthy();
    expect(screen.getByText(/13\. 10\. · 0.33l · 12° Světlá/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Uložit stáčení lahví/ }));
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    const z = h.vlozeno[0];
    // 1 + 2 + (4 druhy lahví ze dvou sudů rozpočítané podle litrů)
    const poDnech = (den: string) => z.filter((x) => x.entry_date === den);
    expect(poDnech('2026-10-12').map((x) => [x.beer_id, x.package_id, x.quantity, x.kegs_used, x.kegs_used_package_id]))
      .toEqual([
        ['s12', 'p1', 88, 2, 'k50'],
        ['jan', 'p15', 25, 1, 'k50'],
        ['jan', 'p05', 20, 1, 'k50'],
      ]);
    const trinact = poDnech('2026-10-13');
    // Součet lahví každého druhu zůstal (rozdělení mezi dva sudy nic neztratí) a oba sudy jsou odečtené.
    for (const [pkg, ks] of [['p15', 12], ['p1', 10], ['p05', 28], ['p033', 12]] as const) {
      expect(trinact.filter((x) => x.package_id === pkg).reduce((a, x) => a + x.quantity, 0)).toBe(ks);
    }
    // (Počet sudů nese každý záznam dávky — kniha ho odečte jednou na dávku a sud.)
    expect(new Set(trinact.map((x) => `${x.kegs_used_package_id}×${x.kegs_used}`))).toEqual(new Set(['k50×1', 'k20×1']));
    // Tři různé dávky = tři různé časy vzniku.
    const casy = new Set(z.map((x) => x.created_at));
    expect(casy.size).toBe(3);
  });

  it('po uložení je zápis prázdný', async () => {
    render(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);
    fireEvent.click(await screen.findByRole('button', { name: /Číst z fotky/ }));
    const vstupy = await waitFor(() => {
      const v = document.querySelectorAll('input[type="file"]');
      expect(v.length).toBeGreaterThan(0);
      return v;
    });
    fireEvent.change(vstupy[1] ?? vstupy[0], { target: { files: [new File(['x'], 'tabulka.png', { type: 'image/png' })] } });
    await screen.findByText(/Rozpoznané řádky stočení/);
    fireEvent.click(screen.getByRole('button', { name: /Vložit 3 řádky z 2 dnů/ }));
    await screen.findByText(/Zápis stáčení/);
    fireEvent.click(screen.getByRole('button', { name: /Uložit stáčení lahví/ }));
    await waitFor(() => expect(h.vlozeno).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/Zápis stáčení/)).toBeNull());
    expect(localStorage.getItem('rozepsane_staceni_lahve')).toBeNull();
  });
});
