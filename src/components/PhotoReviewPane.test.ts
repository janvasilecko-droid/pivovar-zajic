// Výchozí pohled ukotvené fotky v kontrole objednávky: na celou šířku pruhu,
// od horního okraje (17. 11. 2026 — lístek na výšku byl v nízkém pruhu jen
// nečitelná miniatura).
import { describe, expect, it } from 'vitest';
import { vychoziPohledNaSirku } from './PhotoReviewPane';

describe('vychoziPohledNaSirku', () => {
  it('lístek na výšku v nízkém pruhu telefonu: zvětší se na šířku a ukáže se jeho vršek', () => {
    // Pruh 390×240, fotka 1080×1440 se do něj celá vejde jako 180×240.
    const v = vychoziPohledNaSirku({ w: 390, h: 240 }, { w: 180, h: 240 });
    expect(v.scale).toBeCloseTo(390 / 180, 5);
    // Zvětšená fotka je vysoká 520 px; posun o polovinu přesahu dolů = horní okraj fotky na horním okraji pruhu.
    expect(v.pos).toEqual({ x: 0, y: (520 - 240) / 2 });
  });

  it('fotka, která šířku vyplňuje (na šířku focená), zůstává celá a uprostřed', () => {
    expect(vychoziPohledNaSirku({ w: 390, h: 240 }, { w: 390, h: 220 })).toEqual({ scale: 1, pos: { x: 0, y: 0 } });
  });

  it('po zvětšení na šířku se celá vejde na výšku → žádný posun', () => {
    // Plocha 640×900, fotka vejde se celá jako 600×800; na šířku 640×853 < 900.
    const v = vychoziPohledNaSirku({ w: 640, h: 900 }, { w: 600, h: 800 });
    expect(v.scale).toBeCloseTo(640 / 600, 5);
    expect(v.pos).toEqual({ x: 0, y: 0 });
  });

  it('zvětšení nepřeleze strop a nesmyslné rozměry nic nerozbijí', () => {
    expect(vychoziPohledNaSirku({ w: 2000, h: 100 }, { w: 10, h: 100 }).scale).toBe(8);
    for (const [plocha, fotka] of [[{ w: 0, h: 0 }, { w: 100, h: 100 }], [{ w: 300, h: 200 }, { w: 0, h: 0 }], [{ w: NaN, h: 200 }, { w: 10, h: 10 }]] as const) {
      expect(vychoziPohledNaSirku(plocha, fotka)).toEqual({ scale: 1, pos: { x: 0, y: 0 } });
    }
  });
});
