// 📅 Přepínač období: dny jako tlačítka, ne kalendář.
// Zadání z 19. 9. 2026: „místo den tam dej tlačítka po, út, st, čt, pá jako
// dny, a kliknutím na den se uvidí, jaký den se co stáčelo."
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrepinacObdobi } from './PrepinacObdobi';

const zaklad = {
  den: '2026-09-16',           // středa
  tyden: '2026-W38',
  mesic: '2026-09',
  onObdobi: () => {},
  onDen: () => {},
  onTyden: () => {},
  onMesic: () => {},
};

describe('volba dne', () => {
  it('nabídne dny týdne jako tlačítka, ne systémový kalendář', () => {
    const { container } = render(<PrepinacObdobi {...zaklad} obdobi="day" />);
    expect(container.querySelector('input[type="date"]'), 'kalendář se vrátil').toBeNull();
    for (const d of ['po', 'út', 'st', 'čt', 'pá']) {
      expect(screen.getByText(d), `chybí ${d}`).toBeTruthy();
    }
  });

  it('sobota a neděle tam taky jsou — jinak by sobotní stáčení nešlo najít', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="day" />);
    expect(screen.getByText('so')).toBeTruthy();
    expect(screen.getByText('ne')).toBeTruthy();
  });

  it('je vidět, který den je vybraný', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="day" />);
    expect(screen.getByText('st').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('po').closest('button')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('kliknutím na den se přepne datum', () => {
    const onDen = vi.fn();
    render(<PrepinacObdobi {...zaklad} obdobi="day" onDen={onDen} />);
    fireEvent.click(screen.getByText('po'));
    expect(onDen).toHaveBeenCalledWith('2026-09-14');
  });

  it('šipky listují po TÝDNECH — řádek dnů zůstane celý', () => {
    const onDen = vi.fn();
    render(<PrepinacObdobi {...zaklad} obdobi="day" onDen={onDen} />);
    fireEvent.click(screen.getByLabelText('Předchozí období'));
    expect(onDen).toHaveBeenCalledWith('2026-09-09'); // o týden zpět, pořád středa
  });

  it('u dne se ukazuje i číslo — „kolikátého to bylo" se nemusí dopočítávat', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="day" />);
    expect(screen.getByLabelText('st 16.')).toBeTruthy();
  });
});

describe('ostatní období zůstala', () => {
  it('týden i měsíc jdou pořád zvolit', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="week" />);
    expect(screen.getByText('Týden')).toBeTruthy();
    expect(screen.getByText('Měsíc')).toBeTruthy();
    expect(screen.getByText('Den')).toBeTruthy();
  });

  it('v měsíci zůstává výběr měsíce', () => {
    const { container } = render(<PrepinacObdobi {...zaklad} obdobi="month" />);
    expect(container.querySelector('input[type="month"]')).toBeTruthy();
  });
});
