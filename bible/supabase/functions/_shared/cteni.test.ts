// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  celeCislo, druhObjektu, jeCitelny, listyPodStropem, MAX_ZNAKU_ODPOVEDI, nahled, rejstrikListu, STRANKA_DB, vsechnyRadky,
  zpravaNezpracovano,
} from './cteni';
import { ChybaVstupu } from './vstupy';

describe('kdy jde kniha číst', () => {
  it('jen hotovo a ke_kontrole — jinak jsou kapitoly a pasáže napůl zapsané', () => {
    expect(jeCitelny('hotovo')).toBe(true);
    expect(jeCitelny('ke_kontrole')).toBe(true);
    for (const s of ['nahrava', 'ceka', 'zpracovava', 'chyba', 'pozastaveno', '', null, undefined, 1]) expect(jeCitelny(s), String(s)).toBe(false);
  });

  it('zpráva podle stavu, česky a bez obsahu knihy', () => {
    expect(zpravaNezpracovano('zpracovava')).toMatch(/právě zpracovává/);
    expect(zpravaNezpracovano('ceka')).toMatch(/čeká na zpracování/);
    expect(zpravaNezpracovano('chyba')).toMatch(/nepodařilo zpracovat/);
    expect(zpravaNezpracovano('pozastaveno')).toMatch(/pozastavené/);
    expect(zpravaNezpracovano('nahrava')).toMatch(/nahrává/);
    expect(zpravaNezpracovano('neco')).toBe('Kniha ještě není zpracovaná.');
  });
});

describe('vstupy čtení', () => {
  it('celé číslo v rozsahu, výchozí hodnota jen když chybí', () => {
    expect(celeCislo(5, 'List', 1, 10)).toBe(5);
    expect(celeCislo(undefined, 'Počet', 1, 3, 1)).toBe(1);
    expect(celeCislo(null, 'Počet', 1, 3, 2)).toBe(2);
    expect(() => celeCislo(undefined, 'List', 1, 10)).toThrow(ChybaVstupu);
    expect(() => celeCislo(0, 'List', 1, 10)).toThrow(/1–10/);
    expect(() => celeCislo(11, 'List', 1, 10)).toThrow(ChybaVstupu);
    expect(() => celeCislo(1.5, 'List', 1, 10)).toThrow(/celé číslo/);
    expect(() => celeCislo('3', 'List', 1, 10)).toThrow(/celé číslo/);
  });

  it('druh objektu: tabulka, vzorec, popisek, nebo nic (vše)', () => {
    expect(druhObjektu('tabulka')).toBe('tabulka');
    expect(druhObjektu('vzorec')).toBe('vzorec');
    expect(druhObjektu('popisek')).toBe('popisek');
    expect(druhObjektu(undefined)).toBeNull();
    expect(() => druhObjektu('text')).toThrow(ChybaVstupu);
    expect(() => druhObjektu('tabulka; drop')).toThrow(ChybaVstupu);
  });
});

describe('odpověď čtení', () => {
  it('listy pod strop znaků — vždy aspoň jeden celý, žádný se nezkracuje', () => {
    const list = (n: number, znaku: number) => ({ pdf_index: n, text: 'x'.repeat(znaku) });
    expect(listyPodStropem([list(1, 10), list(2, 10), list(3, 10)], 25).map((l) => l.pdf_index)).toEqual([1, 2]);
    const obri = listyPodStropem([list(1, MAX_ZNAKU_ODPOVEDI + 5), list(2, 1)]);
    expect(obri.map((l) => l.pdf_index)).toEqual([1]);
    expect(obri[0].text).toHaveLength(MAX_ZNAKU_ODPOVEDI + 5);
    expect(listyPodStropem([])).toEqual([]);
    expect(listyPodStropem([{ pdf_index: 1, text: null }])).toHaveLength(1);
  });

  it('náhled: krátký text celý, dlouhý zkrácený na celé znaky s …', () => {
    expect(nahled('  | a | b |  ')).toBe('| a | b |');
    expect(nahled(null)).toBe('');
    const dlouhy = 'ž'.repeat(400);
    expect(nahled(dlouhy, 300)).toBe(`${'ž'.repeat(300)}…`);
    expect(nahled('😀'.repeat(200), 150)).toBe(`${'😀'.repeat(150)}…`);
  });

  it('kompaktní rejstřík listů', () => {
    expect(rejstrikListu([
      { pdf_index: 1, tistena_strana: null, zdroj_textu: 'vrstva', ke_kontrole: false },
      { pdf_index: 2, tistena_strana: 'XII', zdroj_textu: 'ocr', ke_kontrole: true },
      { pdf_index: 3, tistena_strana: '1', zdroj_textu: 'soubor', ke_kontrole: null },
    ])).toEqual([[1, null, 'v', 0], [2, 'XII', 'o', 1], [3, '1', 's', 0]]);
  });

  it('všechny řádky po stránkách (strop PostgRESTu 1000) a chyba stránku zastaví', async () => {
    const radky = Array.from({ length: 2345 }, (_, i) => i);
    const rozsahy: [number, number][] = [];
    const vse = await vsechnyRadky<number>(async (od, do_) => {
      rozsahy.push([od, do_]);
      return { data: radky.slice(od, do_ + 1), error: null };
    });
    expect(vse.error).toBeNull();
    expect(vse.data).toEqual(radky);
    expect(rozsahy).toEqual([[0, STRANKA_DB - 1], [STRANKA_DB, 2 * STRANKA_DB - 1], [2 * STRANKA_DB, 3 * STRANKA_DB - 1]]);

    // Přesně 1000 řádků: ještě jeden dotaz, který vrátí prázdno.
    let dotazu = 0;
    const presne = await vsechnyRadky<number>(async (od, do_) => { dotazu += 1; return { data: radky.slice(0, 1000).slice(od, do_ + 1), error: null }; });
    expect(presne.data).toHaveLength(1000);
    expect(dotazu).toBe(2);

    const chyba = { code: '42P01' };
    const sChybou = await vsechnyRadky<number>(async (od) => (od === 0 ? { data: [1, 2], error: null } : { data: null, error: chyba }), 5000);
    expect(sChybou.error).toBeNull();   // první stránka neplná → konec bez druhého dotazu
    const prvniChyba = await vsechnyRadky<number>(async () => ({ data: null, error: chyba }));
    expect(prvniChyba.error).toBe(chyba);

    // Pojistka: nikdy víc než max řádků.
    const mnoho = await vsechnyRadky<number>(async (od, do_) => ({ data: Array.from({ length: do_ - od + 1 }, (_, i) => od + i), error: null }), 2500);
    expect(mnoho.data).toHaveLength(2500);
  });
});
