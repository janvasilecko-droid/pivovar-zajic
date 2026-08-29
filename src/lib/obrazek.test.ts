import { describe, it, expect } from 'vitest';
import { typObrazku } from './obrazek';

describe('typObrazku', () => {
  it('přečte typ z hlavičky data URL', () => {
    expect(typObrazku('data:image/png;base64,iVBORw0KGgo=')).toBe('image/png');
    expect(typObrazku('data:image/jpeg;base64,/9j/4AAQ')).toBe('image/jpeg');
    expect(typObrazku('data:image/webp;base64,UklGRg==')).toBe('image/webp');
  });

  it('zvládne data URL bez base64 příznaku', () => {
    expect(typObrazku('data:image/svg+xml,<svg/>')).toBe('image/svg+xml');
  });

  it('když typ chybí nebo je vstup nesmysl, vrátí jpeg', () => {
    expect(typObrazku('')).toBe('image/jpeg');
    expect(typObrazku('data:;base64,AAAA')).toBe('image/jpeg');
    expect(typObrazku('https://priklad.cz/foto.png')).toBe('image/jpeg');
  });
});
