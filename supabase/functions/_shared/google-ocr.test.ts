import { afterEach, describe, it, expect, vi } from 'vitest';
import { opravOcrObjednavky, prepisFotkyGoogle, sekceOcr, textSOcr, textZOdpovediVision } from './google-ocr';

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
    ['SX 20l 120', '5x 20l 12°'],
    ['15х10 110', '15x 10 11°'],
  ];
  it.each(pripady)('%s → %s', (ocr, ma) => {
    expect(opravOcrObjednavky(ocr)).toBe(ma);
  });

  it('nesahá na jména, poznámky ani na sudy psané správně', () => {
    for (const r of ['JONA', '② DROBAN (NORAW)', 'Seeberg 4x30 12sv', '2x 30 11sv', '5x 11 sv', '3x 50l 12°', '10x 12 sv', '4x 10 11sv', 'Bez summera']) {
      expect(opravOcrObjednavky(r)).toBe(r);
    }
  });
});
