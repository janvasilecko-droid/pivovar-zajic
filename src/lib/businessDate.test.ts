import { describe, expect, it } from 'vitest';
import { businessDateISO, businessHour } from './businessDate';

describe('business date (Europe/Prague)', () => {
  it('uses the next local day while UTC is still on the previous day in summer', () => {
    const instant = new Date('2026-08-16T22:30:00.000Z');
    expect(businessDateISO(instant)).toBe('2026-08-17');
    expect(businessHour(instant)).toBe(0);
  });

  it('handles the winter UTC offset', () => {
    const instant = new Date('2026-12-31T23:30:00.000Z');
    expect(businessDateISO(instant)).toBe('2027-01-01');
    expect(businessHour(instant)).toBe(0);
  });

  it('keeps a daytime instant on the same date', () => {
    const instant = new Date('2026-08-16T10:15:00.000Z');
    expect(businessDateISO(instant)).toBe('2026-08-16');
    expect(businessHour(instant)).toBe(12);
  });
});
