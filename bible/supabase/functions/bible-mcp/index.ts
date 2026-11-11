import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import { sluzebniKlic } from '../_shared/brana.ts';
import {
  metadataZdroje, nahodnyToken, platnyClient, platnyVerifier, registrace, s256, sha256hex, wwwAuthenticate, zpracujZpravu,
} from '../_shared/mcp.ts';
import { zavolejNastroj } from '../_shared/nastroje.ts';

/**
 * 🔌 bible-mcp — konektor Pivovarské bible do aplikace Claude (R16).
 *
 * Majitel 3. 11. 2026 zvolil „obě" (přehledy v appce + konektor). Claude
 * v aplikaci majitele (jeho předplatné) si tudy hledá v knihách, čte stránky
 * a přehledy a odpovídá s odkazy na knihy. Pravidla Anthropicu to dovolují:
 * uživatel se svým účtem v nativní aplikaci Claude, server jen nástroje.
 *
 * Cesty (za /functions/v1/bible-mcp):
 *   GET  /.well-known/oauth-protected-resource  metadata zdroje (RFC 9728)
 *   POST /register                              registrace klienta (jen Claude)
 *   POST /token                                 kód / obnovení → tokeny (PKCE S256)
 *   POST /                                      MCP (JSON-RPC, Streamable HTTP s JSON odpověďmi)
 * Schválení („Povolit") je v appce: /claude-pripojeni → bible-api mcp_povolit
 * (přihlášení a přístup ověří brána hlavního projektu, fail-closed).
 *
 * Tokeny jsou v DB jen jako sha256; přístupový platí 1 h, obnovovací 30 dní
 * (rotace, zneužití starého zruší připojení). Odpojení v appce je okamžité.
 * Do logu nejde žádný text knih ani token. Nástroje (hledání, čtení, výpočty,
 * várky, zápis zjištění) jsou v _shared/nastroje.ts — stejné má chatbot v appce.
 */

const MAX_TELO = 64 * 1024;

const json = (status: number, telo: unknown, hlavicky: Record<string, string> = {}) => new Response(JSON.stringify(telo), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...hlavicky },
});
const chybaOAuth = (status: number, error: string, popis?: string) =>
  json(status, popis ? { error, error_description: popis } : { error });

async function nactiTelo(req: Request): Promise<Record<string, string> | Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > MAX_TELO) return null;
  const typ = req.headers.get('Content-Type') ?? '';
  if (typ.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(text));
  try {
    const t = JSON.parse(text || '{}');
    return t && typeof t === 'object' ? t : null;
  } catch {
    return null;
  }
}

async function vydejTokeny() {
  const pristup = nahodnyToken();
  const obnova = nahodnyToken();
  return { pristup, obnova, pristupHash: await sha256hex(pristup), obnovaHash: await sha256hex(obnova) };
}

const odpovedTokenu = (t: { pristup: string; obnova: string }) => json(200, {
  access_token: t.pristup, token_type: 'Bearer', expires_in: 3600, refresh_token: t.obnova, scope: 'bible',
});

async function token(db: SupabaseClient, p: Record<string, unknown>): Promise<Response> {
  const druh = p.grant_type;
  const klient = p.client_id;
  if (!platnyClient(klient)) return chybaOAuth(400, 'invalid_client');
  if (druh === 'authorization_code') {
    if (typeof p.code !== 'string' || typeof p.redirect_uri !== 'string' || !platnyVerifier(p.code_verifier)) {
      return chybaOAuth(400, 'invalid_request');
    }
    const t = await vydejTokeny();
    const { data, error } = await db.rpc('bible_mcp_vymen_kod', {
      p_kod_hash: await sha256hex(p.code), p_client_id: klient, p_redirect_uri: p.redirect_uri,
      p_challenge: await s256(p.code_verifier), p_pristup_hash: t.pristupHash, p_obnova_hash: t.obnovaHash,
    });
    if (error) { console.error(`bible-mcp výměna kódu: chyba databáze ${error.code ?? '?'}`); return chybaOAuth(500, 'server_error'); }
    return data === true ? odpovedTokenu(t) : chybaOAuth(400, 'invalid_grant');
  }
  if (druh === 'refresh_token') {
    if (typeof p.refresh_token !== 'string') return chybaOAuth(400, 'invalid_request');
    const t = await vydejTokeny();
    const { data, error } = await db.rpc('bible_mcp_obnov', {
      p_obnova_hash: await sha256hex(p.refresh_token), p_client_id: klient, p_pristup_hash: t.pristupHash, p_nova_obnova_hash: t.obnovaHash,
    });
    if (error) { console.error(`bible-mcp obnovení: chyba databáze ${error.code ?? '?'}`); return chybaOAuth(500, 'server_error'); }
    return data === true ? odpovedTokenu(t) : chybaOAuth(400, 'invalid_grant');
  }
  return chybaOAuth(400, 'unsupported_grant_type');
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const cesta = url.pathname.replace(/^.*?\/bible-mcp/, '') || '/';
  const zaklad = `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/bible-mcp`;
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'Access-Control-Allow-Methods': 'GET, POST' } });
  }
  if (req.method === 'GET' && cesta.startsWith('/.well-known/oauth-protected-resource')) return json(200, metadataZdroje(zaklad));
  if (req.method === 'GET' && cesta.startsWith('/.well-known/oauth-authorization-server')) {
    return Response.redirect('https://zajic-pivovar.pages.dev/.well-known/oauth-authorization-server', 302);
  }

  const klic = sluzebniKlic((jmeno) => Deno.env.get(jmeno));
  if (!klic || !Deno.env.get('SUPABASE_URL')) return json(503, { error: 'server_error' });
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', klic, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  try {
    if (req.method === 'POST' && cesta === '/register') {
      const r = registrace(await nactiTelo(req));
      if (!r.ok) return chybaOAuth(400, 'invalid_redirect_uri', r.chyba);
      const clientId = nahodnyToken(24);
      const { error } = await db.rpc('bible_mcp_registruj', { p_client_id: clientId, p_nazev: r.nazev, p_redirect_uris: r.navraty });
      if (error) { console.error(`bible-mcp registrace: chyba databáze ${error.code ?? '?'}`); return chybaOAuth(500, 'server_error'); }
      return json(201, {
        client_id: clientId, client_name: r.nazev, redirect_uris: r.navraty, token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], client_id_issued_at: Math.floor(Date.now() / 1000),
      });
    }
    if (req.method === 'POST' && cesta === '/token') {
      const p = await nactiTelo(req);
      if (!p) return chybaOAuth(400, 'invalid_request');
      return await token(db, p as Record<string, unknown>);
    }
    if (cesta !== '/' && cesta !== '') return json(404, { error: 'not_found' });
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });

    // MCP: každé volání s platným přístupovým tokenem (fail-closed).
    const hlavicka = req.headers.get('Authorization') ?? '';
    const token_ = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(hlavicka)?.[1];
    const neprihlasen = () => json(401, { error: 'invalid_token' }, { 'WWW-Authenticate': wwwAuthenticate(zaklad) });
    if (!token_) return neprihlasen();
    const { data: overeni, error: chybaOvereni } = await db.rpc('bible_mcp_over', { p_pristup_hash: await sha256hex(token_) });
    if (chybaOvereni) { console.error(`bible-mcp ověření: chyba databáze ${chybaOvereni.code ?? '?'}`); return json(503, { error: 'server_error' }); }
    if (!Array.isArray(overeni) || overeni.length === 0) return neprihlasen();

    const telo = await nactiTelo(req);
    if (telo === null) return json(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    const zpravy = Array.isArray(telo) ? telo : [telo];
    const radek = overeni[0] as { uzivatel?: unknown; jmeno?: unknown; pristup?: unknown };
    if (typeof radek.uzivatel !== 'string' || typeof radek.pristup !== 'string') return neprihlasen();
    const zavolej = zavolejNastroj(db, { uzivatel: radek.uzivatel, jmeno: typeof radek.jmeno === 'string' ? radek.jmeno : null, pristup: radek.pristup });
    const odpovedi = (await Promise.all(zpravy.map((z) => zpracujZpravu(z as Record<string, unknown>, zavolej)))).filter((o) => o !== null);
    if (odpovedi.length === 0) return new Response(null, { status: 202 });
    return json(200, Array.isArray(telo) ? odpovedi : odpovedi[0]);
  } catch (e) {
    console.error(`bible-mcp: neočekávaná chyba ${e instanceof Error ? e.name : typeof e}`);
    return json(500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
  }
});
