// Fasování: krokové zadávání (29. 10. 2026) — klepnutí na pivo otevře
// otázku „Kolik kusů?", nahoře obal (lahve, pod nimi sudy), pod polem pět
// nejčastějších čísel a pod nimi to, co se dnes už uložilo.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import ProdejnaScreen from './ProdejnaScreen';

vi.mock('../lib/businessDate', async (puvodni) => ({
  ...(await puvodni<any>()),
  businessDateISO: () => '2026-01-07',
}));

const h = vi.hoisted(() => {
  const zapisy: any[] = [];
  const potvrd = vi.fn();
  const DB: Record<string, any[]> = {
    fasovani_private: [
      { id: 'f1', entry_date: '2026-01-07', created_at: '2026-01-07T08:05:00Z', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 10, who: 'Pavel' },
      { id: 'f2', entry_date: '2026-01-06', created_at: '2026-01-06T08:05:00Z', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 12, who: 'Pavel' },
      { id: 'f3', entry_date: '2026-01-05', created_at: '2026-01-05T08:05:00Z', beer_id: 'beer-12', package_id: 'pkg-1', quantity: 12, who: 'Pavel' },
    ],
    fasovani: [], writeoffs: [],
    beers: [{ id: 'beer-12', name: '12° Světlá', is_active: true, sort_order: 1 }],
    packages: [
      { id: 'pkg-1', label: '1 l', kind: 'bottle', volume_l: 1, sort_order: 1 },
      { id: 'pkg-05', label: '0,5 l', kind: 'bottle', volume_l: 0.5, sort_order: 2 },
      { id: 'pkg-50', label: 'KEG 50l', kind: 'keg', volume_l: 50, sort_order: 3 },
    ],
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
const pole = (panel: HTMLElement) => within(panel).getByRole('textbox', { name: 'Kolik kusů?' }) as HTMLInputElement;

describe('Fasování — krokové zadávání', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    h.zapisy.length = 0;
  });

  it('klepnutí na pivo otevře otázku s polem; lahve a pod nimi sudy, rychlá čísla z historie', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText('Kolik kusů?')).toBeTruthy();
    expect(document.activeElement).toBe(pole(panel));
    expect(within(panel).getAllByRole('radio').map((r) => r.textContent)).toEqual(['1 l', '0,5 l', '50 l']);
    expect(within(panel).getByText('Lahve')).toBeTruthy();
    expect(within(panel).getByText('Sudy')).toBeTruthy();
    // 1 l: 12 (2×) a 10 (1×) z historie
    expect(within(panel).getByRole('button', { name: '12' })).toBeTruthy();
    expect(within(panel).getByRole('button', { name: '10' })).toBeTruthy();
  });

  it('obal a počet: 0,5 l × 24 a 50 l × 1 → oba v zápisu, uložení až tlačítkem', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
    const panel = await screen.findByRole('dialog');
    fireEvent.click(within(panel).getByRole('radio', { name: '0,5 l' }));
    fireEvent.change(pole(panel), { target: { value: '24' } });
    fireEvent.click(within(panel).getByRole('radio', { name: '50 l' }));
    fireEvent.change(pole(panel), { target: { value: '1' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Hotovo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(h.zapisy).toHaveLength(0);
    const ulozeny = JSON.parse(localStorage.getItem(KLIC) as string);
    expect(ulozeny.entryRows.filter((r: any) => Number(r.qty) > 0))
      .toMatchObject([{ pkgId: 'pkg-05', qty: '24' }, { pkgId: 'pkg-50', qty: '1' }]);
  });

  it('pod polem je dnešní zápis téhle tabulky, včerejší ne', async () => {
    otevri();
    fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
    const panel = await screen.findByRole('dialog');
    expect(within(panel).getByText(/Už uloženo dnes u 12° Světlá/)).toBeTruthy();
    expect(within(panel).getByText('10× 1 l')).toBeTruthy();
    expect(within(panel).queryByText('12× 1 l')).toBeNull();
  });

  it('„pro koho" zůstává v liště panelu (fasování pro personál)', async () => {
    render(<ProdejnaScreen table="fasovani" title="Fasování personál" />);
    fireEvent.click(await screen.findByRole('button', { name: /12° Světlá/ }));
    const panel = await screen.findByRole('dialog');
    const kdo = within(panel).getAllByRole('textbox').find((i) => (i as HTMLInputElement).placeholder !== '0') as HTMLInputElement;
    expect(kdo).toBeTruthy();
    fireEvent.change(kdo, { target: { value: 'Pavel' } });
    fireEvent.change(pole(panel), { target: { value: '6' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Hotovo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(JSON.parse(localStorage.getItem('rozdelany_vydej_fasovani') as string).who).toBe('Pavel');
  });
});
