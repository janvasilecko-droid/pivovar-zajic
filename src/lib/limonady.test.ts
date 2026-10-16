import { describe, it, expect } from 'vitest';
import { jeLimonada, potrebujeTank } from './limonady';

describe('jeLimonada — rozliší limonádu od piva podle jména', () => {
  it('pozná všechny čtyři žádané příchutě, i s diakritikou', () => {
    expect(jeLimonada('Grep')).toBe(true);
    expect(jeLimonada('Citron')).toBe(true);
    expect(jeLimonada('Kiwi')).toBe(true);
    expect(jeLimonada('Višeň')).toBe(true);
  });

  it('nezávisí na velikosti písmen ani na tom, jestli je slovo součástí delšího názvu', () => {
    expect(jeLimonada('GREP limonáda 1l')).toBe(true);
    expect(jeLimonada('limonáda citron')).toBe(true);
  });

  it('opravdové pivo mezi limonády nespadne', () => {
    expect(jeLimonada('11° Světlá')).toBe(false);
    expect(jeLimonada('12° Světlá')).toBe(false);
    expect(jeLimonada('Summer Ale')).toBe(false);
  });

  it('prázdné nebo chybějící jméno je bezpečně "ne"', () => {
    expect(jeLimonada(null)).toBe(false);
    expect(jeLimonada(undefined)).toBe(false);
    expect(jeLimonada('')).toBe(false);
  });
});

// 16. 10. 2026 majitel: „limonády celkově nemají tank" — Citron se hlásil jako
// „Stáčení KEG bez tanku".
describe('potrebujeTank — limonáda tank nemá, pivo ano', () => {
  it('limonády (Citron, Grep, Kiwi, Višeň) tank nepotřebují', () => {
    for (const n of ['Citron', 'Grep', 'Kiwi', 'Višeň', 'limonáda citron']) expect(potrebujeTank(n)).toBe(false);
  });

  it('pivo tank potřebuje, včetně Jantaru a Osmy', () => {
    for (const n of ['10° Desítka', '11° Světlá', '12° Tmavá', 'Jantar', 'Osma', 'winter']) expect(potrebujeTank(n)).toBe(true);
  });

  it('neznámé jméno se bere jako pivo — radši nahlásit než přehlédnout', () => {
    expect(potrebujeTank(null)).toBe(true);
    expect(potrebujeTank(undefined)).toBe(true);
    expect(potrebujeTank('')).toBe(true);
  });
});
