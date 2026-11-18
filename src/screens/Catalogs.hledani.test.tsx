// 🔎 Číselníky → Odběratelé: hledání funguje i bez diakritiky.
// Majitel 18. 11. 2026: „vyhledávání odběratelů ať jde i bez diakritiky."
// Pole hledalo jen přes malá písmena, takže „luzec" nenašlo Lužec.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({ places: [] as Record<string, unknown>[] }));

vi.mock('../lib/supabase', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../lib/supabase');
  const dotaz = (data: unknown) => {
    const p = Promise.resolve({ data, error: null }) as Promise<{ data: unknown; error: null }> & Record<string, unknown>;
    for (const m of ['order', 'eq', 'neq', 'in', 'select', 'limit']) p[m] = () => p;
    return p;
  };
  return {
    ...actual,
    useRealtime: () => {},
    fetchAllRows: () => dotaz([]),
    supabase: { from: () => ({ select: () => dotaz(h.places) }) },
  };
});
vi.mock('../lib/auth', () => ({ useAuth: () => ({ profile: { role: 'user' }, user: { email: '' } }) }));
vi.mock('../lib/toast', () => ({ chyba: vi.fn(), oznam: vi.fn(), potvrd: async () => true, uspech: vi.fn() }));
vi.mock('../lib/placeLookup', () => ({ lookupPlaceOnline: async () => [] }));

import { PlacesScreen } from './Catalogs';

const misto = (name: string, o: Record<string, unknown> = {}) => ({
  id: name, name, note: null, created_at: '2026-08-02T18:06:03Z', address: null, phone: null,
  opening_hours: null, contact_name: null, email: null, delivery_group: null, lat: null, lng: null, ...o,
});

beforeEach(() => {
  h.places = [
    misto('Lužec'),
    misto('Seeberg'),
    misto('Žižkov', { address: 'Cimburkova, Žižkov, Praha 3' }),
    misto('Dadali', { contact_name: 'Jiří Černý' }),
  ];
});

async function hledej(text: string) {
  render(<PlacesScreen />);
  await screen.findByText('Seeberg');
  fireEvent.change(screen.getByPlaceholderText(/Hledat odběratele/), { target: { value: text } });
}

describe('Číselníky → Odběratelé: hledání bez diakritiky', () => {
  it('„luzec" najde Lužec a ostatní schová', async () => {
    await hledej('luzec');
    expect(screen.getByText('Lužec')).toBeTruthy();
    expect(screen.queryByText('Seeberg')).toBeNull();
  });

  it('velkými písmeny a s diakritikou taky: „LUŽEC", „Lužec"', async () => {
    await hledej('LUŽEC');
    expect(screen.getByText('Lužec')).toBeTruthy();
    expect(screen.queryByText('Seeberg')).toBeNull();
  });

  it('podle adresy a kontaktu bez diakritiky: „cimburkova zizkov", „cerny"', async () => {
    await hledej('cimburkova zizkov');
    expect(screen.getByText('Žižkov')).toBeTruthy();
    expect(screen.queryByText('Lužec')).toBeNull();
    fireEvent.change(screen.getByPlaceholderText(/Hledat odběratele/), { target: { value: 'cerny' } });
    expect(screen.getByText('Dadali')).toBeTruthy();
    expect(screen.queryByText('Žižkov')).toBeNull();
  });

  it('prázdné hledání ukáže všechny', async () => {
    await hledej('');
    for (const j of ['Lužec', 'Seeberg', 'Žižkov', 'Dadali']) expect(screen.getByText(j)).toBeTruthy();
  });
});
