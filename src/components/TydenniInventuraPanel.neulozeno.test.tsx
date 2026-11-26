// Týdenní inventura: napočítané, ale NEULOŽENÉ počty musí svítit.
// Majitel 26. 11. 2026: „když dám reálný stav skladu, musí s tím počítat" — nula u Osmy 1 l se ale nikdy neuložila
// (tlačítko se jmenovalo „Uložit kontrolu", nápověda jinde říkala „Uložit vše") a nikde to nesvítilo.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { buildMovements } from '../lib/stockLedger';

const h = vi.hoisted(() => ({ ulozeno: [] as Record<string, unknown>[] }));

vi.mock('../lib/businessDate', () => ({ businessDateISO: () => '2026-10-15', posunMesic: (m: string) => m }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      let akce: 'select' | 'zapis' = 'select';
      const q: any = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        insert: () => { akce = 'zapis'; return q; },
        upsert: (radky: Record<string, unknown> | Record<string, unknown>[]) => {
          akce = 'zapis';
          if (tabulka === 'tydenni_inventura') h.ulozeno.push(...(Array.isArray(radky) ? radky : [radky]));
          return q;
        },
        // Uložené týdenní počty se při dalším načtení vrátí, ostatní tabulky jsou prázdné.
        then: (ok: (r: any) => any, ko?: (e: any) => any) =>
          Promise.resolve({ data: akce === 'select' && tabulka === 'tydenni_inventura' ? h.ulozeno : akce === 'select' ? [] : null, error: null }).then(ok, ko),
      };
      return q;
    },
  },
  fetchAllRows: () => Promise.resolve({ data: [], error: null }),
  formatPackageLabel: (l: string) => l,
  beerBg: () => '#ffffff',
  beerText: () => '',
  useRealtime: () => {},
}));
vi.mock('../lib/sdilenaData', () => ({ nactiSdilenouTabulku: () => Promise.resolve({ data: [], error: null }) }));
vi.mock('../lib/skladovaKnihaData', () => ({
  nactiSkladovouKnihu: () => Promise.resolve({
    piva: [{ id: 'b50', name: 'Jantar', is_active: true }],
    obaly: [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
    pohyby: buildMovements({ inventoryRows: [{ entry_date: '2026-10-01', beer_id: 'b50', package_id: 'k50', quantity: 2, note: 'Počáteční stav' }] }),
    kegging: [], bottling: [], inventura: [], fasovani: [], odpisy: [], zavozy: [],
  }),
}));
vi.mock('./QuickCountModal', () => ({ QuickCountModal: () => null }));

import TydenniInventuraPanel from './TydenniInventuraPanel';

async function otevri() {
  render(<TydenniInventuraPanel />);
  await waitFor(() => expect(screen.getByText('Jantar')).toBeTruthy());
}
const pole = () => screen.getByPlaceholderText('—') as HTMLInputElement;

beforeEach(() => { localStorage.clear(); h.ulozeno.length = 0; });

describe('Týdenní inventura — neuložené počty', () => {
  it('bez napočítaného čísla žádný pruh a tlačítko je jen „Uložit vše"', async () => {
    await otevri();
    expect(screen.queryByTestId('tydenni-neulozeno')).toBeNull();
    expect(screen.getByRole('button', { name: 'Uložit vše' })).toBeTruthy();
  });

  it('napočítaná NULA je neuložené číslo jako každé jiné: pruh i počet na tlačítku', async () => {
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByTestId('tydenni-neulozeno')).toBeTruthy());
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/1 položka napočítaná, ale neuložených/);
    expect(screen.getByTestId('tydenni-neulozeno').textContent).toMatch(/Sklad ani Rozbor s nimi zatím nepočítají/);
    expect(screen.getByRole('button', { name: 'Uložit vše (1)' })).toBeTruthy();
  });

  it('po „Uložit vše" se nula zapíše a pruh zmizí', async () => {
    await otevri();
    fireEvent.change(pole(), { target: { value: '0' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Uložit vše (1)' }));
    await waitFor(() => expect(h.ulozeno).toHaveLength(1));
    expect(h.ulozeno[0]).toMatchObject({ beer_id: 'b50', package_id: 'k50', napocitano: 0 });
    await waitFor(() => expect(screen.queryByTestId('tydenni-neulozeno')).toBeNull());
    expect(screen.getByRole('button', { name: 'Uložit vše' })).toBeTruthy();
  });

  it('číslo, které už v databázi je, pruh nevyvolá; jiné než uložené ano', async () => {
    h.ulozeno.push({ beer_id: 'b50', package_id: 'k50', napocitano: 0, updated_at: '2026-10-14T08:00:00Z', tyden_od: '2026-10-12' });
    await otevri();
    await waitFor(() => expect(pole().value).toBe('0'));
    expect(screen.queryByTestId('tydenni-neulozeno')).toBeNull();
    fireEvent.change(pole(), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByTestId('tydenni-neulozeno')).toBeTruthy());
  });
});
