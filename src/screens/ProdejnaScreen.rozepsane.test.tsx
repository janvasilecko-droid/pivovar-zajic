// Rozepsané fasování / odpis / prodejna se neztratí (lib/rozepsanyZapis.ts).
// 15. 10. 2026: „když zadávám fasování… ať se ta data, pokud je nepotvrdím,
// nevymažou… ať to tam je, než se to potvrdí, nebo se to musí ručně smazat."
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';

const h = vi.hoisted(() => {
  const zapisy: any[] = [];
  const potvrd = vi.fn();
  const DB: Record<string, any[]> = {
    fasovani_private: [], fasovani: [], writeoffs: [],
    beers: [{ id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 }],
    packages: [{ id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 1 }],
    inventory: [], parser_aliases: [],
  };
  return { DB, zapisy, potvrd };
});

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
      const radky = Array.isArray(payload) ? payload : [payload];
      h.zapisy.push(...radky.map((r) => ({ ...r, __tabulka: table })));
      const vlozeno: any = Promise.resolve({ data: radky.map((_, i) => ({ id: `novy-${i}` })), error: null });
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
    beerName: vi.fn((b: any) => b?.name ?? ''),
    pkgBg: vi.fn(() => '#ef4444'),
    pkgText: vi.fn(() => '#fff'),
    formatPackageLabel: vi.fn((l: string) => l),
  };
});
vi.mock('../lib/toast', () => ({
  chyba: vi.fn(),
  uspech: vi.fn(),
  oznam: vi.fn(),
  potvrd: h.potvrd,
  toastZpet: vi.fn(),
}));

const KLIC = 'rozdelany_vydej_fasovani_private';
const otevri = () => render(<ProdejnaScreen table="fasovani_private" title="Fasování" />);

describe('Fasování — rozepsaný zápis', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.zapisy.length = 0;
    h.potvrd.mockResolvedValue(true);
  });

  it('koncept z předchozí verze appky (bez času uložení) se vrátí a obrazovka to řekne', async () => {
    // Stejný klíč i tvar jako dřív: { entryRows, who, note, date }.
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }],
      who: 'Pavel', note: 'pro obchod', date: '2026-01-05',
    }));
    otevri();
    expect(await screen.findByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    // Řádek je v souhrnu zápisu (6 × 0,5 l = 3 l) a poznámka v poli.
    expect(screen.getAllByText(/6 ks · 3 L/).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('pro obchod')).toBeTruthy();
    expect((document.querySelector('input[type="date"]') as HTMLInputElement).value).toBe('2026-01-05');
  });

  it('„Uložit fasování" je nahoře v pruhu, který se při rolování přilepí (30. 10. 2026)', async () => {
    otevri();
    const pruh = await screen.findByTestId('pruh-ulozeni');
    expect(within(pruh).getByRole('button', { name: /Uložit fasování/ })).toBeTruthy();
    expect(pruh.className).toContain('sticky');
    // Pruh je první věc formuláře — nad dlaždicemi i poznámkou.
    const form = pruh.closest('form')!;
    expect(form.querySelector('[data-testid="pruh-ulozeni"]')).toBe(pruh);
    expect(pruh.compareDocumentPosition(screen.getByPlaceholderText('nepovinná poznámka')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // „Vymazat vše" zůstává dole, mimo pruh.
    expect(within(pruh).queryByRole('button', { name: /Vymazat vše/ })).toBeNull();
  });

  it('bez konceptu žádné upozornění není a nic se neukládá', async () => {
    otevri();
    await waitFor(() => expect(screen.getByRole('button', { name: /Uložit fasování/ })).toBeTruthy());
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('po uložení do databáze se koncept smaže a upozornění zmizí', async () => {
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }],
      who: '', note: '', date: '2026-01-05',
    }));
    otevri();
    await screen.findByTestId('rozepsany-zapis-pruh');
    fireEvent.click(screen.getByRole('button', { name: /Uložit fasování/ }));
    await waitFor(() => expect(h.zapisy.length).toBeGreaterThan(0));
    expect(h.zapisy[0]).toMatchObject({ beer_id: 'beer-12', package_id: 'pkg-05', quantity: 6, entry_date: '2026-01-05' });
    await waitFor(() => expect(localStorage.getItem(KLIC)).toBeNull());
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
  });

  it('„Zahodit" se ptá, než cokoliv smaže', async () => {
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }],
      who: '', note: '', date: '2026-01-05',
    }));
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalledTimes(1));
    expect(String(h.potvrd.mock.calls[0][0])).toMatch(/Zahodit rozepsaný zápis/);
  });

  it('odmítnuté „Zahodit" nic nesmaže', async () => {
    h.potvrd.mockResolvedValue(false);
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }],
      who: '', note: '', date: '2026-01-05',
    }));
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(h.potvrd).toHaveBeenCalled());
    expect(screen.getByTestId('rozepsany-zapis-pruh')).toBeTruthy();
    expect(localStorage.getItem(KLIC)).not.toBeNull();
    expect(screen.getAllByText(/6 ks · 3 L/).length).toBeGreaterThan(0);
  });

  it('potvrzené „Zahodit" smaže řádky i koncept', async () => {
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '6', vycep: false, who: '' }],
      who: 'Pavel', note: '', date: '2026-01-05',
    }));
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /Zahodit/ }));
    await waitFor(() => expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull());
    expect(localStorage.getItem(KLIC)).toBeNull();
    expect(screen.queryByText(/6 ks · 3 L/)).toBeNull();
  });

  it('každý druh výdeje má vlastní koncept (odpis nepřebírá rozepsané fasování)', async () => {
    localStorage.setItem(KLIC, JSON.stringify({
      entryRows: [{ beerId: 'beer-12', pkgId: 'pkg-05', qty: '3', vycep: false, who: '' }], who: '', note: '', date: '2026-01-05',
    }));
    render(<ProdejnaScreen table="writeoffs" title="Odpis" />);
    await waitFor(() => expect(screen.getByText(/Datum/)).toBeTruthy());
    expect(screen.queryByTestId('rozepsany-zapis-pruh')).toBeNull();
    // Koncept fasování zůstává, jak byl.
    expect(localStorage.getItem(KLIC)).not.toBeNull();
  });
});
