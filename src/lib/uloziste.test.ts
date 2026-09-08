import { describe, it, expect, vi, afterEach } from 'vitest';
import { nacti, uloz, smaz, nactiJson, ulozJson } from './uloziste';

function rozbijUloziste() {
  // Privátní režim Safari, plná kvóta i zakázané ukládání se navenek
  // projeví stejně: setItem/getItem vyhodí výjimku.
  vi.stubGlobal('localStorage', {
    getItem: () => { throw new Error('SecurityError'); },
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: () => { throw new Error('SecurityError'); },
  });
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('uloziste', () => {
  it('normálně uloží a přečte', () => {
    expect(uloz('pokus', 'ano')).toBe(true);
    expect(nacti('pokus')).toBe('ano');
    smaz('pokus');
    expect(nacti('pokus')).toBeNull();
  });

  it('když úložiště vyhodí výjimku, nic nespadne', () => {
    rozbijUloziste();
    expect(() => uloz('a', 'b')).not.toThrow();
    expect(uloz('a', 'b')).toBe(false);
    expect(nacti('a')).toBeNull();
    expect(() => smaz('a')).not.toThrow();
  });

  it('JSON se uloží i přečte', () => {
    ulozJson('filtr', { pivo: '12', jenSudy: true });
    expect(nactiJson('filtr', null as any)).toEqual({ pivo: '12', jenSudy: true });
  });

  it('rozbitý JSON vrátí výchozí hodnotu místo pádu', () => {
    // Nedopsaný zápis (vybitý telefon uprostřed ukládání) nesmí shodit
    // obrazovku kvůli zapamatovanému filtru.
    localStorage.setItem('filtr', '{nedopsan');
    expect(nactiJson('filtr', { pivo: '' })).toEqual({ pivo: '' });
  });

  it('nečitelné úložiště vrátí výchozí hodnotu', () => {
    rozbijUloziste();
    expect(nactiJson('filtr', { pivo: '' })).toEqual({ pivo: '' });
  });

  it('kruhová reference se neuloží, ale ani nespadne', () => {
    const kruh: any = {};
    kruh.self = kruh;
    expect(ulozJson('kruh', kruh)).toBe(false);
  });
});
