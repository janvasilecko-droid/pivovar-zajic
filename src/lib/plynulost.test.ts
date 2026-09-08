import { describe, it, expect, beforeEach, vi } from 'vitest';
import { vyhodnot, maSeMerit, uzNabidnuto, hlidejPlynulost } from './plynulost';
import { nastavEfekty } from './efekty';

describe('měření plynulosti na skutečném telefonu', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = '';
  });

  describe('vyhodnocení naměřených snímků', () => {
    const snimky = (n: number, ms: number) => Array(n).fill(ms);

    it('plynulý telefon (16,7 ms) se nehlásí', () => {
      expect(vyhodnot(snimky(180, 16.7)).seka).toBe(false);
    });

    it('trhající se telefon se pozná', () => {
      // Polovina snímků přes 34 ms — to člověk vidí jako škubání.
      const v = vyhodnot([...snimky(90, 16.7), ...snimky(90, 50)]);
      expect(v.seka).toBe(true);
      expect(v.podil).toBeCloseTo(0.5, 1);
    });

    it('pár trhnutí ještě není sekání', () => {
      // 5 % dlouhých snímků má i rychlý telefon (uklízení paměti apod.).
      const v = vyhodnot([...snimky(171, 16.7), ...snimky(9, 60)]);
      expect(v.seka).toBe(false);
    });

    it('z mála snímků se NIC nevyvozuje', () => {
      // Uživatel odešel z appky hned po startu. Radši mlčet než hádat.
      expect(vyhodnot(snimky(10, 200)).seka).toBe(false);
    });

    it('nesmyslně dlouhé snímky se zahazují', () => {
      // Telefon uspaný v kapse vyrobí jeden snímek dlouhý minuty; kdyby se
      // počítal, hlásila by appka sekání každému, kdo ji nechal otevřenou.
      const v = vyhodnot([...snimky(180, 16.7), 60000]);
      expect(v.snimku).toBe(180);
      expect(v.seka).toBe(false);
    });

    it('rozhoduje počet zahozených snímků, ne průměr', () => {
      // Průměr 20 ms vypadá dobře, ale každý pátý snímek je trhnutí —
      // a přesně to člověk vnímá.
      const v = vyhodnot([...snimky(144, 8), ...snimky(36, 68)]);
      expect(v.median).toBeLessThan(20);
      expect(v.seka).toBe(true);
    });
  });

  describe('kdy se vůbec měří', () => {
    it('měří se, dokud se nic nenabídlo', () => {
      expect(maSeMerit()).toBe(true);
    });

    it('když jsou efekty vypnuté, není co nabízet', () => {
      nastavEfekty(true);
      expect(maSeMerit()).toBe(false);
    });

    /** Sekající telefon: každý snímek 50 ms. Bez podvržených časovačů —
        ty ve Vitestu podvrhují i requestAnimationFrame a vlastní stub přebijí. */
    function sekajiciTelefon() {
      let cas = 0;
      const puvodni = performance.now;
      vi.spyOn(performance, 'now').mockImplementation(() => cas);
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
        cas += 50;
        setTimeout(cb, 0);
        return 1;
      });
      return () => { vi.unstubAllGlobals(); performance.now = puvodni; };
    }

    it('nabídne se JEDNOU za život instalace', async () => {
      const nabidni = vi.fn();
      const uklid = sekajiciTelefon();
      const vysledek = await hlidejPlynulost(nabidni, { odklad: 0, pocet: 60 });
      uklid();

      expect(vysledek?.seka).toBe(true);
      expect(nabidni).toHaveBeenCalledOnce();
      expect(uzNabidnuto()).toBe(true);
      // Podruhé už se ani neměří.
      expect(maSeMerit()).toBe(false);
      expect(await hlidejPlynulost(nabidni, { odklad: 0, pocet: 60 })).toBe(null);
    });

    it('nabídka opravdu vypne efekty, když se na ni klikne', async () => {
      // Text nabídky i její tlačítko jsou k ničemu, když ten druhý krok
      // nefunguje — proto se ověřuje, co ta předaná funkce udělá.
      let zapniEfekty: (() => void) | null = null;
      const uklid = sekajiciTelefon();
      await hlidejPlynulost((_t, zapnout) => { zapniEfekty = zapnout; }, { odklad: 0, pocet: 60 });
      uklid();

      expect(zapniEfekty).toBeTypeOf('function');
      zapniEfekty!();
      expect(document.documentElement.classList.contains('mene-efektu')).toBe(true);
    });

    it('plynulý telefon se neptá vůbec', async () => {
      let cas = 0;
      const puvodni = performance.now;
      vi.spyOn(performance, 'now').mockImplementation(() => cas);
      vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { cas += 16.7; setTimeout(cb, 0); return 1; });
      const nabidni = vi.fn();
      const v = await hlidejPlynulost(nabidni, { odklad: 0, pocet: 60 });
      vi.unstubAllGlobals(); performance.now = puvodni;

      expect(v?.seka).toBe(false);
      expect(nabidni).not.toHaveBeenCalled();
      // A hlavně: nabídka zůstává k dispozici do příště, nespotřebovala se.
      expect(uzNabidnuto()).toBe(false);
    });
  });
});
