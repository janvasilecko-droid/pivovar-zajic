// 🔎 PlaceCombobox: režim „bez nabídky“ (29. 10. 2026). Okno Odběratel ukazuje odpovídající
// odběratele samo pod polem, takže rozbalovací nabídka nad nimi by je jen přikryla. Zůstává
// tlačítko „Uložit nového odběratele“ a Enter dělá jen to, co je vidět.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import type { Place } from '../lib/supabase';

const getOrCreatePlace = vi.hoisted(() => vi.fn());
vi.mock('../lib/orderParser', () => ({ getOrCreatePlace }));

import { PlaceCombobox } from './PlaceCombobox';

const MISTA = [
  { id: 'a', name: 'Restaurace' },
  { id: 'b', name: 'Martin' },
  { id: 'c', name: 'Marek' },
] as unknown as Place[];

function Obal({ bezNapovedy, onChange }: { bezNapovedy?: boolean; onChange: (id: string, name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <PlaceCombobox
      value={value}
      places={MISTA}
      bezNapovedy={bezNapovedy}
      onChange={(id, name) => { setValue(id || name); onChange(id, name); }}
    />
  );
}

function pis(text: string, bezNapovedy?: boolean) {
  const onChange = vi.fn();
  render(<Obal bezNapovedy={bezNapovedy} onChange={onChange} />);
  const pole = screen.getByPlaceholderText(/Napiš nebo vyber odběratele/);
  fireEvent.change(pole, { target: { value: text } });
  return { onChange, pole };
}

beforeEach(() => { getOrCreatePlace.mockReset(); });

describe('PlaceCombobox — běžný režim zůstává', () => {
  it('při psaní rozbalí nabídku napovídaných odběratelů', () => {
    pis('mar');
    expect(screen.getByRole('button', { name: /^Martin/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Marek/ })).toBeTruthy();
  });

  it('Enter vybere první z napovídaných', () => {
    const { onChange, pole } = pis('mar');
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('b', 'Martin');
  });
});

describe('PlaceCombobox — bezNapovedy', () => {
  it('nekreslí nabídku s odběrateli, jen tlačítko Uložit nového odběratele', () => {
    pis('mar', true);
    expect(screen.queryByRole('button', { name: /^Martin/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Marek/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /Uložit nového odběratele/ })).toHaveLength(1);
  });

  it('Enter při jediné shodě ji vybere', () => {
    const { onChange, pole } = pis('mart', true);
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('b', 'Martin');
  });

  it('Enter při přesně napsaném jménu vybere stávajícího odběratele (nezakládá duplicitu)', () => {
    const { onChange, pole } = pis('martin', true);
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(onChange).toHaveBeenLastCalledWith('b', 'Martin');
    expect(getOrCreatePlace).not.toHaveBeenCalled();
  });

  it('Enter při víc shodách nevybírá naslepo — nic se nevybere ani nezaloží', () => {
    const { onChange, pole } = pis('mar', true);
    fireEvent.keyDown(pole, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1); // jen samotné psaní ('', 'mar')
    expect(onChange).toHaveBeenCalledWith('', 'mar');
    expect(getOrCreatePlace).not.toHaveBeenCalled();
  });

  it('Enter, když nikdo neodpovídá, založí nového odběratele', async () => {
    getOrCreatePlace.mockResolvedValue({ id: 'n', name: 'Xyz' });
    const { onChange, pole } = pis('xyz', true);
    fireEvent.keyDown(pole, { key: 'Enter' });
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith('n', 'Xyz'));
    expect(getOrCreatePlace).toHaveBeenCalledWith('xyz', MISTA);
  });
});
