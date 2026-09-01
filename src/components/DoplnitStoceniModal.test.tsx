// Doplnění stočení lahví: kolik sudů se odečte zadává ČLOVĚK.
//
// Z provozu: „ty odpočty sudů mi dej jen orientačně, ale já si to vypočítám"
// a „dej možnost 50 a 30 l". Jedno stáčení běžně načne obě velikosti
// dohromady a dopočet neví, kolik sudů se opravdu načalo — proto pole
// začínají prázdná a nic se nepředvyplňuje.
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

const pole50 = () => screen.getByLabelText('Počet sudů 50 l') as HTMLInputElement;
const pole30 = () => screen.getByLabelText('Počet sudů 30 l') as HTMLInputElement;

describe('DoplnitStoceniModal', () => {
  it('pole začínají prázdná — nic se nepředvyplňuje', () => {
    vykresli();
    expect(pole50().value).toBe('');
    expect(pole30().value).toBe('');
  });

  it('dopočet ukáže jen orientačně, jako číslo k porovnání', () => {
    vykresli();
    // 781 l ÷ 0,9 = 867,8 l ÷ 50 = 17,36 → 18.
    expect(screen.getByText(/Orientačně/)).toBeTruthy();
    expect(screen.getByText(/18×50/)).toBeTruthy();
  });

  it('padesátky i třicítky jdou zadat naráz', () => {
    const onConfirm = vykresli();
    fireEvent.change(pole50(), { target: { value: '15' } });
    fireEvent.change(pole30(), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat a odečíst 20 sudů/ }));
    expect(onConfirm).toHaveBeenCalledWith({
      sudy: [
        { kegPkgId: 'k50', kegQty: 15, kegVolumeL: 50 },
        { kegPkgId: 'k30', kegQty: 5, kegVolumeL: 30 },
      ],
    });
  });

  it('jen jedna velikost taky projde', () => {
    const onConfirm = vykresli();
    fireEvent.change(pole30(), { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat a odečíst 7 sudů/ }));
    expect(onConfirm).toHaveBeenCalledWith({ sudy: [{ kegPkgId: 'k30', kegQty: 7, kegVolumeL: 30 }] });
  });

  it('ukáže litry, které se odečtou', () => {
    vykresli();
    fireEvent.change(pole50(), { target: { value: '15' } });
    fireEvent.change(pole30(), { target: { value: '5' } });
    expect(screen.getByText(/15×50 \+ 5×30 = 900 l/)).toBeTruthy();
  });

  it('prázdné pole = sudy se neodečtou', () => {
    const onConfirm = vykresli();
    expect(screen.getByText(/prázdné znamená, že se sudy neodečtou/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Zapsat 781 ks lahví/ }));
    expect(onConfirm).toHaveBeenCalledWith({ sudy: [] });
  });

  it('nesmysl v poli neshodí dialog ani nepošle NaN', () => {
    const onConfirm = vykresli();
    fireEvent.change(pole50(), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat/ }));
    expect(onConfirm).toHaveBeenCalledWith({ sudy: [] });
  });

  it('nula se chová jako prázdno, ne jako zápis nula sudů', () => {
    const onConfirm = vykresli();
    fireEvent.change(pole50(), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: /Zapsat 781 ks lahví/ }));
    expect(onConfirm).toHaveBeenCalledWith({ sudy: [] });
  });
});
