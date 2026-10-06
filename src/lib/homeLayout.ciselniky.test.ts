import { describe, it, expect } from 'vitest';
import { ciselnikyNaPlochu, type HomeLayout } from './homeLayout';

// 6. 10. 2026: „kde najdu seznam odběratelů a piv a obalů, udělej na to
// dlaždici na ploše" — dlaždice Číselníky byla na konci plochy nebo schovaná.
const plocha = (pages: string[][], hidden: string[] = []): HomeLayout => ({
  pages: pages as any,
  overrides: { orders: { w: 1, h: 1, color: 'amber2', x: 0, y: 0 }, depozitar: { w: 1, h: 1, color: 'forest', x: 3, y: 9 } } as any,
  groups: {}, tileOpacity: 0.9, tileGap: 8, dock: ['home'], hidden: hidden as any, fixedColors: {},
});

describe('ciselnikyNaPlochu', () => {
  it('z druhé stránky na první, ostatní dlaždice zůstanou na místě', () => {
    const v = ciselnikyNaPlochu(plocha([['orders'], ['depozitar', 'audit']]));
    expect(v.pages[0]).toEqual(['orders', 'depozitar']);
    expect(v.pages[1]).toEqual(['audit']);
    expect(v.overrides.orders).toMatchObject({ x: 0, y: 0 });
    expect(v.overrides.depozitar).toMatchObject({ x: undefined, y: undefined, color: 'forest' });
  });

  it('schovanou dlaždici odkryje', () => {
    const v = ciselnikyNaPlochu(plocha([['orders']], ['depozitar']));
    expect(v.hidden).not.toContain('depozitar');
    expect(v.pages[0]).toContain('depozitar');
  });

  it('když už na první stránce je, nic nemění', () => {
    const puvodni = plocha([['orders', 'depozitar']]);
    expect(ciselnikyNaPlochu(puvodni)).toBe(puvodni);
  });
});
