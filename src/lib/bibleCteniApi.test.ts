import { describe, it, expect, vi, beforeEach } from 'vitest';

// Falešná brána bible-api: zaznamená akce a vrátí nastavené odpovědi.
type Volani = { funkce: string; telo: Record<string, unknown> };
const volani: Volani[] = [];
let odpovedi: Record<string, unknown> = {};

vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (funkce: string, telo: Record<string, unknown>) => {
    volani.push({ funkce, telo });
    const o = odpovedi[String(telo.akce)];
    if (o && typeof o === 'object' && 'chyba' in (o as object)) return { ok: false, ...(o as object) };
    return { ok: true, data: o };
  }),
}));

import { nactiKnihu, nactiListy, nactiObjekty } from './bibleCteniApi';

const ID = '11111111-2222-3333-4444-555555555555';

beforeEach(() => {
  volani.length = 0;
  odpovedi = {};
});

describe('čtení knihy přes bible-api', () => {
  it('kniha: dokument, kapitoly (vadné vynechá) a rejstřík listů', async () => {
    odpovedi.kniha = {
      dokument: { id: ID, nazev: 'Technologie piva', stav: 'hotovo' },
      kapitoly: [
        { id: 'k1', rodic_id: null, poradi: 1, uroven: 1, cislo: '1', nazev: 'Slad', strana_od: 1, strana_do: 4 },
        { id: 'k2', poradi: 2, nazev: 'Bez úrovně' },
        { nazev: 'bez id' },
      ],
      listy: [[1, null, 'v', 0], [2, '12', 'o', 1]],
    };
    const r = await nactiKnihu(ID);
    expect(volani).toEqual([{ funkce: 'bible-api', telo: { akce: 'kniha', id: ID } }]);
    expect(r.stav).toBe('ok');
    if (r.stav !== 'ok') return;
    expect(r.data.dokument.nazev).toBe('Technologie piva');
    expect(r.data.kapitoly.map((k) => [k.id, k.uroven, k.strana_od])).toEqual([['k1', 1, 1], ['k2', 1, null]]);
    expect(r.data.listy).toEqual([
      { pdfIndex: 1, tistena: null, zdroj: 'vrstva', keKontrole: false },
      { pdfIndex: 2, tistena: '12', zdroj: 'ocr', keKontrole: true },
    ]);
  });

  it('chyby: nezpracovaná, smazaná, stará bible-api (nasazuje se) a ostatní', async () => {
    odpovedi.kniha = { chyba: { kod: 'nezpracovano', zprava: 'Kniha se právě zpracovává — číst půjde, až zpracování doběhne.', status: 409 } };
    expect(await nactiKnihu(ID)).toEqual({ stav: 'nezpracovano', zprava: 'Kniha se právě zpracovává — číst půjde, až zpracování doběhne.' });
    odpovedi.kniha = { chyba: { kod: 'nenalezeno', zprava: 'Dokument už v knihovně není.', status: 404 } };
    expect((await nactiKnihu(ID)).stav).toBe('nenalezeno');
    odpovedi.kniha = { chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect(await nactiKnihu(ID)).toEqual({ stav: 'nenasazeno', zprava: 'Čtení knih se právě nasazuje — zkus to za pár minut.' });
    odpovedi.kniha = { chyba: { kod: 'nenasazeno', zprava: 'Bot není nasazený.', status: 404 } };
    expect((await nactiKnihu(ID)).stav).toBe('nenasazeno');
    odpovedi.kniha = { chyba: { kod: 'sit', zprava: 'Spojení se přerušilo.', status: 0 } };
    expect(await nactiKnihu(ID)).toEqual({ stav: 'chyba', zprava: 'Spojení se přerušilo.' });
    odpovedi.kniha = { kapitoly: [] };
    expect((await nactiKnihu(ID)).stav).toBe('chyba');
  });

  it('listy: od a počet do bible-api, neznámý zdroj textu = textová vrstva (nerozebírá se)', async () => {
    odpovedi.listy = { listy: [
      { pdf_index: 3, tistena_strana: '5', tistena_zdroj: 'ocr', zdroj_textu: 'ocr', text: '# Nadpis', ke_kontrole: true, kontrola_duvod: '2 z 9 čísel', kapitola_id: 'k1' },
      { pdf_index: 4, zdroj_textu: 'divny', text: 5 },
      { text: 'bez čísla listu' },
    ] };
    const r = await nactiListy(ID, 3);
    expect(volani[0].telo).toEqual({ akce: 'listy', id: ID, od: 3, pocet: 2 });
    expect(r.stav).toBe('ok');
    if (r.stav !== 'ok') return;
    expect(r.data).toHaveLength(2);
    expect(r.data[0]).toMatchObject({ pdf_index: 3, zdroj_textu: 'ocr', ke_kontrole: true, kontrola_duvod: '2 z 9 čísel' });
    expect(r.data[1]).toMatchObject({ pdf_index: 4, zdroj_textu: 'vrstva', text: '', ke_kontrole: false });
  });

  it('objekty: jen známé druhy, pokračování podle pořadí', async () => {
    odpovedi.objekty = {
      objekty: [
        { poradi: 7, druh: 'tabulka', strana_od: 12, strana_do: 13, kapitola_id: null, nahled: '| a | b |' },
        { poradi: 8, druh: 'text', strana_od: 12 },
        { poradi: 9, druh: 'vzorec', strana_od: 14, nahled: 'E = mc^2' },
      ],
      dalsi: 9,
    };
    const r = await nactiObjekty(ID, 5);
    expect(volani[0].telo).toEqual({ akce: 'objekty', id: ID, po: 5 });
    expect(r.stav).toBe('ok');
    if (r.stav !== 'ok') return;
    expect(r.data.objekty.map((o) => [o.poradi, o.druh, o.strana_do])).toEqual([[7, 'tabulka', 13], [9, 'vzorec', 14]]);
    expect(r.data.dalsi).toBe(9);
  });
});
