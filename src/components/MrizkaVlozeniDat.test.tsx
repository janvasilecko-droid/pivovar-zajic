// Mřížka pro vložení dat: vložení víc řádků/sloupců najednou (jako
// zkopírování bloku buněk z Google Sheets) vyplní mřížku od místa vložení.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MrizkaVlozeniDat from './MrizkaVlozeniDat';

const SLOUPCE = ['Datum', 'Pivo', 'Počet'];

function vlozSchranku(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

describe('MrizkaVlozeniDat', () => {
  it('vložení bloku (víc řádků, víc sloupců) vyplní buňky od místa vložení dál', () => {
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} onZpracovat={() => {}} />);
    const bunky = screen.getAllByRole('textbox');
    // 3 sloupce → první buňka prvního řádku je index 0
    vlozSchranku(bunky[0], '4.11.2024\t12 Světlá\t1\n5.11.2024\tJantar\t3\n');
    expect((bunky[0] as HTMLInputElement).value).toBe('4.11.2024');
    expect((bunky[1] as HTMLInputElement).value).toBe('12 Světlá');
    expect((bunky[2] as HTMLInputElement).value).toBe('1');
    expect((bunky[3] as HTMLInputElement).value).toBe('5.11.2024');
    expect((bunky[4] as HTMLInputElement).value).toBe('Jantar');
    expect((bunky[5] as HTMLInputElement).value).toBe('3');
  });

  it('vložení víc řádků, než mřížka má, přidá chybějící řádky samo', () => {
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} pocatecniRadky={2} onZpracovat={() => {}} />);
    const text = Array.from({ length: 5 }, (_, i) => `den${i}\tpivo${i}\t${i}`).join('\n');
    vlozSchranku(screen.getAllByRole('textbox')[0], text);
    const bunky = screen.getAllByRole('textbox');
    expect(bunky).toHaveLength(5 * SLOUPCE.length);
    expect((bunky[bunky.length - 3] as HTMLInputElement).value).toBe('den4');
  });

  it('vložení do buňky uprostřed řádku posune sloupce správně, přebytečné sloupce se zahodí', () => {
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} onZpracovat={() => {}} />);
    const bunky = screen.getAllByRole('textbox');
    vlozSchranku(bunky[1], 'X\tY\tZ'); // vložit od 2. sloupce (index 1) — Z přesahuje mřížku
    expect((bunky[0] as HTMLInputElement).value).toBe('');
    expect((bunky[1] as HTMLInputElement).value).toBe('X');
    expect((bunky[2] as HTMLInputElement).value).toBe('Y');
  });

  it('tlačítko Zpracovat je vypnuté, dokud je mřížka prázdná, a pošle celou mřížku po klepnutí', () => {
    const onZpracovat = vi.fn();
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} pocatecniRadky={2} onZpracovat={onZpracovat} />);
    const zpracovat = screen.getByRole('button', { name: 'Zpracovat' });
    expect(zpracovat).toBeDisabled();

    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: '12 Světlá' } });
    expect(zpracovat).not.toBeDisabled();

    fireEvent.click(zpracovat);
    expect(onZpracovat).toHaveBeenCalledWith([
      ['', '12 Světlá', ''],
      ['', '', ''],
    ]);
  });

  it('jedna hodnota (bez tabulátoru/nového řádku) se vloží normálně, appka nezasahuje', () => {
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} onZpracovat={() => {}} />);
    const input = screen.getAllByRole('textbox')[0];
    const preventDefault = vi.fn();
    fireEvent.paste(input, { clipboardData: { getData: () => 'jenom text' }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('„Přidat 10 řádků" a „Vyčistit" fungují', () => {
    render(<MrizkaVlozeniDat sloupce={SLOUPCE} pocatecniRadky={2} onZpracovat={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Přidat 10 řádků/ }));
    expect(screen.getAllByRole('textbox')).toHaveLength(12 * SLOUPCE.length);

    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'něco' } });
    fireEvent.click(screen.getByRole('button', { name: /Vyčistit/ }));
    const bunky = screen.getAllByRole('textbox');
    expect(bunky).toHaveLength(2 * SLOUPCE.length); // vyčistit vrátí i na počáteční počet řádků
    expect((bunky[0] as HTMLInputElement).value).toBe('');
  });
});
