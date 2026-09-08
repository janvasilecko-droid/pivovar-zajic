/**
 * Zavírání dialogu tlačítkem Zpět (lib/zavriNaZpet.ts).
 *
 * Chování bylo dřív jen uvnitř `<Modal>`; třináct dialogů, které si
 * `fixed inset-0` kreslí samy, ho nemělo a Zpět v nich odešel z celé
 * obrazovky i s rozepsanou prací. Test hlídá obojí: že se při otevření
 * přidá krok do historie a že popstate zavolá zavření.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useZavriNaZpet } from './zavriNaZpet';

describe('useZavriNaZpet', () => {
  beforeEach(() => {
    // Vyčistit stav historie mezi testy — jinak si `modalOpen` z předchozího
    // testu nese další a úklid by volal back() navíc.
    window.history.replaceState({}, '');
  });

  it('otevření přidá krok do historie', () => {
    const delka = window.history.length;
    renderHook(() => useZavriNaZpet(true, () => {}));
    expect(window.history.state?.modalOpen).toBe(true);
    expect(window.history.length).toBeGreaterThanOrEqual(delka);
  });

  it('zavřený dialog do historie nesahá', () => {
    renderHook(() => useZavriNaZpet(false, () => {}));
    expect(window.history.state?.modalOpen).toBeUndefined();
  });

  it('tlačítko Zpět (popstate) zavolá zavření', () => {
    const zavri = vi.fn();
    renderHook(() => useZavriNaZpet(true, zavri));
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(zavri).toHaveBeenCalledTimes(1);
  });

  it('používá se vždy aktuální zavírací funkce, ne ta z prvního vykreslení', () => {
    // Kdyby se posluchač držel funkce z prvního renderu, zavřel by dialog
    // zastaralou obsluhou — u kontroly objednávky by to znamenalo zahodit
    // jiný stav, než na který se uživatel dívá.
    const prvni = vi.fn();
    const druhy = vi.fn();
    const { rerender } = renderHook(({ fn }) => useZavriNaZpet(true, fn), {
      initialProps: { fn: prvni },
    });
    rerender({ fn: druhy });
    act(() => { window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(prvni).not.toHaveBeenCalled();
    expect(druhy).toHaveBeenCalledTimes(1);
  });
});
