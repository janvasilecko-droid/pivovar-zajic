// Z provozu 29. 9. 2026: návrhy po dni zadávání — obvyklý den / závoz,
// neobvyklé množství (Maneo přečten 10× místo obvyklých 2×).
import { describe, it, expect } from 'vitest';
import { spoctiZvyklosti, neobvykleMnozstvi } from './zvyklostiOdberatele';

const o = (id: string, den: string | null, zavoz = 1, status = 'nova') => ({ id, delivery_day: den, zavoz_cislo: zavoz, status });
const p = (order_id: string, q: number) => ({ order_id, beer_id: 'b10', package_id: 'k30', quantity: q });

describe('zvyklosti odběratele', () => {
  it('obvyklý den: aspoň 3× a aspoň polovina objednávek', () => {
    const z = spoctiZvyklosti([o('1', 'ut'), o('2', 'ut'), o('3', 'ut'), o('4', 'pa')], []);
    expect(z.obvyklyDen).toBe('ut');
    expect(spoctiZvyklosti([o('1', 'ut'), o('2', 'ut'), o('3', 'pa')], []).obvyklyDen).toBeNull();
  });
  it('obvyklý 2. závoz jen při většině', () => {
    expect(spoctiZvyklosti([o('1', 'ut', 2), o('2', 'ut', 2), o('3', 'ut', 1)], []).obvyklyZavoz).toBe(2);
    expect(spoctiZvyklosti([o('1', 'ut', 2), o('2', 'ut', 1), o('3', 'ut', 1)], []).obvyklyZavoz).toBeNull();
  });
  it('Maneo: obvykle 2× 30 l, přečteno 10× → varování; 3× ne', () => {
    const z = spoctiZvyklosti([o('1', 'ut'), o('2', 'ut'), o('3', 'ut')], [p('1', 2), p('2', 2), p('3', 3)]);
    expect(neobvykleMnozstvi(z, 'b10', 'k30', 10)).toBe(2);
    expect(neobvykleMnozstvi(z, 'b10', 'k30', 3)).toBeNull();
    expect(neobvykleMnozstvi(z, 'b12', 'k30', 10)).toBeNull(); // bez historie
  });
  it('storno se nepočítá', () => {
    const z = spoctiZvyklosti([o('1', 'po', 1, 'storno'), o('2', 'po', 1, 'storno'), o('3', 'po', 1, 'storno')], []);
    expect(z.obvyklyDen).toBeNull();
  });
});
