// 📍 Odběratelé: další místa závozu — 5. 11. 2026: „u Radek je potřeba 2 GPS,
// občas se vozí do Hradce a občas do Prahy." Formulář musí fungovat i PŘED
// spuštěním migrace (sloupec mista_zavozu v databázi ještě není).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  places: [] as Record<string, unknown>[],
  zapisy: [] as Record<string, unknown>[],
  chybyZapisu: [] as ({ code: string; message: string } | null)[],
  chyba: vi.fn(),
  oznam: vi.fn(),
}));

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../lib/supabase');
  const dotaz = (data: unknown) => {
    const p: any = Promise.resolve({ data, error: null });
    for (const m of ['order', 'eq', 'neq', 'in', 'select', 'limit']) p[m] = () => p;
    return p;
  };
  return {
    ...actual,
    useRealtime: () => {},
    fetchAllRows: () => dotaz([]),
    supabase: {
      from: () => ({
        select: () => dotaz(h.places),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => { h.zapisy.push(payload); return { error: h.chybyZapisu.shift() ?? null }; },
        }),
        insert: async (payload: Record<string, unknown>) => { h.zapisy.push(payload); return { error: h.chybyZapisu.shift() ?? null }; },
        delete: () => ({ eq: async () => ({ error: null }) }),
      }),
    },
  };
});
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: { role: 'user' }, user: { email: '' } }) }));
vi.mock('../lib/toast', () => ({
  chyba: (...a: unknown[]) => h.chyba(...a),
  oznam: (...a: unknown[]) => h.oznam(...a),
  potvrd: async () => true,
  uspech: vi.fn(),
}));
vi.mock('../lib/placeLookup', () => ({ lookupPlaceOnline: async () => [] }));

import { PlacesScreen } from './Catalogs';

const radek = (o: Record<string, unknown> = {}) => ({
  id: 'radek', name: 'Radek', note: null, created_at: '2026-08-02T18:06:03Z', address: null, phone: null,
  opening_hours: null, contact_name: null, email: null, delivery_group: null, lat: null, lng: null, ...o,
});

beforeEach(() => {
  h.places = [radek()];
  h.zapisy = [];
  h.chybyZapisu = [];
  h.chyba.mockReset();
  h.oznam.mockReset();
});

async function otevriRadka() {
  render(<PlacesScreen />);
  await screen.findByText('Radek');
  fireEvent.click(screen.getByRole('button', { name: 'Upravit' }));
  await screen.findByText('Upravit odběratele');
}

function vyplnPrahuAHradec() {
  fireEvent.change(screen.getByPlaceholderText('Ulice 123, Město'), { target: { value: 'Korunní 10, Praha 2' } });
  fireEvent.change(screen.getByLabelText('GPS hlavní adresy'), { target: { value: '50.0755, 14.4378' } });
  fireEvent.click(screen.getByRole('button', { name: /Přidat další místo závozu/ }));
  fireEvent.change(screen.getByLabelText('Název místa'), { target: { value: 'Hradec' } });
  fireEvent.change(screen.getByLabelText('GPS'), { target: { value: 'https://mapy.cz/zakladni?x=15.8327664&y=50.2092003&z=17' } });
}

describe('Odběratel s víc místy závozu', () => {
  it('Radek: hlavní adresa Praha s GPS a další místo Hradec se uloží najednou', async () => {
    await otevriRadka();
    vyplnPrahuAHradec();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit odběratele' }));
    await waitFor(() => expect(h.zapisy).toHaveLength(1));
    expect(h.zapisy[0]).toMatchObject({
      name: 'Radek', address: 'Korunní 10, Praha 2', lat: 50.0755, lng: 14.4378,
      mista_zavozu: [{ id: expect.any(String), nazev: 'Hradec', adresa: null, lat: 50.2092003, lng: 15.8327664 }],
    });
    await waitFor(() => expect(screen.queryByText('Upravit odběratele')).toBeNull());
    expect(h.chyba).not.toHaveBeenCalled();
  });

  it('před migrací: ostatní údaje se uloží, místa zůstanou ve formuláři a řekne se proč', async () => {
    h.chybyZapisu = [{ code: 'PGRST204', message: "Could not find the 'mista_zavozu' column of 'places' in the schema cache" }];
    await otevriRadka();
    vyplnPrahuAHradec();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit odběratele' }));
    await waitFor(() => expect(h.chyba).toHaveBeenCalled());
    expect(h.zapisy).toHaveLength(2);
    expect(h.zapisy[1]).not.toHaveProperty('mista_zavozu');
    expect(h.zapisy[1]).toMatchObject({ address: 'Korunní 10, Praha 2', lat: 50.0755, lng: 14.4378 });
    expect(String(h.chyba.mock.calls[0][0])).toMatch(/spusť migraci 20261231450000.*Ostatní údaje odběratele jsou uložené/);
    expect(screen.getByText('Upravit odběratele')).toBeTruthy();
    expect((screen.getByLabelText('Název místa') as HTMLInputElement).value).toBe('Hradec');
  });

  it('odběratel bez dalších míst ukládá jako dřív (bez sloupce mista_zavozu)', async () => {
    await otevriRadka();
    fireEvent.change(screen.getByPlaceholderText('Ulice 123, Město'), { target: { value: 'Korunní 10, Praha 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uložit odběratele' }));
    await waitFor(() => expect(h.zapisy).toHaveLength(1));
    expect(h.zapisy[0]).not.toHaveProperty('mista_zavozu');
    expect(h.zapisy[0]).toMatchObject({ lat: null, lng: null });
  });

  it('nepoznané GPS uložení zastaví', async () => {
    await otevriRadka();
    fireEvent.change(screen.getByLabelText('GPS hlavní adresy'), { target: { value: 'u kostela' } });
    expect(screen.getByText(/GPS jsem nepoznal/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Uložit odběratele' }));
    await waitFor(() => expect(h.oznam).toHaveBeenCalled());
    expect(String(h.oznam.mock.calls[0][0])).toMatch(/GPS hlavní adresy jsem nepoznal/);
    expect(h.zapisy).toHaveLength(0);
  });

  it('uložená místa se ve formuláři načtou, v seznamu je vidět „Další místa"', async () => {
    h.places = [radek({ address: 'Korunní 10, Praha 2', lat: 50.0755, lng: 14.4378, mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova 1, Hradec Králové', lat: 50.2092, lng: 15.8328 }] })];
    render(<PlacesScreen />);
    expect(await screen.findByText('Další místa: Hradec')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upravit' }));
    expect(((await screen.findByLabelText('Název místa')) as HTMLInputElement).value).toBe('Hradec');
    expect((screen.getByLabelText('GPS') as HTMLInputElement).value).toBe('50.209200, 15.832800');
    // Beze změny se GPS uloží přesně, jak bylo, a místa zůstanou.
    fireEvent.click(screen.getByRole('button', { name: 'Uložit odběratele' }));
    await waitFor(() => expect(h.zapisy).toHaveLength(1));
    expect(h.zapisy[0]).toMatchObject({ lat: 50.0755, lng: 14.4378, mista_zavozu: [{ id: 'hk', nazev: 'Hradec', adresa: 'Gočárova 1, Hradec Králové', lat: 50.2092, lng: 15.8328 }] });
  });
});
