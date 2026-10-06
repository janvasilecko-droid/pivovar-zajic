import { describe, it, expect } from 'vitest';
import { doSuduOdberatele, vlastniSudyOdberatele } from './vlastniSudy';

// 6. 10. 2026: „Duck and Dog a Michal Fojtovice počítej zvlášť, mimo zásoby
// skladu, stáčí se do jejich sudů, to samý Martin malý sudy."
describe('vlastniSudyOdberatele', () => {
  it('Duck and Dog a Michal Fojtovice — všechny sudy jejich', () => {
    expect(vlastniSudyOdberatele('Duck and Dog')).toBe('vse');
    expect(vlastniSudyOdberatele('duck  and dog')).toBe('vse');
    expect(vlastniSudyOdberatele('Michal fojtovice')).toBe('vse');
    expect(vlastniSudyOdberatele('Michal Vojtovice')).toBe('vse');
  });

  it('Martin — jen malé sudy; ne každý, kdo má Martina v názvu', () => {
    expect(vlastniSudyOdberatele('MARTIN')).toBe('male');
    expect(vlastniSudyOdberatele('Martinice')).toBeNull();
    expect(vlastniSudyOdberatele('Hospoda U Martina')).toBeNull();
  });

  it('ostatní odběratelé sudy pivovaru', () => {
    expect(vlastniSudyOdberatele('Lokálka Říčany')).toBeNull();
    expect(vlastniSudyOdberatele(null)).toBeNull();
  });
});

describe('doSuduOdberatele', () => {
  const s50 = { kind: 'keg', volume_l: 50 };
  const s20 = { kind: 'keg', volume_l: 20 };
  const lahev = { kind: 'bottle', volume_l: 1 };
  it('Martin: 20 l do jeho sudu, 50 l ze sudu pivovaru, lahve nikdy', () => {
    expect(doSuduOdberatele('Martin', s20)).toBe(true);
    expect(doSuduOdberatele('Martin', s50)).toBe(false);
    expect(doSuduOdberatele('Martin', lahev)).toBe(false);
  });
  it('Duck and Dog: všechny sudy, lahve ne', () => {
    expect(doSuduOdberatele('Duck and Dog', s50)).toBe(true);
    expect(doSuduOdberatele('Duck and Dog', s20)).toBe(true);
    expect(doSuduOdberatele('Duck and Dog', lahev)).toBe(false);
  });
});
