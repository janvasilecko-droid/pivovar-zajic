// 📋 Výběr odběratele: řazení Nejčastější / A–Z (29. 10. 2026, majitel: „přidej
// tam možnost seřadit podle abecedy, docela dlouho jsem hledal Martina").
// Výchozí řazení zůstává od nejčastěji používaných; volba A–Z se pamatuje.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Place } from '../lib/supabase';

// PlaceCombobox sahá na Supabase (zakládání odběratele) — tady se nezkouší.
vi.mock('./PlaceCombobox', () => ({ PlaceCombobox: () => null }));

import { OdberatelTlacitko } from './OdberatelTlacitko';

const MISTA = [
  { id: 'a', name: 'Restaurace' },
  { id: 'b', name: 'MARTIN' },
  { id: 'c', name: 'Maneo' },
  { id: 'd', name: 'Zizkov' },
] as unknown as Place[];
const NAZVY = MISTA.map((m) => m.name);

// Restaurace 3×, Zizkov 2×, Maneo 1×, MARTIN 0× → „nejčastější": Restaurace, Zizkov, Maneo, MARTIN
const OBJEDNAVKY = [
  { place_id: 'a', place_name: 'Restaurace' }, { place_id: 'a', place_name: 'Restaurace' }, { place_id: 'a', place_name: 'Restaurace' },
  { place_id: 'd', place_name: 'Zizkov' }, { place_id: 'd', place_name: 'Zizkov' },
  { place_id: 'c', place_name: 'Maneo' },
];

function otevri() {
  const onChange = vi.fn();
  const vykresleni = render(
    <OdberatelTlacitko placeId="" placeName="" places={MISTA} objednavky={OBJEDNAVKY} onChange={onChange} />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Vybrat odběratele/ }));
  return { onChange, vykresleni };
}

/** Tlačítka odběratelů v pořadí, v jakém jsou v okně. */
const poradi = () => screen.getAllByRole('button').map((b) => b.textContent ?? '').filter((t) => NAZVY.includes(t));

beforeEach(() => { localStorage.clear(); });

describe('OdberatelTlacitko — řazení', () => {
  it('výchozí je od nejčastěji používaných', () => {
    otevri();
    expect(poradi()).toEqual(['Restaurace', 'Zizkov', 'Maneo', 'MARTIN']);
    expect(screen.getByRole('button', { name: 'Nejčastější' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('A–Z seřadí podle abecedy a zase zpět na nejčastější', () => {
    otevri();
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(poradi()).toEqual(['Maneo', 'MARTIN', 'Restaurace', 'Zizkov']);
    expect(screen.getByRole('button', { name: 'A–Z' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Nejčastější' }));
    expect(poradi()).toEqual(['Restaurace', 'Zizkov', 'Maneo', 'MARTIN']);
  });

  it('zvolené řazení se pamatuje i po novém otevření okna a po novém načtení stránky', () => {
    const { vykresleni } = otevri();
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    expect(localStorage.getItem('pivovar_odberatel_razeni')).toBe('abeceda');

    vykresleni.unmount();
    otevri();
    expect(poradi()).toEqual(['Maneo', 'MARTIN', 'Restaurace', 'Zizkov']);
  });

  it('rozbitá hodnota v úložišti = výchozí řazení', () => {
    localStorage.setItem('pivovar_odberatel_razeni', 'cokoliv');
    otevri();
    expect(poradi()).toEqual(['Restaurace', 'Zizkov', 'Maneo', 'MARTIN']);
  });

  it('klepnutí na odběratele ho vybere (řazení to nemění)', () => {
    const { onChange } = otevri();
    fireEvent.click(screen.getByRole('button', { name: 'A–Z' }));
    fireEvent.click(screen.getByRole('button', { name: 'MARTIN' }));
    expect(onChange).toHaveBeenCalledWith('b', 'MARTIN');
  });
});
