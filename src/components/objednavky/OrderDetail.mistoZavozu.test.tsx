// 📍 Detail objednávky: kam se veze — 5. 11. 2026: „u Radek je potřeba 2 GPS,
// občas se vozí do Hradce a občas do Prahy."
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ uloz: vi.fn(), chyba: vi.fn() }));

vi.mock('../../lib/supabase', async (puvodni) => {
  const skutecny = await puvodni<typeof import('../../lib/supabase')>();
  // Ostatní dotazy okna detailu (poznámky, fotky, …): cokoli se zřetězí, čeká se na prázdný výsledek.
  const retez = (): any => new Proxy({}, {
    get: (_t, vlastnost) => (vlastnost === 'then'
      ? (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok)
      : () => retez()),
  });
  return { ...skutecny, fetchAllRows: () => retez(), supabase: { from: () => retez(), rpc: async () => ({ data: null, error: null }) } };
});
vi.mock('../../lib/mistaZavozuDb', () => ({ ulozMistoObjednavky: (...a: unknown[]) => h.uloz(...a) }));
vi.mock('../../lib/toast', async (puvodni) => ({ ...(await puvodni<typeof import('../../lib/toast')>()), chyba: h.chyba }));

import { OrderDetail } from './OrderDetail';
import type { Order } from './spolecne';

const RADEK = {
  id: 'radek', name: 'Radek', note: null, created_at: '', address: 'Korunní 10, Praha 2', phone: null, opening_hours: null,
  lat: 50.0755, lng: 14.4378,
  mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova 1, Hradec Králové', lat: 50.2092, lng: 15.8328 }],
};
const OBJEDNAVKA: Order = {
  id: 'o1', order_date: '2026-11-03', place_id: 'radek', place_name: 'Radek', source: 'whatsapp', status: 'nova',
  note: 'Radek na ctvrtek', created_at: '2026-11-03T10:00:00Z', delivery_day: 'ct', delivery_date: '2026-11-05',
  is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null, misto_zavozu: null,
};
const onChanged = vi.fn();

function otevri(order: Order = OBJEDNAVKA, places: unknown[] = [RADEK]) {
  return render(
    <OrderDetail
      order={order} items={[]} beers={[]} packages={[]} places={places as any} priceList={[]}
      remaining={new Map()} onClose={vi.fn()} onChanged={onChanged} onSplit={vi.fn()} onToggleFlag={vi.fn()}
      onToggleItemFlag={vi.fn()} onImportImage={vi.fn()} setItems={vi.fn()} allOrders={[order]}
      allItems={{ [order.id]: [] }} weekKey="2026-45" setWeekKey={vi.fn()}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.uloz.mockResolvedValue(null);
});

describe('detail objednávky — kam se veze', () => {
  it('u Radka je přepínač Praha / Hradec; volba se uloží', async () => {
    otevri();
    expect(screen.getByText(/nevybráno — jede se na Praha/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hradec' })); });
    expect(h.uloz).toHaveBeenCalledWith('o1', 'hk');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Hradec' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('když uložení neprojde (třeba před migrací), volba se vrátí a řekne se proč', async () => {
    h.uloz.mockResolvedValue('Další místa závozu ještě nejdou uložit — nejdřív spusť migraci …');
    otevri();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Hradec' })); });
    await waitFor(() => expect(h.chyba).toHaveBeenCalledWith(expect.stringMatching(/spusť migraci/)));
    expect(screen.getByRole('button', { name: 'Hradec' }).getAttribute('aria-pressed')).toBe('false');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('u odběratele s jedním místem přepínač není', () => {
    otevri({ ...OBJEDNAVKA, place_id: 'luzec', place_name: 'Lužec' }, [{ ...RADEK, id: 'luzec', name: 'Lužec', mista_zavozu: [] }]);
    expect(screen.queryByRole('group', { name: 'Kam se veze' })).toBeNull();
  });
});
