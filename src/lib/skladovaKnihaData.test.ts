// Načtení skladové knihy (lib/skladovaKnihaData.ts).
// 15. 10. 2026: „občas se nechce načíst sklad", Jantar 50 l „na začátku 3"
// místo 2. Chybějící tabulka se dřív brala jako prázdná, takže se kniha
// poskládala z neúplných dat a ukázala číslo, které nesedělo. Teď to musí
// spadnout nahlas.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  radky: {} as Record<string, any[]>,
  chyby: {} as Record<string, { message: string }>,
  bezDat: new Set<string>(),
  zPameti: new Set<string>(),
  navic: null as null | (() => void),
}));

const odpoved = (tabulka: string) => ({
  data: h.chyby[tabulka] || h.bezDat.has(tabulka) ? null : (h.radky[tabulka] ?? []).map((r) => ({ ...r })),
  error: h.chyby[tabulka] ?? null,
  ...(h.zPameti.has(tabulka) ? { zPameti: true } : {}),
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (tabulka: string) => {
      const q: any = {
        select: () => q, order: () => q,
        then: (ok: (r: any) => any, ko?: (e: any) => any) => Promise.resolve(odpoved(tabulka)).then(ok, ko),
      };
      return q;
    },
  },
}));
vi.mock('./sdilenaData', () => ({
  nactiSdilenouTabulku: async (tabulka: string) => {
    h.navic?.();
    return odpoved(tabulka);
  },
}));

import { nactiSkladovouKnihu } from './skladovaKnihaData';
import { NeuplnaDataError, vycistiZPameti, zapisZPameti } from './zPameti';

beforeEach(() => {
  vycistiZPameti();
  h.radky = {
    beers: [{ id: 'b50', name: 'Jantar', is_active: true }],
    packages: [{ id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }],
    inventory: [{ entry_date: '2026-10-01', beer_id: 'b50', package_id: 'k50', quantity: 2, note: 'Počáteční stav' }],
  };
  h.chyby = {};
  h.bezDat = new Set();
  h.zPameti = new Set();
  h.navic = null;
});

describe('nactiSkladovouKnihu', () => {
  it('z úplných dat poskládá pohyby a katalogy', async () => {
    const k = await nactiSkladovouKnihu();
    expect(k.piva.map((b) => b.name)).toEqual(['Jantar']);
    expect(k.obaly.map((o) => o.label)).toEqual(['KEG 50l']);
    expect(k.pohyby.length).toBeGreaterThan(0);
    expect(k.inventura).toHaveLength(1);
    expect(k.zPameti).toBeUndefined();
  });

  it('když se nenačetla některá tabulka, kniha se neposkládá a chyba řekne která', async () => {
    h.chyby = { fasovani: { message: 'fetch failed' } };
    await expect(nactiSkladovouKnihu()).rejects.toBeInstanceOf(NeuplnaDataError);
    await expect(nactiSkladovouKnihu()).rejects.toThrow(/fasování/);
  });

  it('vypíše všechny chybějící zdroje, ne jen první', async () => {
    h.chyby = { kegging: { message: 'x' }, zavoz_deductions: { message: 'y' } };
    const chyba = await nactiSkladovouKnihu().catch((e) => e as NeuplnaDataError);
    expect(chyba).toBeInstanceOf(NeuplnaDataError);
    expect((chyba as NeuplnaDataError).zdroje).toEqual(['stáčení KEG', 'závozy']);
  });

  it('tabulka, která vrátila null místo řádků, se taky nebere jako prázdná', async () => {
    h.bezDat = new Set(['inventory']);
    await expect(nactiSkladovouKnihu()).rejects.toThrow(/inventura/);
  });

  it('chyba katalogu piv taky shodí načtení (jména by chyběla)', async () => {
    h.chyby = { beers: { message: 'permission denied' } };
    await expect(nactiSkladovouKnihu()).rejects.toThrow(/piva/);
  });

  it('každý ze dvanácti zdrojů se hlídá', async () => {
    const tabulky: Record<string, string> = {
      beers: 'piva', packages: 'obaly', bottling: 'stáčení lahví', kegging: 'stáčení KEG',
      fasovani: 'fasování', fasovani_private: 'prodejna', writeoffs: 'odpisy', inventory: 'inventura',
      inventory_adjustments: 'opravy skladu', zavoz_deductions: 'závozy', akce: 'akce', keg_prefuk: 'přefuk',
    };
    for (const [tabulka, nazev] of Object.entries(tabulky)) {
      h.chyby = { [tabulka]: { message: 'x' } };
      const chyba = await nactiSkladovouKnihu().catch((e) => e as NeuplnaDataError);
      expect((chyba as NeuplnaDataError).zdroje, tabulka).toEqual([nazev]);
    }
  });

  it('tabulka z paměti telefonu: kniha vznikne, ale je poznačená', async () => {
    h.zPameti = new Set(['fasovani']);
    const k = await nactiSkladovouKnihu();
    expect(k.zPameti).toBe(true);
    expect(k.pohyby.length).toBeGreaterThan(0);
  });

  it('odpověď z paměti telefonu kdekoliv během načítání (i mimo sdílené tabulky) se pozná', async () => {
    h.navic = () => zapisZPameti(Date.now() + 5);
    const k = await nactiSkladovouKnihu();
    expect(k.zPameti).toBe(true);
  });

  it('výpadek PŘED načítáním se nezapočítá', async () => {
    zapisZPameti(Date.now() - 60_000);
    const k = await nactiSkladovouKnihu();
    expect(k.zPameti).toBeUndefined();
  });
});
