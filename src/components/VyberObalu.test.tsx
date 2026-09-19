// 📦 Obal i sud se vyklikávají, ne rozklikávají — společná mechanika.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „ten zdrojový keg ve stáčení lahví nedělej jako
// rozklikávací pole, ale zaškrtávací (vypiš všechny velikosti)" a vzápětí
// „udělej stejně i obaly".
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import VyberObalu, { objemCesky } from './VyberObalu';

const LAHVE = [
  { id: 'p15', volume_l: 1.5, label: null },
  { id: 'p1', volume_l: 1, label: null },
  { id: 'p05', volume_l: 0.5, label: null },
  { id: 'p033', volume_l: 0.33, label: null },
];

const popis = (o: { label?: string | null; volume_l: number | null }) =>
  o.label || objemCesky(o.volume_l) || 'obal';

describe('objemCesky', () => {
  it('desetinná čárka, ne tečka — tak je to na etiketách i v hlavě', () => {
    expect(objemCesky(0.5)).toBe('0,5 L');
    expect(objemCesky(1.5)).toBe('1,5 L');
    expect(objemCesky(1)).toBe('1 L');
  });

  it('bez objemu nevymýšlí číslo', () => {
    expect(objemCesky(null)).toBe('');
    expect(objemCesky(0)).toBe('');
  });
});

describe('výběr obalu', () => {
  it('vypíše všechny velikosti, ne rozbalovátko', () => {
    const { container } = render(
      <VyberObalu obaly={LAHVE} vybrany="p05" zmen={() => {}} popis={popis} ariaLabel="Obal 1" />,
    );
    expect(container.querySelector('select'), 'rozbalovátko se vrátilo').toBeNull();
    for (const t of ['1,5 L', '1 L', '0,5 L', '0,33 L']) {
      expect(screen.getByText(t), `chybí ${t}`).toBeTruthy();
    }
  });

  it('je vidět, který obal platí — bez otevírání', () => {
    render(<VyberObalu obaly={LAHVE} vybrany="p05" zmen={() => {}} popis={popis} ariaLabel="Obal 1" />);
    expect(screen.getByText('0,5 L').closest('button')?.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('1 L').closest('button')?.getAttribute('aria-checked')).toBe('false');
  });

  it('klepnutí obal vybere', () => {
    const zmen = vi.fn();
    render(<VyberObalu obaly={LAHVE} vybrany="p05" zmen={zmen} popis={popis} ariaLabel="Obal 1" />);
    fireEvent.click(screen.getByText('1,5 L'));
    expect(zmen).toHaveBeenCalledWith('p15');
  });

  it('popisek z katalogu má přednost před objemem', () => {
    render(
      <VyberObalu
        obaly={[{ id: 'x', volume_l: 0.5, label: 'Půllitr vratný' }]}
        vybrany="" zmen={() => {}} popis={popis} ariaLabel="Obal 1"
      />,
    );
    expect(screen.getByText('Půllitr vratný')).toBeTruthy();
  });

  it('prázdná volba se nabídne jen tam, kde má jméno', () => {
    const { rerender } = render(
      <VyberObalu obaly={LAHVE} vybrany="p05" zmen={() => {}} popis={popis} ariaLabel="Obal 1" />,
    );
    expect(screen.queryByText('prázdný 1')).toBeNull();
    rerender(
      <VyberObalu obaly={LAHVE} vybrany="p05" zmen={() => {}} popis={popis}
        prazdnyPopis="prázdný 1" ariaLabel="Obal 1" />,
    );
    expect(screen.getByText('prázdný 1')).toBeTruthy();
  });

  it('prázdnou volbou jde slot vyprázdnit', () => {
    const zmen = vi.fn();
    render(
      <VyberObalu obaly={LAHVE} vybrany="p05" zmen={zmen} popis={popis}
        prazdnyPopis="prázdný 1" ariaLabel="Obal 1" />,
    );
    fireEvent.click(screen.getByText('prázdný 1'));
    expect(zmen).toHaveBeenCalledWith('');
  });
});

describe('stáčení lahví vyklikává obojí', () => {
  const ZDROJ = readFileSync('src/screens/BottlingScreen.tsx', 'utf8');

  it('obaly lahví i zdrojový sud jsou vyklikávací', () => {
    expect(ZDROJ).toMatch(/<VyberObalu/);
    expect(ZDROJ).toMatch(/<VyberZdrojovehoSudu/);
  });

  it('v zadávání stáčení už nezůstalo rozbalovátko na obal ani na sud', () => {
    const panel = ZDROJ.slice(ZDROJ.indexOf('Lahve (až 3 druhy)'), ZDROJ.indexOf('Zdrojový KEG (odečet sudů)') + 2000);
    expect(panel).not.toMatch(/<option value="">— obal/);
    expect(panel).not.toMatch(/<option value="">— žádný —/);
  });
});
