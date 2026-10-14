import { afterEach, describe, it, expect, vi } from 'vitest';
import { VZORKY_OCR } from './ocr-vzorky';
import { odpovedVisionGoogle, opravOcrObjednavky, prepisFotkyGoogle, sekceOcr, textSOcr, textZOdpovediVision } from './google-ocr';

describe('Přepis fotky přes Google Vision', () => {
  afterEach(() => vi.unstubAllGlobals());

  const admin = (data: number | null, chyba: string | null = null) => ({
    rpc: vi.fn(async () => ({ data, error: chyba ? { message: chyba } : null })),
  });

  it('vezme celý text dokumentu, řádky zachová', () => {
    const data = { responses: [{ fullTextAnnotation: { text: 'Radek  \r\n35x 1l 11sv\n10x 1,5l 11sv\n' } }] };
    expect(textZOdpovediVision(data)).toBe('Radek\n35x 1l 11sv\n10x 1,5l 11sv');
    expect(textZOdpovediVision({ responses: [{}] })).toBe('');
    expect(textZOdpovediVision(null)).toBe('');
  });

  it('každý přepis se započte do měsíce', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'a\nb' } }] }))));
    const a = admin(901);
    const chyby: string[] = [];
    expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: a, chyby })).toBe('a\nb');
    expect(a.rpc).toHaveBeenCalledWith('zapocti_ocr_fotky');
    expect(chyby).toEqual(['ocr: přepsáno 2 řádků, 901. v měsíci']);
  });

  it('nezastaví se ani nad limitem, ani bez počítadla (např. před migrací)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'x' } }] }))));
    for (const a of [admin(1500), admin(null, 'function does not exist')]) {
      const chyby: string[] = [];
      expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: a, chyby })).toBe('x');
    }
  });

  it('chyba Googlu → prázdný přepis a důvod', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"billing"}}', { status: 403 })));
    const chyby: string[] = [];
    expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: admin(1), chyby })).toBe('');
    expect(chyby[0]).toMatch(/HTTP 403/);
    expect(chyby[0]).not.toMatch(/v měsíci/); // odmítnutý požadavek Google neúčtuje
  });

  it('celá odpověď i s polohou slov (uzávěrka z pokladny skládá řádky podle polohy) a započtení do měsíce', async () => {
    const odpoved = { responses: [{ fullTextAnnotation: { text: 'a', pages: [{ blocks: [{ paragraphs: [{ words: [{ boundingBox: { vertices: [{}, { x: 5 }, { x: 5, y: 3 }, { y: 3 }] }, symbols: [{ text: 'a' }] }] }] }] }] } }] };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(odpoved)));
    vi.stubGlobal('fetch', fetchMock);
    const a = admin(42);
    const chyby: string[] = [];
    const vysledek = await odpovedVisionGoogle({ klic: 'k', imageBase64: 'x', admin: a, chyby });
    expect(vysledek?.data).toEqual(odpoved);
    expect(vysledek?.poradi).toBe(', 42. v měsíci');
    expect(a.rpc).toHaveBeenCalledWith('zapocti_ocr_fotky');
    expect(chyby).toEqual([]);   // úspěch hlásí až ten, kdo odpověď použije
    const pozadavek = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(pozadavek.requests[0].features).toEqual([{ type: 'DOCUMENT_TEXT_DETECTION' }]);
    expect(pozadavek.requests[0].imageContext).toEqual({ languageHints: ['cs'] });
  });

  it('odpověď Vision s chybou, odmítnutý požadavek i výpadek sítě → null a důvod', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"billing"}}', { status: 403 })));
    const c1: string[] = [];
    expect(await odpovedVisionGoogle({ klic: 'k', imageBase64: 'x', admin: admin(1), chyby: c1 })).toBeNull();
    expect(c1[0]).toMatch(/HTTP 403/);

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ responses: [{ error: { message: 'Bad image data' } }] }))));
    const c2: string[] = [];
    expect(await odpovedVisionGoogle({ klic: 'k', imageBase64: 'x', admin: admin(7), chyby: c2 })).toBeNull();
    expect(c2).toEqual(['ocr: Bad image data, 7. v měsíci']);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    const c3: string[] = [];
    expect(await odpovedVisionGoogle({ klic: 'k', imageBase64: 'x', admin: admin(8), chyby: c3 })).toBeNull();
    expect(c3[0]).toMatch(/^ocr: TypeError, 8\. v měsíci/);
  });

  it('prompt: s fotkou platí fotka, bez ní se čte z přepisu', () => {
    expect(sekceOcr(true)).toMatch(/PŘEDEVŠÍM Z FOTKY/);
    expect(sekceOcr(true)).toMatch(/platí fotka/);
    expect(sekceOcr(false)).toMatch(/PŘEDEVŠÍM Z TOHO PŘEPISU/);
    for (const s of [sekceOcr(true), sekceOcr(false)]) expect(s).toMatch(/„1l"\/„1,5l" přečte jako „11"/);
    expect(textSOcr('foto', '35x 1l')).toContain('PŘEPIS FOTKY (OCR):\n"""\n35x 1l\n"""');
  });
});

describe('Oprava typických chyb OCR u objednávek', () => {
  // Skutečný přepis lístku Radka (12. 10. 2026) → co na lístku stojí.
  const pripady: [string, string][] = [
    ['10x 11, 11° Sv.', '10x 1l 11° Sv.'],
    ['10x 1 12" JANTAR', '10x 1l 12° JANTAR'],
    ['10x 1120 TL', '10x 1l 12° TL'],
    ['10x 11 12 WINTER', '10x 1l 12 WINTER'],
    ['15x11 11°', '15x 1l 11°'],
    ['10x 1,51 11° Sv.', '10x 1,5l 11° Sv.'],
    ['20x 0,5 LIMO -CITRON', '20x 0,5l LIMO -CITRON'],
    ['20x 0,5! 10°', '20x 0,5l 10°'],
    ['20x 0,5" 12" Sv.', '20x 0,5l 12° Sv.'],
    ['20× 0,5) 12° WINTER', '20x 0,5l 12° WINTER'],
    ['35 x 11 12° sv.', '35x 1l 12° sv.'],
    ['10x 12 12° JANTAR', '10x 1l 12° JANTAR'],
    ['6x 0,331 11°', '6x 0,33l 11°'],
    ['3x 101 11°sv', '3x 10l 11°sv'],
    ['2x 15h 11°sv', '2x 15l 11°sv'],
    ['2 x 151 12° WINTER', '2x 15l 12° WINTER'],
    ['1x 15 120', '1x 15 12°'],
    ['SX 20l 120', 'Sx 20l 12°'], // S = 5 nebo 8 — nerozhoduje se
    // Další fotky (srpen–říjen 2026) → co stojí v potvrzené objednávce.
    ['2x 201 110', '2x 20l 11°'],
    ['17 x 30l Mo', '17x 30l 11°'],
    ['20x 05 11°su.', '20x 0,5l 11°su.'],
    ['20x0,5/12°', '20x 0,5l 12°'],
    ['17 x 30% 100', '17x 30l 10°'],
    ['3x 10f 110', '3x 10l 11°'],
    ['20x0,51 12"', '20x 0,5l 12°'],
    ['1x 30|LIMO KIUI', '1x 30l LIMO KIWI'],
    ['25x11 12°', '25x 1l 12°'],
    ['8x301 100', '8x 30l 10°'],
    ['10x 18 10°', '10x 1l 10°'],
    ['10x11 80', '10x 1l 8°'],
    ['3<301 LIMO', '3x 30l LIMO'],
    ['4x 300 11°', '4x 30l 11°'],
    ['15x 18 120', '15x 1l 12°'],
    ['15< 11 11°', '15x 1l 11°'],
    ['2005 LIMO CIT.', '20x 0,5l LIMO CIT.'],
    ['10x 11 120.', '10x 1l 12°.'],
    ['10x 11.8°', '10x 1l 8°'],
    ['Sx 11 Mosv.', 'Sx 1l 11°sv.'],
    ['10x 1l M°sv.', '10x 1l 11°sv.'],
    ['10x11 &', '10x 1l 8°'],
    ['5x sol 100', '5x 30l 10°'],
    ['1x 45 120', '1x 15l 12°'],
    ['10x 7l 11°', '10x 1l 11°'],
    ['10x 7,5l 12°', '10x 1,5l 12°'],
    ['15x30 11 SUMMER', '15x 30 11 SUMMER'],
    ['15х10 110', '15x 10 11°'],
  ];
  it.each(pripady)('%s → %s', (ocr, ma) => {
    expect(opravOcrObjednavky(ocr)).toBe(ma);
  });

  it('nesahá na jména, poznámky ani na sudy psané správně', () => {
    for (const r of ['JONA', '② DROBAN (NORAW)', 'Seeberg 4x30 12sv', '2x 30 11sv', '5x 11 sv', '3x 50l 12°', '10x 12 sv', '4x 10 11sv', '3x 50l 12° JANTAR', '1x 10l 12° PETASNER !', 'Maneo', 'Mobil: 728 405 407 Mira', '2x 30 LIMO CIT.', 'Bez summera']) {
      expect(opravOcrObjednavky(r)).toBe(r);
    }
  });
});

describe('Všechny fotky objednávek: přepis Google Vision → co je na lístku', () => {
  /** Význam řádku: počet, obal (bez „l"), stupeň. Slova a interpunkce nehrají roli. */
  const vyznam = (r: string) => {
    const t = r.replace(/^\s*[+•]\s*/, '');
    const pocet = t.match(/^\s*(\d{1,3}|[sS])x\b/)?.[1] ?? null;
    const obal = t.match(/^\s*(?:\d{1,3}|[sS])x\s+(\d+(?:,\d+)?)l?\b(?!°)/)?.[1] ?? null;
    const stupen = t.match(/(?:^|\s|x)(8|1[0-3])°/)?.[1] ?? t.match(/\s(8|1[0-3])(?=\s+[A-Z]|$)/)?.[1] ?? null;
    return { pocet, obal, stupen };
  };
  const vse = Object.entries(VZORKY_OCR).flatMap(([foto, radky]) => radky.map((r) => ({ foto, r })));

  it.each(vse.filter(({ r }) => !r[2]).map(({ foto, r }) => [foto, r[0], r[1]]))(
    '%s: „%s" → „%s"',
    (_foto, ocr, listek) => {
      expect(vyznam(opravOcrObjednavky(ocr))).toEqual(vyznam(listek));
    },
  );

  it('pravidla opraví aspoň 85 % řádků (zbytek přečte Gemini z fotky)', () => {
    const ok = vse.filter(({ r }) => JSON.stringify(vyznam(opravOcrObjednavky(r[0]))) === JSON.stringify(vyznam(r[1])));
    const pred = vse.filter(({ r }) => JSON.stringify(vyznam(r[0])) === JSON.stringify(vyznam(r[1])));
    console.log(`OCR bez oprav: ${pred.length}/${vse.length} řádků, s opravami: ${ok.length}/${vse.length}`);
    expect(ok.length / vse.length).toBeGreaterThanOrEqual(0.85);
  });
});
