// 🛢️ Zdrojový sud se vyklikává, ne rozklikává.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „ten zdrojový keg ve stáčení lahví nedělej jako
// rozklikávací pole, ale zaškrtávací (vypiš všechny velikosti), ať se bude jen
// zaklikávat — primárně zakliknutý bude sud 50 l."
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import VyberZdrojovehoSudu, { popisSudu, serazeneSudy } from './VyberZdrojovehoSudu';
import { vychoziZdrojovySud } from '../lib/zdrojovySud';

const SUDY = [
  { id: 'k30', volume_l: 30 },
  { id: 'k50', volume_l: 50 },
  { id: 'k15', volume_l: 15 },
  { id: 'k20', volume_l: 20 },
  { id: 'k10', volume_l: 10 },
];

describe('serazeneSudy', () => {
  it('od nejmenšího po největší', () => {
    expect(serazeneSudy(SUDY).map((s) => s.volume_l)).toEqual([10, 15, 20, 30, 50]);
  });

  it('sud bez objemu neskáče dopředu', () => {
    const s = serazeneSudy([{ id: 'x', volume_l: null }, { id: 'k50', volume_l: 50 }]);
    expect(s[0].id).toBe('x');
    expect(s[1].id).toBe('k50');
  });
});

describe('popisSudu', () => {
  it('objem má přednost před popiskem z katalogu', () => {
    expect(popisSudu({ id: 'k50', volume_l: 50, label: 'Sud padesátka' })).toBe('KEG 50 L');
  });

  it('bez objemu vezme popisek', () => {
    expect(popisSudu({ id: 'x', volume_l: null, label: 'Nádoba' })).toBe('Nádoba');
  });
});

describe('vyklikávání', () => {
  it('vypíše všechny velikosti, ne rozbalovátko', () => {
    const { container } = render(<VyberZdrojovehoSudu sudy={SUDY} vybrany="k50" zmen={() => {}} />);
    expect(container.querySelector('select'), 'rozbalovátko se vrátilo').toBeNull();
    for (const objem of [10, 15, 20, 30, 50]) {
      expect(screen.getByText(`KEG ${objem} L`), `chybí ${objem} l`).toBeTruthy();
    }
  });

  it('je vidět, která velikost platí — i bez otevírání', () => {
    render(<VyberZdrojovehoSudu sudy={SUDY} vybrany="k50" zmen={() => {}} />);
    expect(screen.getByText('KEG 50 L').closest('button')?.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText('KEG 30 L').closest('button')?.getAttribute('aria-checked')).toBe('false');
  });

  it('klepnutí vybere sud', () => {
    const zmen = vi.fn();
    render(<VyberZdrojovehoSudu sudy={SUDY} vybrany="k50" zmen={zmen} />);
    fireEvent.click(screen.getByText('KEG 30 L'));
    expect(zmen).toHaveBeenCalledWith('k30');
  });

  it('stáčet jde i bez sudu — rovnou z tanku', () => {
    const zmen = vi.fn();
    render(<VyberZdrojovehoSudu sudy={SUDY} vybrany="k50" zmen={zmen} />);
    fireEvent.click(screen.getByText('bez sudu'));
    expect(zmen).toHaveBeenCalledWith('');
  });

  it('„bez sudu" jde skrýt, kde nedává smysl', () => {
    render(<VyberZdrojovehoSudu sudy={SUDY} vybrany="k50" zmen={() => {}} sBezSudu={false} />);
    expect(screen.queryByText('bez sudu')).toBeNull();
  });
});

describe('padesátka je předvolená', () => {
  it('výchozí volbou je sud 50 l', () => {
    expect(vychoziZdrojovySud(SUDY)).toBe('k50');
  });

  it('stáčení lahví bere výchozí sud a ukazuje ho vyklikaný', () => {
    const zdroj = readFileSync('src/screens/BottlingScreen.tsx', 'utf8');
    expect(zdroj).toMatch(/kegPkgId: vychoziZdrojovySud\(kegPackages\)/);
    expect(zdroj).toMatch(/<VyberZdrojovehoSudu/);
  });
});
