import { describe, expect, it } from 'vitest';
import {
  cestaKnihy, kapitolaListu, kapitolyProObsah, listyZRejstriku, najdiList, oznaceniListu, rozeberCestuKnihy, sousedniList,
  type KapitolaKnihy, type ListKnihy,
} from './bibleCteni';

const ID = '11111111-2222-3333-4444-555555555555';

describe('trasa čtečky', () => {
  it('kniha a volitelně list; jen platné uuid a kladné číslo', () => {
    expect(cestaKnihy(ID)).toBe(`kniha:${ID}`);
    expect(cestaKnihy(ID, 12)).toBe(`kniha:${ID}:12`);
    expect(cestaKnihy(ID, 0)).toBe(`kniha:${ID}`);
    expect(rozeberCestuKnihy(`kniha:${ID}`)).toEqual({ id: ID, list: null });
    expect(rozeberCestuKnihy(`kniha:${ID.toUpperCase()}:12`)).toEqual({ id: ID, list: 12 });
    expect(rozeberCestuKnihy(`kniha:${ID}:0`)).toEqual({ id: ID, list: null });
    expect(rozeberCestuKnihy(`kniha:${ID}:abc`)).toEqual({ id: ID, list: null });
    for (const s of ['knihovna', 'kniha:', 'kniha:neni-uuid', '', undefined, null, `kniha:${ID}x`]) expect(rozeberCestuKnihy(s), String(s)).toBeNull();
  });
});

describe('rejstřík listů', () => {
  it('kompaktní řádky z bible-api → listy; vadné vynechá a seřadí', () => {
    expect(listyZRejstriku([[2, 'XII', 'o', 1], [1, null, 'v', 0], [3, ' 1 ', 's', 0], ['x'], [0, null, 'v', 0], [4, '', 'z', 0], null])).toEqual([
      { pdfIndex: 1, tistena: null, zdroj: 'vrstva', keKontrole: false },
      { pdfIndex: 2, tistena: 'XII', zdroj: 'ocr', keKontrole: true },
      { pdfIndex: 3, tistena: '1', zdroj: 'soubor', keKontrole: false },
      { pdfIndex: 4, tistena: null, zdroj: 'vrstva', keKontrole: false },
    ]);
    expect(listyZRejstriku(undefined)).toEqual([]);
    expect(listyZRejstriku({})).toEqual([]);
  });

  it('označení místa: tištěná strana, jinak list, u souborů část', () => {
    expect(oznaceniListu({ tistena: '158', zdroj: 'ocr' }, 170)).toBe('s. 158');
    expect(oznaceniListu({ tistena: null, zdroj: 'vrstva' }, 3)).toBe('list 3');
    expect(oznaceniListu({ tistena: null, zdroj: 'soubor' }, 3)).toBe('část 3');
    expect(oznaceniListu(undefined, 9)).toBe('list 9');
  });

  const listy: ListKnihy[] = [
    { pdfIndex: 1, tistena: 'I', zdroj: 'ocr', keKontrole: false },
    { pdfIndex: 2, tistena: '1', zdroj: 'ocr', keKontrole: false },
    { pdfIndex: 3, tistena: '2', zdroj: 'ocr', keKontrole: false },
    { pdfIndex: 5, tistena: '1', zdroj: 'ocr', keKontrole: false },   // příloha čísluje znovu od 1
  ];

  it('sousední list: další a předchozí, na krajích nic, chybějící list → nejbližší', () => {
    expect(sousedniList(listy, 2, 1)).toBe(3);
    expect(sousedniList(listy, 2, -1)).toBe(1);
    expect(sousedniList(listy, 1, -1)).toBeNull();
    expect(sousedniList(listy, 5, 1)).toBeNull();
    expect(sousedniList(listy, 4, 1)).toBe(5);
    expect(sousedniList(listy, 4, -1)).toBe(3);
  });

  it('najdi stranu: tištěné číslo (první výskyt, i římské), jinak pořadí listu', () => {
    expect(najdiList(listy, '1')?.pdfIndex).toBe(2);
    expect(najdiList(listy, 's. 2')?.pdfIndex).toBe(3);
    expect(najdiList(listy, 'i')?.pdfIndex).toBe(1);
    expect(najdiList(listy, '5')?.pdfIndex).toBe(5);
    expect(najdiList(listy, '99')).toBeNull();
    expect(najdiList(listy, '  ')).toBeNull();
    expect(najdiList(listy, 'XX')).toBeNull();
  });
});

describe('kapitoly', () => {
  const kap = (poradi: number, uroven: number, od: number | null, do_: number | null): KapitolaKnihy => ({
    id: `k${poradi}`, rodic_id: null, poradi, uroven, cislo: null, nazev: `Kapitola ${poradi}`, strana_od: od, strana_do: do_,
  });

  it('obsah v pořadí knihy, odsazení nejvýš 3 úrovně', () => {
    const obsah = kapitolyProObsah([kap(2, 2, 5, 9), kap(1, 1, 1, 9), kap(3, 5, 6, 7)]);
    expect(obsah.map((k) => [k.poradi, k.odsazeni])).toEqual([[1, 0], [2, 1], [3, 2]]);
  });

  it('kapitola listu: poslední začatá kapitola, která list obsahuje', () => {
    const kapitoly = [kap(1, 1, 1, 10), kap(2, 2, 4, 6), kap(3, 1, 11, null)];
    expect(kapitolaListu(kapitoly, 5)?.poradi).toBe(2);
    expect(kapitolaListu(kapitoly, 8)?.poradi).toBe(1);
    expect(kapitolaListu(kapitoly, 20)?.poradi).toBe(3);
    expect(kapitolaListu([kap(1, 1, 3, 4)], 1)).toBeNull();
  });
});
