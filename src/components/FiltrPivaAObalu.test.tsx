// 🍺📦 Chipy piva a obalu — přímo klikatelné, vidět hned.
// Zadání 24. 9. 2026: „misto rollovaciho pole udelej obaly i piva
// rouzklikavaci ikony ktery budou videt hned, stejne jako po ut st......"
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChipyPiva, ChipyObalu } from './FiltrPivaAObalu';

const piva = [
  { id: 'b1', name: '11° Světlá', beer_color: '#f5c518' },
  { id: 'b2', name: '13° Jantar', beer_color: '#c2410c' },
];
const obaly = [
  { id: 'p30', label: '30L' },
  { id: 'p50', label: '50L' },
];

describe('ChipyPiva', () => {
  it('všechny volby jsou vidět hned, bez rozbalování — žádný <select>', () => {
    render(<ChipyPiva piva={piva} vybrane="" onVybrat={vi.fn()} />);
    expect(screen.getByText('Všechna piva')).toBeTruthy();
    expect(screen.getByText('11° Světlá')).toBeTruthy();
    expect(screen.getByText('13° Jantar')).toBeTruthy();
    expect(document.querySelector('select')).toBeNull();
  });

  it('klik na pivo zavolá onVybrat s jeho id, klik na „Všechna piva" vrátí prázdný filtr', () => {
    const onVybrat = vi.fn();
    render(<ChipyPiva piva={piva} vybrane="" onVybrat={onVybrat} />);
    fireEvent.click(screen.getByText('13° Jantar'));
    expect(onVybrat).toHaveBeenCalledWith('b2');
    fireEvent.click(screen.getByText('Všechna piva'));
    expect(onVybrat).toHaveBeenCalledWith('');
  });

  it('vybrané pivo je vidět jako stisknuté (aria-pressed), ne jen barvou', () => {
    render(<ChipyPiva piva={piva} vybrane="b1" onVybrat={vi.fn()} />);
    expect(screen.getByText('11° Světlá').closest('button')!.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('13° Jantar').closest('button')!.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText('Všechna piva').closest('button')!.getAttribute('aria-pressed')).toBe('false');
  });

  it('bez piv se nevykreslí vůbec — nemá smysl ukazovat prázdnou lištu', () => {
    const { container } = render(<ChipyPiva piva={[]} vybrane="" onVybrat={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('ChipyObalu', () => {
  it('obaly jsou vidět jako klikatelné chipy, vybraný je stisknutý', () => {
    render(<ChipyObalu obaly={obaly} vybrane="p50" onVybrat={vi.fn()} />);
    expect(screen.getByText('30L')).toBeTruthy();
    expect(screen.getByText('50L').closest('button')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('klik na obal zavolá onVybrat s jeho id', () => {
    const onVybrat = vi.fn();
    render(<ChipyObalu obaly={obaly} vybrane="" onVybrat={onVybrat} />);
    fireEvent.click(screen.getByText('30L'));
    expect(onVybrat).toHaveBeenCalledWith('p30');
  });
});
