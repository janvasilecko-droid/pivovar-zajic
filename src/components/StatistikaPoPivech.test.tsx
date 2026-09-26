// Statistika → Po pivech: vybrané pivo, teď proti minule, sudy a lahve zvlášť.
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
  { entry_date: '2025-05-01', beer_id: 'b12', package_id: 'keg50', quantity: 30 },
];
const LAHVE = [{ entry_date: '2026-09-16', beer_id: 'b12', package_id: 'lah05', quantity: 180 }];

const karta = (nazev: string) => screen.getByRole('region', { name: nazev });
const radek = (nazev: string, obal: string) =>
  [...karta(nazev).querySelectorAll('tbody tr')].find((tr) => tr.textContent!.startsWith(obal))!;

describe('StatistikaPoPivech', () => {
  it('výchozí pivo s největším výstavem, tento měsíc proti minulému, po obalech', () => {
    render(<StatistikaPoPivech sudy={SUDY} lahve={LAHVE} obaly={OBALY} piva={PIVA} dnes="2026-09-17" />);
    expect(screen.getByRole('heading', { name: '12° Světlý — stočeno' })).toBeTruthy();
    expect(karta('Sudy (KEG)').textContent).toMatch(/Tento měsíc8 ks4 hl/);
    expect(karta('Sudy (KEG)').textContent).toMatch(/Minulý měsíc5 ks2,5 hl/);
    expect(karta('Sudy (KEG)').textContent).toMatch(/\+60 %/);
    expect(radek('Sudy (KEG)', 'KEG 50l').textContent).toBe('KEG 50l8 ks5 ks13 ks');
    expect(karta('Sudy (KEG)').textContent).toMatch(/Celkem letos \(2026\)13 ks · 6,5 hl/);
    expect(radek('Lahve a PET', 'Lahev 0,5l').textContent).toBe('Lahev 0,5l180 ks–180 ks');
    // Přehled všech piv za tento měsíc.
    const vsechna = screen.getByRole('heading', { name: 'Všechna piva — tento měsíc' }).closest('section')!;
    expect(vsechna.textContent).toMatch(/12° Světlý8 ks4 hl180 ks0,9 hl/);
    expect(vsechna.textContent).toMatch(/11° Světlá1 ks0,5 hl–/);
  });

  it('přepnutí na rok a na jiné pivo', () => {
    render(<StatistikaPoPivech sudy={SUDY} lahve={LAHVE} obaly={OBALY} piva={PIVA} dnes="2026-09-17" />);
    fireEvent.click(screen.getByRole('button', { name: 'Rok' }));
    // U roku je letošek nahoře — řádek „Celkem letos" ani sloupec Letos se neopakují.
    expect(karta('Sudy (KEG)').textContent).not.toMatch(/Celkem letos/);
    expect(radek('Sudy (KEG)', 'KEG 50l').textContent).toBe('KEG 50l13 ks30 ks');
    fireEvent.click(screen.getAllByRole('button', { name: '11° Světlá' })[0]);
    expect(screen.getByRole('heading', { name: '11° Světlá — stočeno' })).toBeTruthy();
    expect(radek('Sudy (KEG)', 'KEG 50l').textContent).toBe('KEG 50l1 ks–');
    expect(karta('Lahve a PET').textContent).toMatch(/Ani letos, ani loni se nestáčelo/);
  });
});
