import { afterEach, describe, it, expect, vi } from 'vitest';
import { prepisFotkyGoogle, sekceOcr, textSOcr, textZOdpovediVision } from './google-ocr';

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
