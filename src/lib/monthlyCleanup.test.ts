import { describe, it, expect } from 'vitest';
import { isLastWeekOfMonth, getMonthKey } from './monthlyCleanup';

describe('isLastWeekOfMonth (posledních 7 dnů měsíce)', () => {
  it('srpen (31 dní) — poslední týden je 25.–31.', () => {
    expect(isLastWeekOfMonth('2026-08-25')).toBe(true);
    expect(isLastWeekOfMonth('2026-08-31')).toBe(true);
    expect(isLastWeekOfMonth('2026-08-24')).toBe(false);
    expect(isLastWeekOfMonth('2026-08-10')).toBe(false);
  });

  it('únor (28 dní) — poslední týden je 22.–28.', () => {
    expect(isLastWeekOfMonth('2026-02-22')).toBe(true);
    expect(isLastWeekOfMonth('2026-02-28')).toBe(true);
    expect(isLastWeekOfMonth('2026-02-21')).toBe(false);
  });

  it('duben (30 dní) — poslední týden je 24.–30.', () => {
    expect(isLastWeekOfMonth('2026-04-24')).toBe(true);
    expect(isLastWeekOfMonth('2026-04-30')).toBe(true);
    expect(isLastWeekOfMonth('2026-04-23')).toBe(false);
  });

  it('getMonthKey vrací klíč měsíce RRRR-MM', () => {
    expect(getMonthKey('2026-08-31')).toBe('2026-08');
    expect(getMonthKey('2026-12-01')).toBe('2026-12');
  });
});
