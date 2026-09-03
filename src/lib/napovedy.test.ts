import { describe, it, expect } from 'vitest';
import { maSeZobrazit, oznacZobrazenou, type UlozisteNapoved } from './napovedy';

function pamet(): UlozisteNapoved & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

describe('jednorázové nápovědy', () => {
  it('poprvé se zobrazí, po odklepnutí už nikdy', () => {
    const store = pamet();
    expect(maSeZobrazit('plocha-gesta', store)).toBe(true);
    oznacZobrazenou('plocha-gesta', store);
    expect(maSeZobrazit('plocha-gesta', store)).toBe(false);
  });

  it('opakované odklepnutí nic nerozbije', () => {
    const store = pamet();
    oznacZobrazenou('plocha-gesta', store);
    oznacZobrazenou('plocha-gesta', store);
    expect(maSeZobrazit('plocha-gesta', store)).toBe(false);
  });

  it('bez úložiště se tip ukáže — nezamkne se kvůli chybě prohlížeče', () => {
    // Privátní režim Safari umí na localStorage hodit výjimku. Tehdy je
    // správná odpověď „ukaž", ne „mlč navždy".
    expect(maSeZobrazit('plocha-gesta', null)).toBe(true);
    expect(() => oznacZobrazenou('plocha-gesta', null)).not.toThrow();
  });

  it('úložiště, které při čtení i zápisu hází, nespadne', () => {
    const rozbite: UlozisteNapoved = {
      getItem: () => { throw new Error('QuotaExceeded'); },
      setItem: () => { throw new Error('QuotaExceeded'); },
    };
    expect(maSeZobrazit('plocha-gesta', rozbite)).toBe(true);
    expect(() => oznacZobrazenou('plocha-gesta', rozbite)).not.toThrow();
  });

  it('klíč je pod vlastní předponou, ať se neplete s ostatními nastaveními', () => {
    const store = pamet();
    oznacZobrazenou('plocha-gesta', store);
    expect([...store.data.keys()]).toEqual(['pivovar_napoveda_plocha-gesta']);
  });
});
