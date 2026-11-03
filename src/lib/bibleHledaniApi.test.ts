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

import { hledejVKnihach } from './bibleHledaniApi';

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
