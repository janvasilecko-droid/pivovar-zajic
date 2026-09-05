/**
 * Kostra místo zhasnuté obrazovky (components/ui.tsx).
 *
 * Jedenáct obrazovek dělalo `if (loading) return <Spinner />`, což obsah
 * odmountuje — a prohlížeč u prázdné stránky srazí odrolování na nulu.
 * Kostra drží rozvržení, takže se stránka po načtení neposkočí.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Kostra } from './ui';

describe('Kostra', () => {
  it('vykreslí zadaný počet řádků', () => {
    const { container } = render(<Kostra radku={4} />);
    expect(container.querySelectorAll('.card').length).toBe(4);
  });

  it('hlásí odečítači, že se načítá', () => {
    render(<Kostra />);
    const prvek = screen.getByLabelText('Načítá se');
    expect(prvek.getAttribute('aria-busy')).toBe('true');
  });

  it('bez karty kreslí holé pruhy (pro tabulky a dlaždice)', () => {
    const { container } = render(<Kostra radku={3} karta={false} />);
    expect(container.querySelectorAll('.card').length).toBe(0);
    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
  });
});
