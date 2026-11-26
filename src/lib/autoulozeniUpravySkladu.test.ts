// Úprava skladu se ukládá sama — pravidla (majitel 26. 11. 2026: „…úprava skladu, z toho se to musí ukládat
// a počítat“). Pojistky: nula se ukládá, staré číslo z paměti telefonu ne, při nejistých číslech ne.
import { describe, expect, it } from 'vitest';
import {
  AUTOUKLADANI_MS,
  duvodBlokace,
  polozek,
  radkyNeulozene,
  rozdelNeulozene,
  vetyPruhu,
} from './autoulozeniUpravySkladu';

const radek = (klic: string, napocitano: number | null) => ({ klic, napocitano });
const ulozene = (m: Record<string, number>) => new Map(Object.entries(m));

describe('radkyNeulozene — co se liší od databáze', () => {
  it('nula je napočítaná stejně jako pět, nenapočítané řádky se nepočítají', () => {
    const r = radkyNeulozene([radek('a', 0), radek('b', 5), radek('c', null)], ulozene({}));
    expect(r.map((x) => x.klic)).toEqual(['a', 'b']);
  });

  it('číslo shodné s uloženým se nepočítá, jiné než uložené ano (i změna na nulu)', () => {
    const r = radkyNeulozene([radek('a', 0), radek('b', 5), radek('c', 7)], ulozene({ a: 0, b: 6, c: 7 }));
    expect(r.map((x) => x.klic)).toEqual(['b']);
    expect(radkyNeulozene([radek('a', 0)], ulozene({ a: 3 })).map((x) => x.klic)).toEqual(['a']);
  });
});

describe('rozdelNeulozene — čerstvé smí samo, starší ne', () => {
  it('podle toho, zda se klíč upravil v tomhle otevření', () => {
    const neul = [radek('a', 0), radek('b', 5)];
    const r = rozdelNeulozene(neul, new Set(['b']));
    expect(r.cerstve.map((x) => x.klic)).toEqual(['b']);
    expect(r.starsi.map((x) => x.klic)).toEqual(['a']);
  });

  it('bez upravených klíčů je všechno „starší“ (koncept z paměti telefonu)', () => {
    const r = rozdelNeulozene([radek('a', 0)], new Set());
    expect(r.cerstve).toEqual([]);
    expect(r.starsi).toHaveLength(1);
  });
});

describe('duvodBlokace — kdy se samo neukládá', () => {
  const ok = { maKnihu: true, bezi: false, uklada: false, zPameti: false, chybaNacteni: false, selhaloUlozeni: false };
  it('všechno v pořádku = smí', () => {
    expect(duvodBlokace(ok)).toBeNull();
  });
  it.each([
    [{ maKnihu: false }, 'nacita'],
    [{ bezi: true }, 'nacita'],
    [{ uklada: true }, 'uklada'],
    [{ zPameti: true }, 'z-pameti'],
    [{ chybaNacteni: true }, 'chyba-nacteni'],
    [{ selhaloUlozeni: true }, 'chyba-ulozeni'],
  ] as const)('%j → %s', (zmena, duvod) => {
    expect(duvodBlokace({ ...ok, ...zmena })).toBe(duvod);
  });
  it('čísla z paměti telefonu mají přednost před dřívějším selháním uložení', () => {
    expect(duvodBlokace({ ...ok, zPameti: true, selhaloUlozeni: true })).toBe('z-pameti');
  });
});

describe('texty pruhu', () => {
  it('množná čísla', () => {
    expect([1, 2, 4, 5, 12].map(polozek)).toEqual(['1 položka', '2 položky', '4 položky', '5 položek', '12 položek']);
  });

  it('čerstvé a smí: „uloží se samo za chvilku“', () => {
    const v = vetyPruhu({ cerstve: 1, starsi: 0, blokace: null });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/^Čeká na uložení: 1 položka — uloží se samo za chvilku/);
    expect(v[0]).toMatch(/Sklad ani Rozbor s tím zatím nepočítají/);
    expect(vetyPruhu({ cerstve: 3, starsi: 0, blokace: null })[0]).toMatch(/^Čeká na uložení: 3 položky —/);
    expect(vetyPruhu({ cerstve: 7, starsi: 0, blokace: 'uklada' })[0]).toMatch(/^Čeká na uložení: 7 položek —/);
  });

  it('čísla z paměti telefonu: samo se neuloží a řekne se co dál', () => {
    const [v] = vetyPruhu({ cerstve: 2, starsi: 0, blokace: 'z-pameti' });
    expect(v).toMatch(/^Napočítáno, ale neuloženo: 2 položky\./);
    expect(v).toMatch(/Samo se to neuloží, protože čísla „Čeká se“ jsou z paměti telefonu/);
    expect(v).toMatch(/„Načíst znovu“ a pak na „Uložit vše“/);
    expect(v).not.toMatch(/uloží se samo za chvilku/);
  });

  it('selhání načtení i uložení má vlastní větu', () => {
    expect(vetyPruhu({ cerstve: 1, starsi: 0, blokace: 'chyba-nacteni' })[0]).toMatch(/nepodařilo načíst aktuální stav/);
    expect(vetyPruhu({ cerstve: 1, starsi: 0, blokace: 'chyba-ulozeni' })[0]).toMatch(/automatické uložení se nepovedlo/);
  });

  it('starší čísla z dřívějška: nikdy „uloží se samo“, vysvětlí proč', () => {
    const v = vetyPruhu({ cerstve: 0, starsi: 2, blokace: null });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/^Napočítáno dřív a neuloženo: 2 položky\./);
    expect(v[0]).toMatch(/sama se neuloží \(platila by až od dneška\)/);
    expect(v[0]).not.toMatch(/uloží se samo za chvilku/);
  });

  it('čerstvé i starší najednou = dvě věty; nic = žádná', () => {
    expect(vetyPruhu({ cerstve: 1, starsi: 1, blokace: null })).toHaveLength(2);
    expect(vetyPruhu({ cerstve: 0, starsi: 0, blokace: null })).toEqual([]);
  });

  it('pauza před uložením je do pár sekund', () => {
    expect(AUTOUKLADANI_MS).toBeGreaterThanOrEqual(1500);
    expect(AUTOUKLADANI_MS).toBeLessThanOrEqual(5000);
  });
});
