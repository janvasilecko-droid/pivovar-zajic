// Přehled knih v chatu AI sládka (jen vymyšlené knihy — žádný text skutečných knih).
import { describe, expect, it } from 'vitest';
import type { StavDokumentu } from './bibleKnihovna';
import { pocetKnih, prehledKnih, souhrnKnih } from './bibleKnihyChatu';

type Vstup = Parameters<typeof prehledKnih>[0][number];
const kniha = (id: string, nazev: string, stav: StavDokumentu, extra: Partial<Vstup> = {}): Vstup => ({
  id, nazev, autor: null, rok: null, jazyk: null, stav, stran_celkem: null, postup: {}, ...extra,
});

describe('přehled knih v chatu', () => {
  it('zpracované (hotovo, ke kontrole) zná AI; ostatní čekají — a nic se nevydává za známé', () => {
    const p = prehledKnih([
      kniha('1', 'Ležáky', 'hotovo'), kniha('2', 'Kvasnice', 'ke_kontrole'), kniha('3', 'Sladování', 'ceka'),
      kniha('4', 'Voda', 'zpracovava'), kniha('5', 'Chmel', 'chyba'), kniha('6', 'Filtrace', 'pozastaveno'), kniha('7', 'Nové', 'nahrava'),
    ]);
    expect(p.zpracovane.map((k) => k.nazev)).toEqual(['Kvasnice', 'Ležáky']);
    expect(p.zpracovane.every((k) => k.zpracovana)).toBe(true);
    expect(p.ostatni.map((k) => k.nazev)).toEqual(['Voda', 'Sladování', 'Nové', 'Filtrace', 'Chmel']);
    expect(p.ostatni.some((k) => k.zpracovana)).toBe(false);
  });

  it('popis: autor, rok, jazyk a počet stran — jen co je známé', () => {
    const p = prehledKnih([
      kniha('1', 'A', 'hotovo', { autor: ' Novák ', rok: 2004, jazyk: 'de', stran_celkem: 412 }),
      kniha('2', 'B', 'hotovo', { autor: null, rok: null, jazyk: 'cs', stran_celkem: null, postup: { stran: 90 } }),
      kniha('3', 'C', 'hotovo'),
    ]);
    expect(p.zpracovane.map((k) => k.popis)).toEqual(['Novák · 2004 · němčina · 412 stran', 'čeština · 90 stran', '']);
  });

  it('řadí podle abecedy česky (Č za C, CH za H) a prázdný název nahradí', () => {
    const p = prehledKnih([kniha('1', 'Čaj', 'hotovo'), kniha('2', 'Cukr', 'hotovo'), kniha('3', 'Chmel', 'hotovo'), kniha('4', 'Hrnec', 'hotovo'), kniha('5', '   ', 'hotovo')]);
    expect(p.zpracovane.map((k) => k.nazev)).toEqual(['Bez názvu', 'Cukr', 'Čaj', 'Hrnec', 'Chmel']);
  });

  it('textový stav je ten z knihovny (stejná slova jako v Knihovně dokumentů)', () => {
    const p = prehledKnih([kniha('1', 'A', 'ceka'), kniha('2', 'B', 'ke_kontrole')]);
    expect(p.ostatni[0].stavText).toBe('Čeká na zpracování');
    expect(p.zpracovane[0].stavText).toBe('Zpracováno · u pár stran ověř čísla');
  });

  it('prázdná knihovna', () => {
    expect(prehledKnih([])).toEqual({ zpracovane: [], ostatni: [] });
  });
});

describe('souhrn nad seznamem', () => {
  const p = (zpracovane: number, ostatni: number) => prehledKnih([
    ...Array.from({ length: zpracovane }, (_, i) => kniha(`z${i}`, `Z${i}`, 'hotovo')),
    ...Array.from({ length: ostatni }, (_, i) => kniha(`o${i}`, `O${i}`, 'ceka')),
  ]);

  it('počet zpracovaných a kolik jich ještě čeká', () => {
    expect(souhrnKnih(p(3, 0))).toBe('3 knihy');
    expect(souhrnKnih(p(1, 2))).toBe('1 kniha · ještě nezpracováno: 2');
    expect(souhrnKnih(p(7, 1))).toBe('7 knih · ještě nezpracováno: 1');
  });

  it('žádná zpracovaná: řekne to na rovinu, ať se netvrdí, že AI něco zná', () => {
    expect(souhrnKnih(p(0, 0))).toBe('knihovna je zatím prázdná');
    expect(souhrnKnih(p(0, 2))).toBe('zatím žádná zpracovaná kniha · ještě nezpracováno: 2');
  });

  it('skloňování: 1 kniha, 2–4 knihy, 0 a 5+ knih', () => {
    expect([0, 1, 2, 4, 5, 11, 22].map(pocetKnih)).toEqual(['0 knih', '1 kniha', '2 knihy', '4 knihy', '5 knih', '11 knih', '22 knih']);
  });
});
