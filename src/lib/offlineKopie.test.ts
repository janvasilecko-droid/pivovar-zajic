// 📴 Stahování kopie provozních tabulek do telefonu (se signálem, na pozadí) — aby bez signálu bylo z čeho
// odpovídat. Majitel 27. 11. 2026: „offline si to má držet aspoň objednávky na daný týden, závozy, stáčení,
// sklad aktuální." Data v testech jsou vymyšlená.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { supabase } from './supabase';
import {
  MAX_RADKU_TABULKY, OBNOVA_CELA_MS, OBNOVA_PO_NAVRATU_MS, ODSTUP_CELE_PO_ZMENE_MS, TABULKY_KOPIE, ZDRZENI_PO_ZMENE_MS,
  spustUdrzbuKopie, stahniKopii, stahniTabulku, zapomenBehyKopieProTesty,
} from './offlineKopie';
import { nactiKopii, nastavUzivateleKopie, popisCasuKopie, stavKopie, ulozKopii, ulozStavKopie, vetaOKopii, zapomenKopiiProTesty } from './offlineKopieSklad';
import { UDALOST_SPOJENI_ZPET, ohlasSelhaniSite, vynulujJisticProTesty } from './jisticSpojeni';
import { zneplatniTabulku, zneplatniVse } from './zneplatneni';

const T0 = new Date('2026-11-27T10:00:00Z').getTime();
type Pozadavek = { tabulka: string; razeni: boolean; offset: number; autorizace: string | null; klic: string | null };
type Odpoved = unknown[] | { status: number; telo?: unknown } | 'spadne' | 'nesmysl';

/** Atrapa serveru: `rozhodni` vrací řádky, chybu serveru, nebo pád spojení. */
function server(rozhodni: (p: Pozadavek) => Odpoved = () => []) {
  const pozadavky: Pozadavek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: any, init?: RequestInit) => {
    const url = new URL(String(input?.url ?? input));
    const h = new Headers(init?.headers);
    const p: Pozadavek = {
      tabulka: url.pathname.replace('/rest/v1/', ''), razeni: url.searchParams.get('order') === 'id.asc',
      offset: Number(url.searchParams.get('offset')), autorizace: h.get('Authorization'), klic: h.get('apikey'),
    };
    pozadavky.push(p);
    const co = rozhodni(p);
    if (co === 'spadne') throw new TypeError('Failed to fetch');
    if (co === 'nesmysl') return new Response('<html>brána</html>', { status: 200 });
    if (Array.isArray(co)) return new Response(JSON.stringify(co), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(co.telo ?? { message: 'chyba' }), { status: co.status, headers: { 'Content-Type': 'application/json' } });
  }));
  return pozadavky;
}
const radky = (n: number, od = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${String(od + i).padStart(5, '0')}` }));
const tabulky = (p: Pozadavek[]) => Array.from(new Set(p.map((x) => x.tabulka)));

function prihlas(uzivatel: string | null = 'u1', token = 'token-uzivatele') {
  return vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
    data: { session: uzivatel ? ({ access_token: token, user: { id: uzivatel } } as never) : null }, error: null,
  } as never);
}

function nastavOnline(online: boolean): () => void {
  const puvodni = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', { value: online, configurable: true });
  return () => {
    delete (navigator as unknown as { onLine?: boolean }).onLine;
    if (puvodni) Object.defineProperty(Navigator.prototype, 'onLine', puvodni);
  };
}

beforeEach(() => {
  localStorage.clear();
  zapomenKopiiProTesty();
  zapomenBehyKopieProTesty();
  vynulujJisticProTesty();
  nastavUzivateleKopie('u1');
  prihlas();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('seznam tabulek', () => {
  it('drží objednávky, závoz, stáčení a sklad — a nic citlivého navíc', () => {
    for (const t of ['orders', 'order_items', 'zavoz_deductions', 'kegging', 'bottling', 'inventory', 'fasovani', 'writeoffs', 'beers', 'packages', 'places']) {
      expect(TABULKY_KOPIE, t).toContain(t);
    }
    for (const t of ['whatsapp_incoming', 'app_secrets', 'audit_log', 'push_subscriptions', 'chyby', 'user_app_versions']) {
      expect(TABULKY_KOPIE, t).not.toContain(t);
    }
    expect(new Set(TABULKY_KOPIE).size).toBe(TABULKY_KOPIE.length);
  });
});

describe('stahniTabulku', () => {
  it('malá tabulka: jeden dotaz bez řazení (pořadí řádků jako od serveru), s tokenem přihlášeného', async () => {
    const p = server(() => [{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
    expect(await stahniTabulku('beers', 'tok')).toEqual([{ id: 'b', n: 2 }, { id: 'a', n: 1 }]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ tabulka: 'beers', razeni: false, offset: 0, autorizace: 'Bearer tok' });
    expect(p[0].klic).toBeTruthy();
  });

  it('tabulka nad tisíc řádků se stáhne po stránkách v pevném pořadí — žádný řádek nechybí ani není dvakrát', async () => {
    const vsechny = radky(2340);
    const p = server((x) => (x.razeni ? vsechny.slice(x.offset, x.offset + 1000) : vsechny.slice(0, 1000)));
    const stazene = await stahniTabulku('order_items', 'tok');
    expect(stazene).toHaveLength(2340);
    expect(new Set(stazene.map((r) => r.id)).size).toBe(2340);
    expect(p.map((x) => `${x.razeni ? 'id' : '-'}@${x.offset}`)).toEqual(['-@0', 'id@0', 'id@1000', 'id@2000']);
  });

  it('přesně tisíc řádků: další stránka je prázdná a tím to končí', async () => {
    const vsechny = radky(1000);
    const p = server((x) => (x.razeni ? vsechny.slice(x.offset, x.offset + 1000) : vsechny));
    expect(await stahniTabulku('kegging', 'tok')).toHaveLength(1000);
    expect(p).toHaveLength(3);
  });

  it('velká tabulka bez sloupce id se nestáhne — radši nic než neúplná kopie', async () => {
    server((x) => (x.razeni ? { status: 400, telo: { message: 'column id does not exist' } } : radky(1000)));
    await expect(stahniTabulku('male_sudy', 'tok')).rejects.toThrow(/bez id/);
  });

  it('pojistka proti obří tabulce', async () => {
    server((x) => radky(1000, x.offset));
    await expect(stahniTabulku('orders', 'tok')).rejects.toThrow(/moc velká/);
    expect(MAX_RADKU_TABULKY).toBeGreaterThanOrEqual(20_000);
  });

  it('chyba serveru a nesmyslná odpověď jsou chyby, ne prázdná tabulka', async () => {
    server(() => ({ status: 403 }));
    await expect(stahniTabulku('orders', 'tok')).rejects.toThrow('server odpověděl 403');
    server(() => 'nesmysl');
    await expect(stahniTabulku('orders', 'tok')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ zprava: 'objekt' }), { status: 200 })));
    await expect(stahniTabulku('orders', 'tok')).rejects.toThrow(/není seznam/);
  });
});

describe('stahniKopii', () => {
  it('stáhne všechny tabulky, uloží je pro přihlášeného a zapíše souhrn', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    const p = server((x) => (x.tabulka === 'orders' ? [{ id: 'o1' }, { id: 'o2' }] : x.tabulka === 'beers' ? [{ id: 'b1' }] : []));
    const v = await stahniKopii();
    expect(v).toMatchObject({ ok: true, preskoceno: null, nestazene: [] });
    expect(v.stazene.slice().sort()).toEqual(TABULKY_KOPIE.slice().sort());
    expect(tabulky(p).sort()).toEqual(TABULKY_KOPIE.slice().sort());
    expect(p.every((x) => x.autorizace === 'Bearer token-uzivatele')).toBe(true);
    expect(await nactiKopii('orders')).toEqual({ rows: [{ id: 'o1' }, { id: 'o2' }], t: T0, uzivatel: 'u1' });
    expect((await nactiKopii('kegging'))?.rows).toEqual([]);              // prázdná tabulka je taky odpověď
    expect(stavKopie()).toEqual({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: TABULKY_KOPIE.length, radku: 3, nestazene: [] });
  });

  it('jen vyjmenované tabulky — a jen ty, které do kopie patří', async () => {
    const p = server(() => [{ id: 'x' }]);
    const v = await stahniKopii(['orders', 'whatsapp_incoming', 'kegging']);
    expect(v.stazene.sort()).toEqual(['kegging', 'orders']);
    expect(tabulky(p).sort()).toEqual(['kegging', 'orders']);
    // Částečné stažení neznamená „mám všechno".
    expect(stavKopie().uplneT).toBeNull();
    expect(stavKopie().tabulek).toBe(2);
  });

  it('nepřihlášený nic nestahuje', async () => {
    prihlas(null);
    const p = server();
    expect(await stahniKopii()).toMatchObject({ ok: false, preskoceno: 'neprihlasen', stazene: [] });
    expect(p).toHaveLength(0);
  });

  it('bez signálu (telefon to ví, nebo server před chvílí neodpověděl) se nestahuje', async () => {
    const p = server();
    const vrat = nastavOnline(false);
    try {
      expect(await stahniKopii()).toMatchObject({ ok: false, preskoceno: 'offline' });
    } finally { vrat(); }
    ohlasSelhaniSite(Date.now() - 10_000);
    expect(await stahniKopii()).toMatchObject({ ok: false, preskoceno: 'offline' });
    expect(p).toHaveLength(0);
  });

  it('když spadne spojení, stahování skončí a starší kopie zůstane — nikdy se nepřepíše prázdnem', async () => {
    await ulozKopii('orders', { rows: [{ id: 'stara' }], t: 1, uzivatel: 'u1' });
    ulozStavKopie({ uplneT: 1, posledniT: 1, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    const p = server(() => 'spadne');
    const v = await stahniKopii();
    expect(v.ok).toBe(false);
    expect(v.stazene).toEqual([]);
    expect(v.nestazene).toHaveLength(TABULKY_KOPIE.length);
    expect(v.nestazene.every((n) => n.duvod === 'bez spojení')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(4);                                 // další tabulky se už nezkoušely
    expect((await nactiKopii('orders'))?.rows).toEqual([{ id: 'stara' }]);
    expect(stavKopie().uplneT).toBe(1);
  });

  it('prošlé přihlášení stahování zastaví (nezkouší se 47 tabulek se stejným výsledkem)', async () => {
    const p = server(() => ({ status: 401 }));
    const v = await stahniKopii();
    expect(v.nestazene.every((n) => n.duvod === 'přihlášení vypršelo')).toBe(true);
    expect(p.length).toBeLessThanOrEqual(4);
  });

  it('chyba jedné tabulky ostatní nezdrží; „úplná" kopie to ale není', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    ulozStavKopie({ uplneT: 5, posledniT: 5, uzivatel: 'u1', tabulek: 0, radku: 0, nestazene: [] });
    server((x) => (x.tabulka === 'vycepy' ? { status: 404 } : [{ id: 'x' }]));
    const v = await stahniKopii();
    expect(v.ok).toBe(false);
    expect(v.nestazene).toEqual([{ tabulka: 'vycepy', duvod: 'server odpověděl 404' }]);
    expect(v.stazene).toHaveLength(TABULKY_KOPIE.length - 1);
    expect(stavKopie()).toMatchObject({ uplneT: 5, posledniT: T0, nestazene: ['vycepy'], tabulek: TABULKY_KOPIE.length - 1 });
    // Příště se povede → ze seznamu nestažených zmizí.
    server(() => [{ id: 'x' }]);
    await stahniKopii(['vycepy']);
    expect(stavKopie().nestazene).toEqual([]);
  });

  it('po přihlášení jiného účtu se počty a „úplnost" staré kopie nepřenesou', async () => {
    server(() => [{ id: 'x' }]);
    await stahniKopii();
    expect(stavKopie().tabulek).toBe(TABULKY_KOPIE.length);
    prihlas('u2', 'token-druheho');
    nastavUzivateleKopie('u2');
    const p = server(() => [{ id: 'y' }, { id: 'z' }]);
    await stahniKopii(['orders']);
    expect(p[0].autorizace).toBe('Bearer token-druheho');
    expect(stavKopie()).toMatchObject({ uzivatel: 'u2', uplneT: null, tabulek: 1, radku: 2 });
    expect((await nactiKopii('orders'))?.uzivatel).toBe('u2');
    expect(await nactiKopii('beers')).toBeNull();                            // kopie prvního účtu se druhému nedá
  });

  it('běží nejvýš jedno stahování; požadavek během něj se provede hned po něm', async () => {
    let pust: () => void = () => {};
    const brana = new Promise<void>((ok) => { pust = ok; });
    const p: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      p.push(new URL(String(input)).pathname.replace('/rest/v1/', ''));
      await brana;
      return new Response('[]', { status: 200 });
    }));
    const prvni = stahniKopii(['orders']);
    const druhy = stahniKopii(['kegging']);
    const treti = stahniKopii(['bottling']);
    await new Promise((r) => setTimeout(r, 10));
    expect(p).toEqual(['orders']);                                           // druhé a třetí čekají
    pust();
    await Promise.all([prvni, druhy, treti]);
    await new Promise((r) => setTimeout(r, 10));
    expect(p.slice().sort()).toEqual(['bottling', 'kegging', 'orders']);
  });

  it('neočekávaná chyba stahování nevyhodí výjimku', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockRejectedValue(new Error('rozbité přihlášení'));
    server();
    const v = await stahniKopii();
    expect(v.ok).toBe(false);
    expect(v.nestazene[0].duvod).toContain('rozbité přihlášení');
  });
});

describe('spustUdrzbuKopie', () => {
  let p: Pozadavek[];
  let uklid: () => void;
  const cele = () => p.filter((x) => x.tabulka === 'beers').length;         // kolikrát se stahovalo všechno
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    p = server(() => [{ id: 'x' }]);
  });
  afterEach(() => { uklid?.(); });

  it('po spuštění stáhne kopii (s malým odkladem); pak ji obnovuje po deseti minutách', async () => {
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(2000);
    expect(p).toHaveLength(0);                                               // nesoutěží s prvním vykreslením
    await vi.advanceTimersByTimeAsync(1000);
    expect(cele()).toBe(1);
    await vi.advanceTimersByTimeAsync(OBNOVA_CELA_MS - 60_000);
    expect(cele()).toBe(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(cele()).toBe(2);
  });

  it('po obnovení stránky (kopie stará pár vteřin) se nestahuje znovu', async () => {
    ulozStavKopie({ uplneT: T0 - 20_000, posledniT: T0 - 20_000, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(5000);
    expect(p).toHaveLength(0);
  });

  it('po návratu signálu — ohlášeném telefonem i poznaném jističem — stáhne čerstvou kopii', async () => {
    ulozStavKopie({ uplneT: T0 - 20_000, posledniT: T0 - 20_000, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(cele()).toBe(1);
    window.dispatchEvent(new Event(UDALOST_SPOJENI_ZPET));
    await vi.advanceTimersByTimeAsync(2000);
    expect(cele()).toBe(2);
  });

  it('po návratu do appky obnoví kopii starší než pár minut; schovaná appka nestahuje', async () => {
    ulozStavKopie({ uplneT: T0 - 30_000, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(5000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(p).toHaveLength(0);                                               // ještě je čerstvá
    const viditelnost = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(OBNOVA_CELA_MS + 120_000);
    expect(p).toHaveLength(0);                                               // v kapse nic, ani po deseti minutách
    document.dispatchEvent(new Event('visibilitychange'));                   // (událost i ze schované appky)
    await vi.advanceTimersByTimeAsync(100);
    expect(p).toHaveLength(0);
    viditelnost.mockReturnValue('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(cele()).toBe(1);
  });

  it('po návratu do appky se kopie mladší než pár minut nestahuje', async () => {
    ulozStavKopie({ uplneT: T0 - 30_000, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(OBNOVA_PO_NAVRATU_MS - 31_000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(p).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(100);
    expect(cele()).toBe(1);
  });

  it('dva důvody ke stažení všeho těsně po sobě (spuštění + návrat signálu) = jedno stahování, ne dvě', async () => {
    let pust: () => void = () => {};
    const brana = new Promise<void>((ok) => { pust = ok; });
    const stazeno: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: any) => {
      stazeno.push(new URL(String(input)).pathname.replace('/rest/v1/', ''));
      await brana;                                                           // stahování chvíli trvá
      return new Response('[]', { status: 200 });
    }));
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(3000);                                 // první kolo běží
    window.dispatchEvent(new Event(UDALOST_SPOJENI_ZPET));
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(2000);
    pust();
    await vi.advanceTimersByTimeAsync(5000);
    expect(stazeno.filter((t) => t === 'beers')).toHaveLength(1);
    expect(stazeno).toHaveLength(TABULKY_KOPIE.length);
  });

  it('po změně tabulky stáhne jen ji, až změny utichnou', async () => {
    ulozStavKopie({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    zneplatniTabulku('orders');
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS - 1000);
    zneplatniTabulku('order_items');                                         // další změna odkládá
    zneplatniTabulku('whatsapp_incoming');                                   // tabulka mimo kopii se nestahuje
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS - 1000);
    expect(p).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(tabulky(p).sort()).toEqual(['order_items', 'orders']);
  });

  it('změna tabulky, kterou telefon nedrží, stahování ostatních neodkládá', async () => {
    ulozStavKopie({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    zneplatniTabulku('orders');
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS - 1000);
    zneplatniTabulku('whatsapp_incoming');                                   // zprávy chodí pořád — nesmí to zdržet
    await vi.advanceTimersByTimeAsync(1000);
    expect(tabulky(p)).toEqual(['orders']);
  });

  it('jedna trvale nedostupná tabulka neznamená stahovat všechno každou minutu znovu', async () => {
    p = server((x) => (x.tabulka === 'vycepy' ? { status: 404 } : [{ id: 'x' }]));
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(3000);
    expect(cele()).toBe(1);
    expect(stavKopie().uplneT).toBeNull();                                   // úplná není…
    await vi.advanceTimersByTimeAsync(OBNOVA_CELA_MS - 60_000);
    expect(cele()).toBe(1);                                                  // … ale znovu se stahuje až za obvyklou dobu
    await vi.advanceTimersByTimeAsync(120_000);
    expect(cele()).toBe(2);
  });

  it('kolo, které přerušilo spadlé spojení, se zkusí při nejbližší příležitosti znovu', async () => {
    p = server(() => 'spadne');
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(3000);
    const poPrvnim = p.length;
    expect(poPrvnim).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(p.length).toBeGreaterThan(poPrvnim);
  });

  it('stažení jedné změněné tabulky pravidelnou obnovu všeho neodkládá', async () => {
    ulozStavKopie({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    await vi.advanceTimersByTimeAsync(OBNOVA_CELA_MS - 60_000);
    zneplatniTabulku('orders');
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS);
    expect(tabulky(p)).toEqual(['orders']);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(cele()).toBe(1);                                                  // ostatní tabulky by jinak zestárly
  });

  it('vnořená tabulka zneplatní i nadřazenou (akce_items → akce)', async () => {
    ulozStavKopie({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    zneplatniTabulku('akce_items');
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS);
    expect(tabulky(p)).toContain('akce_items');
  });

  it('„změnilo se něco, nevíme co" stáhne všechno — ale nejvýš jednou za minutu', async () => {
    ulozStavKopie({ uplneT: T0, posledniT: T0, uzivatel: 'u1', tabulek: 1, radku: 1, nestazene: [] });
    uklid = spustUdrzbuKopie();
    zneplatniVse();
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS);
    expect(cele()).toBe(1);
    zneplatniVse();
    zneplatniTabulku('orders');
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS);
    expect(cele()).toBe(1);                                                  // podruhé hned ne…
    expect(p.filter((x) => x.tabulka === 'orders')).toHaveLength(2);         // … ale změněná tabulka ano
    await vi.advanceTimersByTimeAsync(ODSTUP_CELE_PO_ZMENE_MS);
    zneplatniVse();
    await vi.advanceTimersByTimeAsync(ZDRZENI_PO_ZMENE_MS);
    expect(cele()).toBe(2);
  });

  it('úklid (odhlášení) všechno zastaví', async () => {
    uklid = spustUdrzbuKopie();
    uklid();
    zneplatniTabulku('orders');
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(OBNOVA_CELA_MS * 2);
    expect(p).toHaveLength(0);
  });
});

describe('popisCasuKopie', () => {
  const ted = new Date(2026, 10, 27, 12, 30).getTime();
  it('dnes, včera, starší datum', () => {
    expect(popisCasuKopie(new Date(2026, 10, 27, 10, 42).getTime(), ted)).toBe('dnes 10:42');
    expect(popisCasuKopie(new Date(2026, 10, 27, 0, 5).getTime(), ted)).toBe('dnes 0:05');
    expect(popisCasuKopie(new Date(2026, 10, 26, 18, 5).getTime(), ted)).toBe('včera 18:05');
    expect(popisCasuKopie(new Date(2026, 10, 25, 7, 30).getTime(), ted)).toBe('25. 11. 7:30');
    expect(popisCasuKopie(new Date(2026, 9, 31, 23, 59).getTime(), new Date(2026, 10, 1, 0, 1).getTime())).toBe('včera 23:59');
  });
  it('bez kopie nic', () => {
    expect(popisCasuKopie(null)).toBeNull();
    expect(popisCasuKopie(Number.NaN)).toBeNull();
  });
});

describe('vetaOKopii (pruh „data nejsou ze serveru")', () => {
  const ted = new Date(2026, 10, 27, 12, 30).getTime();
  const rano = new Date(2026, 10, 27, 7, 15).getTime();
  it('řekne, jak stará kopie je — přednost má čas, kdy se stáhlo všechno', () => {
    expect(vetaOKopii({ uplneT: rano, posledniT: ted }, ted)).toBe('Kopie dat v telefonu: dnes 7:15.');
    expect(vetaOKopii({ uplneT: null, posledniT: rano }, ted)).toBe('Kopie dat v telefonu: dnes 7:15.');
  });
  it('bez kopie poradí, co udělat', () => {
    const veta = vetaOKopii({ uplneT: null, posledniT: null }, ted);
    expect(veta).toMatch(/zatím není kopie dat/);
    expect(veta).toMatch(/jednou se signálem/);
  });
});
