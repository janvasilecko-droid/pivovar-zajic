// 🚪 Brána projektu bible: kdo smí dál.
// ---------------------------------------------------------------------------
// Projekt bible (cegrelgvkygcatupqwrx) nemá vlastní uživatele — appka se
// přihlašuje v hlavním projektu (sasqexjadvlqyticxwja) a jeho token tady
// platforma neumí ověřit (verify_jwt je proto vypnuté v config.toml).
// Ověří ho proto ten, kdo ho vydal — hlavní projekt, dvěma dotazy naráz:
//
//   1. GET /auth/v1/user — token je pravý, nevypršel, relace žije (po
//      odhlášení neprojde) a uživatel není zablokovaný;
//   2. POST /rest/v1/rpc/bible_overeni — schválený e-mail, nastavené heslo,
//      limit požadavků a přístup do bible (cte / prispiva / spravuje).
//
// Obojí s tokenem uživatele na PEVNOU adresu hlavního projektu (nikdy ne
// z požadavku). Cokoli jiného než jasné „ano" — chyba, výpadek, pomalá
// odpověď, nesoulad uživatelů — znamená odmítnutí (fail-closed).
//
// Bez závislostí na Denu: testuje se ve vitestu (brana.test.ts).

export const HLAVNI_URL = 'https://sasqexjadvlqyticxwja.supabase.co';
export const APP_ORIGIN = 'https://zajic-pivovar.pages.dev';

export type Pristup = 'cte' | 'prispiva' | 'spravuje';

export type Uzivatel = {
  uid: string;
  email: string | null;
  pristup: Pristup | null;
  admin: boolean;
  jmeno: string | null;
};

export type Overeni =
  | { ok: true; uzivatel: Uzivatel }
  | { ok: false; status: number; kod: string; zprava: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function jeUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

export function uroven(pristup: string | null | undefined): number {
  return pristup === 'cte' ? 1 : pristup === 'prispiva' ? 2 : pristup === 'spravuje' ? 3 : 0;
}

// ---------------------------------------------------------------------------
// CORS a odpovědi
// ---------------------------------------------------------------------------
const POVOLENE_ORIGINY = [
  /^https:\/\/zajic-pivovar\.pages\.dev$/,
  /^https:\/\/[a-z0-9-]+\.zajic-pivovar\.pages\.dev$/, // náhledy Cloudflare Pages
  /^https?:\/\/localhost(:\d+)?$/, // vývoj a Capacitor
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

/** Hlavičky CORS: známý původ se vrátí, cizí dostane adresu appky (prohlížeč ho pak odmítne). */
export function corsHlavicky(origin: string | null): Record<string, string> {
  const povoleny = origin && POVOLENE_ORIGINY.some((r) => r.test(origin)) ? origin : APP_ORIGIN;
  return {
    'Access-Control-Allow-Origin': povoleny,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

export function odpoved(cors: Record<string, string>, status: number, telo: unknown): Response {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export function hotovo(cors: Record<string, string>, data: unknown): Response {
  return odpoved(cors, 200, { ok: true, data });
}

export function chyba(cors: Record<string, string>, status: number, kod: string, zprava: string): Response {
  return odpoved(cors, status, { ok: false, kod, zprava });
}

/** Tělo požadavku jako JSON objekt, nejvýš maxBajtu. Chyba = vyhozená výjimka s českou zprávou. */
export async function nactiJson(req: Request, maxBajtu: number): Promise<Record<string, unknown>> {
  const ohlaseno = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(ohlaseno) && ohlaseno > maxBajtu) throw new Error('Požadavek je příliš velký.');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBajtu) throw new Error('Požadavek je příliš velký.');
  if (!text.trim()) return {};
  const data = JSON.parse(text) as unknown;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Požadavek musí být objekt JSON.');
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Token
// ---------------------------------------------------------------------------
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** „Bearer <token>" → token ve tvaru JWT, jinak null. */
export function tokenZHlavicky(hlavicka: string | null): string | null {
  const m = (hlavicka ?? '').match(/^Bearer\s+(\S+)$/i);
  if (!m || m[1].length > 8192 || !JWT.test(m[1])) return null;
  return m[1];
}

function zBase64Url(cast: string): string {
  const b64 = cast.replace(/-/g, '+').replace(/_/g, '/');
  const doplneno = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const bajty = Uint8Array.from(atob(doplneno), (z) => z.charCodeAt(0));
  return new TextDecoder().decode(bajty);
}

/**
 * Rychlé předběžné síto BEZ ověření podpisu: role authenticated, uživatel,
 * nevypršelo. Jen ušetří dotazy do hlavního projektu u zjevně cizích tokenů
 * (veřejný anon klíč, klíč služby). Rozhoduje vždy hlavní projekt
 * (overUzivatele) — proto tu záměrně není nic, co by při drobné změně
 * tokenu u Supabase (vydavatel, nové claimy) zavřelo bibli všem.
 */
export function predbeznaKontrola(token: string, ted = Date.now()): string | null {
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(zBase64Url(token.split('.')[1])) as Record<string, unknown>;
  } catch {
    return 'Přihlášení má neplatný tvar.';
  }
  if (!claims || typeof claims !== 'object') return 'Přihlášení má neplatný tvar.';
  if (claims.role !== 'authenticated' || !jeUuid(claims.sub)) return 'Přihlášení nepatří uživateli aplikace.';
  // 30 s rezerva na rozdíl hodin; vypršení stejně pozná hlavní projekt.
  if (typeof claims.exp !== 'number' || claims.exp * 1000 + 30_000 <= ted) return 'Přihlášení vypršelo — obnov stránku.';
  return null;
}

// ---------------------------------------------------------------------------
// Ověření v hlavním projektu
// ---------------------------------------------------------------------------
type Fetch = (vstup: string, init?: RequestInit) => Promise<Response>;

export type NastaveniOvereni = {
  /** Veřejný (anon/publishable) klíč hlavního projektu — secret funkce HLAVNI_ANON_KEY. */
  anonKlic: string | undefined;
  fetch?: Fetch;
  limitMs?: number;
  /** Jen pro testy; v provozu vždy HLAVNI_URL. */
  hlavniUrl?: string;
};

const NEDOSTUPNY = 'Ověření přihlášení v hlavní appce teď neodpovídá. Zkus to za chvíli znovu.';

async function sCasovymLimitem(f: Fetch, url: string, init: RequestInit, limitMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const casovac = setTimeout(() => ctrl.abort(), limitMs);
  try {
    return await f(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(casovac);
  }
}

async function jsonNeboNull(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

export async function overUzivatele(token: string, nastaveni: NastaveniOvereni): Promise<Overeni> {
  const anonKlic = (nastaveni.anonKlic ?? '').trim();
  if (!anonKlic) {
    return { ok: false, status: 503, kod: 'nenastaveno', zprava: 'Bot nemá nastavený klíč hlavní appky (HLAVNI_ANON_KEY). Nasazení ho doplní samo.' };
  }
  const predem = predbeznaKontrola(token);
  if (predem) return { ok: false, status: 401, kod: 'neprihlasen', zprava: predem };

  const f = nastaveni.fetch ?? fetch;
  const url = (nastaveni.hlavniUrl ?? HLAVNI_URL).replace(/\/+$/, '');
  const limitMs = nastaveni.limitMs ?? 8000;
  const hlavicky = { apikey: anonKlic, Authorization: `Bearer ${token}` };

  let odpovedi: [Response, Response];
  try {
    odpovedi = await Promise.all([
      sCasovymLimitem(f, `${url}/auth/v1/user`, { method: 'GET', headers: hlavicky }, limitMs),
      sCasovymLimitem(f, `${url}/rest/v1/rpc/bible_overeni`, {
        method: 'POST',
        headers: { ...hlavicky, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      }, limitMs),
    ]);
  } catch {
    return { ok: false, status: 503, kod: 'hlavni_nedostupny', zprava: NEDOSTUPNY };
  }
  const [auth, rpc] = odpovedi;

  if (auth.status === 401 || auth.status === 403) {
    return { ok: false, status: 401, kod: 'neprihlasen', zprava: 'Přihlášení neplatí (vypršelo nebo ses odhlásil). Obnov stránku a přihlas se znovu.' };
  }
  if (!auth.ok) return { ok: false, status: 503, kod: 'hlavni_nedostupny', zprava: NEDOSTUPNY };
  const uzivatel = (await jsonNeboNull(auth)) as { id?: unknown; email?: unknown } | null;
  if (!uzivatel || !jeUuid(uzivatel.id)) return { ok: false, status: 503, kod: 'hlavni_nedostupny', zprava: NEDOSTUPNY };

  if (rpc.status === 401 || rpc.status === 403) {
    return { ok: false, status: 401, kod: 'neprihlasen', zprava: 'Přihlášení neplatí. Obnov stránku a přihlas se znovu.' };
  }
  if (rpc.status === 404) {
    return {
      ok: false, status: 503, kod: 'chybi_overeni',
      zprava: 'V hlavní databázi chybí migrace 20261231430000 (ověření pro bota) — spusť ji v Systém → Databázové migrace.',
    };
  }
  if (!rpc.ok) return { ok: false, status: 503, kod: 'hlavni_nedostupny', zprava: NEDOSTUPNY };
  const v = (await jsonNeboNull(rpc)) as Record<string, unknown> | null;
  if (!v || typeof v !== 'object') return { ok: false, status: 403, kod: 'zakazano', zprava: 'Přístup do bible se nepodařilo ověřit.' };

  switch (v.duvod) {
    case undefined:
      break;
    case 'limit':
      return { ok: false, status: 429, kod: 'limit', zprava: 'Příliš mnoho požadavků za minutu. Chvíli počkej.' };
    case 'neschvaleny_email':
      return { ok: false, status: 403, kod: 'zakazano', zprava: 'Tvůj e-mail nemá schválený přístup do aplikace.' };
    case 'bez_hesla':
      return { ok: false, status: 403, kod: 'zakazano', zprava: 'Nejdřív si v aplikaci nastav vlastní heslo.' };
    case 'neprihlasen':
      return { ok: false, status: 401, kod: 'neprihlasen', zprava: 'Přihlášení neplatí. Obnov stránku a přihlas se znovu.' };
    default:
      return { ok: false, status: 503, kod: 'hlavni_nedostupny', zprava: NEDOSTUPNY };
  }
  // Oba dotazy musí mluvit o stejném člověku.
  if (!jeUuid(v.uid) || String(v.uid).toLowerCase() !== String(uzivatel.id).toLowerCase()) {
    return { ok: false, status: 401, kod: 'neprihlasen', zprava: 'Přihlášení se nepodařilo ověřit.' };
  }
  const pristup = v.pristup === 'cte' || v.pristup === 'prispiva' || v.pristup === 'spravuje' ? v.pristup : null;
  return {
    ok: true,
    uzivatel: {
      uid: String(v.uid).toLowerCase(),
      email: typeof uzivatel.email === 'string' ? uzivatel.email : null,
      pristup,
      admin: v.admin === true,
      jmeno: typeof v.jmeno === 'string' && v.jmeno.trim() ? v.jmeno.trim().slice(0, 200) : null,
    },
  };
}

/** Klíč ze slovníku klíčů Supabase (JSON {"default": "…"}), nebo holý klíč s danou předponou. */
function klicZeSlovniku(hodnota: string | undefined, predpona: string): string {
  if (!hodnota) return '';
  try {
    const o = JSON.parse(hodnota) as unknown;
    if (o && typeof o === 'object' && !Array.isArray(o)) {
      const zaznam = o as Record<string, unknown>;
      if (typeof zaznam.default === 'string' && zaznam.default) return zaznam.default;
      const prvni = Object.values(zaznam).find((h) => typeof h === 'string' && h);
      if (typeof prvni === 'string') return prvni;
    }
  } catch {
    if (hodnota.startsWith(predpona)) return hodnota;
  }
  return '';
}

/**
 * Klíč service role projektu bible z prostředí edge funkce: nové klíče
 * (SUPABASE_SECRET_KEYS = JSON {"default": "sb_secret_…"}), jinak dřívější
 * SUPABASE_SERVICE_ROLE_KEY.
 */
export function sluzebniKlic(env: (jmeno: string) => string | undefined): string {
  return klicZeSlovniku(env('SUPABASE_SECRET_KEYS'), 'sb_secret_') || (env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

/**
 * Veřejný (publishable/anon) klíč projektu bible — smí do prohlížeče, sám nic
 * neotevře (databáze i úložiště jsou zavřené). Appka ho pošle jen jako
 * apikey u nahrání podepsaným odkazem, kdyby ho brána Supabase chtěla.
 */
export function verejnyKlic(env: (jmeno: string) => string | undefined): string {
  return klicZeSlovniku(env('SUPABASE_PUBLISHABLE_KEYS'), 'sb_publishable_') || (env('SUPABASE_ANON_KEY') ?? '');
}
