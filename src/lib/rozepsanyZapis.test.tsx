// Rozepsaný zápis (lib/rozepsanyZapis.ts).
// 15. 10. 2026: „když zadávám fasování nebo stáčení, ať se data, pokud je
// nepotvrdím, nevymažou… ať to tam je, než se to potvrdí, nebo se to musí
// ručně smazat."
import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { jakoText, nactiKoncept, platneDatum, radkyZKonceptu, smazKoncept, ulozKoncept, useRozepsanyZapis } from './rozepsanyZapis';

type Koncept = { radky: { pivo: string; mnozstvi: string }[]; poznamka: string };
const jePlatny = (d: unknown): d is Koncept => {
  const o = d as Partial<Koncept> | null;
  return !!o && Array.isArray(o.radky) && typeof o.poznamka === 'string';
};
const jeCo = (d: Koncept) => d.radky.some((r) => r.pivo && Number(r.mnozstvi) > 0) || d.poznamka.trim() !== '';
const prazdny = (): Koncept => ({ radky: [{ pivo: '', mnozstvi: '' }], poznamka: '' });

const KLIC = 'rozepsane_test';

beforeEach(() => { localStorage.clear(); });

describe('nactiKoncept / ulozKoncept', () => {
  it('uložený koncept se vrátí i s časem uložení', () => {
    const kdy = new Date('2026-10-15T11:05:00Z');
    ulozKoncept(KLIC, { radky: [{ pivo: 'b12', mnozstvi: '30' }], poznamka: '' }, kdy);
    const k = nactiKoncept(KLIC, jePlatny);
    expect(k?.data).toEqual({ radky: [{ pivo: 'b12', mnozstvi: '30' }], poznamka: '' });
    expect(k?.ulozeno).toBe('2026-10-15T11:05:00.000Z');
  });

  it('nic uloženého = null', () => {
    expect(nactiKoncept(KLIC, jePlatny)).toBeNull();
  });

  it('starší záznam bez času (z dřívější verze) se načte, čas je null', () => {
    localStorage.setItem(KLIC, JSON.stringify({ radky: [{ pivo: 'b12', mnozstvi: '3' }], poznamka: '' }));
    const k = nactiKoncept(KLIC, jePlatny);
    expect(k?.ulozeno).toBeNull();
    expect(k?.data.radky).toHaveLength(1);
  });

  it('rozbitý JSON, pole nebo špatný tvar se zahodí, ne vrátí do formuláře', () => {
    localStorage.setItem(KLIC, '{nedopsané');
    expect(nactiKoncept(KLIC, jePlatny)).toBeNull();
    localStorage.setItem(KLIC, JSON.stringify([1, 2, 3]));
    expect(nactiKoncept(KLIC, jePlatny)).toBeNull();
    localStorage.setItem(KLIC, JSON.stringify({ radky: 'ne pole', poznamka: '' }));
    expect(nactiKoncept(KLIC, jePlatny)).toBeNull();
    localStorage.setItem(KLIC, JSON.stringify('text'));
    expect(nactiKoncept(KLIC, jePlatny)).toBeNull();
  });

  it('smazKoncept uklidí záznam', () => {
    ulozKoncept(KLIC, prazdny());
    smazKoncept(KLIC);
    expect(localStorage.getItem(KLIC)).toBeNull();
  });
});

describe('jakoText', () => {
  it('řetězec a konečné číslo projdou, ostatní je prázdné políčko', () => {
    expect(jakoText('12')).toBe('12');
    expect(jakoText(5)).toBe('5');
    expect(jakoText(undefined)).toBe('');
    expect(jakoText(null)).toBe('');
    expect(jakoText({})).toBe('');
    expect(jakoText(NaN)).toBe('');
  });
});

describe('radkyZKonceptu', () => {
  type Radek = { beerId: string; pkgId: string; qty: string; vycep: boolean; who?: string };
  const prazdnyRadek = (): Radek => ({ beerId: '', pkgId: '', qty: '', vycep: false, who: '' });

  it('řádky se vrátí se všemi poli a doplní se na minimální počet', () => {
    const r = radkyZKonceptu([{ beerId: 'b12', pkgId: 'k30', qty: '4', vycep: true, who: 'Jan' }], prazdnyRadek, 3);
    expect(r).toHaveLength(3);
    expect(r[0]).toEqual({ beerId: 'b12', pkgId: 'k30', qty: '4', vycep: true, who: 'Jan' });
    expect(r[1]).toEqual(prazdnyRadek());
  });

  it('políčko, které koncept nezná (starší verze), je prázdné — ne undefined', () => {
    const r = radkyZKonceptu([{ beerId: 'b12', pkgId: 'k30', qty: '4' }], prazdnyRadek, 1);
    expect(r[0]).toEqual({ beerId: 'b12', pkgId: 'k30', qty: '4', vycep: false, who: '' });
  });

  it('cizí pole se zahodí a hodnoty špatného typu se opraví', () => {
    const r = radkyZKonceptu([{ beerId: 7, pkgId: null, qty: { a: 1 }, vycep: 'ano', who: ['x'], cizi: 'nic' }], prazdnyRadek, 1);
    expect(r[0]).toEqual({ beerId: '7', pkgId: '', qty: '', vycep: false, who: '' });
    expect(r[0]).not.toHaveProperty('cizi');
  });

  it('nesmysl místo řádků = prázdný formulář; prvky, co nejsou objekty, se přeskočí', () => {
    expect(radkyZKonceptu('ne pole', prazdnyRadek, 2)).toEqual([prazdnyRadek(), prazdnyRadek()]);
    expect(radkyZKonceptu([null, 5, 'a', [1], { beerId: 'b' }], prazdnyRadek, 1)).toEqual([{ ...prazdnyRadek(), beerId: 'b' }]);
  });

  it('víc řádků, než je minimum, se nezkracuje', () => {
    const r = radkyZKonceptu(Array.from({ length: 15 }, (_, i) => ({ beerId: `b${i}` })), prazdnyRadek, 12);
    expect(r).toHaveLength(15);
    expect(r[14].beerId).toBe('b14');
  });

  it('každý řádek je vlastní objekt (úprava jednoho se nepromítne do dalších)', () => {
    const r = radkyZKonceptu([], prazdnyRadek, 2);
    r[0].qty = '9';
    expect(r[1].qty).toBe('');
  });
});

describe('platneDatum', () => {
  it('jen RRRR-MM-DD', () => {
    expect(platneDatum('2026-10-15')).toBe('2026-10-15');
    expect(platneDatum('15. 10. 2026')).toBeNull();
    expect(platneDatum('')).toBeNull();
    expect(platneDatum(undefined)).toBeNull();
    expect(platneDatum(20261015)).toBeNull();
  });
});

/** Formulář tak, jak ho používají obrazovky: stav + hook. */
function formular(klic = KLIC) {
  return renderHook(({ k }: { k: string }) => {
    const [data, setData] = useState<Koncept>(prazdny());
    const { obnoveno } = useRozepsanyZapis<Koncept>({ klic: k, data, jeCo, jePlatny, naObnovu: setData });
    return { data, setData, obnoveno };
  }, { initialProps: { k: klic } });
}

describe('useRozepsanyZapis', () => {
  it('rozepsané řádky se uloží do zařízení', () => {
    const { result } = formular();
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '30' }], poznamka: '' }); });
    expect(nactiKoncept(KLIC, jePlatny)?.data.radky[0]).toEqual({ pivo: 'b12', mnozstvi: '30' });
  });

  it('po zavření a znovuotevření obrazovky se rozepsané vrátí a obrazovka řekne, že je obnovené', () => {
    const prvni = formular();
    act(() => { prvni.result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '30' }], poznamka: 'ranní směna' }); });
    prvni.unmount();

    const druhy = formular();
    expect(druhy.result.current.data.radky[0]).toEqual({ pivo: 'b12', mnozstvi: '30' });
    expect(druhy.result.current.data.poznamka).toBe('ranní směna');
    expect(druhy.result.current.obnoveno).not.toBeNull();
    expect(druhy.result.current.obnoveno?.ulozeno).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('prázdný výchozí stav nepřepíše uložený koncept dřív, než se vrátí', () => {
    ulozKoncept(KLIC, { radky: [{ pivo: 'b11', mnozstvi: '12' }], poznamka: '' });
    formular();
    // Hned po prvním vykreslení musí koncept v úložišti pořád být.
    expect(nactiKoncept(KLIC, jePlatny)?.data.radky[0].pivo).toBe('b11');
  });

  it('formulář bez obsahu (po uložení do databáze, po „Vymazat vše") koncept smaže', () => {
    const { result } = formular();
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '30' }], poznamka: '' }); });
    expect(localStorage.getItem(KLIC)).not.toBeNull();
    act(() => { result.current.setData(prazdny()); });
    expect(localStorage.getItem(KLIC)).toBeNull();
    expect(result.current.obnoveno).toBeNull();
  });

  it('prázdný formulář nic neukládá', () => {
    formular();
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('jen vybrané pivo bez množství není co ztratit — neukládá se', () => {
    const { result } = formular();
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '' }], poznamka: '' }); });
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('samotná poznámka se ukládá', () => {
    const { result } = formular();
    act(() => { result.current.setData({ radky: [{ pivo: '', mnozstvi: '' }], poznamka: 'pozor na sudy' }); });
    expect(nactiKoncept(KLIC, jePlatny)?.data.poznamka).toBe('pozor na sudy');
  });

  it('upozornění „obnoveno" zmizí, jakmile se formulář vyprázdní', () => {
    ulozKoncept(KLIC, { radky: [{ pivo: 'b12', mnozstvi: '3' }], poznamka: '' });
    const { result } = formular();
    expect(result.current.obnoveno).not.toBeNull();
    act(() => { result.current.setData(prazdny()); });
    expect(result.current.obnoveno).toBeNull();
  });

  it('uložený koncept bez obsahu (prázdná zbytková data) se do formuláře nevrací', () => {
    localStorage.setItem(KLIC, JSON.stringify({ radky: [{ pivo: '', mnozstvi: '' }], poznamka: '' }));
    const { result } = formular();
    expect(result.current.obnoveno).toBeNull();
  });

  it('změna klíče: rozepsané řádky se přenesou pod nový klíč a starý koncept se smaže (žádný přízrak)', () => {
    const { result, rerender } = formular('rozepsane_fasovani');
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '4' }], poznamka: '' }); });
    expect(localStorage.getItem('rozepsane_fasovani')).not.toBeNull();

    rerender({ k: 'rozepsane_odpis' });
    expect(nactiKoncept('rozepsane_odpis', jePlatny)?.data.radky[0]).toEqual({ pivo: 'b12', mnozstvi: '4' });
    expect(localStorage.getItem('rozepsane_fasovani')).toBeNull();
    expect(result.current.data.radky[0]).toEqual({ pivo: 'b12', mnozstvi: '4' });
  });

  it('změna klíče na takový, který má vlastní koncept: vrátí se ten a původní zůstane uložený', () => {
    ulozKoncept('rozepsane_odpis', { radky: [{ pivo: 'b10', mnozstvi: '7' }], poznamka: '' });
    const { result, rerender } = formular('rozepsane_fasovani');
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '4' }], poznamka: '' }); });

    rerender({ k: 'rozepsane_odpis' });
    expect(result.current.data.radky[0]).toEqual({ pivo: 'b10', mnozstvi: '7' });
    expect(nactiKoncept('rozepsane_fasovani', jePlatny)?.data.radky[0].pivo).toBe('b12');
    expect(nactiKoncept('rozepsane_odpis', jePlatny)?.data.radky[0].pivo).toBe('b10');
  });

  it('při změně klíče se do nového klíče nezapíše starý obsah dřív, než proběhne obnova', () => {
    ulozKoncept('rozepsane_odpis', { radky: [{ pivo: 'b10', mnozstvi: '7' }], poznamka: '' });
    const { result, rerender } = formular('rozepsane_fasovani');
    act(() => { result.current.setData({ radky: [{ pivo: 'b12', mnozstvi: '4' }], poznamka: '' }); });
    rerender({ k: 'rozepsane_odpis' });
    // Vlastní koncept nového klíče nesmí být přepsán obsahem z toho předchozího.
    expect(nactiKoncept('rozepsane_odpis', jePlatny)?.data.radky[0].pivo).toBe('b10');
  });
});
