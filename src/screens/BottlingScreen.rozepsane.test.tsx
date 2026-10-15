// Rozepsané stáčení lahví se neztratí (lib/rozepsanyZapis.ts).
// 15. 10. 2026: „když zadávám stáčení, tak ať se ta data, pokud je nepotvrdím,
// nevymažou. Když teď kliknu jinam a nepotvrdím stáčení, smaže se to… ať to
// tam je, než se to potvrdí, nebo se to musí ručně smazat."
//
// Příčina: dlaždice piva držela zadané počty jen ve vlastním konceptu a při
// zavření (křížek, „Zpět", klepnutí vedle) ho zahodila.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import BottlingScreen from './BottlingScreen';

const h = vi.hoisted(() => ({
  DB: {
    bottling: [],
    beers: [{ id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 }],
    packages: [
      { id: 'pkg-15', label: 'PET 1,5 l', kind: 'bottle', volume_l: 1.5, sort_order: 1 },
      { id: 'pkg-05', label: 'PET 0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 2 },
      { id: 'keg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 3 },
    ],
    orders: [], order_items: [], inventory: [], fasovani: [], fasovani_private: [],
    writeoffs: [], kegging: [], keg_prefuk: [], zavoz_deductions: [], bottling_plans: [],
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
vi.mock('../components/ImportBottlingFromImage', () => ({ ImportBottlingFromImage: () => null }));
vi.mock('../components/ImportStaceniLahviExcel', () => ({ default: () => null }));
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

const KLIC = 'rozepsane_staceni_lahve';
const ulozeny = () => {
  const t = localStorage.getItem(KLIC);
  return t ? JSON.parse(t) : null;
};
const otevri = () => render(<BottlingScreen setPage={vi.fn()} initialSubTab="zapis" />);

/** Otevře dlaždici piva, vybere 1,5 l a zadá počet. */
async function zadejVDlazdici(pocet: string) {
  fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
  const skupina = await screen.findByRole('radiogroup', { name: 'Obal 1' });
  fireEvent.click(within(skupina).getByRole('radio', { name: 'PET 1,5 l' }));
  const pole = document.querySelector('input[type="number"][placeholder="0"]') as HTMLInputElement;
  fireEvent.change(pole, { target: { value: pocet } });
}

describe('Stáčení lahví — rozepsaný zápis', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('zavření dlaždice tlačítkem „Zavřít a nechat rozepsané" NEzahodí zadané počty', async () => {
    otevri();
    await zadejVDlazdici('30');
    fireEvent.click(screen.getByRole('button', { name: /Zavřít a nechat rozepsané/ }));
    // Řádek je v zápisu pod dlaždicemi…
    expect(await screen.findByText(/Zápis stáčení \(30 ks\)/)).toBeTruthy();
    // …a v zařízení.
    expect(ulozeny().entryRows.find((r: any) => r.beerId === 'beer-12')).toMatchObject({ pkgId: 'pkg-15', qty: '30' });
  });

  it('křížek v liště dlaždice taky nechá, co je zadané', async () => {
    otevri();
    await zadejVDlazdici('12');
    fireEvent.click(screen.getByRole('button', { name: /Zavřít a vrátit se k dlaždicím/ }));
    expect(await screen.findByText(/Zápis stáčení \(12 ks\)/)).toBeTruthy();
  });

  it('klepnutí vedle dlaždice (na ztmavené pozadí) taky nechá, co je zadané', async () => {
    otevri();
    await zadejVDlazdici('18');
    fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement);
    expect(await screen.findByText(/Zápis stáčení \(18 ks\)/)).toBeTruthy();
  });

  it('prázdná dlaždice (jen se podíval) nic nezapíše', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Zavřít a nechat rozepsané/ }));
    await waitFor(() => expect(screen.queryByRole('radiogroup', { name: 'Obal 1' })).toBeNull());
    expect(screen.queryByText(/Zápis stáčení/)).toBeNull();
    expect(ulozeny()).toBeNull();
  });

  it('když z appky něco vyhodí v otevřené dlaždici, rozepsané zůstane v zařízení', async () => {
    const { unmount } = otevri();
    await zadejVDlazdici('24');
    unmount();
    expect(ulozeny().entryRows.find((r: any) => r.beerId === 'beer-12')).toMatchObject({ pkgId: 'pkg-15', qty: '24' });
  });

  it('po návratu na obrazovku je rozepsané zpátky a obrazovka to řekne', async () => {
    const prvni = otevri();
    await zadejVDlazdici('30');
    fireEvent.click(screen.getByRole('button', { name: /Zavřít a nechat rozepsané/ }));
    await screen.findByText(/Zápis stáčení \(30 ks\)/);
    prvni.unmount();

    otevri();
    expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    expect(await screen.findByText(/Zápis stáčení \(30 ks\)/)).toBeTruthy();
  });

  it('„Zahodit" ve pruhu smaže rozepsané řádky i uložený koncept', async () => {
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-15', qty: '30', kegPkgId: 'keg-50', kegQty: '1' }],
      date: '2026-01-05', note: '', ulozeno: '2026-01-06T10:05:00.000Z',
    }));
    otevri();
    expect(await screen.findByText(/Zápis stáčení \(31 ks\)/)).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(screen.queryByText(/Zápis stáčení/)).toBeNull());
    expect(localStorage.getItem(KLIC)).toBeNull();
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
  });

  it('koncept ze staré verze bez novějších polí se vrátí bez pádu', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '40' }], date: '2026-01-05', note: '' }));
    otevri();
    expect(await screen.findByText(/Zápis stáčení \(40 ks\)/)).toBeTruthy();
    expect(screen.getByTestId('rozepsany-zapis-pruh').textContent).not.toMatch(/ z /);
  });

  it('„Vymazat vše" se zeptá a po odmítnutí nic nesmaže', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-15', qty: '30' }], date: '2026-01-05', note: '' }));
    otevri();
    await screen.findByText(/Zápis stáčení \(30 ks\)/);
    fireEvent.click(screen.getByRole('button', { name: /Vymazat vše/ }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(screen.getByText(/Zápis stáčení \(30 ks\)/)).toBeTruthy();
    expect(ulozeny()).not.toBeNull();
  });

  it('„Vymazat vše" po souhlasu smaže řádky i koncept', async () => {
    localStorage.setItem(KLIC, JSON.stringify({ entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-15', qty: '30' }], date: '2026-01-05', note: '' }));
    otevri();
    await screen.findByText(/Zápis stáčení \(30 ks\)/);
    fireEvent.click(screen.getByRole('button', { name: /Vymazat vše/ }));
    await waitFor(() => expect(screen.queryByText(/Zápis stáčení/)).toBeNull());
    expect(localStorage.getItem(KLIC)).toBeNull();
  });
});
