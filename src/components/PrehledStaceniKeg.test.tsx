// Přehled stáčení KEG po dnech jako tabulka (17. 10. 2026: „udělej takhle i
// přehled stáčení KEG" — po tabulce stáčení lahví).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { Beer, Package } from '../lib/supabase';
import PrehledStaceniKeg from './PrehledStaceniKeg';
import type { ZaznamKeg } from '../lib/prehledStaceniKeg';

type Radek = ZaznamKeg & { package_label: string | null };

const PIVA = [{ id: 'sv', name: '12° Světlá' }, { id: 'tm', name: '12° Tmavá' }] as unknown as Beer[];
const OBALY = [
  { id: 'k50', label: ' 50l', kind: 'keg', volume_l: 50 }, { id: 'k30', label: '30l', kind: 'keg', volume_l: 30 },
  { id: 'k20', label: '20l', kind: 'keg', volume_l: 20 },
] as unknown as Package[];

const r = (id: string, datum: string, beer: string, pkg: string, ks: number, extra: Partial<Radek> = {}): Radek => ({
  id, entry_date: datum, beer_id: beer, beer_name: beer === 'sv' ? '12° Světlá' : '12° Tmavá', package_id: pkg,
  package_label: OBALY.find((p) => p.id === pkg)?.label ?? null, quantity: ks, source_volume_l: null, note: null, ...extra,
});

const ZAZNAMY: Radek[] = [
  r('1', '2026-10-12', 'sv', 'k50', 2, { source_volume_l: 105 }),
  r('2', '2026-10-12', 'sv', 'k30', 1, { source_volume_l: 31 }),
  r('3', '2026-10-12', 'tm', 'k30', 4),
  r('4', '2026-10-14', 'sv', 'k20', 5, { note: 'Řez: Tank 7 50 % + sudy ze skladu 50 % (60 l)' }),
  r('5', '2026-10-14', 'sv', 'k20', 1),
];

function vykresli(zaznamy: Radek[] = ZAZNAMY) {
  const fn = { onPocet: vi.fn(), onKus: vi.fn(), onUpravit: vi.fn(), onSmazat: vi.fn() };
  render(<PrehledStaceniKeg zaznamy={zaznamy} piva={PIVA} obaly={OBALY} dnes="2026-10-14" {...fn} />);
  return fn;
}

beforeEach(() => { vi.clearAllMocks(); });

describe('PrehledStaceniKeg', () => {
  it('každý den je pás s názvem dne a součtem kusů a litrů; nejnovější den nahoře', () => {
    vykresli();
    const dny = screen.getAllByTestId('den-keg');
    expect(dny).toHaveLength(2);
    expect(dny[0].textContent).toContain('Středa 14. 10.');
    expect(dny[0].textContent).toContain('dnes');
    expect(dny[0].textContent).toContain('6 ks · 120 L');
    expect(dny[1].textContent).toContain('Pondělí 12. 10.');
    expect(dny[1].textContent).toContain('7 ks · 250 L');
  });

  it('sloupce jsou velikosti sudů: základní 50 a 30 vždy, 20 jen když v ní něco je', () => {
    vykresli();
    const hlavicky = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(hlavicky.filter((h) => /^\d+ L$/.test(h ?? ''))).toEqual(['50 L', '30 L', '20 L', '50 L', '30 L', '20 L']);
  });

  it('řádek = pivo, v buňkách kusy po velikostech, prázdné buňky jsou tečka; dole Celkem', () => {
    vykresli();
    const den12 = screen.getAllByTestId('den-keg')[1];
    const radky = within(den12).getAllByTestId('radek-keg');
    expect(radky).toHaveLength(2);
    expect(radky[0].textContent).toContain('12° Světlá');
    expect(within(radky[0]).getByRole('button', { name: '12° Světlá, 50 L: 2 ks' })).toBeTruthy();
    expect(within(radky[0]).getByRole('button', { name: '12° Světlá, 30 L: 1 ks' })).toBeTruthy();
    expect(radky[0].textContent).toContain('·');
    const celkem = within(den12).getByTestId('celkem-dne-keg').textContent;
    expect(celkem).toBe('Celkem25—'); // 50 L: 2, 30 L: 1 + 4, 20 L: nic
  });

  it('pod řádkem: litry, z kolika litrů z tanku a výtrata; bez tanku to řekne', () => {
    vykresli();
    const den12 = screen.getAllByTestId('den-keg')[1];
    const souhrn = within(den12).getAllByTestId('souhrn-keg');
    expect(souhrn[0].textContent).toContain('130 L z 136 L');
    expect(within(souhrn[0]).getByTestId('vytrata-keg').textContent).toBe('výtrata 4,4 %');
    expect(souhrn[1].textContent).toContain('120 L');
    expect(souhrn[1].textContent).toContain('bez tanku');
    expect(within(souhrn[1]).queryByTestId('vytrata-keg')).toBeNull();
  });

  it('zvláštní výtrata se zvýrazní jako ke kontrole', () => {
    vykresli([r('1', '2026-10-12', 'sv', 'k50', 1, { source_volume_l: 90 })]);
    expect(screen.getByTestId('vytrata-keg').className).toContain('bg-rose-700');
  });

  it('poznámka se ukáže pod řádkem', () => {
    vykresli();
    expect(screen.getByText('Řez: Tank 7 50 % + sudy ze skladu 50 % (60 l)')).toBeTruthy();
  });

  it('číslo v buňce se přepíše: Enter uloží celé číslo ≥ 1', () => {
    const fn = vykresli();
    fireEvent.click(screen.getByRole('button', { name: '12° Tmavá, 30 L: 4 ks' }));
    const pole = screen.getByLabelText('Počet sudů 30 L — 12° Tmavá');
    fireEvent.change(pole, { target: { value: '6' } });
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(fn.onPocet).toHaveBeenCalledWith('3', 6);
  });

  it('nula, prázdné, stejné číslo nebo Escape nic neuloží', () => {
    const fn = vykresli();
    for (const hodnota of ['0', '', '4']) {
      fireEvent.click(screen.getByRole('button', { name: '12° Tmavá, 30 L: 4 ks' }));
      const pole = screen.getByLabelText('Počet sudů 30 L — 12° Tmavá');
      fireEvent.change(pole, { target: { value: hodnota } });
      fireEvent.keyDown(pole, { key: 'Enter' });
    }
    fireEvent.click(screen.getByRole('button', { name: '12° Tmavá, 30 L: 4 ks' }));
    fireEvent.keyDown(screen.getByLabelText('Počet sudů 30 L — 12° Tmavá'), { key: 'Escape' });
    expect(fn.onPocet).not.toHaveBeenCalled();
  });

  it('buňka s víc záznamy téhož obalu otevře podrobnosti, ne přepisování', () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: '12° Světlá, 20 L: 6 ks (víc záznamů)' }));
    expect(screen.getByTestId('zaznamy-davky')).toBeTruthy();
    expect(within(screen.getByTestId('zaznamy-davky')).getAllByRole('listitem')).toHaveLength(2);
  });

  it('podrobnosti: úprava, ± a smazání jdou po jednom záznamu', () => {
    const fn = vykresli();
    fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: 12° Tmavá' }));
    const seznam = screen.getByTestId('zaznamy-davky');
    fireEvent.click(within(seznam).getByRole('button', { name: 'Přidat sud' }));
    expect(fn.onKus).toHaveBeenLastCalledWith('3', 1);
    fireEvent.click(within(seznam).getByRole('button', { name: 'Ubrat sud' }));
    expect(fn.onKus).toHaveBeenLastCalledWith('3', -1);
    fireEvent.click(within(seznam).getByRole('button', { name: 'Upravit záznam' }));
    expect(fn.onUpravit).toHaveBeenCalledWith(expect.objectContaining({ id: '3' }));
    expect(screen.queryByTestId('zaznamy-davky')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Podrobnosti: 12° Tmavá' }));
    fireEvent.click(within(screen.getByTestId('zaznamy-davky')).getByRole('button', { name: 'Smazat záznam' }));
    expect(fn.onSmazat).toHaveBeenCalledWith('3');
  });

  it('prázdný seznam nekreslí žádné dny', () => {
    vykresli([]);
    expect(screen.queryAllByTestId('den-keg')).toHaveLength(0);
  });
});
