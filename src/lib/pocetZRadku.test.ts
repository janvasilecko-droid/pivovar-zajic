import { describe, it, expect } from 'vitest';
import { pocetZRadku } from './pocetZRadku';

describe('počet kusů z textu řádku (pojistka proti AI)', () => {
  it('„10sv 2x30" u KEG 30 l → 2, ne 10', () => {
    expect(pocetZRadku('10sv 2x30', 30)).toBe(2);
    expect(pocetZRadku('2x30 10°', 30)).toBe(2);
    expect(pocetZRadku('desitka 2 × 30l', 30)).toBe(2);
  });
  it('„30l 2x" → 2', () => {
    expect(pocetZRadku('10sv 30l 2x', 30)).toBe(2);
  });
  it('víc položek na řádku — vybere tu se správným objemem', () => {
    expect(pocetZRadku('11sv 3x30 3x20 15x1', 20)).toBe(3);
    expect(pocetZRadku('11sv 3x30 3x20 15x1', 1)).toBe(15);
  });
  it('nejednoznačné nebo bez shody → null', () => {
    expect(pocetZRadku('3x30 12sv 2x30 10sv', 30)).toBeNull();
    expect(pocetZRadku('10sv 2x50', 30)).toBeNull();
    expect(pocetZRadku(null, 30)).toBeNull();
  });
});

import { pocetZTabulky } from './pocetZRadku';

describe('množství ze sloupce „Množství" (Maneo, 29. 9. 2026)', () => {
  const zprava = 'Maneo objednávka\nPivo\tObal\tMnožství\n10° světlé\t30 l\t2\n12° světlé\t15 l\t3';
  it('bere číslo ze sloupce Množství, ne stupeň', () => {
    expect(pocetZTabulky(zprava, '10° světlé\t30 l\t2')).toBe(2);
    // AI v raw_line tabulátory často nahradí mezerami — řádek se pozná i tak.
    expect(pocetZTabulky(zprava, '12° světlé 15 l 3')).toBe(3);
  });
  it('tabulka zarovnaná mezerami', () => {
    const z = 'Pivo        Obal    Množství\n10 sv       30      2\n12 sv       50      1';
    expect(pocetZTabulky(z, '10 sv       30      2')).toBe(2);
    expect(pocetZTabulky(z, '12 sv       50      1')).toBe(1);
  });
  it('bez záhlaví Množství → null', () => {
    expect(pocetZTabulky('10sv 2x30', '10sv 2x30')).toBeNull();
  });
});
