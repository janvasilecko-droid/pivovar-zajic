import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.110.7';
import { jeUuid, sluzebniKlic } from '../_shared/brana.ts';
import { ChybaVstupu } from '../_shared/vstupy.ts';
import {
  dotazHledani, jeCitelny, sPrekladem, SLOUPCE_LISTU, SLOUPCE_PREKLADU, slovaDotazu, uryvek,
} from '../_shared/cteni.ts';
import {
  ChybaNastroje, metadataZdroje, najdiTema, nahodnyToken, odkazNaList, platnyClient, platnyVerifier,
  prehledSOdkazy, registrace, s256, sha256hex, wwwAuthenticate, zpracujZpravu,
} from '../_shared/mcp.ts';

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
 * Do logu nejde žádný text knih ani token.
 */

const MAX_TELO = 64 * 1024;
const VYSLEDKU = 25;

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

// --- nástroje -------------------------------------------------------------------

const misto = (tistena: string | null | undefined, list: number) => (tistena ? `s. ${tistena}` : `list ${list}`);

function textVstupu(e: unknown): never {
  if (e instanceof ChybaVstupu) throw new ChybaNastroje(e.message);
  throw e;
}

async function citelny(db: SupabaseClient, id: string): Promise<{ nazev: string }> {
  const { data, error } = await db.from('bible_dokumenty').select('nazev,stav').eq('id', id).maybeSingle();
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  if (!data) throw new ChybaNastroje('Kniha s tímto id v knihovně není (seznam_knih vrátí platná id).');
  if (!jeCitelny((data as { stav: string }).stav)) throw new ChybaNastroje('Kniha ještě není zpracovaná — zkus ji později.');
  return { nazev: String((data as { nazev: string }).nazev) };
}

async function hledej(db: SupabaseClient, args: Record<string, unknown>): Promise<string> {
  let dotaz: string;
  try { dotaz = dotazHledani(args.dotaz); } catch (e) { textVstupu(e); }
  const kniha = args.kniha_id === undefined || args.kniha_id === null || args.kniha_id === '' ? null : args.kniha_id;
  if (kniha !== null && !jeUuid(kniha)) throw new ChybaNastroje('kniha_id musí být id knihy ze seznam_knih.');
  const { data, error } = await db.rpc('bible_hledej', { p_dotaz: dotaz, p_dokument: kniha, p_limit: VYSLEDKU });
  if (error?.code === 'PGRST202') throw new ChybaNastroje('Hledání v databázi bible ještě není zapnuté (migrace 20261103010000_bible_hledani).');
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const radky = (data ?? []) as {
    dokument_id: string; nazev: string; autor: string | null; rok: number | null; zdroj: string;
    pdf_index: number; tistena_strana: string | null; kapitola: string | null; text: string;
  }[];
  if (radky.length === 0) return `Pro „${dotaz}" jsem v knihách nic nenašel. Zkus jiné nebo kratší slovo, případně anglicky či německy.`;
  const slova = slovaDotazu(dotaz);
  const casti = radky.map((r, i) => [
    `${i + 1}. ${r.nazev}${r.autor ? ` (${r.autor}${r.rok ? `, ${r.rok}` : ''})` : ''} — ${misto(r.tistena_strana, r.pdf_index)}`
      + `${r.kapitola ? `, kapitola „${r.kapitola}"` : ''} — ${r.zdroj === 'preklad' ? 'český překlad' : 'originál'}`,
    `   kniha_id=${r.dokument_id} list=${r.pdf_index} odkaz: ${odkazNaList(r.dokument_id, r.pdf_index)}`,
    `   ${uryvek(r.text, slova)}`,
  ].join('\n'));
  return `Nalezeno ${radky.length} míst pro „${dotaz}" (celý text a kontext: precti_stranu s kniha_id a list):\n\n${casti.join('\n\n')}`;
}

async function prectiStranu(db: SupabaseClient, args: Record<string, unknown>): Promise<string> {
  if (!jeUuid(args.kniha_id)) throw new ChybaNastroje('kniha_id musí být id knihy ze seznam_knih.');
  const list = typeof args.list === 'number' && Number.isInteger(args.list) && args.list >= 1 ? args.list : null;
  if (list === null) throw new ChybaNastroje('list musí být celé číslo od 1.');
  const pocet = typeof args.pocet === 'number' && Number.isInteger(args.pocet) ? Math.min(3, Math.max(1, args.pocet)) : 2;
  const id = args.kniha_id.toLowerCase();
  const { nazev } = await citelny(db, id);
  const dotaz = (sloupce: string) => db.from('bible_strany').select(sloupce).eq('dokument_id', id).gte('pdf_index', list).order('pdf_index').limit(pocet);
  let { data, error } = await dotaz(`${SLOUPCE_LISTU},${SLOUPCE_PREKLADU}`);
  if (error?.code === '42703') ({ data, error } = await dotaz(SLOUPCE_LISTU));
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const listy = ((data ?? []) as Record<string, unknown>[]).map((l) => sPrekladem(l as { preklad?: string | null })) as unknown as {
    pdf_index: number; tistena_strana: string | null; text: string; ke_kontrole: boolean; kontrola_duvod: string | null;
    preklad: string | null; preklad_kontrola: string | null;
  }[];
  if (listy.length === 0) throw new ChybaNastroje('Takový list kniha nemá.');
  return listy.map((l) => {
    const hlava = `### ${nazev} — ${misto(l.tistena_strana, l.pdf_index)} (list ${l.pdf_index})\nOdkaz: ${odkazNaList(id, l.pdf_index)}`;
    const pozor = [
      l.ke_kontrole ? `Pozor: přepis strany ke kontrole${l.kontrola_duvod ? ` (${l.kontrola_duvod})` : ''} — čísla ověř v originále.` : '',
      l.preklad && l.preklad_kontrola ? `Pozor u překladu: ${l.preklad_kontrola}.` : '',
    ].filter(Boolean).join('\n');
    const telo = l.preklad
      ? `Český překlad:\n${l.preklad}\n\nOriginál:\n${l.text}`
      : `${l.preklad === null ? '(Český překlad zatím není.)\n' : ''}${l.text || '(Na listu není text.)'}`;
    return [hlava, pozor, telo].filter(Boolean).join('\n\n');
  }).join('\n\n---\n\n');
}

async function prehledTematu(db: SupabaseClient, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from('bible_prehledy').select('klic,nazev,oblast').order('poradi');
  if (error?.code === 'PGRST205' || error?.code === '42P01') return 'Přehledy témat v databázi bible ještě nejsou (migrace 20261103020000_bible_prehledy).';
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const seznam = (data ?? []) as { klic: string; nazev: string }[];
  if (seznam.length === 0) return 'Přehledy témat ještě nejsou napsané — vzniknou, až budou všechny knihy zpracované a přeložené. Použij hledej_v_knihach.';
  const tema = typeof args.tema === 'string' ? args.tema : '';
  const p = tema ? najdiTema(seznam, tema) : null;
  if (!p) {
    return `${tema ? `Přehled „${tema}" není. ` : ''}Dostupné přehledy: ${seznam.map((s) => `${s.nazev} (${s.klic})`).join(', ')}.`;
  }
  const r = await db.from('bible_prehledy').select('nazev,text,zdroje,kontrola').eq('klic', p.klic).maybeSingle();
  if (r.error) throw new Error(`db ${r.error.code ?? '?'}`);
  const d = r.data as { nazev: string; text: string; zdroje: { n: number; dokument_id: string; pdf_index: number; nazev: string; tistena_strana: string | null }[]; kontrola: string | null };
  return `# Přehled: ${d.nazev}\n${d.kontrola ? `Pozor: ${d.kontrola}.\n` : ''}\n${prehledSOdkazy(d.text, Array.isArray(d.zdroje) ? d.zdroje : [])}`;
}

async function seznamKnih(db: SupabaseClient): Promise<string> {
  const { data, error } = await db.from('bible_dokumenty').select('id,nazev,autor,rok,jazyk,stav,stran_celkem').order('nazev');
  if (error) throw new Error(`db ${error.code ?? '?'}`);
  const knihy = (data ?? []) as { id: string; nazev: string; autor: string | null; rok: number | null; jazyk: string | null; stav: string; stran_celkem: number | null }[];
  if (knihy.length === 0) return 'Knihovna je zatím prázdná.';
  return knihy.map((k) => `- ${k.nazev}${k.autor ? ` — ${k.autor}` : ''}${k.rok ? `, ${k.rok}` : ''}${k.jazyk ? ` [${k.jazyk}]` : ''}`
    + ` — ${jeCitelny(k.stav) ? 'zpracovaná' : `stav: ${k.stav}`}${k.stran_celkem ? `, ${k.stran_celkem} stran` : ''} — kniha_id=${k.id}`).join('\n');
}

function zavolejNastroj(db: SupabaseClient) {
  return (jmeno: string, args: Record<string, unknown>): Promise<string> => {
    if (jmeno === 'hledej_v_knihach') return hledej(db, args);
    if (jmeno === 'precti_stranu') return prectiStranu(db, args);
    if (jmeno === 'prehled_tematu') return prehledTematu(db, args);
    return seznamKnih(db);
  };
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
    const zavolej = zavolejNastroj(db);
    const odpovedi = (await Promise.all(zpravy.map((z) => zpracujZpravu(z as Record<string, unknown>, zavolej)))).filter((o) => o !== null);
    if (odpovedi.length === 0) return new Response(null, { status: 202 });
    return json(200, Array.isArray(telo) ? odpovedi : odpovedi[0]);
  } catch (e) {
    console.error(`bible-mcp: neočekávaná chyba ${e instanceof Error ? e.name : typeof e}`);
    return json(500, { jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Internal error' } });
  }
});
