import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { TextListu } from '../../lib/bibleCteniApi';
import { PrekladListu } from './BibleKniha';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).
const list = (navic: Partial<TextListu> = {}): TextListu => ({
  pdf_index: 2, tistena_strana: '1', tistena_zdroj: null, zdroj_textu: 'ocr',
  text: 'Mashing at 62 °C for 30 min.', ke_kontrole: false, kontrola_duvod: null, kapitola_id: null,
  preklad: 'Rmutování při 62 °C po 30 min.', preklad_kontrola: null, ...navic,
});

function Obal({ text }: { text: TextListu }) {
  const [jazyk, setJazyk] = useState<'cs' | 'original'>('cs');
  return <PrekladListu text={text} jazyk={jazyk} setJazyk={setJazyk} />;
}

describe('čtení česky nebo v originále (3. 11. 2026: „musí tam být i překlad do češtiny")', () => {
  it('výchozí je čeština, Originál jedním klepnutím a zpět', () => {
    render(<Obal text={list()} />);
    expect(screen.getByText('Rmutování při 62 °C po 30 min.')).toBeTruthy();
    expect(screen.queryByText('Mashing at 62 °C for 30 min.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Česky' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Originál' }));
    expect(screen.getByText('Mashing at 62 °C for 30 min.')).toBeTruthy();
    expect(screen.queryByText('Rmutování při 62 °C po 30 min.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Česky' }));
    expect(screen.getByText('Rmutování při 62 °C po 30 min.')).toBeTruthy();
  });

  it('překlad s nesedícími čísly ukáže důvod ověřit v originále', () => {
    render(<Obal text={list({ preklad_kontrola: 'čísla v překladu nesedí s originálem (1 navíc) — ověř v originále' })} />);
    expect(screen.getByRole('note').textContent).toContain('ověř v originále');
  });

  it('překlad ještě není: originál s poznámkou, že se připravuje', () => {
    render(<Obal text={list({ preklad: null })} />);
    expect(screen.getByText('Mashing at 62 °C for 30 min.')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('se připravuje');
  });

  it('strana bez potřeby překladu (česká, prázdná): originál bez přepínače', () => {
    render(<Obal text={list({ preklad: '', text: 'Česká věta o sladu.' })} />);
    expect(screen.getByText('Česká věta o sladu.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Česky' })).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
  });
});
