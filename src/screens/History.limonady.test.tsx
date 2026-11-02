// 🥤 Limonády (Citron, Kiwi, Višeň, Grep) ve Výstavu (2. 11. 2026, majitel: „do inventury
// a výstavu nikdy nepočítej limonády, počítej je zvlášť"): Výstav dostane jen pivo
// (stočené i objednané), limonády jsou zvlášť pod číslem „Letos v kusech" a v uzávěrce.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const ROK = '2026';
const tabulky = vi.hoisted(() => ({} as Record<string, unknown[]>));
const vystav = vi.hoisted(() => ({ props: null as null | Record<string, any> }));

vi.mock('../lib/sdilenaData', () => ({
  nactiSdilenouTabulku: async (t: string) => ({ data: tabulky[t] ?? [], error: null }),
}));
vi.mock('../lib/supabase', () => {
  const dotaz = (data: unknown[]) => {
    const api: any = { eq: () => api, order: () => api, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok) };
    return api;
  };
  return {
    supabase: { from: (t: string) => ({ select: () => dotaz(tabulky[`db_${t}`] ?? []) }) },
    fetchAllRows: async () => ({ data: [], error: null }),
    useRealtime: () => {},
  };
});
vi.mock('../components/StatistikaVystav', () => ({
  default: (p: Record<string, any>) => { vystav.props = p; return <div data-testid="vystav" />; },
}));
vi.mock('../components/StatistikaTrzby', () => ({ default: () => null }));
vi.mock('../components/StatistikaPoPivech', () => ({ default: () => null }));
vi.mock('../components/StatistikaTanku', () => ({ default: () => null }));
vi.mock('../components/StatistikaMalychSudu', () => ({ default: () => null }));
vi.mock('../components/StatistikaTrendy', () => ({ default: () => null }));

import History from './History';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${ROK}-11-02T10:00:00+01:00`));
  vystav.props = null;
  tabulky.db_beers = [{ id: 'b12', name: '12° Světlá', is_active: true, sort_order: 1 }];
  // Neaktivní limonáda: rozpoznat se musí i tak (katalog bez filtru is_active).
  tabulky.db_packages = [
    { id: 'k30', label: '30l', kind: 'keg', volume_l: 30, sort_order: 1 },
    { id: 'l05', label: '0,5l', kind: 'bottle', volume_l: 0.5, sort_order: 2 },
  ];
  tabulky.kegging = [
    { entry_date: `${ROK}-10-05`, beer_id: 'b12', package_id: 'k30', quantity: 4 },
    { entry_date: `${ROK}-10-06`, beer_id: 'bcit', package_id: 'k30', quantity: 7 },
  ];
  tabulky.bottling = [{ entry_date: `${ROK}-10-07`, beer_id: 'bcit', package_id: 'l05', quantity: 280 }];
  tabulky.order_items = [
    { order_id: 'o1', beer_id: 'b12', package_id: 'k30', quantity: 2 },
    { order_id: 'o1', beer_id: 'bcit', package_id: 'k30', quantity: 10 },
  ];
  tabulky.orders = [{ id: 'o1', status: 'nova', order_date: `${ROK}-10-08`, delivery_date: `${ROK}-10-10` }];
});
afterEach(() => { vi.useRealTimers(); });

describe('Historie: limonády mimo výstav, zvlášť', () => {
  it('Výstav dostane jen pivo (stočené i objednané) a limonády jsou zvlášť', async () => {
    // Limonáda je i v seznamu piv obrazovky (jeLimonada podle jména) a v celém katalogu.
    (tabulky.db_beers as unknown[]).push({ id: 'bcit', name: 'Citron', is_active: false, sort_order: 9 });
    render(<History />);
    await waitFor(() => expect(screen.getByTestId('vystav')).toBeTruthy());
    const p = vystav.props!;
    expect(p.keggingRows.map((r: any) => r.beer_id)).toEqual(['b12']);
    expect(p.bottlingRows).toEqual([]);
    expect(p.orderItems.map((r: any) => r.beer_id)).toEqual(['b12']);
    const letos = await screen.findByTestId('limonady-letos');
    expect(letos.textContent).toMatch(/Limonády zvlášť/);
    expect(letos.textContent).toMatch(/287 ks \(sudy 7, lahve 280\)/);
    expect(letos.textContent).toMatch(/350 l/);   // 7 × 30 l + 280 × 0,5 l
  });

  it('bez limonád žádný řádek zvlášť', async () => {
    tabulky.kegging = (tabulky.kegging as any[]).filter((r) => r.beer_id === 'b12');
    tabulky.bottling = [];
    tabulky.order_items = (tabulky.order_items as any[]).filter((r) => r.beer_id === 'b12');
    render(<History />);
    await waitFor(() => expect(screen.getByTestId('vystav')).toBeTruthy());
    expect(screen.queryByTestId('limonady-letos')).toBeNull();
  });

  it('tištěná uzávěrka: limonády zvlášť podle vybraných měsíců, mimo „Celkem stočeno"', async () => {
    (tabulky.db_beers as unknown[]).push({ id: 'bcit', name: 'Citron', is_active: false, sort_order: 9 });
    render(<History />);
    await waitFor(() => expect(screen.getByTestId('vystav')).toBeTruthy());
    fireEvent.click(await screen.findByRole('button', { name: /Měsíční uzávěrka \(tisk\)/ }));
    // Výchozí měsíc je zvolený (říjen 2026): limonády zvlášť; po odškrtnutí měsíce zmizí.
    const r = await screen.findByTestId('limonady-uzaverka');
    expect(r.textContent).toMatch(/Limonády \(mimo součty\): 287 ks \(sudy 7, lahve 280\)/);
    expect(screen.getByText('Celkem stočeno').nextElementSibling!.textContent).toBe('4 ks');
    fireEvent.click(screen.getByRole('button', { name: /Říj 2026/ }));
    expect(screen.queryByTestId('limonady-uzaverka')).toBeNull();
  });
});
