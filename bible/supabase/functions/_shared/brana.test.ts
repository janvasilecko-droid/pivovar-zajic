// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  APP_ORIGIN, corsHlavicky, HLAVNI_URL, nactiJson, overUzivatele, predbeznaKontrola, sluzebniKlic, tokenZHlavicky, uroven, verejnyKlic,
} from './brana';

const UID = '11111111-2222-3333-4444-555555555555';
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = (claims: Record<string, unknown> = {}) =>
  `${b64({ alg: 'ES256', kid: 'k' })}.${b64({ sub: UID, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, ...claims })}.podpis`;

type Odpovedi = { auth?: Response | Error; rpc?: Response | Error };
const json = (status: number, telo: unknown) => new Response(JSON.stringify(telo), { status, headers: { 'Content-Type': 'application/json' } });

function falesnyFetch(o: Odpovedi) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const r = url.endsWith('/auth/v1/user') ? o.auth : o.rpc;
    if (r instanceof Error) throw r;
    return r ?? json(500, {});
  });
}

const OK_AUTH = () => json(200, { id: UID, email: 'honza@zajic.cz' });
const OK_RPC = (navic: Record<string, unknown> = {}) => json(200, { uid: UID, pristup: 'spravuje', admin: true, jmeno: 'Honza', ...navic });

describe('tokenZHlavicky', () => {
  it('bere jen „Bearer <JWT>"', () => {
    const t = token();
    expect(tokenZHlavicky(`Bearer ${t}`)).toBe(t);
    expect(tokenZHlavicky(`bearer ${t}`)).toBe(t);
    expect(tokenZHlavicky(null)).toBeNull();
    expect(tokenZHlavicky('Bearer')).toBeNull();
    expect(tokenZHlavicky('Bearer sb_publishable_abc')).toBeNull();
    expect(tokenZHlavicky(`Basic ${t}`)).toBeNull();
    expect(tokenZHlavicky(`Bearer ${t} navic`)).toBeNull();
    expect(tokenZHlavicky(`Bearer ${'a'.repeat(9000)}.b.c`)).toBeNull();
  });
});

describe('predbeznaKontrola', () => {
  it('pustí token přihlášeného uživatele', () => {
    expect(predbeznaKontrola(token())).toBeNull();
  });
  it('odmítne veřejný anon klíč, klíč služby, vypršelý a rozbitý token', () => {
    expect(predbeznaKontrola(token({ role: 'anon' }))).toMatch(/nepatří/);
    expect(predbeznaKontrola(token({ role: 'service_role', sub: undefined }))).toMatch(/nepatří/);
    expect(predbeznaKontrola(token({ sub: 'neni-uuid' }))).toMatch(/nepatří/);
    expect(predbeznaKontrola(token({ exp: Math.floor(Date.now() / 1000) - 120 }))).toMatch(/vypršelo/);
    expect(predbeznaKontrola(token({ exp: undefined }))).toMatch(/vypršelo/);
    expect(predbeznaKontrola('a.###.c')).toMatch(/tvar/);
    expect(predbeznaKontrola(`${b64({})}.${Buffer.from('null').toString('base64url')}.x`)).toMatch(/tvar/);
  });
  it('drobný rozdíl hodin (pod 30 s) nevadí', () => {
    expect(predbeznaKontrola(token({ exp: Math.floor(Date.now() / 1000) - 10 }))).toBeNull();
  });
});

describe('overUzivatele', () => {
  it('ověří v HLAVNÍM projektu tokenem uživatele a vrátí přístup', async () => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC() });
    const t = token();
    const v = await overUzivatele(t, { anonKlic: 'anon-hlavni', fetch: f });
    expect(v).toEqual({ ok: true, uzivatel: { uid: UID, email: 'honza@zajic.cz', pristup: 'spravuje', admin: true, jmeno: 'Honza' } });
    expect(f).toHaveBeenCalledTimes(2);
    const volani = f.mock.calls.map(([url, init]) => ({ url, init: init as RequestInit }));
    expect(volani.map((c) => c.url).sort()).toEqual([`${HLAVNI_URL}/auth/v1/user`, `${HLAVNI_URL}/rest/v1/rpc/bible_overeni`]);
    for (const c of volani) {
      const h = c.init.headers as Record<string, string>;
      expect(h.apikey).toBe('anon-hlavni');
      expect(h.Authorization).toBe(`Bearer ${t}`);
      expect(c.init.signal).toBeInstanceOf(AbortSignal);
    }
    expect(volani.find((c) => c.url.includes('/rpc/'))?.init.method).toBe('POST'); // GET by šel jen pro čtení a limit by spadl
  });

  it('bez klíče hlavní appky nikoho nepustí', async () => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC() });
    const v = await overUzivatele(token(), { anonKlic: '  ', fetch: f });
    expect(v).toMatchObject({ ok: false, status: 503, kod: 'nenastaveno' });
    expect(f).not.toHaveBeenCalled();
  });

  it('zjevně cizí token do hlavního projektu vůbec nepošle', async () => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC() });
    expect(await overUzivatele(token({ role: 'anon' }), { anonKlic: 'k', fetch: f })).toMatchObject({ ok: false, status: 401 });
    expect(f).not.toHaveBeenCalled();
  });

  it.each([
    ['odhlášený (relace neexistuje)', { auth: json(403, { error_code: 'session_not_found' }) }, 401, 'neprihlasen'],
    ['neplatný token', { auth: json(401, {}) }, 401, 'neprihlasen'],
    ['Auth hlavního projektu nefunguje', { auth: json(500, {}) }, 503, 'hlavni_nedostupny'],
    ['Auth vrátí nesmysl', { auth: json(200, { id: 'x' }) }, 503, 'hlavni_nedostupny'],
    ['RPC odmítne token', { rpc: json(401, {}) }, 401, 'neprihlasen'],
    ['v hlavní DB chybí migrace', { rpc: json(404, { code: 'PGRST202' }) }, 503, 'chybi_overeni'],
    ['RPC spadne', { rpc: json(500, {}) }, 503, 'hlavni_nedostupny'],
    ['RPC vrátí null', { rpc: json(200, null) }, 403, 'zakazano'],
    ['limit požadavků', { rpc: json(200, { duvod: 'limit' }) }, 429, 'limit'],
    ['neschválený e-mail', { rpc: json(200, { duvod: 'neschvaleny_email' }) }, 403, 'zakazano'],
    ['bez hesla', { rpc: json(200, { duvod: 'bez_hesla' }) }, 403, 'zakazano'],
    ['chyba v databázi', { rpc: json(200, { duvod: 'chyba', kod: '42883' }) }, 503, 'hlavni_nedostupny'],
    ['neznámý důvod', { rpc: json(200, { duvod: 'novinka' }) }, 503, 'hlavni_nedostupny'],
    ['jiný uživatel v RPC než v Auth', { rpc: OK_RPC({ uid: '99999999-2222-3333-4444-555555555555' }) }, 401, 'neprihlasen'],
    ['RPC bez uživatele', { rpc: OK_RPC({ uid: null }) }, 401, 'neprihlasen'],
    ['síť spadla', { rpc: new TypeError('fetch failed') }, 503, 'hlavni_nedostupny'],
  ])('%s → odmítnuto (%i %s)', async (_popis, o, status, kod) => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC(), ...o } as Odpovedi);
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f })).toMatchObject({ ok: false, status, kod });
  });

  it('neplatný klíč hlavní appky (vyměněný bez nasazení): 503 s radou, ne „přihlas se znovu"', async () => {
    const klic = () => json(401, { message: 'Invalid API key', hint: 'Double check your Supabase `anon` or `service_role` API key.' });
    const f = falesnyFetch({ auth: klic(), rpc: klic() });
    expect(await overUzivatele(token(), { anonKlic: 'stary', fetch: f })).toMatchObject({ ok: false, status: 503, kod: 'klic_hlavni' });
    // Odmítnutý token uživatele (GoTrue s error_code) zůstává „přihlas se znovu".
    const f2 = falesnyFetch({ auth: json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }), rpc: json(401, { code: 'PGRST301', message: 'JWT expired' }) });
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f2 })).toMatchObject({ ok: false, status: 401, kod: 'neprihlasen' });
  });

  it.each([
    ['vypnuté staré klíče (legacy) v hlavním projektu', { message: 'Legacy API keys are disabled', hint: 'Re-enable them in the Supabase dashboard, or use the new publishable and secret API keys.' }],
    ['chybějící klíč', { message: 'No API key found in request', hint: 'No `apikey` request header or url param was found.' }],
    ['brána s novým, neznámým textem (bez kódu Auth/PostgREST)', { message: 'Unregistered API key' }],
    ['brána s úplně jiným textem (bez kódu Auth/PostgREST)', { message: 'API key revoked' }],
  ])('klíč hlavní appky neplatí — %s: 503 klic_hlavni', async (_popis, telo) => {
    const f = falesnyFetch({ auth: json(401, telo), rpc: json(401, telo) });
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f })).toMatchObject({ ok: false, status: 503, kod: 'klic_hlavni' });
  });

  it.each([
    ['jen jedna odpověď vypadá jako brána', json(401, { message: 'Invalid JWT' }), json(401, { code: 'PGRST301', message: 'JWT invalid' })],
    ['prázdné tělo', json(401, {}), json(401, { message: '' })],
    ['tělo není JSON', new Response('nic', { status: 401 }), new Response('nic', { status: 401 })],
    ['pole místo objektu', json(401, ['Invalid API key']), json(401, ['Invalid API key'])],
  ])('odmítnutý token, ne klíč — %s: 401 neprihlasen', async (_popis, auth, rpc) => {
    const f = falesnyFetch({ auth, rpc });
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f })).toMatchObject({ ok: false, status: 401, kod: 'neprihlasen' });
  });

  it('pomalý hlavní projekt = odmítnuto (časový limit)', async () => {
    const f = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_ok, ko) => {
      init?.signal?.addEventListener('abort', () => ko(new DOMException('aborted', 'AbortError')));
    }));
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f, limitMs: 20 })).toMatchObject({ ok: false, status: 503 });
  });

  it('neznámý přístup = žádný; admin jen při true; jméno se ořízne', async () => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC({ pristup: 'SPRAVUJE', admin: 'true', jmeno: '  ' }) });
    const v = await overUzivatele(token(), { anonKlic: 'k', fetch: f });
    expect(v).toMatchObject({ ok: true, uzivatel: { pristup: null, admin: false, jmeno: null } });
  });

  it('přihlášený bez práva do bible projde ověřením s pristup = null (bible-api ho pak odmítne)', async () => {
    const f = falesnyFetch({ auth: OK_AUTH(), rpc: OK_RPC({ pristup: null, admin: false }) });
    expect(await overUzivatele(token(), { anonKlic: 'k', fetch: f })).toMatchObject({ ok: true, uzivatel: { pristup: null } });
  });
});

describe('corsHlavicky', () => {
  it('appka, náhledy a vývoj se vrátí, cizí web dostane adresu appky', () => {
    expect(corsHlavicky('https://zajic-pivovar.pages.dev')['Access-Control-Allow-Origin']).toBe('https://zajic-pivovar.pages.dev');
    expect(corsHlavicky('https://abc123.zajic-pivovar.pages.dev')['Access-Control-Allow-Origin']).toBe('https://abc123.zajic-pivovar.pages.dev');
    expect(corsHlavicky('http://localhost:5173')['Access-Control-Allow-Origin']).toBe('http://localhost:5173');
    expect(corsHlavicky('https://localhost')['Access-Control-Allow-Origin']).toBe('https://localhost');
    expect(corsHlavicky('https://zlo.example')['Access-Control-Allow-Origin']).toBe(APP_ORIGIN);
    expect(corsHlavicky('https://zajic-pivovar.pages.dev.zlo.example')['Access-Control-Allow-Origin']).toBe(APP_ORIGIN);
    expect(corsHlavicky(null)['Access-Control-Allow-Origin']).toBe(APP_ORIGIN);
    expect(corsHlavicky(null).Vary).toBe('Origin');
  });
});

describe('nactiJson', () => {
  const req = (telo: string, delka?: string) => new Request('https://x/', {
    method: 'POST', body: telo, headers: delka ? { 'content-length': delka } : {},
  });
  it('objekt projde, velké nebo jiné tělo ne', async () => {
    expect(await nactiJson(req('{"akce":"dokumenty"}'), 100)).toEqual({ akce: 'dokumenty' });
    expect(await nactiJson(req(''), 100)).toEqual({});
    await expect(nactiJson(req('[1]'), 100)).rejects.toThrow(/objekt/);
    await expect(nactiJson(req('"x"'), 100)).rejects.toThrow(/objekt/);
    await expect(nactiJson(req(`{"a":"${'x'.repeat(200)}"}`), 100)).rejects.toThrow(/velký/);
    await expect(nactiJson(req('{}', '999999'), 100)).rejects.toThrow(/velký/);
    await expect(nactiJson(req('{nejson'), 100)).rejects.toThrow(SyntaxError);
  });
});

describe('sluzebniKlic a uroven', () => {
  it('nové klíče mají přednost, jinak dřívější service role', () => {
    const env = (o: Record<string, string>) => (k: string) => o[k];
    expect(sluzebniKlic(env({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }))).toBe('sb_secret_a');
    expect(sluzebniKlic(env({ SUPABASE_SECRET_KEYS: '{"jiny":"sb_secret_b"}' }))).toBe('sb_secret_b');
    expect(sluzebniKlic(env({ SUPABASE_SECRET_KEYS: 'sb_secret_c' }))).toBe('sb_secret_c');
    expect(sluzebniKlic(env({ SUPABASE_SECRET_KEYS: '{}', SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }))).toBe('eyJ');
    expect(sluzebniKlic(env({}))).toBe('');
    expect(verejnyKlic(env({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_x"}', SUPABASE_ANON_KEY: 'eyJ' }))).toBe('sb_publishable_x');
    expect(verejnyKlic(env({ SUPABASE_ANON_KEY: 'eyJanon' }))).toBe('eyJanon');
    expect(verejnyKlic(env({ SUPABASE_PUBLISHABLE_KEYS: 'sb_secret_omylem' }))).toBe('');
  });
  it('úrovně přístupu', () => {
    expect([uroven('cte'), uroven('prispiva'), uroven('spravuje'), uroven(null), uroven('admin')]).toEqual([1, 2, 3, 0, 0]);
  });
});
