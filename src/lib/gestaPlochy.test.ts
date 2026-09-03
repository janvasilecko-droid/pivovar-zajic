import { describe, it, expect } from 'vitest';
import {
  vyhodnotGesto, rychlostPosunu,
  PRAH_STRANKY_PX, PRAH_TAHU_DOLU_PX, VYSKA_OKRAJE_PX, MAX_POSUN_PX,
} from './gestaPlochy';

describe('vyhodnotGesto', () => {
  it('tah do strany přetočí stránku', () => {
    expect(vyhodnotGesto(-80, 5, true)).toBe('stranka-dalsi');
    expect(vyhodnotGesto(80, 5, true)).toBe('stranka-predchozi');
  });

  it('krátký tah nedělá nic — je to klepnutí s třesem ruky', () => {
    expect(vyhodnotGesto(PRAH_STRANKY_PX - 1, 0, true)).toBeNull();
    expect(vyhodnotGesto(0, PRAH_TAHU_DOLU_PX - 1, true)).toBeNull();
  });

  it('tah dolů od horního konce otevře hledání', () => {
    expect(vyhodnotGesto(0, PRAH_TAHU_DOLU_PX, true)).toBe('hledat');
    expect(vyhodnotGesto(10, 120, true)).toBe('hledat');
  });

  it('tah dolů uprostřed odrolované plochy je rolování, ne hledání', () => {
    // Tohle je celý důvod parametru `naVrcholu`: bez něj by prst, kterým
    // člověk roluje zpátky nahoru, otevíral hledání.
    expect(vyhodnotGesto(0, 200, false)).toBeNull();
  });

  it('tah nahoru hledání neotevře', () => {
    expect(vyhodnotGesto(0, -200, true)).toBeNull();
  });

  it('šikmý tah rozhodne převažující směr a vodorovný má přednost', () => {
    // 80 px do strany a 60 dolů — vodorovná složka není 1.5× větší, takže
    // to není přetočení; svislá taky ne, takže nic. Nejednoznačné gesto
    // schválně neudělá nic: náhodné přetočení stránky mate víc než nic.
    expect(vyhodnotGesto(-80, 60, true)).toBeNull();
    expect(vyhodnotGesto(-80, 20, true)).toBe('stranka-dalsi');
    expect(vyhodnotGesto(20, 100, true)).toBe('hledat');
  });
});

describe('rychlostPosunu', () => {
  const rect = { top: 100, bottom: 700 };

  it('uprostřed se nikam neposouvá', () => {
    expect(rychlostPosunu(400, rect)).toBe(0);
  });

  it('u horní hrany jde nahoru, u dolní dolů', () => {
    expect(rychlostPosunu(rect.top + 1, rect)).toBeLessThan(0);
    expect(rychlostPosunu(rect.bottom - 1, rect)).toBeGreaterThan(0);
  });

  it('na hraně je plná rychlost, na okraji zóny nulová', () => {
    expect(rychlostPosunu(rect.top, rect)).toBe(-MAX_POSUN_PX);
    expect(rychlostPosunu(rect.bottom, rect)).toBe(MAX_POSUN_PX);
    expect(rychlostPosunu(rect.top + VYSKA_OKRAJE_PX, rect)).toBe(0);
    expect(rychlostPosunu(rect.bottom - VYSKA_OKRAJE_PX, rect)).toBe(0);
  });

  it('za hranou rychlost dál neroste', () => {
    // Prst se dá vytáhnout mimo okno; posun se tím nesmí zbláznit.
    expect(rychlostPosunu(rect.top - 500, rect)).toBe(-MAX_POSUN_PX);
    expect(rychlostPosunu(rect.bottom + 500, rect)).toBe(MAX_POSUN_PX);
  });

  it('hlouběji v zóně je posun rychlejší', () => {
    const blizko = Math.abs(rychlostPosunu(rect.top + 8, rect));
    const daleko = Math.abs(rychlostPosunu(rect.top + 60, rect));
    expect(blizko).toBeGreaterThan(daleko);
  });

  it('nulová zóna posun vypne (pojistka proti dělení nulou)', () => {
    expect(rychlostPosunu(rect.top, rect, 0)).toBe(0);
  });

  it('nízká obrazovka: mezi zónami zůstane klidné pásmo', () => {
    // Na výřezu 100 px by se zóny po 72 px potkaly a plocha by se posouvala
    // i uprostřed, kde na to nikdo nemíří. Zóna se proto zkrátí na třetinu.
    const maly = { top: 0, bottom: 100 };
    expect(rychlostPosunu(5, maly)).toBeLessThan(0);
    expect(rychlostPosunu(50, maly)).toBe(0);
    expect(rychlostPosunu(95, maly)).toBeGreaterThan(0);
  });
});
