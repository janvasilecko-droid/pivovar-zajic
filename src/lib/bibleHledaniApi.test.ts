import { describe, it, expect, vi, beforeEach } from 'vitest';

type Volani = { funkce: string; telo: Record<string, unknown> };
const volani: Volani[] = [];
let odpoved: unknown = null;

vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (funkce: string, telo: Record<string, unknown>) => {
    volani.push({ funkce, telo });
    return odpoved;
  }),
}));

import { hledejVKnihach, nactiPrehled, nactiPrehledy } from './bibleHledaniApi';

const ID = '11111111-2222-3333-4444-555555555555';
beforeEach(() => { volani.length = 0; });

describe('hledání přes bible-api', () => {
  it('pošle dotaz (a volitelně knihu), vadné řádky vynechá', async () => {
    odpoved = { ok: true, data: { vysledky: [
      { dokument_id: ID, nazev: 'Kniha', autor: 'A', rok: 2001, zdroj: 'preklad', pdf_index: 5, tistena_strana: '3', kapitola: 'K', druh: 'text', uryvek: 'u' },
      { dokument_id: ID, zdroj: 'divny', pdf_index: 6 },
      { nazev: 'bez id', pdf_index: 1 },
    ] } };
    const r = await hledejVKnihach('slad', ID);
    expect(volani[0]).toEqual({ funkce: 'bible-api', telo: { akce: 'hledej', dotaz: 'slad', id: ID } });
    expect(r).toEqual({ stav: 'ok', vysledky: [
      { dokumentId: ID, nazev: 'Kniha', autor: 'A', rok: 2001, zdroj: 'preklad', pdfIndex: 5, tistena: '3', kapitola: 'K', druh: 'text', uryvek: 'u' },
      { dokumentId: ID, nazev: 'Kniha', autor: null, rok: null, zdroj: 'original', pdfIndex: 6, tistena: null, kapitola: null, druh: 'text', uryvek: '' },
    ] });
    await hledejVKnihach('slad');
    expect(volani[1].telo).toEqual({ akce: 'hledej', dotaz: 'slad' });
  });

  it('stará bible-api (neznámá akce) = nasazuje se; jiná chyba projde', async () => {
    odpoved = { ok: false, chyba: { kod: 'neplatny_vstup', zprava: 'Neznámá akce.', status: 400 } };
    expect((await hledejVKnihach('slad')).stav).toBe('nenasazeno');
    odpoved = { ok: false, chyba: { kod: 'nezpracovano', zprava: 'Hledání čeká na migraci.', status: 409 } };
    expect(await hledejVKnihach('slad')).toEqual({ stav: 'chyba', zprava: 'Hledání čeká na migraci.' });
  });
});

describe('přehledy přes bible-api', () => {
  it('seznam a jeden přehled se zdroji (vadné zdroje vynechá)', async () => {
    odpoved = { ok: true, data: { prehledy: [{ klic: 'chmelovar', nazev: 'Chmelovar', oblast: 'F' }, { nazev: 'bez klíče' }], migrace: true } };
    expect(await nactiPrehledy()).toEqual({ stav: 'ok', migrace: true, prehledy: [
      { klic: 'chmelovar', nazev: 'Chmelovar', oblast: 'F', kontrola: null, vytvoreno: null },
    ] });
    odpoved = { ok: true, data: { prehledy: [], migrace: false } };
    expect(await nactiPrehledy()).toMatchObject({ migrace: false });
    odpoved = { ok: true, data: { klic: 'chmelovar', nazev: 'Chmelovar', text: 'Var [1].', kontrola: null,
      zdroje: [{ n: 1, dokument_id: ID, nazev: 'K', pdf_index: 4, tistena_strana: '2', kapitola: null, zdroj: 'preklad' }, { n: 2 }] } };
    const r = await nactiPrehled('chmelovar');
    expect(volani.at(-1)?.telo).toEqual({ akce: 'prehled', klic: 'chmelovar' });
    expect(r).toMatchObject({ stav: 'ok', prehled: { text: 'Var [1].', zdroje: [
      { n: 1, dokumentId: ID, nazev: 'K', pdfIndex: 4, tistena: '2', kapitola: null, zdroj: 'preklad' },
    ] } });
    odpoved = { ok: false, chyba: { kod: 'nenalezeno', zprava: 'Přehled tohoto tématu zatím není.', status: 404 } };
    expect(await nactiPrehled('x')).toEqual({ stav: 'chyba', zprava: 'Přehled tohoto tématu zatím není.' });
  });
});
