import { describe, it, expect } from 'vitest';
import { vNovemSklepu } from './sklepOd';

describe('sklep od 1. 10. 2026', () => {
  it('od 1. 10. ano, zářijové ne, bez data ne', () => {
    expect(vNovemSklepu('2026-10-01')).toBe(true);
    expect(vNovemSklepu('2026-10-01T00:30:00+00:00')).toBe(true);
    expect(vNovemSklepu('2026-09-30')).toBe(false);
    expect(vNovemSklepu('2026-09-30T23:59:59+00:00')).toBe(false);
    expect(vNovemSklepu(null)).toBe(false);
  });
});
