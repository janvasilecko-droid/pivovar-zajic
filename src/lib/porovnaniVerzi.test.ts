import { describe, expect, it } from 'vitest';
import { jeStarsiVerze } from './porovnaniVerzi';

describe('jeStarsiVerze', () => {
  it('stejná verze není starší', () => {
    expect(jeStarsiVerze('2.934', '2.934')).toBe(false);
  });

  it('nižší číslo za tečkou je starší, i když je delší jako text', () => {
    expect(jeStarsiVerze('2.9', '2.10')).toBe(true);
    expect(jeStarsiVerze('2.10', '2.9')).toBe(false);
  });
});
