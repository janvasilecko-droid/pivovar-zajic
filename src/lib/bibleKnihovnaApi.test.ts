import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { BIBLE_URL } from './bibleKlient';
import { nactiDokumenty, nactiNakladyMesice, nahrajDokument, odkazNaSoubor, smazDokument } from './bibleKnihovnaApi';

const ID = '11111111-2222-3333-4444-555555555555';
const pdf = (jmeno = 'Kunze Technology Brewing.pdf', obsah = '%PDF-1.7 obsah') => new File([obsah], jmeno, { type: '' });
const dokument = { id: ID, nazev: 'Kunze', stav: 'ceka' };
const akce = () => volani.map((v) => v.telo.akce);

let fetchMock: ReturnType<typeof vi.fn>;
let nahraniOdpoved: () => Response;

beforeEach(() => {
  volani.length = 0;
  odpovedi = {
    zalozit_nahrani: { id: ID, cesta: `${ID}/Kunze-Technology-Brewing.pdf`, obnoveno: false, soubor_nahran: false, token: 'tok+en/1', apikey: 'sb_publishable_bible' },
    potvrdit_nahrani: dokument,
  };
  nahraniOdpoved = () => new Response(JSON.stringify({ Key: 'knihovna/x' }), { status: 200 });
  fetchMock = vi.fn(async () => nahraniOdpoved());
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('nahrání dokumentu do knihovny (projekt bible)', () => {
  it('založí nahrání, pošle soubor rovnou do úložiště bible a potvrdí ho', async () => {
    const v = await nahrajDokument(pdf(), { nazev: '  Technology Brewing and Malting ', autor: '', jazyk: 'en', oblasti: ['A', 'D'] });
    expect(v).toEqual({ stav: 'nahrano', dokument });
    expect(akce()).toEqual(['zalozit_nahrani', 'potvrdit_nahrani']);
    const zalozeni = volani[0].telo;
    expect(zalozeni.popis).toEqual({
      nazev: 'Technology Brewing and Malting', autor: null, vydani: null, rok: null, isbn: null, jazyk: 'en',
      druh: 'kniha', oblasti: ['A', 'D'], zdroj: null, licence: null,
    });
    const soubor = zalozeni.soubor as Record<string, unknown>;
    expect(soubor).toMatchObject({ nazev: 'Kunze Technology Brewing.pdf', jmeno: 'Kunze-Technology-Brewing.pdf', mime: 'application/pdf', velikost: 14 });
    expect(soubor.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Kdo nahrál a potvrdil práva určí server z přihlášení — klient je neposílá.
    expect(zalozeni).not.toHaveProperty('nahral');
    expect(zalozeni).not.toHaveProperty('nahral_jmeno');
    expect(volani[1].telo).toEqual({ akce: 'potvrdit_nahrani', id: ID });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [adresa, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(adresa).toBe(`${BIBLE_URL}/storage/v1/object/upload/sign/knihovna/${ID}/Kunze-Technology-Brewing.pdf?token=tok%2Ben%2F1`);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'x-upsert': 'false', apikey: 'sb_publishable_bible' });
    const telo = init.body as FormData;
    const castSouboru = telo.get('') as Blob;
    expect(castSouboru.type).toBe('application/pdf'); // typ podle přípony, i když ho prohlížeč nezná
    expect(castSouboru.size).toBe(14);
  });

  it('stejný soubor (SHA-256) podruhé nenahraje', async () => {
    odpovedi.zalozit_nahrani = { duplicita: true, nazev: 'Kunze (už nahraný)' };
    expect(await nahrajDokument(pdf(), { nazev: 'Kunze' })).toEqual({ stav: 'duplicita', nazev: 'Kunze (už nahraný)' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(akce()).toEqual(['zalozit_nahrani']);
  });

  it('nepodporovaný typ, prázdný název, prázdný nebo příliš velký soubor odmítne bez volání serveru', async () => {
    expect((await nahrajDokument(pdf('kniha.mobi'), { nazev: 'X' })).stav).toBe('chyba');
    expect((await nahrajDokument(pdf(), { nazev: '   ' })).stav).toBe('chyba');
    expect((await nahrajDokument(pdf('prazdny.pdf', ''), { nazev: 'X' })).stav).toBe('chyba');
    const velky = pdf();
    Object.defineProperty(velky, 'size', { value: 50 * 1024 * 1024 + 1 });
    const v = await nahrajDokument(velky, { nazev: 'Velký sken' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/50 MB/);
    expect(volani).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dokončí dřívější nahrání, které soubor už doneslo (bez nového nahrávání)', async () => {
    odpovedi.zalozit_nahrani = { id: ID, cesta: `${ID}/Kunze.pdf`, obnoveno: true, soubor_nahran: true };
    expect((await nahrajDokument(pdf(), { nazev: 'Kunze' })).stav).toBe('nahrano');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(akce()).toEqual(['zalozit_nahrani', 'potvrdit_nahrani']);
  });

  it('soubor už v úložišti je (dřívější pokus) → jen potvrdí', async () => {
    nahraniOdpoved = () => new Response(JSON.stringify({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }), { status: 400 });
    expect((await nahrajDokument(pdf(), { nazev: 'Kunze' })).stav).toBe('nahrano');
    expect(akce()).toEqual(['zalozit_nahrani', 'potvrdit_nahrani']);
  });

  it('nad limit úložiště: srozumitelná hláška, nepotvrdí, poradí jak dokončit', async () => {
    nahraniOdpoved = () => new Response(JSON.stringify({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }), { status: 413 });
    const v = await nahrajDokument(pdf(), { nazev: 'Velký sken' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/50 MB/);
    expect(v.stav === 'chyba' && v.zprava).toMatch(/nahraj ho znovu/);
    expect(akce()).toEqual(['zalozit_nahrani']);
  });

  it('vypršelý odkaz pro nahrání i přerušená síť: chyba, nic se nepotvrdí', async () => {
    nahraniOdpoved = () => new Response(JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: 'jwt expired' }), { status: 400 });
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/vypršel/);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const v2 = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v2.stav === 'chyba' && v2.zprava).toMatch(/Spojení se přerušilo/);
    expect(akce().filter((a) => a === 'potvrdit_nahrani')).toHaveLength(0);
  });

  it('potvrzení selže (soubor nedorazil) → hláška ze serveru', async () => {
    odpovedi.potvrdit_nahrani = { chyba: { kod: 'soubor_chybi', zprava: 'Soubor do úložiště nedorazil — nahraj ho znovu.', status: 409 } };
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v).toEqual({ stav: 'chyba', zprava: 'Soubor do úložiště nedorazil — nahraj ho znovu.' });
  });

  it('bez práva: hláška z brány, žádné nahrávání', async () => {
    odpovedi.zalozit_nahrani = { chyba: { kod: 'zakazano', zprava: 'Nemáš právo nahrávat ani upravovat knihovnu.', status: 403 } };
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/Nemáš právo/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('knihovna — ostatní akce', () => {
  it('chybějící migrace databáze bible = stav bez_migrace', async () => {
    odpovedi.dokumenty = { chyba: { kod: 'bez_migrace', zprava: 'x', status: 503 } };
    expect(await nactiDokumenty()).toEqual({ stav: 'bez_migrace' });
    odpovedi.dokumenty = { chyba: { kod: 'nedostupna', zprava: 'Databáze bible neodpovídá.', status: 0 } };
    expect(await nactiDokumenty()).toEqual({ stav: 'chyba', zprava: 'Databáze bible neodpovídá.' });
    odpovedi.dokumenty = [dokument];
    expect(await nactiDokumenty()).toEqual({ stav: 'ok', dokumenty: [dokument] });
  });

  it('smazání: záznam i soubor; když soubor zůstane, řekne to', async () => {
    odpovedi.smazat = { smazano: true, soubor_zustal: false };
    expect(await smazDokument(ID)).toBeNull();
    expect(volani.at(-1)?.telo).toEqual({ akce: 'smazat', id: ID });
    odpovedi.smazat = { smazano: true, soubor_zustal: true };
    expect(await smazDokument(ID)).toMatch(/soubor zůstal/);
    odpovedi.smazat = { chyba: { kod: 'zakazano', zprava: 'Mazat smí jen správce knihovny.', status: 403 } };
    expect(await smazDokument(ID)).toBe('Mazat smí jen správce knihovny.');
  });

  it('odkaz ke stažení jen do úložiště bible', async () => {
    odpovedi.odkaz = { url: 'https://interni-adresa:8000/storage/v1/object/sign/knihovna/abc/kniha.pdf?token=t1' };
    expect(await odkazNaSoubor(ID)).toEqual({ url: `${BIBLE_URL}/storage/v1/object/sign/knihovna/abc/kniha.pdf?token=t1` });
    odpovedi.odkaz = { url: 'https://zlo.example/phish?token=t' };
    expect(await odkazNaSoubor(ID)).toEqual({ chyba: expect.stringMatching(/neplatný odkaz/) });
    odpovedi.odkaz = { url: `${BIBLE_URL}/storage/v1/object/sign/knihovna/abc/kniha.pdf` };
    expect(await odkazNaSoubor(ID)).toEqual({ chyba: expect.stringMatching(/neplatný odkaz/) });
  });

  it('útrata za AI: od začátku měsíce UTC, součet z databáze', async () => {
    odpovedi.naklady = [{ ucel: 'ocr', cena_usd: '1.250000', volani: 1200 }, { ucel: 'chat', cena_usd: 0.5, volani: 3 }];
    const v = await nactiNakladyMesice(new Date('2026-10-31T23:30:00Z'));
    expect(volani.at(-1)?.telo).toEqual({ akce: 'naklady', od: '2026-10-01T00:00:00.000Z' });
    expect(v).toEqual({ naklady: { usd: 1.75, volani: 1203, podleUcelu: { ocr: 1.25, chat: 0.5 } } });
  });
});
