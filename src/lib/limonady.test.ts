import { describe, it, expect } from 'vitest';
import { jeLimonada } from './limonady';

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
