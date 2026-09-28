// Z provozu 28. 9. 2026: tanky nahoře na ploše, bílé pozadí, vodorovná plnost.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrehledTankuPlocha } from './PrehledTankuPlocha';

describe('PrehledTankuPlocha', () => {
  const tanky = [
    { label: 'Tank 1', pivo: '12° Světlá', barva: '#f4c430', litry: 3750, kapacita: 7500, prazdny: false },
    { label: 'Tank 2', pivo: '', barva: null, litry: 0, kapacita: 7500, prazdny: true },
  ];

  it('ukáže číslo tanku, hl, pivo a prázdný tank; klepnutí otevře Sklep', () => {
    const onOtevrit = vi.fn();
    render(<PrehledTankuPlocha tanky={tanky} onOtevrit={onOtevrit} />);
    expect(screen.getByText('T1')).toBeTruthy();
    expect(screen.getByText('38 hl')).toBeTruthy();
    expect(screen.getByText('12° Světlá')).toBeTruthy();
    expect(screen.getByText('prázdný')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Otevřít Sklep' }));
    expect(onOtevrit).toHaveBeenCalled();
  });

  it('bez tanků nic nevykreslí', () => {
    const { container } = render(<PrehledTankuPlocha tanky={[]} onOtevrit={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
