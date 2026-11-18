// 👤 Detail objednávky: odběratele jde změnit PŘÍMO v objednávce.
// Majitel 18. 11. 2026: „ať se edituje odběratel přímo v objednávce
// jednodušeji." Dřív jen přes Upravit → pole s napovídáním; teď tlačítko
// „Změnit" vedle jména otevře stejné okno výběru jako u nové objednávky.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  zmeny: [] as { tabulka: string; zmena: Record<string, unknown>; sloupec: string; hodnota: unknown }[],
  chybaZapisu: null as { message: string } | null,
  chyba: vi.fn(),
  toastZpet: vi.fn(),
}));

vi.mock('../../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../../lib/supabase')>();
  // Ostatní dotazy okna detailu (poznámky, fotky, …): cokoli se zřetězí, čeká se na prázdný výsledek.
  const retez = (): object => new Proxy({}, {
    get: (_t, vlastnost) => (vlastnost === 'then'
      ? (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      : () => retez()),
  });
  const tabulka = (nazev: string) => new Proxy({}, {
    get: (_t, vlastnost) => {
      if (vlastnost === 'update') {
        return (zmena: Record<string, unknown>) => ({
          eq: async (sloupec: string, hodnota: unknown) => {
            h.zmeny.push({ tabulka: nazev, zmena, sloupec, hodnota });
            return { error: h.chybaZapisu };
          },
        });
      }
      return vlastnost === 'then' ? undefined : () => retez();
    },
  });
  return { ...skutecny, fetchAllRows: () => retez(), supabase: { from: (n: string) => tabulka(n), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('../../lib/toast', async (puvodni) => ({
  ...(await puvodni<typeof import('../../lib/toast')>()),
  chyba: h.chyba,
  toastZpet: (...a: unknown[]) => h.toastZpet(...a),
}));

import { OrderDetail } from './OrderDetail';
import type { Order } from './spolecne';
import type { Place } from '../../lib/supabase';

const misto = (id: string, name: string) => ({
  id, name, note: null, created_at: '', address: null, phone: null, opening_hours: null, lat: null, lng: null, mista_zavozu: [],
});
const MISTA = [misto('radek', 'Radek'), misto('luzec', 'Lužec'), misto('seeberg', 'Seeberg')];
const OBJEDNAVKA: Order = {
  id: 'o1', order_date: '2026-11-17', place_id: 'radek', place_name: 'Radek', source: 'whatsapp', status: 'nova',
  note: null, created_at: '2026-11-17T10:00:00Z', delivery_day: 'st', delivery_date: '2026-11-18',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null, misto_zavozu: null,
};
const onChanged = vi.fn();

function otevri(order: Order = OBJEDNAVKA) {
  return render(
    <OrderDetail
      order={order} items={[]} beers={[]} packages={[]} places={MISTA as unknown as Place[]} priceList={[]}
      remaining={new Map()} onClose={vi.fn()} onChanged={onChanged} onSplit={vi.fn()} onToggleFlag={vi.fn()}
      onToggleItemFlag={vi.fn()} onImportImage={vi.fn()} setItems={vi.fn()} allOrders={[order]}
      allItems={{ [order.id]: [] }} weekKey="2026-47" setWeekKey={vi.fn()}
    />,
  );
}
const oknoVyberu = () => within((screen.getByRole('heading', { name: 'Odběratel' })).closest('.card') as HTMLElement);

beforeEach(() => {
  vi.clearAllMocks();
  h.zmeny.length = 0;
  h.chybaZapisu = null;
});

describe('detail objednávky — změna odběratele přímo v objednávce', () => {
  it('„Změnit" otevře okno výběru; vybraný odběratel se hned uloží a nabídne se „Vrátit zpět"', async () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    await act(async () => { fireEvent.click(oknoVyberu().getByRole('button', { name: 'Lužec' })); });

    await waitFor(() => expect(h.zmeny).toHaveLength(1));
    expect(h.zmeny[0]).toEqual({ tabulka: 'orders', zmena: { place_id: 'luzec', place_name: 'Lužec' }, sloupec: 'id', hodnota: 'o1' });
    expect(onChanged).toHaveBeenCalled();
    expect(h.toastZpet).toHaveBeenCalledTimes(1);
    expect(h.toastZpet.mock.calls[0][0]).toBe('Odběratel změněn: Radek → Lužec');
    // Okno se po výběru zavřelo.
    expect(screen.queryByRole('heading', { name: 'Odběratel' })).toBeNull();
  });

  it('hledání v okně funguje i bez diakritiky: „luzec" nabídne Lužec', async () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    fireEvent.change(oknoVyberu().getByPlaceholderText(/Napiš nebo vyber/), { target: { value: 'luzec' } });
    await act(async () => { fireEvent.click(await oknoVyberu().findByRole('button', { name: 'Lužec' })); });
    await waitFor(() => expect(h.zmeny).toHaveLength(1));
    expect(h.zmeny[0].zmena).toMatchObject({ place_id: 'luzec', place_name: 'Lužec' });
  });

  it('„Vrátit zpět" vrátí původního odběratele', async () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    await act(async () => { fireEvent.click(oknoVyberu().getByRole('button', { name: 'Seeberg' })); });
    await waitFor(() => expect(h.toastZpet).toHaveBeenCalled());

    await act(async () => { await h.toastZpet.mock.calls[0][1](); });
    expect(h.zmeny).toHaveLength(2);
    expect(h.zmeny[1]).toEqual({ tabulka: 'orders', zmena: { place_id: 'radek', place_name: 'Radek' }, sloupec: 'id', hodnota: 'o1' });
  });

  it('místo závozu patří odběrateli: u nového se zruší a „Vrátit zpět" ho vrátí', async () => {
    otevri({ ...OBJEDNAVKA, misto_zavozu: 'hk' });
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    await act(async () => { fireEvent.click(oknoVyberu().getByRole('button', { name: 'Lužec' })); });
    await waitFor(() => expect(h.zmeny).toHaveLength(1));
    expect(h.zmeny[0].zmena).toEqual({ place_id: 'luzec', place_name: 'Lužec', misto_zavozu: null });

    await act(async () => { await h.toastZpet.mock.calls[0][1](); });
    expect(h.zmeny[1].zmena).toEqual({ place_id: 'radek', place_name: 'Radek', misto_zavozu: 'hk' });
  });

  it('stejný odběratel znovu: nic se nezapisuje', async () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    await act(async () => { fireEvent.click(oknoVyberu().getAllByRole('button', { name: 'Radek' })[0]); });
    expect(h.zmeny).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
    expect(h.toastZpet).not.toHaveBeenCalled();
  });

  it('když se uložení nepovede, řekne se proč a nic se nepřekreslí ani nenabídne zpět', async () => {
    h.chybaZapisu = { message: 'permission denied' };
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'Změnit odběratele' }));
    await act(async () => { fireEvent.click(oknoVyberu().getByRole('button', { name: 'Lužec' })); });
    await waitFor(() => expect(h.chyba).toHaveBeenCalledWith(expect.stringMatching(/Odběratele se nepodařilo změnit: permission denied/)));
    expect(onChanged).not.toHaveBeenCalled();
    expect(h.toastZpet).not.toHaveBeenCalled();
  });

  it('jméno odběratele je dál odkaz na jeho kartu a tlačítko Změnit je vedle něj', () => {
    otevri();
    expect(screen.getAllByText('Radek').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Změnit odběratele' }).textContent).toMatch(/Změnit/);
  });
});
