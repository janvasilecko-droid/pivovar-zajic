// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const data: Record<string, any[]> = {
  cellar_tank_cycles: [{
    tank_id: 't1', tank_label: 'Tank 1', beer_name: '12° Světlá', initial_volume_l: 7000, kegged_volume_l: 6800,
    loss_l: 200, started_at: '2026-09-01T08:00:00Z', ended_at: '2026-09-29T08:00:00Z', duration_hours: 672,
  }],
  cellar_tanks: [{ id: 't1', label: 'Tank 1', current_beer_id: 'b10', current_beer_name: '10° Desítka', current_volume_l: 4000, initial_volume_l: 7000, started_at: '2026-10-05T08:00:00Z' }],
  beers: [{ id: 'b10', name: '10° Desítka', beer_color: 'rgb(120, 230, 160)' }],
  kegging: [{ entry_date: '2026-10-13', cellar_tank_id: 't1', source_volume_l: 1500 }],
};
const dotaz = (t: string) => {
  const vysledek = { data: data[t], error: null };
  const o: any = Promise.resolve(vysledek);
  o.order = () => o; o.limit = () => o; o.gte = () => o;
  return o;
};
vi.mock('../lib/supabase', () => ({
  supabase: { from: (t: string) => ({ select: () => dotaz(t) }) },
  fetchAllRows: (t: string) => dotaz(t),
  beerBg: (b: any) => b?.beer_color ?? '#eee',
  beerBorder: (b: any) => b?.beer_color ?? '#ccc',
  beerText: () => 'text-black',
}));

import StatistikaTanku from './StatistikaTanku';

describe('Statistika tanků', () => {
  it('ukáže pivo v tanku, dobu stáčení, týdenní litry a výtratu cyklu', async () => {
    render(<StatistikaTanku dnes="2026-10-19" />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Tank 1' })).toBeTruthy());
    const karta = { textContent: (screen.getByRole('region', { name: 'Tank 1' }).textContent ?? '').replace(/[\u00a0\u202f]/g, ' ') };
    expect(karta.textContent).toContain('10° Desítka · 4 000 l v tanku');
    expect(karta.textContent).toContain('14 dní');
    expect(karta.textContent).toContain('1 500 l');
    expect(karta.textContent).toContain('12° Světlá');
    expect(karta.textContent).toMatch(/2,9\s*%/);
  });
});
