// 📴 Stránka si u service workeru říká o obrazovky, které v telefonu chybí, a pamatuje si, kolik jich má.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KLIC_STAVU_OBRAZOVEK, UDALOST_OBRAZOVEK, doplnObrazovky, spustDoplnovaniObrazovek, stavObrazovek } from './offlineObrazovky';
import { UDALOST_SPOJENI_ZPET } from './jisticSpojeni';

type Posluchac = (e: MessageEvent) => void;
function atrapaSw(sController = true) {
  const posluchaci = new Set<Posluchac>();
  const zpravy: unknown[] = [];
  const aktivni = { postMessage: (z: unknown) => zpravy.push(z) };
  const sw = {
    controller: sController ? aktivni : null,
    ready: Promise.resolve({ active: aktivni }),
    addEventListener: (_t: string, f: Posluchac) => posluchaci.add(f),
    removeEventListener: (_t: string, f: Posluchac) => posluchaci.delete(f),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return { zpravy, posluchaci, posli: (data: unknown) => posluchaci.forEach((f) => f({ data } as MessageEvent)) };
}

beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => {
  vi.useRealTimers();
  delete (navigator as unknown as { serviceWorker?: unknown }).serviceWorker;
});

describe('doplnObrazovky', () => {
  it('pošle service workeru zprávu DOPLN_OFFLINE', () => {
    const sw = atrapaSw();
    doplnObrazovky();
    expect(sw.zpravy).toEqual([{ type: 'DOPLN_OFFLINE' }]);
  });

  it('když stránku service worker ještě neřídí (první spuštění), počká na něj', async () => {
    const sw = atrapaSw(false);
    doplnObrazovky();
    expect(sw.zpravy).toEqual([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(sw.zpravy).toEqual([{ type: 'DOPLN_OFFLINE' }]);
  });

  it('bez service workeru (starý prohlížeč) se nic neděje', () => {
    expect(() => doplnObrazovky()).not.toThrow();
    expect(spustDoplnovaniObrazovek()()).toBeUndefined();
  });
});

describe('spustDoplnovaniObrazovek', () => {
  it('řekne si o doplnění chvíli po spuštění a znovu po návratu signálu (i poznaném jističem)', () => {
    const sw = atrapaSw();
    const uklid = spustDoplnovaniObrazovek(6000);
    vi.advanceTimersByTime(5999);
    expect(sw.zpravy).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(sw.zpravy).toHaveLength(1);
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event(UDALOST_SPOJENI_ZPET));
    expect(sw.zpravy).toHaveLength(3);
    uklid();
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event(UDALOST_SPOJENI_ZPET));
    expect(sw.zpravy).toHaveLength(3);
    expect(sw.posluchaci.size).toBe(0);
  });

  it('úklid před prvním doplněním ho zruší', () => {
    const sw = atrapaSw();
    spustDoplnovaniObrazovek(6000)();
    vi.advanceTimersByTime(10_000);
    expect(sw.zpravy).toHaveLength(0);
  });

  it('odpověď service workeru si zapamatuje a ohlásí; cizí zprávy ignoruje', () => {
    const sw = atrapaSw();
    const zmena = vi.fn();
    window.addEventListener(UDALOST_OBRAZOVEK, zmena);
    const uklid = spustDoplnovaniObrazovek();
    try {
      expect(stavObrazovek()).toBeNull();
      for (const cizi of [null, 'text', { type: 'SW_ACTIVATED' }, { type: 'OFFLINE_STAV', ulozeno: 'x', celkem: 3 }, { type: 'OFFLINE_STAV', ulozeno: 3 }]) sw.posli(cizi);
      expect(stavObrazovek()).toBeNull();
      expect(zmena).not.toHaveBeenCalled();
      vi.setSystemTime(new Date('2026-11-27T10:00:00Z'));
      sw.posli({ type: 'OFFLINE_STAV', ulozeno: 124, celkem: 126 });
      expect(stavObrazovek()).toEqual({ ulozeno: 124, celkem: 126, t: new Date('2026-11-27T10:00:00Z').getTime() });
      expect(zmena).toHaveBeenCalledTimes(1);
    } finally { uklid(); window.removeEventListener(UDALOST_OBRAZOVEK, zmena); }
  });

  it('poškozený uložený stav se čte jako „nevíme"', () => {
    localStorage.setItem(KLIC_STAVU_OBRAZOVEK, JSON.stringify({ ulozeno: 'hodně' }));
    expect(stavObrazovek()).toBeNull();
    localStorage.setItem(KLIC_STAVU_OBRAZOVEK, '{nesmysl');
    expect(stavObrazovek()).toBeNull();
  });
});
