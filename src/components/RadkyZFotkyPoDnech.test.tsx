// Řádky z fotky po dnech (majitel 16. 10. 2026: „udělej to pro všechno") —
// seznam, do kterého jdou řádky z víc dnů tabulky u Stáčení KEG a výdeje.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import RadkyZFotkyPoDnech from './RadkyZFotkyPoDnech';

type Radek = { beerId: string; qty: string; datum: string | null };
const JMENA: Record<string, string> = { des: '10° Desítka · 30l', sv: '12° Světlá · 50l' };
const popisek = (r: Radek) => JMENA[r.beerId] ?? r.beerId;

const RADKY: Radek[] = [
  { beerId: 'sv', qty: '2', datum: '2026-10-14' },
  { beerId: 'des', qty: '6', datum: '2026-10-12' },
  { beerId: 'des', qty: '4', datum: '2026-10-14' },
];

function vykresli(radky: Radek[] = RADKY) {
  const fn = { onKusy: vi.fn(), onOdeber: vi.fn(), onZahodit: vi.fn() };
  render(<RadkyZFotkyPoDnech radky={radky} popisek={popisek} napoveda="Uloží se tlačítkem Uložit." {...fn} />);
  return fn;
}

describe('RadkyZFotkyPoDnech', () => {
  it('bez řádků s dnem se nekreslí nic', () => {
    const { container } = render(
      <RadkyZFotkyPoDnech radky={[{ beerId: 'des', qty: '1', datum: null }]} popisek={popisek} napoveda="" onKusy={vi.fn()} onOdeber={vi.fn()} onZahodit={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('hlavička říká, kolik řádků z kolika dnů, a pod seznamem je věta, kdy se uloží', () => {
    vykresli();
    expect(screen.getByRole('heading')).toHaveTextContent('Řádky z fotky po dnech — 3 řádky z 2 dnů');
    expect(screen.getByText('Uloží se tlačítkem Uložit.')).toBeTruthy();
  });

  it('dny jdou od nejstaršího a řádky jsou pod svým dnem', () => {
    vykresli();
    const dny = screen.getAllByTestId(/^den-/);
    expect(dny.map((d) => d.getAttribute('data-testid'))).toEqual(['den-2026-10-12', 'den-2026-10-14']);
    expect(within(dny[0]).getByText('12. 10. 2026')).toBeTruthy();
    expect(within(dny[0]).getAllByRole('listitem')).toHaveLength(1);
    expect(within(dny[1]).getAllByRole('listitem')).toHaveLength(2);
    expect(within(dny[1]).getByText('12° Světlá · 50l')).toBeTruthy();
  });

  it('počet se mění podle původního pořadí řádku, ne podle pozice v seznamu', () => {
    const fn = vykresli();
    // „12° Světlá" 14. 10. je v poli první (index 0), i když je v seznamu až pod 12. 10.
    fireEvent.click(within(screen.getByTestId('den-2026-10-14')).getAllByTitle('Přidat kus')[0]);
    expect(fn.onKusy).toHaveBeenLastCalledWith(0, '3');
    fireEvent.click(within(screen.getByTestId('den-2026-10-12')).getByTitle('Ubrat kus'));
    expect(fn.onKusy).toHaveBeenLastCalledWith(1, '5');
  });

  it('počet jde napsat; jiné znaky než číslice (např. 1e5, -3) se zahodí', () => {
    const fn = vykresli();
    const pole = screen.getByLabelText('Počet kusů — 10° Desítka · 30l, 12. 10. 2026');
    fireEvent.change(pole, { target: { value: '12' } });
    expect(fn.onKusy).toHaveBeenLastCalledWith(1, '12');
    fireEvent.change(pole, { target: { value: '1e5' } });
    expect(fn.onKusy).toHaveBeenLastCalledWith(1, '15');
    fireEvent.change(pole, { target: { value: '-3' } });
    expect(fn.onKusy).toHaveBeenLastCalledWith(1, '3');
  });

  it('nula už se neubírá; řádek s nulou zůstane vidět, ale ztlumený', () => {
    const fn = vykresli([{ beerId: 'des', qty: '0', datum: '2026-10-12' }, { beerId: 'sv', qty: '2', datum: '2026-10-13' }]);
    const ubrat = screen.getAllByTitle('Ubrat kus')[0];
    expect(ubrat).toBeDisabled();
    fireEvent.click(ubrat);
    expect(fn.onKusy).not.toHaveBeenCalled();
    expect(screen.getAllByRole('listitem')[0].className).toContain('opacity-50');
    expect(screen.getAllByRole('listitem')[1].className).not.toContain('opacity-50');
  });

  it('prázdné políčko se bere jako nula (ubrat nejde, přidat dá 1)', () => {
    const fn = vykresli([{ beerId: 'des', qty: '', datum: '2026-10-12' }]);
    expect(screen.getByTitle('Ubrat kus')).toBeDisabled();
    fireEvent.click(screen.getByTitle('Přidat kus'));
    expect(fn.onKusy).toHaveBeenCalledWith(0, '1');
  });

  it('odstranění řádku a zahození všech řádků z fotky', () => {
    const fn = vykresli();
    fireEvent.click(screen.getByLabelText('Odstranit řádek — 10° Desítka · 30l, 12. 10. 2026'));
    expect(fn.onOdeber).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Zahodit řádky z fotky' }));
    expect(fn.onZahodit).toHaveBeenCalledTimes(1);
  });

  it('jeden den: hlavička nepíše „z 1 dne"', () => {
    vykresli([{ beerId: 'des', qty: '6', datum: '2026-10-12' }]);
    expect(screen.getByRole('heading')).toHaveTextContent('Řádky z fotky po dnech — 1 řádek');
  });
});
