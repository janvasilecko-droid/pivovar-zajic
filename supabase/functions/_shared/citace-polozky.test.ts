import { describe, expect, it } from 'vitest';
import { bezPolozekZCitace, radekJeZCitace } from './citace-polozky';

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

// 17. 11. 2026 (Malešice): odpověď „Bude bez pet 1,5l. 12cky" na objednávku
// se dvěma řádky. AI vrací výsledný stav a k řádkům přikládá text citace.
describe('radekJeZCitace', () => {
  const puvodni = 'Malesice\n•⁠  ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)\n•⁠  Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.';
  const odpoved = 'Tak těch Jantaru v pet bude jen 11 kusů';

  it('celá citovaná zpráva přepsaná na jeden řádek je z citace', () => {
    expect(radekJeZCitace('Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety) •⁠ Jantar 12 = 2x30l KEG + 12x1,5l PET . Děkuji moc.', 'Bude bez pet 1,5l. 12cky', puvodni)).toBe(true);
  });
  it('jeden řádek citace je z citace', () => {
    expect(radekJeZCitace('Malesice •⁠ ⁠SV 12 = 2x50l KEG + 2x30l KEG + 12x1,5l PET (bez etikety)', odpoved, puvodni)).toBe(true);
    expect(radekJeZCitace('Jantar 12 = 2x30l KEG + 12x1,5l PET', odpoved, puvodni)).toBe(true);
  });
  it('text odpovědi samé z citace není', () => {
    expect(radekJeZCitace(odpoved, odpoved, puvodni)).toBe(false);
    expect(radekJeZCitace('Plus 2x30l KEG', 'Plus 2x30l KEG', puvodni)).toBe(false);
  });
  it('řádek, který AI složila sama, a zpráva bez citace z citace nejsou', () => {
    expect(radekJeZCitace('Maneo 3x30 12° Světlá', 'Oprava :bude bez 2x10l 11', 'Maneo • 2x 10l 11° Světlá • 3x 30l 10° Desítka • 3x 30l 12° Světlá')).toBe(false);
    expect(radekJeZCitace('2x50l 12sv', 'cokoli', null)).toBe(false);
    expect(radekJeZCitace('', odpoved, puvodni)).toBe(false);
  });
});
