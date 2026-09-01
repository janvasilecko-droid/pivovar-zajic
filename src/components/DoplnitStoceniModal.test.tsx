// Doplnění stočení lahví: kolik sudů se odečte musí jít přepsat.
//
// Z provozu: „u toho kolik se odečte sudů od lahví ukaž detailní množství
// sudů, které se bude moct opravit, a poté se teprve potvrdí odpis ze skladu."
// Dopočet z 10% ztráty je návrh — kolik sudů se opravdu načalo ví jenom
// stáčeč.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DoplnitStoceniModal } from './DoplnitStoceniModal';
import type { Package } from '../lib/supabase';

const obaly = [
  { id: 'k50', label: '50 L', volume_l: 50, kind: 'keg' },
  { id: 'k30', label: '30 L', volume_l: 30, kind: 'keg' },
] as unknown as Package[];

function vykresli(onConfirm = vi.fn(), kusy = 781) {
  render(
    <DoplnitStoceniModal
      open
      onClose={() => {}}
      onConfirm={onConfirm}
      popis="12° Světlá · 1 l"
      kusy={kusy}
      objemLahveL={1}
      kegPackages={obaly}
      mesic="2026-08"
      datum="2026-08-31"
      ukladaSe={false}
    />,
  );
  return onConfirm;
}

const poleSudu = () => screen.getByLabelText('Počet sudů k odečtení') as HTMLInputElement;

describe('DoplnitStoceniModal', () => {
  it('nabídne dopočet: 781 lahví × 1 l → 18 padesátek', () => {
    vykresli();
    // 781 l ÷ 0,9 = 867,8 l ÷ 50 = 17,36 → nahoru na 18.
    expect(poleSudu().value).toBe('18');
  });

  it('počet jde přepsat a potvrdí se přepsaná hodnota, ne dopočet', () => {
    const onConfirm = vykresli();
    fireEvent.change(poleSudu(), { target: { value: '15' } });
    expect(poleSudu().value).toBe('15');
    fireEvent.click(screen.getByRole('button', { name: /Zapsat a odečíst 15 sudů/ }));
    expect(onConfirm).toHaveBeenCalledWith({ kegPkgId: 'k50', kegQty: 15 });
  });

  it('tlačítko říká, co se stane — kolik sudů se odečte', () => {
    vykresli();
    expect(screen.getByRole('button', { name: /Zapsat a odečíst 18 sudů/ })).toBeTruthy();
  });

  it('nula znamená neodečítat — a je to vidět', () => {
    const onConfirm = vykresli();
    fireEvent.change(poleSudu(), { target: { value: '0' } });
    expect(screen.getByText(/Nula = sudy se neodečtou/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Zapsat 781 ks lahví/ }));
    expect(onConfirm).toHaveBeenCalledWith({ kegPkgId: null, kegQty: 0 });
  });

  it('po přepsání jde vrátit se k dopočtu', () => {
    vykresli();
    fireEvent.change(poleSudu(), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /Zpět na 18/ }));
    expect(poleSudu().value).toBe('18');
  });

  it('přepnutí na 30l sudy přepočítá návrh', () => {
    vykresli();
    fireEvent.click(screen.getByRole('button', { name: '30 l' }));
    // 867,8 l ÷ 30 = 28,9 → 29.
    expect(poleSudu().value).toBe('29');
  });

  it('„Neodečítat" pole schová a potvrdí bez sudů', () => {
    const onConfirm = vykresli();
    fireEvent.click(screen.getByRole('button', { name: 'Neodečítat' }));
    expect(screen.queryByLabelText('Počet sudů k odečtení')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Zapsat 781 ks lahví/ }));
    expect(onConfirm).toHaveBeenCalledWith({ kegPkgId: null, kegQty: 0 });
  });

  it('nesmysl v poli neshodí dialog ani nepošle NaN', () => {
    const onConfirm = vykresli();
    fireEvent.change(poleSudu(), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat/ }));
    expect(onConfirm).toHaveBeenCalledWith({ kegPkgId: null, kegQty: 0 });
  });
});
