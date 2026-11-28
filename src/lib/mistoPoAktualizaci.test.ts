import { afterEach, describe, expect, it, vi } from 'vitest';
import { ulozKoncept, nactiKoncept } from './rozepsanyZapis';

const KLIC = 'rozepsane_staceni_lahve';

type Koncept = { entryRows: { qty: string }[]; date: string; note: string };

function jeKoncept(d: unknown): d is Koncept {
  return !!d && typeof d === 'object' && 'note' in d;
}

describe('místo a rozepsaná data přežijí obnovení', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  // Každý test si načte moduly znovu: „místo po aktualizaci" se čte jednou za načtení modulu a `versionCheck`
  // si pamatuje běžící aktualizaci — dva testy nad stejnými moduly by si překážely.
  async function cerstveModuly() {
    vi.resetModules();
    const misto = await import('./mistoPoAktualizaci');
    const verze = await import('./versionCheck');
    return { misto, verze };
  }
  /** Rozepsaný zápis a místo v appce; vrací, co je v úložišti před aktualizací. */
  function rozepis(misto: typeof import('./mistoPoAktualizaci')) {
    ulozKoncept(KLIC, { entryRows: [{ qty: '40' }], date: '2026-10-26', note: 'půlka palety' });
    misto.zapamatujMisto('bottling', 'zapis');
    return localStorage.getItem(KLIC);
  }
  function zkontrolujNavrat(misto: typeof import('./mistoPoAktualizaci'), pred: string | null) {
    expect(localStorage.getItem(KLIC)).toBe(pred);
    expect(misto.nactiMistoPoAktualizaci()).toEqual({ page: 'bottling', subTab: 'zapis' });
    expect(nactiKoncept(KLIC, jeKoncept)?.data.note).toBe('půlka palety');
    expect(nactiKoncept(KLIC, jeKoncept)?.data.entryRows[0].qty).toBe('40');
    expect(sessionStorage.getItem('misto_po_aktualizaci')).toBeNull();
  }

  it('po vynucené aktualizaci zůstane obrazovka, záložka i rozepsaný zápis', async () => {
    const { misto, verze } = await cerstveModuly();
    const pred = rozepis(misto);
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    // Vynucená aktualizace se spustí, jen když server odpovídá (jinak by smazala uloženou aplikaci nadarmo).
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: '9.9' }), { status: 200 }))));
    const clear = vi.spyOn(Storage.prototype, 'clear');

    await expect(verze.forceRefresh()).resolves.toBe('obnovuji');

    expect(reload).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    zkontrolujNavrat(misto, pred);
  });

  it('po Aktualizovat (přepnutí na staženou verzi) zůstane obrazovka, záložka i rozepsaný zápis', async () => {
    const { misto, verze } = await cerstveModuly();
    const pred = rozepis(misto);
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    const zpravy: unknown[] = [];
    let prevezmi: () => void = () => {};
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue({ waiting: { state: 'installed', postMessage: (z: unknown) => { zpravy.push(z); prevezmi(); } }, installing: null }),
        addEventListener: (_j: string, f: () => void) => { prevezmi = f; },
        removeEventListener: () => {},
      },
    });
    const clear = vi.spyOn(Storage.prototype, 'clear');

    await expect(verze.aktualizuj()).resolves.toBe('obnovuji');

    expect(zpravy).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reload).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    zkontrolujNavrat(misto, pred);
  });
});
