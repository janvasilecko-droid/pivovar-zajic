import { describe, it, expect } from 'vitest';
import {
  pridejBod, novyTah, delkaPodpisu, jePodpisPrazdny, prepocitejNaPlochu,
  velikostDataUrl, podpisJeMocVelky, MIN_POSUN, PODPIS_MAX_BAJTU,
  type Tah,
} from './podpis';

/** Vodorovná čára o dané délce, bod po bodu po 5 px. */
function cara(delka: number, y = 10): Tah {
  const body = [];
  for (let x = 0; x <= delka; x += 5) body.push({ x, y });
  return body;
}

describe('pridejBod', () => {
  it('první bod založí tah', () => {
    expect(pridejBod([], { x: 3, y: 4 })).toEqual([[{ x: 3, y: 4 }]]);
  });

  it('body blíž než MIN_POSUN se zahodí', () => {
    // Prst na 60 Hz udělá stovky bodů na centimetr; bez ředění by podpis
    // přerostl limit velikosti a nakreslený vypadá stejně.
    const tahy = [[{ x: 0, y: 0 }]];
    expect(pridejBod(tahy, { x: MIN_POSUN / 2, y: 0 })).toBe(tahy);
  });

  it('vzdálený bod se přidá do posledního tahu, ne do prvního', () => {
    const tahy = [[{ x: 0, y: 0 }], [{ x: 50, y: 50 }]];
    const nove = pridejBod(tahy, { x: 70, y: 50 });
    expect(nove[0]).toHaveLength(1);
    expect(nove[1]).toHaveLength(2);
  });

  it('vrací nové pole, původní nemění', () => {
    const tahy = [[{ x: 0, y: 0 }]];
    const nove = pridejBod(tahy, { x: 20, y: 0 });
    expect(tahy[0]).toHaveLength(1);
    expect(nove).not.toBe(tahy);
  });
});

describe('novyTah', () => {
  it('zvednutí prstu začne nový tah', () => {
    expect(novyTah([[{ x: 0, y: 0 }]])).toEqual([[{ x: 0, y: 0 }], []]);
  });

  it('dvakrát za sebou nezaloží dva prázdné tahy', () => {
    // Prázdný tah na konci by při dalším bodu vyrobil čáru odnikud.
    const tahy = novyTah([[{ x: 0, y: 0 }]]);
    expect(novyTah(tahy)).toBe(tahy);
  });
});

describe('delkaPodpisu', () => {
  it('sečte délku přes všechny tahy', () => {
    expect(delkaPodpisu([cara(30), cara(20, 40)])).toBe(50);
  });

  it('prázdné vstupy dají nulu, ne NaN', () => {
    expect(delkaPodpisu([])).toBe(0);
    expect(delkaPodpisu([[], [{ x: 1, y: 1 }]])).toBe(0);
  });
});

describe('jePodpisPrazdny', () => {
  it('jedno klepnutí není podpis', () => {
    // Tečka jako doklad o převzetí je horší než nemít nic — u dohadování
    // „to jsme nedostali" je bezcenná.
    expect(jePodpisPrazdny([[{ x: 10, y: 10 }]])).toBe(true);
    expect(jePodpisPrazdny([])).toBe(true);
  });

  it('krátké škrábnutí není podpis', () => {
    expect(jePodpisPrazdny([cara(20)])).toBe(true);
  });

  it('čmáranice přes plátno podpis je', () => {
    expect(jePodpisPrazdny([cara(200), cara(150, 30)])).toBe(false);
  });
});

describe('prepocitejNaPlochu', () => {
  it('zvětší do dvojnásobné plochy se zachováním proporcí', () => {
    const out = prepocitejNaPlochu(
      [[{ x: 0, y: 0 }, { x: 100, y: 50 }]],
      { sirka: 100, vyska: 50 },
      { sirka: 200, vyska: 100 },
    );
    expect(out[0]).toEqual([{ x: 0, y: 0 }, { x: 200, y: 100 }]);
  });

  it('do jiného poměru stran nic neroztahuje, ale vystředí', () => {
    // Roztažený podpis by u dohadování o převzetí nebyl k ničemu.
    const out = prepocitejNaPlochu(
      [[{ x: 0, y: 0 }, { x: 100, y: 100 }]],
      { sirka: 100, vyska: 100 },
      { sirka: 300, vyska: 100 },
    );
    expect(out[0][0]).toEqual({ x: 100, y: 0 });
    expect(out[0][1]).toEqual({ x: 200, y: 100 });
  });

  it('nulová zdrojová plocha nerozhodí body na NaN', () => {
    const tahy = [[{ x: 5, y: 5 }]];
    expect(prepocitejNaPlochu(tahy, { sirka: 0, vyska: 0 }, { sirka: 10, vyska: 10 })).toBe(tahy);
  });
});

describe('velikostDataUrl', () => {
  it('spočítá bajty z base64', () => {
    // "AAAA" = 3 bajty, "AAA=" = 2, "AA==" = 1.
    expect(velikostDataUrl('data:image/png;base64,AAAA')).toBe(3);
    expect(velikostDataUrl('data:image/png;base64,AAA=')).toBe(2);
    expect(velikostDataUrl('data:image/png;base64,AA==')).toBe(1);
  });

  it('nesmyslný vstup dá nulu, ne NaN', () => {
    expect(velikostDataUrl('')).toBe(0);
    expect(velikostDataUrl('tohle není data URL')).toBe(0);
  });
});

describe('podpisJeMocVelky', () => {
  it('běžný podpis projde', () => {
    expect(podpisJeMocVelky(`data:image/png;base64,${'A'.repeat(20_000)}`)).toBe(false);
  });

  it('přerostlý obrázek se do databáze neposílá', () => {
    const velky = `data:image/png;base64,${'A'.repeat(PODPIS_MAX_BAJTU * 2)}`;
    expect(podpisJeMocVelky(velky)).toBe(true);
  });
});
