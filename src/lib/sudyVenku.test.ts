import { describe, it, expect } from 'vitest';
import { sudyVenku, sudyDlouhoVenku } from './sudyVenku';
import type { KegMovement } from './kegAccount';

let n = 0;
function pohyb(place: string, datum: string, direction: 'in' | 'out', quantity: number): KegMovement {
  n++;
  return {
    id: String(n), entry_date: datum, place_id: `id-${place}`, place_name: place, order_id: null,
    volume_l: 50, direction, quantity, note: null, recorded_by: null, created_at: `${datum}T08:00:00Z`,
  };
}

describe('sudy u odběratele', () => {
  it('kdo nikdy nevracel, počítá se od prvního odvozu', () => {
    const v = sudyVenku([pohyb('Lípa', '2026-08-01', 'out', 2), pohyb('Lípa', '2026-08-20', 'out', 1)], '2026-09-10');
    expect(v).toHaveLength(1);
    expect(v[0].pocet).toBe(3);
    expect(v[0].dni).toBe(40);
    expect(v[0].od).toBe('2026-08-01');
  });

  it('po vrácení se počítá od posledního vrácení', () => {
    const v = sudyVenku([
      pohyb('Zámek', '2026-07-01', 'out', 4),
      pohyb('Zámek', '2026-09-01', 'in', 2),
    ], '2026-09-10');
    expect(v[0].pocet).toBe(2);
    expect(v[0].dni).toBe(9);
  });

  it('vše vrácené se nehlásí', () => {
    expect(sudyVenku([pohyb('Terasa', '2026-07-01', 'out', 2), pohyb('Terasa', '2026-07-05', 'in', 2)], '2026-09-10')).toEqual([]);
  });

  it('dlouho venku jen nad prahem, seřazené od nejdelšího', () => {
    const v = sudyDlouhoVenku([
      pohyb('A', '2026-09-05', 'out', 1),
      pohyb('B', '2026-06-01', 'out', 1),
      pohyb('C', '2026-08-01', 'out', 1),
    ], '2026-09-10');
    expect(v.map((s) => s.placeName)).toEqual(['B', 'C']);
  });
});
