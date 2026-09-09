/**
 * Zavírání dialogu tlačítkem Zpět (lib/zavriNaZpet.ts).
 *
 * Chování bylo dřív jen uvnitř `<Modal>`; třináct dialogů, které si
 * `fixed inset-0` kreslí samy, ho nemělo a Zpět v nich odešel z celé
 * obrazovky i s rozepsanou prací. Test hlídá obojí: že se při otevření
 * přidá krok do historie a že popstate zavolá zavření.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  describe('rozhodnutí zavolat back() se odloží na mikrotask', () => {
    // jsdom `history.back()`/`popstate` mezi sebou nepropojuje vůbec (ověřeno
    // — po `back()` se `history.state` v jsdom nezmění a žádný `popstate`
    // nepřijde ani po mikrotasku, ani po `setTimeout`), takže skutečný
    // souběh dvou dialogů nejde v testu zopakovat přes opravdovou navigaci.
    // Tenhle test proto ověřuje mechanismus přímo: `window.history.back`
    // se nesmí zavolat SYNCHRONNĚ v úklidu (dokud případný nový dialog ve
    // stejném commitu nestihl pushnout svůj vlastní záznam), ale až
    // v mikrotasku po něm.
    //
    // Skutečný případ, který tohle řeší: potvrzení "Dokončeno stáčení" se
    // zavře a ve stejné obsluze kliknutí ("Končím") se rovnou otevře
    // checklist — jeden React commit. Bez zpoždění by `back()` z prvního
    // dialogu spadl AŽ PO pushi toho druhého a odpopnul by ZÁZNAM TOHO
    // DRUHÉHO — checklist by se sám zavřel ve chvíli, kdy se otvírá.
    let backSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {}); });
    afterEach(() => { backSpy.mockRestore(); });

    it('po zavření dialogu se back() nezavolá hned, jen po mikrotasku', async () => {
      const { unmount } = renderHook(() => useZavriNaZpet(true, () => {}));
      unmount();
      expect(backSpy).not.toHaveBeenCalled();
      await act(async () => { await Promise.resolve(); });
      expect(backSpy).toHaveBeenCalledTimes(1);
    });

    it('když mezitím (ve stejném commitu) přibude nový záznam, back() se přeskočí', async () => {
      const { unmount } = renderHook(() => useZavriNaZpet(true, () => {}));
      // Simulace: ve STEJNÉM tiku, kdy se starý dialog zavírá, se otevře
      // nový a pushne si vlastní záznam — přesně to, co ve skutečné appce
      // dělá druhý `useZavriNaZpet` mountnutý ve stejném commitu.
      unmount();
      window.history.pushState({ modalOpen: true, modalId: 'novy-dialog' }, '');
      await act(async () => { await Promise.resolve(); });
      expect(backSpy).not.toHaveBeenCalled();
    });
  });
});
