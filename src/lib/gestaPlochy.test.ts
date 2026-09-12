import { describe, it, expect } from 'vitest';
import { vyhodnotGesto, rychlostPosunu, jeVeVodorovnemPasku, PRAH_STRANKY_PX, PRAH_TAHU_DOLU_PX, VYSKA_OKRAJE_PX, MAX_POSUN_PX, stavPodrzeni, PRAH_ZRUSENI_PODRZENI_PX } from './gestaPlochy';

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

describe('jeVeVodorovnemPasku', () => {
  // Zjednodušený strom: prvek zná svého rodiče a svoje rozměry.
  function prvek(scrollWidth: number, clientWidth: number, rodic: any = null): any {
    return { scrollWidth, clientWidth, parentElement: rodic };
  }

  it('dotek v pásku se širším obsahem gesto plochy zablokuje', () => {
    const plocha = prvek(360, 360);
    const pasek = prvek(900, 360, plocha);
    const zalozka = prvek(80, 80, pasek);
    expect(jeVeVodorovnemPasku(zalozka, plocha, (el) => (el === pasek ? 'auto' : 'visible'))).toBe(true);
  });

  it('dotek na dlaždici mimo pásek gesto propustí', () => {
    const plocha = prvek(360, 360);
    const dlazdice = prvek(100, 100, plocha);
    expect(jeVeVodorovnemPasku(dlazdice, plocha, () => 'visible')).toBe(false);
  });

  it('pásek, který se vejde celý, není důvod gesto blokovat', () => {
    // Dvě záložky na širokém displeji — rolovat není kam.
    const plocha = prvek(1200, 1200);
    const pasek = prvek(1200, 1200, plocha);
    expect(jeVeVodorovnemPasku(pasek, plocha, () => 'auto')).toBe(false);
  });

  it('hledání se zastaví u plochy a nejde výš', () => {
    const stranka = prvek(2000, 360);
    const plocha = prvek(360, 360, stranka);
    const dlazdice = prvek(100, 100, plocha);
    expect(jeVeVodorovnemPasku(dlazdice, plocha, () => 'auto')).toBe(false);
  });

  it('bez prvku (dotek mimo) nic neblokuje', () => {
    expect(jeVeVodorovnemPasku(null, null, () => 'auto')).toBe(false);
  });
});

describe('stavPodrzeni — dlaždici zvedne jen podržení, ne přejetí', () => {
  // Ze zadání: „udělej, aby se dlaždice přesouvaly jen když na nich přidržím
  // prst, ne jen přejetím." Dřív stačilo 6 px pohybu a dlaždice se zvedla,
  // takže listování stránek rozhazovalo rozložení plochy.
  it('prst na místě čeká na zvednutí', () => {
    expect(stavPodrzeni(0, 0)).toBe('ceka');
  });

  it('přirozený třes prstu podržení nezruší', () => {
    // Nikdo neudrží prst na pixelu; pár px musí projít, jinak by se dlaždice
    // nedala zvednout vůbec.
    expect(stavPodrzeni(3, 4)).toBe('ceka');   // 5 px
    expect(stavPodrzeni(6, 6)).toBe('ceka');   // ~8,5 px
  });

  it('rozjetý prst podržení zruší — z gesta je listování', () => {
    expect(stavPodrzeni(40, 0)).toBe('zrusit');
    expect(stavPodrzeni(0, -40)).toBe('zrusit');
  });

  it('rozhoduje vzdálenost, ne směr', () => {
    // Šikmo ujetých 10 px je totéž co 10 px do strany — jinak by se dlaždice
    // dala „ušoupnout“ diagonálně.
    const uhlopricne = stavPodrzeni(9, 9); // ~12,7 px
    expect(uhlopricne).toBe('zrusit');
    expect(stavPodrzeni(-40, 0)).toBe('zrusit');
    expect(stavPodrzeni(0, 40)).toBe('zrusit');
  });

  it('práh zrušení je menší než práh listování', () => {
    // Kdyby byl větší, gesto by se nejdřív vyhodnotilo jako přetočení
    // stránky a teprve pak by se pustila dlaždice — pořadí, ve kterém by
    // se dlaždice pořád ještě vozila s sebou.
    expect(PRAH_ZRUSENI_PODRZENI_PX).toBeLessThan(PRAH_STRANKY_PX);
  });
});
