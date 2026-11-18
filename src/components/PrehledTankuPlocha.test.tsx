// Z provozu 28. 9. 2026: tanky nahoře na ploše, bílé pozadí, vodorovná plnost.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrehledTankuPlocha } from './PrehledTankuPlocha';
import type { FazeTanku } from '../lib/fazeTanku';

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

  // 18. 11. 2026: „ať se ukáže, že je tank uzavřený, prázdný, po oplachu, vysanitovaný."
  it('tank bez piva ukáže, v jaké je fázi: uzavřený, po oplachu, po louhu, vysanitovaný, jinak prázdný', () => {
    const t = (id: string, label: string, faze: FazeTanku | null, extra: object = {}) =>
      ({ id, label, pivo: '', barva: null, litry: 0, vystav: 7500, prazdny: true, faze, ...extra });
    const { container } = render(<PrehledTankuPlocha
      tanky={[
        t('t2', 'Tank 2', 'uzavreny'),
        t('t3', 'Tank 3', 'po_oplachu'),
        t('t7', 'Tank 7', 'po_louhu'),
        t('t4', 'Tank 4', 'vysanitovany'),
        t('t5', 'Tank 5', null),
      ]}
      onOtevrit={() => {}}
    />);
    expect(screen.getByText('uzavřený')).toBeTruthy();
    expect(screen.getByText('po oplachu')).toBeTruthy();
    expect(screen.getByText('po louhu')).toBeTruthy();
    expect(screen.getByText('vysanitovaný')).toBeTruthy();
    expect(screen.getAllByText('prázdný')).toHaveLength(1);
    expect(container.querySelectorAll('[data-faze-tanku]')).toHaveLength(4);
    // Vysvětlení pro dotek i čtečku: co fáze znamená a co je další krok.
    expect(screen.getByRole('button', { name: 'Otevřít detail tanku Tank 2' }).getAttribute('title')).toMatch(/musí oplachovat/);
    expect(screen.getByRole('button', { name: 'Otevřít detail tanku Tank 7' }).getAttribute('title')).toMatch(/kyselina/);
  });

  it('tank v sanitaci s nezapsaným zbytkem litrů ukáže fázi, ne pivo a pruh', () => {
    const { container } = render(<PrehledTankuPlocha
      tanky={[{ id: 't7', label: 'Tank 7', pivo: '12° Světlá', barva: '#f4c430', litry: 600, vystav: 7500, prazdny: false, faze: 'po_louhu' }]}
      onOtevrit={() => {}}
    />);
    expect(screen.getByText('po louhu')).toBeTruthy();
    expect(screen.queryByText('12° Světlá')).toBeNull();
    expect((container.querySelector('.h-2 > div') as HTMLElement).style.width).toBe('0%');
  });

  it('bez tanků nic nevykreslí', () => {
    const { container } = render(<PrehledTankuPlocha tanky={[]} onOtevrit={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
