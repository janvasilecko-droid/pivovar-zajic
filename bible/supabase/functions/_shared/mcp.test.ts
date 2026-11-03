// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ChybaNastroje, INSTRUKCE, metadataZdroje, najdiTema, nahodnyToken, NASTROJE, odkazNaList, orizni, platnaChallenge,
  platnyVerifier, prehledSOdkazy, registrace, s256, sha256hex, wwwAuthenticate, zpracujZpravu,
} from './mcp';

const ZAKLAD = 'https://cegrelgvkygcatupqwrx.supabase.co/functions/v1/bible-mcp';

describe('OAuth: PKCE, tokeny, registrace', () => {
  it('S256 podle RFC 7636 (testovací příklad ze standardu)', async () => {
    expect(await s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    expect(platnaChallenge('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')).toBe(true);
    expect(platnyVerifier('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(true);
    expect(platnyVerifier('kratky')).toBe(false);
  });

  it('token je náhodný base64url, v DB jen sha256 (64 hex)', async () => {
    const a = nahodnyToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(nahodnyToken());
    expect(await sha256hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('registrace přijme jen adresy návratu aplikace Claude', () => {
    expect(registrace({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback'], client_name: 'Claude' }))
      .toEqual({ ok: true, nazev: 'Claude', navraty: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(registrace({ redirect_uris: ['https://zly.example/cb'] }).ok).toBe(false);
    expect(registrace({ redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'http://localhost/x'] }).ok).toBe(false);
    expect(registrace({}).ok).toBe(false);
  });

  it('metadata zdroje a hlavička pro přihlášení ukazují na appku jako vydavatele', () => {
    expect(metadataZdroje(ZAKLAD)).toMatchObject({ resource: ZAKLAD, authorization_servers: ['https://zajic-pivovar.pages.dev'] });
    expect(wwwAuthenticate(ZAKLAD)).toBe(`Bearer resource_metadata="${ZAKLAD}/.well-known/oauth-protected-resource"`);
  });
});

describe('MCP (JSON-RPC)', () => {
  const nic = async () => 'x';

  it('initialize: verze protokolu, nástroje, instrukce česky', async () => {
    const r = await zpracujZpravu({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, nic);
    expect(r).toMatchObject({ id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, instructions: INSTRUKCE } });
    const r2 = await zpracujZpravu({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, nic);
    expect((r2?.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18');
  });

  it('notifikace nemá odpověď, neznámá metoda je chyba', async () => {
    expect(await zpracujZpravu({ jsonrpc: '2.0', method: 'notifications/initialized' }, nic)).toBeNull();
    expect(await zpracujZpravu({ jsonrpc: '2.0', id: 3, method: 'nic' }, nic)).toMatchObject({ error: { code: -32601 } });
    expect(await zpracujZpravu({ id: 4, method: 'ping' }, nic)).toMatchObject({ error: { code: -32600 } });
  });

  it('tools/list a tools/call (chyba nástroje jde Claudovi jako isError, ne pád)', async () => {
    const l = await zpracujZpravu({ jsonrpc: '2.0', id: 5, method: 'tools/list' }, nic);
    expect((l?.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(NASTROJE.map((n) => n.name));
    const volano: unknown[] = [];
    const ok = await zpracujZpravu({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'hledej_v_knihach', arguments: { dotaz: 'chmel' } } },
      async (jmeno, args) => { volano.push([jmeno, args]); return 'nález'; });
    expect(ok).toMatchObject({ result: { content: [{ type: 'text', text: 'nález' }], isError: false } });
    expect(volano).toEqual([['hledej_v_knihach', { dotaz: 'chmel' }]]);
    const spatne = await zpracujZpravu({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'hledej_v_knihach', arguments: {} } },
      async () => { throw new ChybaNastroje('Napiš, co hledáš.'); });
    expect(spatne).toMatchObject({ result: { isError: true, content: [{ text: 'Napiš, co hledáš.' }] } });
    expect(await zpracujZpravu({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'smaz_vse' } }, nic))
      .toMatchObject({ error: { code: -32602 } });
    await expect(zpracujZpravu({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'seznam_knih' } },
      async () => { throw new Error('db'); })).rejects.toThrow('db');
  });

  it('dlouhý výsledek se zkrátí pod limit konektoru', () => {
    expect(orizni('x'.repeat(10), 5)).toBe('xxxxx\n\n[… zkráceno — vyžádej si menší část]');
  });
});

describe('odkazy a přehledy', () => {
  const ID = '11111111-2222-3333-4444-555555555555';
  it('odkaz otevře čtečku v appce na listu', () => {
    expect(odkazNaList(ID, 170)).toBe(`https://zajic-pivovar.pages.dev/?page=bible&sub=kniha:${ID}:170`);
  });

  it('téma podle klíče nebo názvu bez diakritiky', () => {
    const p = [{ klic: 'chmelovar', nazev: 'Chmelovar' }, { klic: 'rmutovani', nazev: 'Rmutování' }];
    expect(najdiTema(p, 'Rmutování')?.klic).toBe('rmutovani');
    expect(najdiTema(p, 'chmelovar')?.klic).toBe('chmelovar');
    expect(najdiTema(p, 'filtrace')).toBeNull();
  });

  it('citace přehledu jako odkazy + seznam zdrojů', () => {
    const t = prehledSOdkazy('Var 90 min [1], neznámá [9].', [{ n: 1, dokument_id: ID, pdf_index: 40, nazev: 'Kniha A', tistena_strana: '38' }]);
    expect(t).toContain(`Var 90 min [[1]](https://zajic-pivovar.pages.dev/?page=bible&sub=kniha:${ID}:40)`);
    expect(t).toContain('neznámá [9].');
    expect(t).toContain(`[1] Kniha A, s. 38 — https://zajic-pivovar.pages.dev/?page=bible&sub=kniha:${ID}:40`);
  });
});
