import { describe, it, expect, vi, afterEach } from 'vitest';
import { smiSePredstih, nactiVPredstihu, OBRAZOVKY_V_PREDSTIHU } from './predstih';

function pripojeni(hodnoty: { saveData?: boolean; effectiveType?: string } | undefined) {
  Object.defineProperty(navigator, 'connection', { value: hodnoty, configurable: true });
}

describe('přednačtení obrazovek', () => {
  afterEach(() => { pripojeni(undefined); vi.unstubAllGlobals(); });

  describe('kdy se smí stahovat něco, o co si nikdo neřekl', () => {
    it('na běžném připojení ano', () => {
      pripojeni({ effectiveType: '4g' });
      expect(smiSePredstih()).toBe(true);
    });

    it('se ZAPNUTÝM SPOŘIČEM DAT ne', () => {
      // Stahovat někomu 400 kB, o které si neřekl, když má zapnutý spořič,
      // je drzost — a v pivovaru se jezdí na datech.
      pripojeni({ saveData: true, effectiveType: '4g' });
      expect(smiSePredstih()).toBe(false);
    });

    it('na pomalém připojení ne', () => {
      // Přednačítání by konkurovalo tomu, na co se člověk zrovna dívá.
      pripojeni({ effectiveType: '2g' });
      expect(smiSePredstih()).toBe(false);
      pripojeni({ effectiveType: 'slow-2g' });
      expect(smiSePredstih()).toBe(false);
    });

    it('když to prohlížeč neumí říct, chová se jako dřív', () => {
      pripojeni(undefined);
      expect(smiSePredstih()).toBe(true);
    });
  });

  it('stáhne kusy po jednom', async () => {
    pripojeni({ effectiveType: '4g' });
    const poradi: string[] = [];
    const n = await nactiVPredstihu(
      [
        async () => { poradi.push('a'); },
        async () => { poradi.push('b'); },
      ],
      { odklad: 0, mezi: 0 }
    );
    expect(n).toBe(2);
    expect(poradi).toEqual(['a', 'b']);
  });

  it('na spořiči dat nestáhne NIC', async () => {
    pripojeni({ saveData: true });
    const nacti = vi.fn(async () => {});
    expect(await nactiVPredstihu([nacti], { odklad: 0, mezi: 0 })).toBe(0);
    expect(nacti).not.toHaveBeenCalled();
  });

  it('selhání jednoho kusu nezastaví ostatní', async () => {
    // Je to zrychlení, ne funkce — když se to nepovede, obrazovka se stáhne
    // později jako dřív a uživatel o ničem neví.
    pripojeni({ effectiveType: '4g' });
    const druhy = vi.fn(async () => {});
    const n = await nactiVPredstihu(
      [async () => { throw new Error('síť'); }, druhy],
      { odklad: 0, mezi: 0 }
    );
    expect(druhy).toHaveBeenCalled();
    expect(n).toBe(1);
  });

  it('Objednávky jsou první — nejtěžší kus a klepne se na něj nejdřív', () => {
    expect(OBRAZOVKY_V_PREDSTIHU.length).toBeGreaterThanOrEqual(4);
    expect(String(OBRAZOVKY_V_PREDSTIHU[0])).toContain('OrdersTabbed');
  });

  it('přednačítají se jen obrazovky, které App.tsx opravdu má', async () => {
    // Kdyby se obrazovka přejmenovala, přednačítání by tiše stahovalo nic
    // (import spadne a chyba se polkne) — a nikdo by si toho nevšiml.
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    for (const nacti of OBRAZOVKY_V_PREDSTIHU) {
      const cesta = String(nacti).match(/screens\/(\w+)/)?.[1];
      expect(cesta, String(nacti)).toBeTruthy();
      expect(app, `App.tsx nemá lazy import ./screens/${cesta}`).toContain(`./screens/${cesta}`);
    }
  });
});
