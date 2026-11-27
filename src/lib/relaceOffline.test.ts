// 🔑 Přihlášení vydrží bez signálu: po hodině ve sklepě appka nesmí skončit na přihlašovací obrazovce (kde se
// bez signálu přihlásit nedá) ani nechat každý dotaz čekat ~25 s na obnovu tokenu.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CEKANI_NA_OBNOVU_MS, REZERVA_PLATNOSTI_MS, jeVyprsela, nainstalujRelaciBezSignalu, tokenVHlavicceVyprsel, ulozenaRelace,
} from './relaceOffline';

const TED = new Date('2026-11-27T10:00:00Z').getTime();
const KLIC = 'sb-zkouska-auth-token';

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (expS: number) => `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', exp: expS })}.podpis`;

function relace(expiresAtMs: number, id = 'u1') {
  const exp = Math.floor(expiresAtMs / 1000);
  return { access_token: jwt(exp), refresh_token: 'obnovovaci', expires_at: exp, token_type: 'bearer', user: { id, email: 'sladek@example.invalid' } };
}
const uloz = (r: unknown, klic = KLIC) => localStorage.setItem(klic, JSON.stringify(r));

function nastavOnline(online: boolean): () => void {
  const puvodni = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  return () => {
    delete (navigator as unknown as { onLine?: boolean }).onLine;
    if (puvodni) Object.defineProperty(Navigator.prototype, 'onLine', puvodni);
  };
}

type Auth = Parameters<typeof nainstalujRelaciBezSignalu>[0];
function atrapaAuth(getSession: Auth['getSession'], getUser?: NonNullable<Auth['getUser']>): Auth & { puvodniRelace: ReturnType<typeof vi.fn>; puvodniUzivatel: ReturnType<typeof vi.fn> } {
  const puvodniRelace = vi.fn(getSession);
  const puvodniUzivatel = vi.fn(getUser ?? (async () => ({ data: { user: null }, error: null })));
  return { storageKey: KLIC, getSession: puvodniRelace, getUser: puvodniUzivatel, puvodniRelace, puvodniUzivatel };
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(TED);
});
afterEach(() => { vi.useRealTimers(); });

describe('ulozenaRelace', () => {
  it('čte přihlášení pod klíčem knihovny — u hlavní aplikace doslova „undefined"', () => {
    uloz(relace(TED + 3600_000), 'undefined');
    expect(ulozenaRelace({ storageKey: undefined })?.user.id).toBe('u1');
    expect(ulozenaRelace({ storageKey: KLIC })).toBeNull();
    uloz(relace(TED, 'u2'));
    expect(ulozenaRelace({ storageKey: KLIC })?.user.id).toBe('u2');
  });

  it('poškozený nebo neúplný záznam není přihlášení', () => {
    localStorage.setItem(KLIC, '{nesmysl');
    expect(ulozenaRelace({ storageKey: KLIC })).toBeNull();
    for (const spatne of [null, 'text', { access_token: 'a' }, { access_token: 'a', refresh_token: 'r' }, { access_token: 'a', refresh_token: 'r', user: {} }, { access_token: 1, refresh_token: 'r', user: { id: 'u' } }]) {
      uloz(spatne);
      expect(ulozenaRelace({ storageKey: KLIC }), JSON.stringify(spatne)).toBeNull();
    }
  });
});

describe('jeVyprsela / tokenVHlavicceVyprsel', () => {
  it('token se bere jako prošlý už s rezervou před koncem (stejně jako v knihovně)', () => {
    const konec = Math.floor(TED / 1000) + 600;
    expect(jeVyprsela({ expires_at: konec }, konec * 1000 - REZERVA_PLATNOSTI_MS - 1)).toBe(false);
    expect(jeVyprsela({ expires_at: konec }, konec * 1000 - REZERVA_PLATNOSTI_MS + 1)).toBe(true);
    expect(jeVyprsela({ expires_at: konec }, konec * 1000 + 5000)).toBe(true);
    expect(jeVyprsela({ expires_at: undefined })).toBe(false);
  });

  it('token v hlavičce je prošlý podle svého vlastního údaje exp (bez rezervy)', () => {
    const exp = Math.floor(TED / 1000);
    expect(tokenVHlavicceVyprsel(`Bearer ${jwt(exp)}`, TED)).toBe(true);
    expect(tokenVHlavicceVyprsel(`bearer ${jwt(exp + 1)}`, TED)).toBe(false);
    expect(tokenVHlavicceVyprsel(jwt(exp - 100), TED)).toBe(true);
  });

  it('co není token s údajem exp, není „prošlý token" (veřejný klíč, prázdná hlavička, nesmysl)', () => {
    for (const h of [null, undefined, '', 'Bearer sb_publishable_abc', 'Bearer a.b.c', `Bearer ${b64({})}.${b64({ sub: 'x' })}.p`]) {
      expect(tokenVHlavicceVyprsel(h, TED), String(h)).toBe(false);
    }
  });
});

describe('getSession bez signálu', () => {
  it('nikdo není přihlášený, nebo token platí → rozhodne knihovna jako vždy', async () => {
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }));
    nainstalujRelaciBezSignalu(auth);
    expect((await auth.getSession()).data.session).toBeNull();
    const platna = relace(TED + 3600_000);
    uloz(platna);
    auth.puvodniRelace.mockResolvedValue({ data: { session: platna }, error: null });
    expect((await auth.getSession()).data.session).toEqual(platna);
    expect(auth.puvodniRelace).toHaveBeenCalledTimes(2);
  });

  it('platný token: i bez signálu rozhoduje knihovna (obal se do platného přihlášení neplete)', async () => {
    uloz(relace(TED + 3600_000));
    const odKnihovny = relace(TED + 3600_000, 'od-knihovny');
    const auth = atrapaAuth(async () => ({ data: { session: odKnihovny as never }, error: null }));
    nainstalujRelaciBezSignalu(auth, { vypadek: () => true });
    const vrat = nastavOnline(false);
    try {
      expect((await auth.getSession()).data.session?.user.id).toBe('od-knihovny');
      expect(auth.puvodniRelace).toHaveBeenCalledTimes(1);
    } finally { vrat(); }
  });

  it('prošlý token a telefon je offline → uložené přihlášení hned, obnova se ani nezkouší', async () => {
    const prosla = relace(TED - 3600_000);
    uloz(prosla);
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: new Error('bez spojení') }));
    nainstalujRelaciBezSignalu(auth);
    const vrat = nastavOnline(false);
    try {
      const { data, error } = await auth.getSession();
      expect(data.session?.user.id).toBe('u1');
      expect(error).toBeNull();
      expect(auth.puvodniRelace).not.toHaveBeenCalled();
    } finally { vrat(); }
  });

  it('prošlý token a server před chvílí neodpověděl (jistič) → uložené přihlášení hned', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(() => new Promise(() => {}));
    let vypadek = true;
    nainstalujRelaciBezSignalu(auth, { vypadek: () => vypadek });
    expect((await auth.getSession()).data.session?.user.id).toBe('u1');
    expect(auth.puvodniRelace).not.toHaveBeenCalled();
    // Bez známého výpadku se obnova zkusí.
    vypadek = false;
    const slib = auth.getSession();
    await vi.advanceTimersByTimeAsync(CEKANI_NA_OBNOVU_MS);
    await slib;
    expect(auth.puvodniRelace).toHaveBeenCalledTimes(1);
  });

  it('obnova, která se stihne, vrátí nové přihlášení', async () => {
    uloz(relace(TED - 1000));
    const nova = relace(TED + 3600_000);
    const auth = atrapaAuth(() => new Promise((ok) => setTimeout(() => ok({ data: { session: nova }, error: null }), 500)));
    nainstalujRelaciBezSignalu(auth);
    const slib = auth.getSession();
    await vi.advanceTimersByTimeAsync(500);
    expect((await slib).data.session).toEqual(nova);
  });

  it('obnova, která visí (slabý signál), dotaz zdrží jen krátce — pak platí uložené přihlášení', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(() => new Promise(() => {}));
    nainstalujRelaciBezSignalu(auth);
    let hotovo: unknown = null;
    void auth.getSession().then((v) => { hotovo = v; });
    await vi.advanceTimersByTimeAsync(CEKANI_NA_OBNOVU_MS - 1);
    expect(hotovo).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect((hotovo as { data: { session: { user: { id: string } } } }).data.session.user.id).toBe('u1');
  });

  it('vlastní čekání jde nastavit', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(() => new Promise(() => {}));
    nainstalujRelaciBezSignalu(auth, { cekaniMs: 50 });
    let hotovo = false;
    void auth.getSession().then(() => { hotovo = true; });
    await vi.advanceTimersByTimeAsync(50);
    expect(hotovo).toBe(true);
  });

  it('obnova selhala kvůli spojení (knihovna vrátí „nikdo") → přihlášení v telefonu platí dál', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: { name: 'AuthRetryableFetchError' } }));
    nainstalujRelaciBezSignalu(auth);
    expect((await auth.getSession()).data.session?.user.id).toBe('u1');
  });

  it('obnova, která spadne výjimkou, appku neshodí', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(async () => { throw new Error('rozbité'); });
    nainstalujRelaciBezSignalu(auth);
    expect((await auth.getSession()).data.session?.user.id).toBe('u1');
  });

  it('když knihovna přihlášení sama zruší (neplatný obnovovací token), je správně „nepřihlášen"', async () => {
    uloz(relace(TED - 1000));
    const chyba = { name: 'AuthApiError', status: 400 };
    const auth = atrapaAuth(async () => { localStorage.removeItem(KLIC); return { data: { session: null }, error: chyba }; });
    nainstalujRelaciBezSignalu(auth);
    const { data, error } = await auth.getSession();
    expect(data.session).toBeNull();
    expect(error).toBe(chyba);
  });
});

describe('getUser bez signálu', () => {
  const zeServeru = { id: 'u1', email: 'ze-serveru@example.invalid' };

  it('se spojením odpovídá server', async () => {
    uloz(relace(TED + 3600_000));
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }), async () => ({ data: { user: zeServeru as never }, error: null }));
    nainstalujRelaciBezSignalu(auth);
    expect((await auth.getUser!()).data.user).toEqual(zeServeru);
  });

  it('offline nebo při známém výpadku se na server nečeká — kdo je přihlášený, víme z telefonu', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }), () => new Promise(() => {}));
    let vypadek = false;
    nainstalujRelaciBezSignalu(auth, { vypadek: () => vypadek });
    const vrat = nastavOnline(false);
    try {
      expect((await auth.getUser!()).data.user?.email).toBe('sladek@example.invalid');
    } finally { vrat(); }
    vypadek = true;
    const { data, error } = await auth.getUser!();
    expect(data.user?.id).toBe('u1');
    expect(error).toBeNull();
    expect(auth.puvodniUzivatel).not.toHaveBeenCalled();
  });

  it('server neodpověděl (chyba spojení) → uživatel z telefonu; server odmítl → „nikdo" jako dřív', async () => {
    uloz(relace(TED + 3600_000));
    const spojeni = { name: 'AuthRetryableFetchError' };
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }), async () => ({ data: { user: null }, error: spojeni }));
    nainstalujRelaciBezSignalu(auth);
    expect((await auth.getUser!()).data.user?.id).toBe('u1');
    const odmitnuto = { name: 'AuthApiError', status: 403 };
    auth.puvodniUzivatel.mockResolvedValue({ data: { user: null }, error: odmitnuto });
    const { data, error } = await auth.getUser!();
    expect(data.user).toBeNull();
    expect(error).toBe(odmitnuto);
  });

  it('bez přihlášení v telefonu se nic nevymýšlí', async () => {
    const spojeni = { name: 'AuthRetryableFetchError' };
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }), async () => ({ data: { user: null }, error: spojeni }));
    nainstalujRelaciBezSignalu(auth, { vypadek: () => true });
    const { data, error } = await auth.getUser!();
    expect(data.user).toBeNull();
    expect(error).toBe(spojeni);
    expect(auth.puvodniUzivatel).toHaveBeenCalledTimes(1);
  });

  it('ověření cizího tokenu jde vždy na server', async () => {
    uloz(relace(TED - 1000));
    const auth = atrapaAuth(async () => ({ data: { session: null }, error: null }), async () => ({ data: { user: zeServeru as never }, error: null }));
    nainstalujRelaciBezSignalu(auth, { vypadek: () => true });
    expect((await auth.getUser!('cizi.token.x')).data.user).toEqual(zeServeru);
    expect(auth.puvodniUzivatel).toHaveBeenCalledWith('cizi.token.x');
  });

  it('klient bez getUser se obalí jen z poloviny (nic nespadne)', () => {
    const auth: Auth = { storageKey: KLIC, getSession: async () => ({ data: { session: null }, error: null }) };
    expect(() => nainstalujRelaciBezSignalu(auth)).not.toThrow();
    expect(auth.getUser).toBeUndefined();
  });
});
