import { describe, it, expect } from 'vitest';
import { prokvaseni, dalsiGenerace, posledniStupnovitost, bodyGrafu, type Mereni } from './varky';

function mereni(cas: string, stupnovitost: number | null, teplota: number | null = null): Mereni {
  return { id: cas, batch_id: 'v', measured_at: cas, stupnovitost, teplota_c: teplota, poznamka: null, zapsal: null };
}

describe('várky', () => {
  it('prokvašení z počáteční a konečné stupňovitosti', () => {
    expect(prokvaseni(12, 3)).toBe(75);
    expect(prokvaseni(12, null)).toBeNull();
    expect(prokvaseni(3, 12)).toBeNull();
  });

  it('generace kvasnic', () => {
    expect(dalsiGenerace(null)).toBe(1);
    expect(dalsiGenerace({ kvasnice_generace: 3 })).toBe(4);
    expect(dalsiGenerace({ kvasnice_generace: null })).toBe(2);
  });

  it('aktuální stupňovitost je z posledního měření, jinak počáteční', () => {
    const m = [mereni('2026-09-01T08:00:00Z', 10), mereni('2026-09-03T08:00:00Z', 6), mereni('2026-09-04T08:00:00Z', null, 9)];
    expect(posledniStupnovitost({ og: 12 }, m)).toBe(6);
    expect(posledniStupnovitost({ og: 12 }, [])).toBe(12);
  });

  it('graf má osu x podle času, ne podle pořadí', () => {
    const b = bodyGrafu([
      mereni('2026-09-01T00:00:00Z', 12),
      mereni('2026-09-02T00:00:00Z', 9),
      mereni('2026-09-05T00:00:00Z', 3),
    ], 100, 50);
    expect(b.map((p) => Math.round(p.x))).toEqual([0, 25, 100]);
    expect(b[0].y).toBe(0);
    expect(b[2].y).toBe(50);
  });

  it('jediné měření leží uprostřed', () => {
    const b = bodyGrafu([mereni('2026-09-01T00:00:00Z', 12)], 100, 50);
    expect(b[0]).toMatchObject({ x: 50, y: 25 });
  });
});
