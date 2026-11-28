import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGISTRACE_NEJPOZDEJI_MS, zaregistrujServiceWorker } from './registraceSw';

// Service worker se musí zaregistrovat brzy i na slabém signálu, kde událost `load` přijde pozdě — do té doby
// appka po aktualizaci bez signálu nenaběhne (28. 11. 2026, docs/offline.md).
describe('zaregistrujServiceWorker', () => {
  /** Okno, které se „ještě načítá" — jsdom je jinak načtený hned. */
  function oknoVeStavu(stav: DocumentReadyState) {
    const posluchaci = new Map<string, Set<() => void>>();
    return {
      okno: {
        document: { readyState: stav },
        addEventListener: (j: string, f: () => void) => { if (!posluchaci.has(j)) posluchaci.set(j, new Set()); posluchaci.get(j)!.add(f); },
        removeEventListener: (j: string, f: () => void) => { posluchaci.get(j)?.delete(f); },
      } as unknown as Window,
      nacteno: () => { for (const f of [...(posluchaci.get('load') ?? [])]) f(); },
      posloucha: () => (posluchaci.get('load')?.size ?? 0) > 0,
    };
  }

  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('stránka už je načtená → registruje hned', () => {
    const registruj = vi.fn();
    zaregistrujServiceWorker(registruj, oknoVeStavu('complete').okno);
    expect(registruj).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stránka se načte rychle → registruje při `load`, časovač už nic neudělá', () => {
    const registruj = vi.fn();
    const o = oknoVeStavu('loading');
    zaregistrujServiceWorker(registruj, o.okno);
    expect(registruj).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    o.nacteno();
    expect(registruj).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REGISTRACE_NEJPOZDEJI_MS * 2);
    expect(registruj).toHaveBeenCalledTimes(1);
    expect(o.posloucha()).toBe(false);
  });

  it('slabý signál, `load` nepřichází → registruje nejpozději po limitu a pozdní `load` už nic neudělá', () => {
    const registruj = vi.fn();
    const o = oknoVeStavu('interactive');
    zaregistrujServiceWorker(registruj, o.okno);
    vi.advanceTimersByTime(REGISTRACE_NEJPOZDEJI_MS - 1);
    expect(registruj).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(registruj).toHaveBeenCalledTimes(1);
    o.nacteno();
    expect(registruj).toHaveBeenCalledTimes(1);
  });

  it('chyba při registraci appku neshodí', () => {
    expect(() => zaregistrujServiceWorker(() => { throw new Error('SecurityError'); }, oknoVeStavu('complete').okno)).not.toThrow();
  });

  it('úklid zruší čekání', () => {
    const registruj = vi.fn();
    const o = oknoVeStavu('loading');
    const uklid = zaregistrujServiceWorker(registruj, o.okno);
    uklid();
    o.nacteno();
    vi.advanceTimersByTime(REGISTRACE_NEJPOZDEJI_MS * 2);
    expect(registruj).not.toHaveBeenCalled();
  });

  it('limit je pár vteřin — ne desítky', () => {
    expect(REGISTRACE_NEJPOZDEJI_MS).toBeGreaterThanOrEqual(1_000);
    expect(REGISTRACE_NEJPOZDEJI_MS).toBeLessThanOrEqual(5_000);
  });
});
