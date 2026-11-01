import { describe, expect, it } from 'vitest';
import { bunkyRadku, castiRadku, rozlozText } from './bibleText';

// Jen vymyšlené krátké věty — žádný text skutečných knih (repo je veřejné).

describe('text listu → bloky', () => {
  it('textová vrstva PDF zůstane jeden prostý blok — „|", „#" a „$" v ní platí doslova', () => {
    const text = '# 3 Rmutovani\n| a | b |\n|---|---|\ncena $5 a $10\n';
    expect(rozlozText(text, 'vrstva')).toEqual([{ typ: 'prosty', text: '# 3 Rmutovani\n| a | b |\n|---|---|\ncena $5 a $10' }]);
    expect(rozlozText('   \n ', 'vrstva')).toEqual([]);
    expect(rozlozText('', 'ocr')).toEqual([]);
  });

  it('nadpisy, odstavce oddělené prázdným řádkem, zalomení uvnitř odstavce zůstane', () => {
    const bloky = rozlozText('# 3 Rmutování\n\nPrvní řádek\ndruhý řádek.\n\n## 3.2 Teploty\nText.', 'ocr');
    expect(bloky).toEqual([
      { typ: 'nadpis', uroven: 1, casti: [{ typ: 'text', text: '3 Rmutování' }] },
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'První řádek\ndruhý řádek.' }] },
      { typ: 'nadpis', uroven: 2, casti: [{ typ: 'text', text: '3.2 Teploty' }] },
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'Text.' }] },
    ]);
    expect(rozlozText('#### Hluboký nadpis ##', 'soubor')).toEqual([{ typ: 'nadpis', uroven: 3, casti: [{ typ: 'text', text: 'Hluboký nadpis' }] }]);
    // „#" bez mezery není nadpis (např. „#3 vzorek").
    expect(rozlozText('#3 vzorek', 'ocr')).toEqual([{ typ: 'odstavec', casti: [{ typ: 'text', text: '#3 vzorek' }] }]);
  });

  it('tabulka ze svislých čar s oddělovacím řádkem; chybějící buňky se doplní', () => {
    const bloky = rozlozText('Úvod.\n| Teplota | Čas |\n|---|:---:|\n| 62 °C | 30 min |\n| 72 °C |\nZa tabulkou.', 'ocr');
    expect(bloky).toEqual([
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'Úvod.' }] },
      { typ: 'tabulka', hlavicka: ['Teplota', 'Čas'], radky: [['62 °C', '30 min'], ['72 °C', '']] },
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'Za tabulkou.' }] },
    ]);
  });

  it('řádky se svislou čarou bez oddělovače tabulkou nejsou (nic se neztratí)', () => {
    expect(rozlozText('| jen | text |\n| dál |', 'ocr')).toEqual([
      { typ: 'odstavec', casti: [{ typ: 'text', text: '| jen | text |\n| dál |' }] },
    ]);
  });

  it('vzorec na samostatném řádku — jednořádkový i přes víc řádků; text za ním zůstane', () => {
    expect(rozlozText('Před.\n$$ E = \\frac{a}{b} $$\nPo.', 'ocr')).toEqual([
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'Před.' }] },
      { typ: 'vzorec', tex: 'E = \\frac{a}{b}' },
      { typ: 'odstavec', casti: [{ typ: 'text', text: 'Po.' }] },
    ]);
    expect(rozlozText('$$\nx = 1\n+ y\n$$ (3.1)', 'soubor')).toEqual([
      { typ: 'vzorec', tex: 'x = 1\n+ y' },
      { typ: 'odstavec', casti: [{ typ: 'text', text: '(3.1)' }] },
    ]);
  });

  it('neuzavřený nebo prázdný vzorec zůstane textem', () => {
    expect(rozlozText('$$ x = 1\ndál text', 'ocr')).toEqual([
      { typ: 'odstavec', casti: [{ typ: 'text', text: '$$ x = 1\ndál text' }] },
    ]);
    expect(rozlozText('$$$$', 'ocr')).toEqual([{ typ: 'odstavec', casti: [{ typ: 'text', text: '$$$$' }] }]);
  });
});

describe('části řádku', () => {
  it('vzorec ve větě a [nečitelné]', () => {
    expect(castiRadku('Extrakt $E_p$ je [nečitelné] procent.')).toEqual([
      { typ: 'text', text: 'Extrakt ' },
      { typ: 'vzorec', tex: 'E_p' },
      { typ: 'text', text: ' je ' },
      { typ: 'necitelne' },
      { typ: 'text', text: ' procent.' },
    ]);
    expect(castiRadku('[nečitelné]')).toEqual([{ typ: 'necitelne' }]);
  });

  it('dolar s mezerou za ním nebo před koncem vzorec není (ceny, „$ 5")', () => {
    expect(castiRadku('stojí $5 a $10')).toEqual([{ typ: 'text', text: 'stojí $5 a $10' }]);
    expect(castiRadku('a $ x $ b')).toEqual([{ typ: 'text', text: 'a $ x $ b' }]);
    expect(castiRadku('$$x$$')).toEqual([{ typ: 'text', text: '$$x$$' }]);
    // Dolar těsně před vzorcem: „$$x$ y" není vzorec x se zbloudilým dolarem.
    expect(castiRadku('$$x$ y')).toEqual([{ typ: 'text', text: '$$x$ y' }]);
    expect(castiRadku('$x$ a $y$')).toEqual([{ typ: 'vzorec', tex: 'x' }, { typ: 'text', text: ' a ' }, { typ: 'vzorec', tex: 'y' }]);
  });

  it('buňky bez krajních čar', () => {
    expect(bunkyRadku('| a | b |')).toEqual(['a', 'b']);
    expect(bunkyRadku('a | b')).toEqual(['a', 'b']);
    expect(bunkyRadku('|  |x|')).toEqual(['', 'x']);
  });
});
