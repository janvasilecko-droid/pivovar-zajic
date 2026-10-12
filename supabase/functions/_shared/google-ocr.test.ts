import { afterEach, describe, it, expect, vi } from 'vitest';
import { OCR_LIMIT_DEN, prepisFotkyGoogle, sekceOcr, textSOcr, textZOdpovediVision } from './google-ocr';

describe('Přepis fotky přes Google Vision', () => {
  afterEach(() => vi.unstubAllGlobals());

  const admin = (smi: boolean | null, chyba: string | null = null) => ({
    rpc: vi.fn(async () => ({ data: smi, error: chyba ? { message: chyba } : null })),
  });

  it('vezme celý text dokumentu, řádky zachová', () => {
    const data = { responses: [{ fullTextAnnotation: { text: 'Radek  \r\n35x 1l 11sv\n10x 1,5l 11sv\n' } }] };
    expect(textZOdpovediVision(data)).toBe('Radek\n35x 1l 11sv\n10x 1,5l 11sv');
    expect(textZOdpovediVision({ responses: [{}] })).toBe('');
    expect(textZOdpovediVision(null)).toBe('');
  });

  it('limit drží měsíc pod 1 000 přepisy zdarma', () => {
    expect(OCR_LIMIT_DEN * 32).toBeLessThan(1000);
  });

  it('bez potvrzeného počítadla Google nevolá (pojistka proti placení)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    for (const a of [admin(false), admin(null, 'nedostupné')]) {
      const chyby: string[] = [];
      expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: a, chyby })).toBe('');
      expect(chyby[0]).toMatch(/^ocr: /);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('počítadlo: 30 za 24 h pro všechny funkce dohromady', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ responses: [{ fullTextAnnotation: { text: 'a\nb' } }] }))));
    const a = admin(true);
    const chyby: string[] = [];
    expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: a, chyby })).toBe('a\nb');
    expect(a.rpc).toHaveBeenCalledWith('consume_edge_rate_limit', expect.objectContaining({
      p_bucket: 'google-vision-ocr', p_limit: OCR_LIMIT_DEN, p_window_seconds: 86_400,
    }));
    expect(chyby).toEqual(['ocr: přepsáno 2 řádků']);
  });

  it('chyba Googlu → prázdný přepis a důvod', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"billing"}}', { status: 403 })));
    const chyby: string[] = [];
    expect(await prepisFotkyGoogle({ klic: 'k', imageBase64: 'x', admin: admin(true), chyby })).toBe('');
    expect(chyby[0]).toMatch(/HTTP 403/);
  });

  it('prompt: s fotkou platí fotka, bez ní se čte z přepisu', () => {
    expect(sekceOcr(true)).toMatch(/PŘEDEVŠÍM Z FOTKY/);
    expect(sekceOcr(true)).toMatch(/platí fotka/);
    expect(sekceOcr(false)).toMatch(/PŘEDEVŠÍM Z TOHO PŘEPISU/);
    for (const s of [sekceOcr(true), sekceOcr(false)]) expect(s).toMatch(/„1l"\/„1,5l" přečte jako „11"/);
    expect(textSOcr('foto', '35x 1l')).toContain('PŘEPIS FOTKY (OCR):\n"""\n35x 1l\n"""');
  });
});
