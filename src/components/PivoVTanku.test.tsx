// Pivo v tanku na kartě ve Sklepu (23. 11. 2026): „ať je výrazněji vidět, co tam
// je za pivo, moc to splývá s tím textem."
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PivoVTanku } from './PivoVTanku';

afterEach(cleanup);

describe('PivoVTanku', () => {
  it('název piva je velký a tučný, na plaketě v barvě piva', () => {
    render(<PivoVTanku jmeno="12° Světlá" pivo={{ beer_color: '#F59E0B' }} />);
    const plaketa = screen.getByTestId('pivo-v-tanku');
    const nazev = screen.getByText('12° Světlá');
    expect(nazev.className).toContain('text-xl');
    expect(nazev.className).toContain('font-black');
    expect(plaketa.style.backgroundColor).toBe('rgb(245, 158, 11)');
    // Značka plochy v barvě z databáze — v tmavém režimu se na ní písmo neobrací.
    expect(plaketa.className).toContain('plocha-z-dat');
  });

  it('na světlé barvě tmavé písmo, na tmavé barvě světlé — kvůli čitelnosti', () => {
    const { unmount } = render(<PivoVTanku jmeno="12° Světlá" pivo={{ beer_color: '#F59E0B' }} />);
    let plaketa = screen.getByTestId('pivo-v-tanku');
    expect(plaketa.className).toContain('text-[#451f10]');
    expect(plaketa.style.getPropertyValue('--ink-plochy')).toBe('#0f172a');
    unmount();

    render(<PivoVTanku jmeno="Jantar" pivo={{ beer_color: '#540f0f' }} />);
    plaketa = screen.getByTestId('pivo-v-tanku');
    expect(plaketa.className).toContain('text-white');
    expect(plaketa.className).not.toContain('text-[#451f10]');
    expect(plaketa.style.getPropertyValue('--ink-plochy')).toBe('#ffffff');
  });

  it('pivo bez uložené barvy má neutrální plaketu z palety, ne barvu piva', () => {
    render(<PivoVTanku jmeno="Jarní speciál" pivo={{ beer_color: null }} />);
    const plaketa = screen.getByTestId('pivo-v-tanku');
    expect(screen.getByText('Jarní speciál').className).toContain('text-xl');
    expect(plaketa.className).toContain('bg-primary-50');
    expect(plaketa.className).not.toContain('plocha-z-dat');
    expect(plaketa.style.backgroundColor).toBe('');
  });

  it('pivo, které se v katalogu nenašlo (starý tank jen se jménem), se ukáže taky — neutrálně', () => {
    render(<PivoVTanku jmeno="Starý ležák" />);
    expect(screen.getByTestId('pivo-v-tanku').textContent).toBe('Starý ležák');
    expect(screen.getByTestId('pivo-v-tanku').className).toContain('bg-primary-50');
  });

  it('prázdný tank: čárkovaný rámeček „— prázdno —", žádná plaketa piva', () => {
    for (const jmeno of [null, undefined, '', '   ']) {
      const { unmount } = render(<PivoVTanku jmeno={jmeno} pivo={{ beer_color: '#F59E0B' }} />);
      expect(screen.getByTestId('pivo-v-tanku-prazdno').textContent).toBe('— prázdno —');
      expect(screen.queryByTestId('pivo-v-tanku')).toBeNull();
      unmount();
    }
  });

  it('jméno se ořízne od mezer a dlouhé jméno se zalomí, nepřeteče', () => {
    render(<PivoVTanku jmeno="  Hazy Spring Day  " pivo={{ beer_color: '#86EFAC' }} />);
    const nazev = screen.getByText('Hazy Spring Day');
    expect(nazev.textContent).toBe('Hazy Spring Day');
    expect(nazev.className).toContain('break-words');
  });

  it('předaná třída (odsazení v kartě) se použije u plakety i u prázdného tanku', () => {
    const { unmount } = render(<PivoVTanku jmeno="Osma" pivo={{ beer_color: '#14B8A6' }} className="mt-2" />);
    expect(screen.getByTestId('pivo-v-tanku').className).toContain('mt-2');
    unmount();
    render(<PivoVTanku jmeno={null} className="mt-2" />);
    expect(screen.getByTestId('pivo-v-tanku-prazdno').className).toContain('mt-2');
  });
});
