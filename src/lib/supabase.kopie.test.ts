// 📴 Bez signálu odpovídá KOPIE TABULEK v telefonu — i na dotaz, který se se signálem nikdy nepoložil.
// Majitel 27. 11. 2026: „napíše to, že to je offline, a neukážou se mi žádný data."
// Data v testech jsou vymyšlená.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Ulozena = { rows: any[]; contentRange: string | null; t: number };
const ulozeneOdpovedi = new Map<string, Ulozena>();
vi.mock('./offlineCache', () => ({
  cacheGetResponse: vi.fn().mockResolvedValue(undefined),
  upsertTableRows: vi.fn().mockResolvedValue(undefined),
  getTableRows: vi.fn(async () => null),
  getCachedResponse: vi.fn(async (url: string) => {
    const v = ulozeneOdpovedi.get(url);
    return v ? { rows: JSON.parse(JSON.stringify(v.rows)), contentRange: v.contentRange, t: v.t } : null;
  }),
}));

import { readFileSync } from 'node:fs';
import { supabase, contentRangeOffline, jeVelkyDotaz, nactiVyhodnoceniDotazu, odpovedZKopie } from './supabase';
import { clearQueue, enqueue, getQueue, syncQueue, zapomenProslyZapisy } from './offline';
import { nastavUzivateleKopie, ulozKopii, zapomenKopiiProTesty } from './offlineKopieSklad';
import { vynulujJisticProTesty } from './jisticSpojeni';
import { dataZPametiOd, vycistiZPameti } from './zPameti';

const UZIVATEL = 'uzivatel-1';
const T_KOPIE = new Date('2026-11-27T08:00:00Z').getTime();

const OBJEDNAVKY = [
  { id: 'o1', place_name: 'Hospoda U Lípy', status: 'nova', delivery_date: '2026-11-25', order_date: '2026-11-23', is_delivered: false },
  { id: 'o2', place_name: 'Bistro Na Rohu', status: 'nova', delivery_date: '2026-11-27', order_date: '2026-11-24', is_delivered: false },
  { id: 'o3', place_name: 'Kavárna Pod Věží', status: 'storno', delivery_date: '2026-11-27', order_date: '2026-11-24', is_delivered: false },
  { id: 'o4', place_name: 'Hospoda U Lípy', status: 'nova', delivery_date: '2026-12-02', order_date: '2026-11-26', is_delivered: false },
];
const POLOZKY = [
  { id: 'p1', order_id: 'o1', beer_id: 'b1', quantity: 2 },
  { id: 'p2', order_id: 'o2', beer_id: 'b1', quantity: 5 },
  { id: 'p3', order_id: 'o2', beer_id: 'b2', quantity: 1 },
];

async function dejKopii(tabulka: string, rows: any[], t = T_KOPIE, uzivatel = UZIVATEL) {
  await ulozKopii(tabulka, { rows: JSON.parse(JSON.stringify(rows)), t, uzivatel });
}

const bezSite = () => vi.fn(async () => { throw new TypeError('Failed to fetch'); });
const volani = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map(([input, init]: any[]) => `${(init?.method ?? 'GET').toUpperCase()} ${new URL(String(input?.url ?? input)).pathname}`);

const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const prosly = () => `Bearer ${b64({ alg: 'HS256' })}.${b64({ sub: UZIVATEL, exp: Math.floor(Date.now() / 1000) - 600 })}.p`;
const platny = () => `Bearer ${b64({ alg: 'HS256' })}.${b64({ sub: UZIVATEL, exp: Math.floor(Date.now() / 1000) + 600 })}.p`;
const odmitnutiTokenu = () => new Response(JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }), { status: 401, headers: { 'Content-Type': 'application/json' } });

beforeEach(async () => {
  localStorage.clear();
  clearQueue();
  zapomenProslyZapisy();
  zapomenKopiiProTesty();
  vynulujJisticProTesty();
  vycistiZPameti();
  ulozeneOdpovedi.clear();
  nastavUzivateleKopie(UZIVATEL);
  await dejKopii('orders', OBJEDNAVKY);
  await dejKopii('order_items', POLOZKY);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('čtení bez signálu z kopie tabulek', () => {
  it('dotaz, který se se signálem nikdy nepoložil (jiný týden, filtry, řazení), dostane správné řádky', async () => {
    vi.stubGlobal('fetch', bezSite());
    const zacatek = Date.now();
    const { data, error } = await supabase.from('orders').select('id, place_name')
      .neq('status', 'storno').gte('delivery_date', '2026-11-23').lte('delivery_date', '2026-11-29')
      .order('delivery_date', { ascending: false });
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'o2', place_name: 'Bistro Na Rohu' }, { id: 'o1', place_name: 'Hospoda U Lípy' }]);
    // … a obrazovka se dozví, že čísla nejsou ze serveru.
    expect(dataZPametiOd(zacatek)).toBe(true);
  });

  it('objednávky i s položkami v jednom dotazu', async () => {
    vi.stubGlobal('fetch', bezSite());
    const { data } = await supabase.from('orders').select('id, order_items(id, quantity)').eq('id', 'o2');
    expect(data).toEqual([{ id: 'o2', order_items: [{ id: 'p2', quantity: 5 }, { id: 'p3', quantity: 1 }] }]);
  });

  it('tabulka, kterou telefon nedrží, vrátí jako dřív prázdný seznam (nic se nevymýšlí)', async () => {
    vi.stubGlobal('fetch', bezSite());
    const { data, error } = await supabase.from('whatsapp_incoming').select('*').eq('status', 'new');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('kopie patří účtu, který ji stáhl — jiný přihlášený z ní nedostane nic', async () => {
    vi.stubGlobal('fetch', bezSite());
    nastavUzivateleKopie('nekdo-jiny');
    expect((await supabase.from('orders').select('id')).data).toEqual([]);
    nastavUzivateleKopie(null);
    expect((await supabase.from('orders').select('id')).data).toEqual([]);
    nastavUzivateleKopie(UZIVATEL);
    expect((await supabase.from('orders').select('id')).data).toHaveLength(4);
  });

  it('dotaz, který místně vyhodnotit neumíme, se nehádá — platí starý postup', async () => {
    vi.stubGlobal('fetch', bezSite());
    const { data } = await supabase.from('orders').select('id').eq('sloupec_ktery_neni', 'x');
    expect(data).toEqual([]);
    expect(await odpovedZKopie('orders', new URLSearchParams('select=id&sloupec_ktery_neni=eq.x'))).toBeNull();
    expect(await odpovedZKopie('tabulka_bez_kopie', new URLSearchParams('select=*'))).toBeNull();
  });

  it('čerstvější z dvojice kopie / uložená odpověď na přesně tuhle adresu má přednost', async () => {
    vi.stubGlobal('fetch', bezSite());
    const dotaz = () => supabase.from('orders').select('id').eq('status', 'storno');
    // Adresu si necháme říct od klienta (první pokus ji pošle do sítě).
    const f = bezSite();
    vi.stubGlobal('fetch', f);
    await dotaz();
    const adresa = String(f.mock.calls[0][0]);
    ulozeneOdpovedi.set(adresa, { rows: [{ id: 'stara-odpoved' }], contentRange: null, t: T_KOPIE - 1000 });
    expect((await dotaz()).data).toEqual([{ id: 'o3' }]);                    // kopie je novější
    ulozeneOdpovedi.set(adresa, { rows: [{ id: 'novejsi-odpoved' }], contentRange: null, t: T_KOPIE + 1000 });
    expect((await dotaz()).data).toEqual([{ id: 'novejsi-odpoved' }]);       // odpověď serveru je novější
    ulozeneOdpovedi.set(adresa, { rows: [{ id: 'stejne-stara' }], contentRange: null, t: T_KOPIE });
    expect((await dotaz()).data).toEqual([{ id: 'o3' }]);                    // při shodě kopie (celé řádky)
  });

  it('zápisy z telefonu se do kopie přimíchají PŘED filtrem — nová objednávka se ukáže jen ve svém týdnu', async () => {
    vi.stubGlobal('fetch', bezSite());
    enqueue({ table: 'orders', op: 'insert', row: { id: 'o-nova', place_name: 'Nový odběratel', status: 'nova', delivery_date: '2026-11-28', order_date: '2026-11-27', is_delivered: false } });
    enqueue({ table: 'orders', op: 'update', match: { id: 'o1' }, row: { is_delivered: true } });
    enqueue({ table: 'orders', op: 'delete', match: { id: 'o2' } });
    const tyden = await supabase.from('orders').select('id, is_delivered').gte('delivery_date', '2026-11-23').lte('delivery_date', '2026-11-29').neq('status', 'storno').order('id');
    expect(tyden.data).toEqual([{ id: 'o-nova', is_delivered: false }, { id: 'o1', is_delivered: true }]);
    const pristi = await supabase.from('orders').select('id').gte('delivery_date', '2026-11-30');
    expect(pristi.data).toEqual([{ id: 'o4' }]);
  });

  it('.single() vrátí řádek jako objekt; žádný nebo víc řádků je chyba jako od serveru', async () => {
    vi.stubGlobal('fetch', bezSite());
    const jeden = await supabase.from('orders').select('id, place_name').eq('id', 'o1').single();
    expect(jeden.error).toBeNull();
    expect(jeden.data).toEqual({ id: 'o1', place_name: 'Hospoda U Lípy' });
    const zadny = await supabase.from('orders').select('id').eq('id', 'neni').single();
    expect(zadny.data).toBeNull();
    expect(zadny.error?.code).toBe('PGRST116');
    const vic = await supabase.from('orders').select('id').eq('status', 'nova').single();
    expect(vic.data).toBeNull();
    expect(vic.error?.code).toBe('PGRST116');
  });

  it('.maybeSingle() vrátí řádek, nebo nic', async () => {
    vi.stubGlobal('fetch', bezSite());
    expect((await supabase.from('orders').select('id').eq('id', 'o2').maybeSingle()).data).toEqual({ id: 'o2' });
    const nic = await supabase.from('orders').select('id').eq('id', 'neni').maybeSingle();
    expect(nic.data).toBeNull();
    expect(nic.error).toBeNull();
  });

  it('dotaz jen na počet (odznaky) spočítá kopie; bez kopie zůstane chyba chybou', async () => {
    vi.stubGlobal('fetch', bezSite());
    const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'nova');
    expect(error).toBeNull();
    expect(count).toBe(3);
    // Knihovna chybu sítě u čtení třikrát zopakuje (1 + 2 + 4 s) — proto posunuté hodiny.
    vi.useFakeTimers();
    try {
      const slib = supabase.from('whatsapp_incoming').select('id', { count: 'exact', head: true });
      let bez: Awaited<typeof slib> | null = null;
      void slib.then((v) => { bez = v; });
      await vi.advanceTimersByTimeAsync(8000);
      expect(bez!.count).toBeNull();
      expect(bez!.error).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('stránkované čtení s počtem dostane celkový počet, ne délku stránky', async () => {
    vi.stubGlobal('fetch', bezSite());
    const { data, count } = await supabase.from('orders').select('id', { count: 'exact' }).order('id').range(0, 1);
    expect(data).toEqual([{ id: 'o1' }, { id: 'o2' }]);
    expect(count).toBe(4);
    const druha = await supabase.from('orders').select('id', { count: 'exact' }).order('id').range(2, 3);
    expect(druha.data).toEqual([{ id: 'o3' }, { id: 'o4' }]);
    expect(druha.count).toBe(4);
    const za = await supabase.from('orders').select('id', { count: 'exact' }).order('id').range(4, 5);
    expect(za.data).toEqual([]);
    expect(za.count).toBe(4);
  });

  it('uložená stránka nese původní celkový počet — řádky nad první tisícovku se bez signálu neztratí', async () => {
    const f = bezSite();
    vi.stubGlobal('fetch', f);
    const dotaz = () => supabase.from('logy_mimo_kopii').select('id', { count: 'exact' }).range(0, 999);
    await dotaz();
    ulozeneOdpovedi.set(String(f.mock.calls[0][0]), { rows: [{ id: 'r1' }, { id: 'r2' }], contentRange: '0-999/1089', t: 1 });
    const { data, count } = await dotaz();
    expect(data).toHaveLength(2);
    expect(count).toBe(1089);            // dřív „1000" podle délky stránky → čtení skončilo po první stránce
  });
});

describe('vyhodnocení dotazů je samostatný kus aplikace', () => {
  it('načte se na požádání a podruhé už je po ruce', async () => {
    const prvni = await nactiVyhodnoceniDotazu();
    expect(typeof prvni?.vyhodnotDotaz).toBe('function');
    expect(await nactiVyhodnoceniDotazu()).toBe(prvni);
  });

  it('start aplikace ho nenatahuje — supabase.ts ho smí načíst jen líně', () => {
    const zdroj = readFileSync('src/lib/supabase.ts', 'utf8');
    expect(zdroj).toMatch(/import\('\.\/offlineDotaz'\)/);
    expect(zdroj).not.toMatch(/^import [^\n]*from '\.\/offlineDotaz'/m);
    expect(zdroj).not.toMatch(/^import [^\n]*from '\.\/offlineKopie'/m);
    // Údržbu (stahování kopie) si aplikace načte až po přihlášení.
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).toMatch(/import\('\.\/lib\/offlineUdrzba'\)/);
    expect(app).not.toMatch(/^import [^\n]*from '\.\/lib\/offline(Kopie|Udrzba|Obrazovky)'/m);
  });
});

describe('contentRangeOffline', () => {
  it('jako od serveru: rozsah a celkem; bez řádků hvězdička', () => {
    expect(contentRangeOffline(0, 25, 3573)).toBe('0-24/3573');
    expect(contentRangeOffline(1000, 89, 1089)).toBe('1000-1088/1089');
    expect(contentRangeOffline(0, 0, 0)).toBe('*/0');
    expect(contentRangeOffline(2000, 0, 1089)).toBe('*/1089');
  });
});

describe('jeVelkyDotaz', () => {
  const u = (q: string) => new URL(`https://x.test/rest/v1/t?${q}`);
  it('bez limitu nebo s limitem od 500 je velký', () => {
    expect(jeVelkyDotaz(u('select=*'))).toBe(true);
    expect(jeVelkyDotaz(u('select=*&limit=1000'))).toBe(true);
    expect(jeVelkyDotaz(u('select=*&limit=500'))).toBe(true);
    expect(jeVelkyDotaz(u('select=*&limit=499'))).toBe(false);
  });
  it('dotaz na jeden řádek je malý, i když limit nemá (čeká na něj start appky)', () => {
    expect(jeVelkyDotaz(u('select=*&id=eq.abc'))).toBe(false);
    expect(jeVelkyDotaz(u('select=*'), { headers: { Accept: 'application/vnd.pgrst.object+json' } })).toBe(false);
    expect(jeVelkyDotaz(u('select=*&id=in.(a,b)'))).toBe(true);
    expect(jeVelkyDotaz(u('select=*&order_id=eq.abc'))).toBe(true);
  });
});

describe('prošlý přihlašovací token (dlouho bez signálu) = jako výpadek', () => {
  it('čtení odmítnuté pro prošlý token odpoví z kopie', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odmitnutiTokenu()));
    const { data, error } = await supabase.from('orders').select('id').eq('status', 'storno').setHeader('Authorization', prosly());
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 'o3' }]);
    const pocet = await supabase.from('orders').select('id', { count: 'exact', head: true }).setHeader('Authorization', prosly());
    expect(pocet.count).toBe(4);
  });

  it('odmítnutí s platným tokenem je skutečná chyba — z paměti se neodpovídá', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odmitnutiTokenu()));
    const { data, error } = await supabase.from('orders').select('id').setHeader('Authorization', platny());
    expect(data).toBeNull();
    expect(error?.message).toBe('JWT expired');
    const pocet = await supabase.from('orders').select('id', { count: 'exact', head: true }).setHeader('Authorization', platny());
    expect(pocet.count).toBeNull();
    expect(pocet.error).not.toBeNull();
  });

  it('zápis odmítnutý pro prošlý token jde do fronty (neztratí se) a obrazovka pokračuje', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => odmitnutiTokenu()));
    const { error } = await supabase.from('orders').update({ is_delivered: true }).eq('id', 'o1').setHeader('Authorization', prosly());
    expect(error).toBeNull();
    expect(getQueue().map((o) => [o.table, o.op, o.match])).toEqual([['orders', 'update', { id: 'o1' }]]);
    // S platným tokenem je odmítnutí chyba a do fronty nejde nic.
    clearQueue();
    const druhy = await supabase.from('orders').update({ is_delivered: true }).eq('id', 'o1').setHeader('Authorization', platny());
    expect(druhy.error).not.toBeNull();
    expect(getQueue()).toHaveLength(0);
  });

  it('při odesílání fronty se odmítnutý zápis neřadí znovu — zůstane v ní jednou, s důvodem', async () => {
    enqueue({ table: 'orders', op: 'update', match: { id: 'o1' }, row: { is_delivered: true } });
    // Odesílání fronty jde přes klienta bez vlastní hlavičky — prošlý token mu podstrčí atrapa sítě.
    vi.stubGlobal('fetch', vi.fn(async (_input: any, init?: RequestInit) => {
      (init!.headers as Headers).set('Authorization', prosly());
      return odmitnutiTokenu();
    }));
    const vysledek = await syncQueue();
    expect(vysledek).toMatchObject({ ok: 0, failed: 1, remaining: 1 });
    expect(getQueue()).toHaveLength(1);
  });
});

describe('volání sítě', () => {
  it('se signálem jde čtení na server a kopie se nepoužije', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ id: 'ze-serveru' }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', f);
    const zacatek = Date.now();
    const { data } = await supabase.from('orders').select('id');
    expect(data).toEqual([{ id: 'ze-serveru' }]);
    expect(dataZPametiOd(zacatek)).toBe(false);
    expect(volani(f)).toEqual(['GET /rest/v1/orders']);
  });
});
