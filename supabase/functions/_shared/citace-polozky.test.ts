import { describe, expect, it } from 'vitest';
import { bezPolozekZCitace } from './citace-polozky';

const citace = 'Lokálka Říčany prosim\n10x50l 12sv\n2x30l Winter Hazy 12';

describe('bezPolozekZCitace', () => {
  it('zahodí položky z textu citace, nechá ty z odpovědi', () => {
    const items = [
      { qty: 10, raw_line: 'Lokálka Říčany prosim 10x50l 12sv 2x30l Winter Hazy 12' },
      { qty: 2, raw_line: 'Lokálka Říčany prosim 10x50l 12sv 2x30l Winter Hazy 12' },
      { qty: 100, raw_line: 'A jeste plus 100x 0,5l 12sv' },
    ];
    const v = bezPolozekZCitace(items, 'A jeste plus 100x 0,5l 12sv', citace);
    expect(v).toEqual([{ qty: 100, raw_line: 'A jeste plus 100x 0,5l 12sv' }]);
  });
  it('řádek citace přečtený po částech (10x50l 12sv) se také zahodí', () => {
    const v = bezPolozekZCitace([{ raw_line: '10x50l 12sv' }, { raw_line: 'plus 3x30l' }], 'plus 3x30l', citace);
    expect(v).toEqual([{ raw_line: 'plus 3x30l' }]);
  });
  it('bez citace se nic nemění', () => {
    const items = [{ raw_line: '10x50l 12sv' }];
    expect(bezPolozekZCitace(items, 'cokoli', '')).toBe(items);
  });
  it('řádek, který je i v odpovědi samotné, zůstane', () => {
    const v = bezPolozekZCitace([{ raw_line: '2x30l Winter Hazy 12' }], 'Taky 2x30l Winter Hazy 12', citace);
    expect(v).toHaveLength(1);
  });
});
