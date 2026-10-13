import { describe, it, expect } from 'vitest';
import { souhrnStaceni } from './souhrnStaceni';

const obaly = [{ id: 'k50', volume_l: 50 }, { id: 'k30', volume_l: 30 }];

describe('souhrn stáčení', () => {
  it('rozdělí skutečně stočené, manko a výsledek po odečtu', () => {
    const s = souhrnStaceni([
      { package_id: 'k50', quantity: 10 }, { package_id: 'k30', quantity: 20 },
      { package_id: 'k50', quantity: -3 }, { package_id: 'k30', quantity: '-1' },
    ], obaly);
    expect(s).toEqual({ stocenoKs: 30, stocenoL: 1100, mankoKs: -4, mankoL: -180, poOdecteKs: 26, poOdecteL: 920 });
  });

  it('bez manka je „po odečtu" stejné jako stočeno; prázdné období je nula', () => {
    expect(souhrnStaceni([{ package_id: 'k30', quantity: 2 }], obaly)).toMatchObject({ mankoKs: 0, stocenoL: 60, poOdecteL: 60 });
    expect(souhrnStaceni([], obaly).poOdecteKs).toBe(0);
  });
});
