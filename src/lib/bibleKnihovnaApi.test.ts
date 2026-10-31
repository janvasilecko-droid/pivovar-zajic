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
import {
  NAHRAVANI_ZASEKNUTO, NAHRAVANI_ZASTAVENO, nactiDokumenty, nactiNakladyMesice, nahrajDokument, nahrajDoUloziste,
  odkazNaSoubor, smazDokument,
} from './bibleKnihovnaApi';

const ID = '11111111-2222-3333-4444-555555555555';
const pdf = (jmeno = 'Kunze Technology Brewing.pdf', obsah = '%PDF-1.7 obsah') => new File([obsah], jmeno, { type: '' });
const dokument = { id: ID, nazev: 'Kunze', stav: 'ceka' };
const akce = () => volani.map((v) => v.telo.akce);

// Falešný XMLHttpRequest: nahrání do úložiště bible.
class FalesnyXhr {
  static vsechny: FalesnyXhr[] = [];
  static chovani: (x: FalesnyXhr) => void = (x) => x.odpovez(200, '{"Key":"knihovna/x"}');
  metoda = '';
  adresa = '';
  hlavicky: Record<string, string> = {};
  telo: unknown = null;
  status = 0;
  responseText = '';
  upload: { onprogress: ((e: ProgressEvent) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(metoda: string, adresa: string) { this.metoda = metoda; this.adresa = adresa; }
  setRequestHeader(k: string, v: string) { this.hlavicky[k] = v; }
  send(telo: unknown) {
    this.telo = telo;
    FalesnyXhr.vsechny.push(this);
    queueMicrotask(() => FalesnyXhr.chovani(this));
  }
  abort() { this.onabort?.(); }
  prubeh(loaded: number, total: number) { this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent); }
  odpovez(status: number, text: string) {
    this.prubeh(7, 14);
    this.prubeh(14, 14);
    this.upload.onload?.();
    this.status = status;
    this.responseText = text;
    this.onload?.();
  }
}

beforeEach(() => {
  volani.length = 0;
  odpovedi = {
    zalozit_nahrani: { id: ID, cesta: `${ID}/Kunze-Technology-Brewing.pdf`, obnoveno: false, soubor_nahran: false, token: 'tok+en/1', apikey: 'sb_publishable_bible' },
    potvrdit_nahrani: dokument,
  };
  FalesnyXhr.vsechny = [];
  FalesnyXhr.chovani = (x) => x.odpovez(200, '{"Key":"knihovna/x"}');
  vi.stubGlobal('XMLHttpRequest', FalesnyXhr);
});
afterEach(() => vi.unstubAllGlobals());

describe('nahrání dokumentu do knihovny (projekt bible)', () => {
  it('založí nahrání, pošle soubor rovnou do úložiště bible (s průběhem) a potvrdí ho', async () => {
    const prubeh: number[] = [];
    const v = await nahrajDokument(pdf(), { nazev: '  Technology Brewing and Malting ', autor: '', jazyk: 'en', oblasti: ['A', 'D'] },
      { onPrubeh: (podil) => prubeh.push(podil) });
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

    expect(FalesnyXhr.vsechny).toHaveLength(1);
    const x = FalesnyXhr.vsechny[0];
    expect(x.metoda).toBe('PUT');
    expect(x.adresa).toBe(`${BIBLE_URL}/storage/v1/object/upload/sign/knihovna/${ID}/Kunze-Technology-Brewing.pdf?token=tok%2Ben%2F1`);
    expect(x.hlavicky).toEqual({ 'x-upsert': 'false', apikey: 'sb_publishable_bible' });
    const castSouboru = (x.telo as FormData).get('') as Blob;
    expect(castSouboru.type).toBe('application/pdf'); // typ podle přípony, i když ho prohlížeč nezná
    expect(castSouboru.size).toBe(14);
    expect((x.telo as FormData).get('cacheControl')).toBe('3600');
    expect(prubeh).toEqual([0.5, 1, 1]);
  });

  it('stejný soubor (SHA-256) podruhé nenahraje', async () => {
    odpovedi.zalozit_nahrani = { duplicita: true, nazev: 'Kunze (už nahraný)' };
    expect(await nahrajDokument(pdf(), { nazev: 'Kunze' })).toEqual({ stav: 'duplicita', nazev: 'Kunze (už nahraný)' });
    expect(FalesnyXhr.vsechny).toHaveLength(0);
    expect(akce()).toEqual(['zalozit_nahrani']);
  });

  it('cizí rozpracované nahrání téhož souboru: řekne čí, nic nenahrává', async () => {
    odpovedi.zalozit_nahrani = { rozpracovano: true, nazev: 'Kunze', nahral_jmeno: 'Cyril' };
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/rozpracované nahrání \(Cyril\).*správce knihovny/);
    expect(FalesnyXhr.vsechny).toHaveLength(0);
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
    expect(FalesnyXhr.vsechny).toHaveLength(0);
  });

  it('dokončí dřívější nahrání, které soubor už doneslo (bez nového nahrávání)', async () => {
    odpovedi.zalozit_nahrani = { id: ID, cesta: `${ID}/Kunze.pdf`, obnoveno: true, soubor_nahran: true };
    expect((await nahrajDokument(pdf(), { nazev: 'Kunze' })).stav).toBe('nahrano');
    expect(FalesnyXhr.vsechny).toHaveLength(0);
    expect(akce()).toEqual(['zalozit_nahrani', 'potvrdit_nahrani']);
  });

  it('soubor už v úložišti je (dřívější pokus) → jen potvrdí', async () => {
    FalesnyXhr.chovani = (x) => x.odpovez(400, JSON.stringify({ statusCode: '409', error: 'Duplicate', message: 'The resource already exists' }));
    expect((await nahrajDokument(pdf(), { nazev: 'Kunze' })).stav).toBe('nahrano');
    expect(akce()).toEqual(['zalozit_nahrani', 'potvrdit_nahrani']);
  });

  it('nad limit úložiště: srozumitelná hláška, nepotvrdí, poradí jak dokončit', async () => {
    FalesnyXhr.chovani = (x) => x.odpovez(413, JSON.stringify({ statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' }));
    const v = await nahrajDokument(pdf(), { nazev: 'Velký sken' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/50 MB/);
    expect(v.stav === 'chyba' && v.zprava).toMatch(/nahraj ho znovu/);
    expect(akce()).toEqual(['zalozit_nahrani']);
  });

  it('vypršelý odkaz pro nahrání i přerušená síť: chyba, nic se nepotvrdí', async () => {
    FalesnyXhr.chovani = (x) => x.odpovez(400, JSON.stringify({ statusCode: '400', error: 'InvalidJWT', message: 'jwt expired' }));
    const v = await nahrajDokument(pdf(), { nazev: 'Kunze' });
    expect(v.stav === 'chyba' && v.zprava).toMatch(/vypršel/);
    FalesnyXhr.chovani = (x) => x.onerror?.();
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
    expect(FalesnyXhr.vsechny).toHaveLength(0);
  });
});

describe('nahrávání jde zastavit a zaseknuté se přeruší', () => {
  it('Zastavit: rozběhnuté nahrání se přeruší, nic se nepotvrdí', async () => {
    FalesnyXhr.chovani = (x) => x.prubeh(3, 14); // jen začne, nedokončí
    const ctrl = new AbortController();
    const slib = nahrajDokument(pdf(), { nazev: 'Kunze' }, { signal: ctrl.signal });
    await vi.waitFor(() => expect(FalesnyXhr.vsechny).toHaveLength(1));
    ctrl.abort();
    const v = await slib;
    expect(v.stav === 'chyba' && v.zprava).toMatch(new RegExp(`^${NAHRAVANI_ZASTAVENO}`));
    expect(akce()).toEqual(['zalozit_nahrani']);
  });

  it('už zastavené nahrání se vůbec nespustí', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    expect(await nahrajDoUloziste('a/b.pdf', 't', new Blob(['x']), 'application/pdf', undefined, { signal: ctrl.signal })).toBe(NAHRAVANI_ZASTAVENO);
    expect(FalesnyXhr.vsechny).toHaveLength(0);
  });

  it('bez pohybu déle než limit = zaseknuté spojení → přerušit', async () => {
    FalesnyXhr.chovani = () => undefined; // nikdy nic
    const v = await nahrajDoUloziste('a/b.pdf', 't', new Blob(['x']), 'application/pdf', undefined, { zaseknutiMs: 60 });
    expect(v).toBe(NAHRAVANI_ZASEKNUTO);
  });

  it('pomalé, ale živé nahrání se nepřeruší', async () => {
    FalesnyXhr.chovani = (x) => {
      let krok = 0;
      const t = setInterval(() => {
        krok += 1;
        x.prubeh(krok, 6);
        if (krok === 6) { clearInterval(t); x.odpovez(200, '{}'); }
      }, 25);
    };
    expect(await nahrajDoUloziste('a/b.pdf', 't', new Blob(['x']), 'application/pdf', undefined, { zaseknutiMs: 80 })).toBeNull();
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
