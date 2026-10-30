// Z provozu 28. 9. 2026: tanky nahoře na ploše, bílé pozadí, vodorovná plnost.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrehledTankuPlocha } from './PrehledTankuPlocha';

describe('PrehledTankuPlocha', () => {
  const tanky = [
    { id: 't1', label: 'Tank 1', pivo: '12° Světlá', barva: '#f4c430', litry: 3750, vystav: 7500, prazdny: false },
    { id: 't2', label: 'C7', pivo: '', barva: null, litry: 0, vystav: 7500, prazdny: true },
  ];

  it('ukáže číslo tanku, hl a pivo; klepnutí na C7 předá jeho id', () => {
    const onOtevrit = vi.fn();
    render(<PrehledTankuPlocha tanky={tanky} onOtevrit={onOtevrit} />);
    expect(screen.getByText('T1')).toBeTruthy();
    expect(screen.getByText('38 hl')).toBeTruthy();
    expect(screen.getByText('12° Světlá')).toBeTruthy();
    expect(screen.getByText('prázdný')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Otevřít detail tanku C7' }));
    expect(onOtevrit).toHaveBeenCalledWith('t2');
  });

  it('pruh ukazuje, kolik zbývá z výstavu (100 % = počáteční objem), ne z celého tanku', () => {
    const { container } = render(<PrehledTankuPlocha
      tanky={[{ id: 't2', label: 'Tank 2', pivo: '12 Hazy Bunny', barva: null, litry: 2855, vystav: 3700, prazdny: false }]}
      onOtevrit={() => {}}
    />);
    const pruh = container.querySelector('.h-2 > div') as HTMLElement;
    expect(pruh.style.width).toBe('77%');
  });

  it('bez tanků nic nevykreslí', () => {
    const { container } = render(<PrehledTankuPlocha tanky={[]} onOtevrit={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
