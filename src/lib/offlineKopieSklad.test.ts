// 📴 Úložiště kopie tabulek v telefonu: co se stáhlo se signálem, musí přežít zavření appky — a nesmí se
// dostat k jinému účtu. Data v testech jsou vymyšlená.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  KLIC_STAVU_KOPIE, UDALOST_KOPIE, nactiKopii, nastavUzivateleKopie, smazKopie, stavKopie, ulozKopii, ulozStavKopie,
  uzivatelKopieTed, zapomenKopiiProTesty,
} from './offlineKopieSklad';
import { atrapaIndexedDb } from '../test/atrapaIndexedDb';

const RADKY = [{ id: 'b1', name: 'Desítka' }, { id: 'b2', name: 'Jantar' }];
let idb: ReturnType<typeof atrapaIndexedDb>;

/** „Appka se zavřela a znovu otevřela": paměť je pryč, disk zůstal. */
function restart(uzivatel: string | null = 'u1') {
  zapomenKopiiProTesty();
  nastavUzivateleKopie(uzivatel);
}

beforeEach(() => {
  localStorage.clear();
  idb = atrapaIndexedDb();
  vi.stubGlobal('indexedDB', idb.indexedDB);
  restart();
});
afterEach(() => { vi.unstubAllGlobals(); zapomenKopiiProTesty(); });

describe('kopie tabulky', () => {
  it('uložená kopie přežije zavření appky', async () => {
    expect(await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' })).toBe(true);
    restart();
    expect(await nactiKopii('beers')).toEqual({ rows: RADKY, t: 1000, uzivatel: 'u1' });
    expect(await nactiKopii('orders')).toBeNull();
  });

  it('z disku se čte jen jednou — další dotazy bere z paměti', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    restart();
    await nactiKopii('beers'); await nactiKopii('beers'); await nactiKopii('orders'); await nactiKopii('orders');
    expect(idb.stav.cteni).toBe(2);
  });

  it('kopie patří účtu, který ji stáhl: jiný účet ani nepřihlášený z ní nedostane nic', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    restart('u2');
    expect(uzivatelKopieTed()).toBe('u2');
    expect(await nactiKopii('beers')).toBeNull();
    nastavUzivateleKopie(null);
    expect(await nactiKopii('beers')).toBeNull();
    nastavUzivateleKopie('u1');
    expect((await nactiKopii('beers'))?.rows).toEqual(RADKY);
  });

  it('bez přihlášeného se z disku ani nečte', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    restart(null);
    expect(await nactiKopii('beers')).toBeNull();
    expect(idb.stav.cteni).toBe(0);
  });

  it('novější stažení přepíše starší', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    await ulozKopii('beers', { rows: [RADKY[0]], t: 2000, uzivatel: 'u1' });
    expect((await nactiKopii('beers'))?.t).toBe(2000);
    restart();
    expect((await nactiKopii('beers'))?.rows).toEqual([RADKY[0]]);
  });

  it('čerstvě stažená kopie má přednost před tou, která se zrovna čte z disku', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    restart();
    const cteni = nactiKopii('beers');                      // čtení z disku běží…
    await ulozKopii('beers', { rows: [], t: 5000, uzivatel: 'u1' });   // … a mezitím doběhlo stahování
    expect((await cteni)?.t).toBe(5000);
    expect((await nactiKopii('beers'))?.t).toBe(5000);
  });

  it('poškozený záznam na disku se nepoužije', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    const sklad = idb.databaze.get('pivovar-kopie')!.get('tabulky')!;
    for (const spatne of [null, 'text', { rows: 'ne-pole', t: 1, uzivatel: 'u1' }, { rows: [], uzivatel: 'u1' }, { rows: [], t: 1 }]) {
      sklad.set('beers', spatne);
      restart();
      expect(await nactiKopii('beers'), JSON.stringify(spatne)).toBeNull();
    }
  });

  it('když zápis na disk selže (plné úložiště), kopie slouží aspoň do zavření appky', async () => {
    idb.stav.zapisSelze = true;
    expect(await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' })).toBe(false);
    expect((await nactiKopii('beers'))?.rows).toEqual(RADKY);
    restart();
    expect(await nactiKopii('beers')).toBeNull();
  });

  it('bez úložiště v telefonu (soukromé okno) nic nespadne — kopie je jen v paměti', async () => {
    for (const rozbij of [() => vi.stubGlobal('indexedDB', undefined), () => { idb.stav.otevreniSelze = true; }, () => vi.stubGlobal('indexedDB', { open: () => { throw new Error('zakázáno'); } })]) {
      restart();
      rozbij();
      expect(await nactiKopii('beers')).toBeNull();
      expect(await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' })).toBe(false);
      expect((await nactiKopii('beers'))?.rows).toEqual(RADKY);
      await expect(smazKopie()).resolves.toBeUndefined();
      vi.stubGlobal('indexedDB', idb.indexedDB);
      idb.stav.otevreniSelze = false;
    }
  });

  it('smazání (odhlášení) odstraní kopii z paměti i z disku a souhrn', async () => {
    await ulozKopii('beers', { rows: RADKY, t: 1000, uzivatel: 'u1' });
    ulozStavKopie({ uplneT: 1000, posledniT: 1000, uzivatel: 'u1', tabulek: 1, radku: 2, nestazene: [] });
    const zmena = vi.fn();
    window.addEventListener(UDALOST_KOPIE, zmena);
    try {
      await smazKopie();
      expect(zmena).toHaveBeenCalled();
    } finally { window.removeEventListener(UDALOST_KOPIE, zmena); }
    expect(await nactiKopii('beers')).toBeNull();
    restart();
    expect(await nactiKopii('beers')).toBeNull();
    expect(localStorage.getItem(KLIC_STAVU_KOPIE)).toBeNull();
    expect(stavKopie().uplneT).toBeNull();
  });
});

describe('souhrn kopie (pro pruh „bez signálu")', () => {
  it('bez kopie je prázdný', () => {
    expect(stavKopie()).toEqual({ uplneT: null, posledniT: null, uzivatel: null, tabulek: 0, radku: 0, nestazene: [] });
  });

  it('uložení ohlásí změnu a čte se zpátky', () => {
    const zmena = vi.fn();
    window.addEventListener(UDALOST_KOPIE, zmena);
    try {
      ulozStavKopie({ uplneT: 5, posledniT: 7, uzivatel: 'u1', tabulek: 3, radku: 40, nestazene: ['orders'] });
    } finally { window.removeEventListener(UDALOST_KOPIE, zmena); }
    expect(zmena).toHaveBeenCalledTimes(1);
    expect(stavKopie()).toEqual({ uplneT: 5, posledniT: 7, uzivatel: 'u1', tabulek: 3, radku: 40, nestazene: ['orders'] });
  });

  it('poškozený záznam se přečte jako prázdný, ne jako chyba', () => {
    localStorage.setItem(KLIC_STAVU_KOPIE, '{nesmysl');
    expect(stavKopie().tabulek).toBe(0);
    localStorage.setItem(KLIC_STAVU_KOPIE, JSON.stringify({ uplneT: 'včera', posledniT: 7, uzivatel: 5, tabulek: 'tři', radku: null, nestazene: ['a', 4, null] }));
    expect(stavKopie()).toEqual({ uplneT: null, posledniT: 7, uzivatel: null, tabulek: 0, radku: 0, nestazene: ['a'] });
    localStorage.setItem(KLIC_STAVU_KOPIE, '"text"');
    expect(stavKopie().uplneT).toBeNull();
  });
});
