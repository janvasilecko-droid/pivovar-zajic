// Statistika → Po pivech: vybrané pivo, sudy a lahve po obdobích.
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StatistikaPoPivech from './StatistikaPoPivech';

const OBALY = [
  { id: 'keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 },
];
const PIVA = [{ id: 'b12', name: '12° Světlý' }, { id: 'b11', name: '11° Světlá' }];
const SUDY = [
  { entry_date: '2026-09-15', beer_id: 'b12', package_id: 'keg50', quantity: 8 },
  { entry_date: '2026-08-10', beer_id: 'b12', package_id: 'keg50', quantity: 5 },
  { entry_date: '2026-09-15', beer_id: 'b11', package_id: 'keg50', quantity: 1 },
];
const LAHVE = [{ entry_date: '2026-09-16', beer_id: 'b12', package_id: 'lah05', quantity: 180 }];

describe('StatistikaPoPivech', () => {
  it('výchozí je pivo s největším výstavem tento měsíc; tento a minulý měsíc zvlášť', () => {
    render(<StatistikaPoPivech sudy={SUDY} lahve={LAHVE} obaly={OBALY} piva={PIVA} dnes="2026-09-17" />);
    expect(screen.getByRole('heading', { name: '12° Světlý — stočeno' })).toBeTruthy();
    const mesic = screen.getByText('Tento měsíc').closest('tr')!;
    expect(mesic.textContent).toMatch(/8 ks.*4 hl.*8× KEG 50l/);
    expect(mesic.textContent).toMatch(/180 ks.*0,9 hl.*180× Lahev 0,5l/);
    const minuly = screen.getByText('Minulý měsíc').closest('tr')!;
    expect(minuly.textContent).toMatch(/5 ks/);
  });

  it('přepnutí na jiné pivo', () => {
    render(<StatistikaPoPivech sudy={SUDY} lahve={LAHVE} obaly={OBALY} piva={PIVA} dnes="2026-09-17" />);
    fireEvent.click(screen.getByRole('button', { name: '11° Světlá' }));
    expect(screen.getByRole('heading', { name: '11° Světlá — stočeno' })).toBeTruthy();
    expect(screen.getByText('Tento měsíc').closest('tr')!.textContent).toMatch(/1 ks/);
  });
});
