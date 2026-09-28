// Zadání 28. 9. 2026: stáčení, které by přečerpalo tank, se uloží bez tanku
// a na záložce „Stáčení bez tanku" se přiřadí ručně.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../lib/businessDate', () => ({
  businessDateISO: () => '2026-09-28',
  posunDen: (d: string, n: number) => {
    const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
  },
}));
vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock('../lib/toast', () => ({ chyba: vi.fn(), oznam: vi.fn(), potvrd: vi.fn() }));

import { StaceniBezTanku } from './StaceniBezTanku';

const tanks: any[] = [
  { id: 't1', label: 'Tank 1', current_beer_id: 'b12', current_beer_name: '12° Světlá', current_volume_l: 800 },
  { id: 't2', label: 'Tank 2', current_beer_id: 'b10', current_beer_name: '10° Výčepní', current_volume_l: 5000 },
];
const packages: any[] = [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }];
const beers: any[] = [{ id: 'b12', name: '12° Světlá' }];

describe('StaceniBezTanku', () => {
  it('ukáže jen nedávné stáčení bez tanku a nabídne jen tank se stejným pivem', () => {
    render(
      <StaceniBezTanku
        kegging={[
          { id: 'k1', entry_date: '2026-09-27', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', package_label: 'KEG 50l', quantity: 20, cellar_tank_id: null },
          { id: 'k2', entry_date: '2026-09-27', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', package_label: 'KEG 50l', quantity: 5, cellar_tank_id: 't1' },
          { id: 'k3', entry_date: '2026-05-01', beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', package_label: 'KEG 50l', quantity: 7, cellar_tank_id: null },
        ]}
        tanks={tanks}
        beers={beers}
        packages={packages}
        onZmena={() => {}}
      />,
    );
    expect(screen.getByText('12° Světlá · KEG 50l × 20')).toBeTruthy();
    expect(screen.queryByText(/× 5$/)).toBeNull();
    expect(screen.queryByText(/× 7$/)).toBeNull();
    expect(screen.getByText(/1000 l/)).toBeTruthy();
    const select = screen.getByLabelText('Tank, ze kterého se stáčelo') as HTMLSelectElement;
    expect(select.value).toBe('t1');
    expect(select.options.length).toBe(1);
  });

  it('pivo, které není v žádném tanku, nenabídne tank s jiným pivem', () => {
    render(
      <StaceniBezTanku
        kegging={[{ id: 'k9', entry_date: '2026-09-27', beer_id: 'b11', beer_name: '10° Desítka', package_id: 'k50', package_label: 'KEG 50l', quantity: 3, cellar_tank_id: null }]}
        tanks={tanks}
        beers={beers}
        packages={packages}
        onZmena={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Tank, ze kterého se stáčelo')).toBeNull();
    expect(screen.getByText('Toto pivo teď není v žádném tanku.')).toBeTruthy();
  });

  it('bez nepřiřazeného stáčení napíše, že nic nečeká', () => {
    render(<StaceniBezTanku kegging={[]} tanks={tanks} beers={beers} packages={packages} onZmena={() => {}} />);
    expect(screen.getByText(/Žádné stáčení bez tanku/)).toBeTruthy();
  });
});
