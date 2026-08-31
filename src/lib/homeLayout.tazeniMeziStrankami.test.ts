// Přesun dlaždice mezi stránkami tažením k okraji (jako plocha Androidu).
// Dřív to šlo jen rozbalovacím seznamem v nastavení dlaždice.
import { describe, expect, it } from 'vitest';
import {
  dalsiStranka, moveTileToPageCell, okrajProPrepnuti, SIRKA_OKRAJE_PX,
  GRID_COLS_MOBILE, UNIT_COLS,
  type HomeLayout, type TileId,
} from './homeLayout';

// Mřížka se počítá v jednotkových sloupcích: dlaždice o šířce 1 jich zabere
// UNIT_COLS (3). Na mobilu je sloupců 12, takže vejdou 4 dlaždice vedle sebe
// a největší možné x je 12 − 3 = 9.
const MAX_X = GRID_COLS_MOBILE - UNIT_COLS;

const RECT = { left: 100, right: 500 };

describe('okrajProPrepnuti', () => {
  it('u levého kraje hlásí vlevo', () => {
    expect(okrajProPrepnuti(100, RECT)).toBe('vlevo');
    expect(okrajProPrepnuti(100 + SIRKA_OKRAJE_PX, RECT)).toBe('vlevo');
  });

  it('u pravého kraje hlásí vpravo', () => {
    expect(okrajProPrepnuti(500, RECT)).toBe('vpravo');
    expect(okrajProPrepnuti(500 - SIRKA_OKRAJE_PX, RECT)).toBe('vpravo');
  });

  it('uprostřed mlčí — tam se jen přesouvá po buňkách', () => {
    expect(okrajProPrepnuti(300, RECT)).toBeNull();
    expect(okrajProPrepnuti(100 + SIRKA_OKRAJE_PX + 1, RECT)).toBeNull();
    expect(okrajProPrepnuti(500 - SIRKA_OKRAJE_PX - 1, RECT)).toBeNull();
  });

  it('funguje i za okrajem mřížky (prst sjede mimo)', () => {
    expect(okrajProPrepnuti(20, RECT)).toBe('vlevo');
    expect(okrajProPrepnuti(900, RECT)).toBe('vpravo');
  });
});

describe('dalsiStranka', () => {
  it('posune o jednu daným směrem', () => {
    expect(dalsiStranka(1, 'vpravo', 4)).toBe(2);
    expect(dalsiStranka(1, 'vlevo', 4)).toBe(0);
  });

  it('na koncích se zastaví, nepřetáčí se dokola', () => {
    expect(dalsiStranka(3, 'vpravo', 4)).toBe(3);
    expect(dalsiStranka(0, 'vlevo', 4)).toBe(0);
  });

  it('bez směru nechá index být', () => {
    expect(dalsiStranka(2, null, 4)).toBe(2);
  });
});

describe('moveTileToPageCell', () => {
  const zaklad = (): HomeLayout => ({
    pages: [['stock' as TileId, 'orders' as TileId], ['kegging' as TileId]],
    overrides: {
      stock: { x: 0, y: 0, w: 1, h: 1 },
      orders: { x: 1, y: 0, w: 1, h: 1 },
      kegging: { x: 0, y: 0, w: 1, h: 1 },
    },
    hidden: [], dock: [], fixedColors: {}, scene: 'warm', tileOpacity: 1, tileGap: 8,
  } as unknown as HomeLayout);

  it('přesune dlaždici na druhou stránku i na zadanou buňku', () => {
    const v = moveTileToPageCell(zaklad(), 'stock' as TileId, 1, 6, 1, GRID_COLS_MOBILE);
    expect(v.pages[0]).not.toContain('stock');
    expect(v.pages[1]).toContain('stock');
    expect(v.overrides['stock']).toMatchObject({ x: 6, y: 1 });
  });

  it('ostatní dlaždice na původní stránce zůstanou', () => {
    const v = moveTileToPageCell(zaklad(), 'stock' as TileId, 1, 6, 1, GRID_COLS_MOBILE);
    expect(v.pages[0]).toEqual(['orders']);
    expect(v.pages[1]).toContain('kegging');
  });

  it('v rámci jedné stránky funguje jako obyčejný přesun', () => {
    const v = moveTileToPageCell(zaklad(), 'stock' as TileId, 0, 3, 2, GRID_COLS_MOBILE);
    expect(v.pages[0]).toContain('stock');
    expect(v.overrides['stock']).toMatchObject({ x: 3, y: 2 });
  });

  it('neexistující cílová stránka nic nezmění', () => {
    const p = zaklad();
    expect(moveTileToPageCell(p, 'stock' as TileId, 9, 0, 0, GRID_COLS_MOBILE)).toBe(p);
  });

  it('neumístěná dlaždice nic nezmění', () => {
    const p = zaklad();
    expect(moveTileToPageCell(p, 'neexistuje' as TileId, 1, 0, 0, GRID_COLS_MOBILE)).toBe(p);
  });

  it('pozice se ořízne na šířku mřížky, ať dlaždice nevyleze ven', () => {
    const v = moveTileToPageCell(zaklad(), 'stock' as TileId, 1, 99, 0, GRID_COLS_MOBILE);
    expect(v.overrides['stock']!.x).toBe(MAX_X);
  });
});
