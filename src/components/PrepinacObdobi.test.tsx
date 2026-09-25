// 📅 Přepínač období: dny jako tlačítka, ne kalendář.
// Zadání z 19. 9. 2026: „místo den tam dej tlačítka po, út, st, čt, pá jako
// dny, a kliknutím na den se uvidí, jaký den se co stáčelo." A znovu totéž
// den: „misto toho ze kliknu na den a pak teprv muzu vybrat den, tak at
// rovnou muzu klikat na vybrany den" — dny týdne jsou teď PŘÍMO v hlavní
// řadě místo samostatného tlačítka „Den", klik na den zároveň přepne na
// denní pohled i vybere ho.
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

  it('sobota a neděle se nenabízejí — o víkendu se nestáčí', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="day" />);
    expect(screen.queryByText('so')).toBeNull();
    expect(screen.queryByText('ne')).toBeNull();
  });

  it('když je ale zvolená sobota, je vidět — jinak by nesvítilo nic', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="day" den="2026-09-19" />);
    expect(screen.getByText('so').closest('button')?.getAttribute('aria-pressed')).toBe('true');
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

  it('kliknutím na den se rovnou přepne na denní pohled — bez mezikroku', () => {
    // Dřív se muselo nejdřív kliknout na tlačítko „Den" a teprve pak se
    // objevily dny týdne k výběru. Teď je den vidět a klikatelný hned,
    // i když je aktuálně vybraný Týden nebo Měsíc.
    const onObdobi = vi.fn();
    const onDen = vi.fn();
    render(<PrepinacObdobi {...zaklad} obdobi="week" onObdobi={onObdobi} onDen={onDen} />);
    fireEvent.click(screen.getByText('po'));
    expect(onObdobi).toHaveBeenCalledWith('day');
    expect(onDen).toHaveBeenCalledWith('2026-09-14');
  });

  it('dny týdne jsou vidět i když je zrovna vybraný Týden nebo Měsíc', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="week" />);
    for (const d of ['po', 'út', 'st', 'čt', 'pá']) {
      expect(screen.getByText(d), `chybí ${d}`).toBeTruthy();
    }
  });
});

describe('ostatní období zůstala', () => {
  it('týden i měsíc jdou pořád zvolit', () => {
    render(<PrepinacObdobi {...zaklad} obdobi="week" />);
    expect(screen.getByText('Týden')).toBeTruthy();
    expect(screen.getByText('Měsíc')).toBeTruthy();
  });

  it('v měsíci zůstává výběr měsíce', () => {
    const { container } = render(<PrepinacObdobi {...zaklad} obdobi="month" />);
    expect(container.querySelector('input[type="month"]')).toBeTruthy();
  });
});
