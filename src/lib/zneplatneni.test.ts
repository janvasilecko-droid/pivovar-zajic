// Nástěnka „tahle tabulka se změnila": verze pro sdílenou paměť + posluchači pro kopii dat v telefonu.
import { describe, it, expect, vi } from 'vitest';
import { ohlasZmenuTabulky, priZneplatneni, verzeTabulky, zneplatniTabulku, zneplatniVse } from './zneplatneni';

describe('zneplatnění', () => {
  it('změna tabulky změní její verzi (a verzi nadřazené), jiných ne', () => {
    const [pred, akcePred, jina] = [verzeTabulky('akce_items'), verzeTabulky('akce'), verzeTabulky('beers')];
    zneplatniTabulku('akce_items');
    expect(verzeTabulky('akce_items')).not.toBe(pred);
    expect(verzeTabulky('akce')).not.toBe(akcePred);
    expect(verzeTabulky('beers')).toBe(jina);
    zneplatniVse();
    expect(verzeTabulky('beers')).not.toBe(jina);
  });

  it('posluchač se dozví, která tabulka se změnila; „všechno" jako null', () => {
    const posluchac = vi.fn();
    const odhlas = priZneplatneni(posluchac);
    zneplatniTabulku('orders');
    zneplatniVse();
    expect(posluchac.mock.calls).toEqual([['orders'], [null]]);
    odhlas();
    zneplatniTabulku('orders');
    expect(posluchac).toHaveBeenCalledTimes(2);
  });

  it('posluchač, který spadne, zápis neshodí a ostatní posluchače neodřízne', () => {
    const druhy = vi.fn();
    const odhlasA = priZneplatneni(() => { throw new Error('rozbitý posluchač'); });
    const odhlasB = priZneplatneni(druhy);
    try {
      expect(() => zneplatniTabulku('kegging')).not.toThrow();
      expect(() => zneplatniVse()).not.toThrow();
      expect(druhy).toHaveBeenCalledTimes(2);
    } finally { odhlasA(); odhlasB(); }
  });

  it('zneplatnění „pro jistotu" (minutová pojistka, návrat do appky) paměť zahodí, ale posluchače neruší', () => {
    const posluchac = vi.fn();
    const odhlas = priZneplatneni(posluchac);
    try {
      const [pred, vsePred] = [verzeTabulky('orders'), verzeTabulky('kegging')];
      zneplatniTabulku('orders', false);
      expect(verzeTabulky('orders')).not.toBe(pred);           // paměť obrazovek neplatí…
      zneplatniVse(false);
      expect(verzeTabulky('kegging')).not.toBe(vsePred);
      expect(posluchac).not.toHaveBeenCalled();                // … ale kopie v telefonu se kvůli tomu nestahuje
    } finally { odhlas(); }
  });

  it('ohlasZmenuTabulky dá vědět posluchačům a verze nechá být', () => {
    const posluchac = vi.fn();
    const odhlas = priZneplatneni(posluchac);
    try {
      const pred = verzeTabulky('bottling');
      ohlasZmenuTabulky('bottling');
      expect(posluchac.mock.calls).toEqual([['bottling']]);
      expect(verzeTabulky('bottling')).toBe(pred);
    } finally { odhlas(); }
  });
});
