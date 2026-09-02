import { describe, it, expect } from 'vitest';
import { uvolniMisto, UNIT_COLS, type HomeLayout, type TileId } from './homeLayout';

// Šířka 1 = UNIT_COLS sloupců (viz widthCols), takže dlaždice vedle sebe
// sedí na x = 0, 3, 6, … Mřížka na telefonu má 12 sloupců = 4 dlaždice v řadě.
const COLS = 12;

function layout(kusy: Array<[string, number, number, number?, number?]>): HomeLayout {
  const overrides: any = {};
  for (const [id, x, y, w, h] of kusy) overrides[id] = { x, y, ...(w ? { w } : {}), ...(h ? { h } : {}) };
  return { pages: [kusy.map(([id]) => id as TileId)], overrides, dock: [], groups: {} } as any;
}
const kde = (l: HomeLayout | null, id: string) => {
  const o = l?.overrides[id as TileId];
  return o ? { x: o.x, y: o.y } : null;
};

describe('uvolniMisto — dlaždice uhýbají tažené z cesty', () => {
  it('dlaždice na cílovém místě uhne, tažená sedne přesně tam, kam se míří', () => {
    // A(0,0) B(3,0) C(6,0) — táhnu C na místo B.
    const l = layout([['a', 0, 0], ['b', 3, 0], ['c', 6, 0]]);
    const po = uvolniMisto(l, 'c' as TileId, 3, 0, COLS);
    expect(kde(po, 'c')).toEqual({ x: 3, y: 0 });
    // B uhnulo na nejbližší volno — vedle, ne na místo, odkud C přišlo.
    expect(kde(po, 'b')).not.toEqual({ x: 3, y: 0 });
    expect(kde(po, 'a')).toEqual({ x: 0, y: 0 }); // co nepřekáží, se nehne
  });

  it('široká dlaždice odsune VŠECHNY, které překryje — ne jen jednu', () => {
    // Tohle výměna neuměla: prohodí se jen jedna a zbytek zůstane pod ní.
    const l = layout([['siroka', 0, 2, 2], ['b', 0, 0], ['c', 3, 0]]);
    const po = uvolniMisto(l, 'siroka' as TileId, 0, 0, COLS);
    expect(kde(po, 'siroka')).toEqual({ x: 0, y: 0 });
    for (const id of ['b', 'c']) {
      const p = kde(po, id)!;
      const prekryva = p.x < 0 + 2 * UNIT_COLS && p.x + UNIT_COLS > 0 && p.y < 1 && p.y + 1 > 0;
      expect(prekryva, `${id} zůstalo pod širokou dlaždicí`).toBe(false);
    }
  });

  it('dvě uhýbající dlaždice neskončí na sobě', () => {
    const l = layout([['siroka', 0, 3, 2], ['b', 0, 0], ['c', 3, 0]]);
    const po = uvolniMisto(l, 'siroka' as TileId, 0, 0, COLS);
    expect(kde(po, 'b')).not.toEqual(kde(po, 'c'));
  });

  it('na volné místo se položí bez hnutí ostatních', () => {
    const l = layout([['a', 0, 0], ['b', 3, 0]]);
    const po = uvolniMisto(l, 'b' as TileId, 6, 2, COLS);
    expect(kde(po, 'b')).toEqual({ x: 6, y: 2 });
    expect(kde(po, 'a')).toEqual({ x: 0, y: 0 });
  });

  it('mezery, které si někdo udělal schválně, zůstanou', () => {
    // Plocha se NEPŘESKLÁDÁ celá — uhne jen to, co překáží.
    const l = layout([['a', 0, 0], ['daleko', 9, 5]]);
    const po = uvolniMisto(l, 'a' as TileId, 3, 0, COLS);
    expect(kde(po, 'daleko')).toEqual({ x: 9, y: 5 });
  });

  it('neznámá dlaždice vrátí null (volající zůstane u výměny)', () => {
    expect(uvolniMisto(layout([['a', 0, 0]]), 'neni' as TileId, 0, 0, COLS)).toBeNull();
  });
});
