import { describe, it, expect, vi, beforeEach } from 'vitest';

const volani: Record<string, unknown>[] = [];
let odpoved: unknown = null;
vi.mock('./bibleKlient', async (puvodni) => ({
  ...(await puvodni<typeof import('./bibleKlient')>()),
  volejBibli: vi.fn(async (_f: string, telo: Record<string, unknown>) => { volani.push(telo); return odpoved; }),
}));

import { adresaZamitnuti, nactiPripojeni, odpojitClaude, povolitClaude, zadostZAdresy } from './bibleClaudeApi';

const CH = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const HLEDANI = `?response_type=code&client_id=klient_claude_0000001&redirect_uri=${encodeURIComponent('https://claude.ai/api/mcp/auth_callback')}`
  + `&code_challenge=${CH}&code_challenge_method=S256&state=abc&scope=bible`;

beforeEach(() => { volani.length = 0; });

describe('schválení připojení Claude', () => {
  it('žádost jen od Claude (adresa návratu, response_type=code)', () => {
    expect(zadostZAdresy(HLEDANI)).toMatchObject({ clientId: 'klient_claude_0000001', state: 'abc', codeChallengeMethod: 'S256' });
    expect(zadostZAdresy(HLEDANI.replace('claude.ai', 'zly.example'))).toBeNull();
    expect(zadostZAdresy(HLEDANI.replace('response_type=code', 'response_type=token'))).toBeNull();
    expect(zadostZAdresy('')).toBeNull();
  });

  it('Zamítnout vrací access_denied jen do Claude', () => {
    expect(adresaZamitnuti(zadostZAdresy(HLEDANI)!)).toBe('https://claude.ai/api/mcp/auth_callback?error=access_denied&state=abc');
  });

  it('Povolit pošle parametry do bible-api a přesměruje jen zpátky do Claude', async () => {
    odpoved = { ok: true, data: { presmerovat: 'https://claude.ai/api/mcp/auth_callback?code=xyz&state=abc' } };
    expect(await povolitClaude(zadostZAdresy(HLEDANI)!)).toEqual({ ok: true, presmerovat: 'https://claude.ai/api/mcp/auth_callback?code=xyz&state=abc' });
    expect(volani[0]).toMatchObject({ akce: 'mcp_povolit', client_id: 'klient_claude_0000001', code_challenge: CH, code_challenge_method: 'S256', state: 'abc' });
    odpoved = { ok: true, data: { presmerovat: 'https://zly.example/?code=xyz' } };
    expect((await povolitClaude(zadostZAdresy(HLEDANI)!)).ok).toBe(false);
    odpoved = { ok: false, chyba: { kod: 'bez_pristupu', zprava: 'Nemáš přístup.', status: 403 } };
    expect(await povolitClaude(zadostZAdresy(HLEDANI)!)).toEqual({ ok: false, zprava: 'Nemáš přístup.' });
  });

  it('připojení a odpojení', async () => {
    odpoved = { ok: true, data: { pripojeni: [{ pripojeni: 'p1', klient: 'Claude', od: '2026-11-03T20:00:00Z', naposled: null }, { x: 1 }], migrace: true } };
    expect(await nactiPripojeni()).toEqual({ ok: true, migrace: true, pripojeni: [{ pripojeni: 'p1', klient: 'Claude', od: '2026-11-03T20:00:00Z', naposled: null }] });
    odpoved = { ok: true, data: { odpojeno: 1 } };
    expect(await odpojitClaude('p1')).toEqual({ ok: true });
    expect(volani.at(-1)).toEqual({ akce: 'mcp_odpojit', pripojeni: 'p1' });
  });
});
