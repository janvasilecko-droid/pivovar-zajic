import { afterEach, describe, expect, it, vi } from 'vitest';
import { ulozKoncept, nactiKoncept } from './rozepsanyZapis';
import { nactiMistoPoAktualizaci, ulozMistoPredObnovou, zapamatujMisto } from './mistoPoAktualizaci';

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
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });

  it('po Aktualizovat zůstane obrazovka, záložka i rozepsaný zápis', async () => {
    ulozKoncept(KLIC, { entryRows: [{ qty: '40' }], date: '2026-10-26', note: 'půlka palety' });
    const pred = localStorage.getItem(KLIC);
    zapamatujMisto('bottling', 'zapis');

    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { reload },
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
    const clear = vi.spyOn(Storage.prototype, 'clear');

    const { forceRefresh } = await import('./versionCheck');
    await forceRefresh();

    expect(reload).toHaveBeenCalledOnce();
    expect(clear).not.toHaveBeenCalled();
    expect(localStorage.getItem(KLIC)).toBe(pred);

    const misto = nactiMistoPoAktualizaci();
    expect(misto).toEqual({ page: 'bottling', subTab: 'zapis' });
    expect(nactiKoncept(KLIC, jeKoncept)?.data.note).toBe('půlka palety');
    expect(nactiKoncept(KLIC, jeKoncept)?.data.entryRows[0].qty).toBe('40');
    expect(sessionStorage.getItem('misto_po_aktualizaci')).toBeNull();
  });
});
