// Jantar se stáčí z 80 % 12° Světlé a 20 % tmavého — simulace 28. 9. 2026
// ukázala, že se za něj z tanků nic neodečítalo.
import { describe, it, expect } from 'vitest';
import { jeJantar, pivaJantaru, pivoZdrojovehoTanku, rozdelJantar, znackaJantaru } from './jantar';

const piva = [
  { id: 'b12', name: '12° Světlá' }, { id: 'b12t', name: '12° Tmavá' },
  { id: 'bjan', name: 'Jantar' }, { id: 'b10', name: '10° Desítka' },
];

describe('Jantar', () => {
  it('najde Jantar a piva, ze kterých se míchá', () => {
    const { jantar, svetla, tmava } = pivaJantaru(piva);
    expect([jantar?.id, svetla?.id, tmava?.id]).toEqual(['bjan', 'b12', 'b12t']);
    expect(jeJantar('bjan', piva)).toBe(true);
    expect(jeJantar('b10', piva)).toBe(false);
  });

  it('stáčí se z tanku 12° Světlé, ostatní piva ze svého', () => {
    expect(pivoZdrojovehoTanku('bjan', piva)).toBe('b12');
    expect(pivoZdrojovehoTanku('b10', piva)).toBe('b10');
  });

  it('rozdělí litry 80 / 20 a nic se neztratí', () => {
    expect(rozdelJantar(20)).toEqual({ svetlaL: 16, tmavaL: 4 });
    expect(rozdelJantar(90)).toEqual({ svetlaL: 72, tmavaL: 18 });
    const { svetlaL, tmavaL } = rozdelJantar(33);
    expect(svetlaL + tmavaL).toBeCloseTo(33, 5);
  });

  it('bez Jantaru v katalogu se nic nemění', () => {
    const bez = piva.filter((b) => b.id !== 'bjan');
    expect(pivoZdrojovehoTanku('b12t', bez)).toBe('b12t');
  });

  it('značka váže přetočení na řádek stáčení', () => {
    expect(znackaJantaru('abc')).toBe('[jantar:abc]');
  });
});
