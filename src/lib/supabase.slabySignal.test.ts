// 📶 Slabý signál: telefon hlásí „online", ale server neodpovídá. Dřív si každý dotaz odčekal svůj limit
// (10–25 s) a teprve potom se sáhlo do paměti telefonu — obrazovka, která se ptá postupně, čekala minutu.
// Teď stačí první vypršený dotaz a čte se rovnou z kopie; návrat serveru se pozná sám (lib/jisticSpojeni.ts).
// Data v testech jsou vymyšlená.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('./offlineCache', () => ({
  cacheGetResponse: vi.fn().mockResolvedValue(undefined),
  upsertTableRows: vi.fn().mockResolvedValue(undefined),
  getTableRows: vi.fn(async () => null),
  getCachedResponse: vi.fn(async () => null),
}));

import { supabase, fetchSJisticem, nactiVyhodnoceniDotazu, OFFLINE_FETCH_TIMEOUT_MS, VELKY_DOTAZ_TIMEOUT_MS } from './supabase';
import { clearQueue, getQueue, zapomenProslyZapisy } from './offline';
import { nastavUzivateleKopie, ulozKopii, zapomenKopiiProTesty } from './offlineKopieSklad';
import { CERSTVY_VYPADEK_MS, KRATKE_CEKANI_MS, TIK_SOND_MS, UDALOST_SPOJENI_ZPET, cekaniNaSit, vynulujJisticProTesty } from './jisticSpojeni';
import { dataZPametiOd, vycistiZPameti } from './zPameti';

const T0 = new Date('2026-11-27T10:00:00Z').getTime();
const PIVA = [{ id: 'b1', name: 'Desítka', sort_order: 1 }, { id: 'b2', name: 'Jantar', sort_order: 2 }];
const STOCENI = [{ id: 'k1', beer_id: 'b1', quantity: 12 }, { id: 'k2', beer_id: 'b2', quantity: 4 }];

type Volani = { method: string; url: URL; signal?: AbortSignal | null };
type Chovani = Response | 'visi' | 'spadne';

/** Atrapa sítě: `rozhodni` říká, co server s požadavkem udělá. „visi" = nikdy neodpoví (jen zrušení ho ukončí). */
function sit(rozhodni: (v: Volani) => Chovani) {
  const volani: Volani[] = [];
  vi.stubGlobal('fetch', vi.fn((input: any, init?: RequestInit) => {
    const v: Volani = { method: (init?.method ?? 'GET').toUpperCase(), url: new URL(String(input?.url ?? input)), signal: init?.signal };
    volani.push(v);
    const co = rozhodni(v);
    if (co === 'spadne') return Promise.reject(new TypeError('Failed to fetch'));
    if (co === 'visi') {
      return new Promise<Response>((_ok, zamitni) => {
        const zrus = () => { const e = new Error('The operation was aborted.'); e.name = 'AbortError'; zamitni(e); };
        if (init?.signal?.aborted) zrus();
        else init?.signal?.addEventListener('abort', zrus);
      });
    }
    return Promise.resolve(co.clone());
  }));
  return volani;
}
const json = (telo: unknown, status = 200) => new Response(JSON.stringify(telo), { status, headers: { 'Content-Type': 'application/json' } });
const cesty = (volani: Volani[]) => volani.map((v) => `${v.method} ${v.url.pathname.replace('/rest/v1/', '')}`);
/** Nechá doběhnout rozpracované sliby (odpověď z paměti se skládá v několika krocích). */
const dobehni = () => vi.advanceTimersByTimeAsync(0);

/** Pustí dotaz a vrátí schránku, do které spadne výsledek, až doběhne. */
function pust<T>(slib: PromiseLike<T>): { hotovo: T | null } {
  const schranka: { hotovo: T | null } = { hotovo: null };
  void slib.then((v) => { schranka.hotovo = v; });
  return schranka;
}

// Vyhodnocení dotazů je v samostatném kusu aplikace; appka si ho natáhne chvíli po spuštění
// (lib/offlineUdrzba.ts). Tady předem, ať testy s posunutými hodinami nečekají na skutečné čtení souboru.
beforeAll(async () => { await nactiVyhodnoceniDotazu(); });

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  localStorage.clear();
  clearQueue();
  zapomenProslyZapisy();
  zapomenKopiiProTesty();
  vynulujJisticProTesty(true);
  vycistiZPameti();
  nastavUzivateleKopie('u1');
  await ulozKopii('beers', { rows: PIVA, t: T0 - 60_000, uzivatel: 'u1' });
  await ulozKopii('kegging', { rows: STOCENI, t: T0 - 60_000, uzivatel: 'u1' });
});
afterEach(() => {
  vynulujJisticProTesty(true);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('server neodpovídá (telefon hlásí online)', () => {
  it('první dotaz si odčeká limit; další už dostanou data z kopie hned', async () => {
    const volani = sit(() => 'visi');
    const prvni = pust(supabase.from('beers').select('id').limit(10));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS - 1);
    expect(prvni.hotovo).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(prvni.hotovo!.data).toEqual([{ id: 'b1' }, { id: 'b2' }]);
    expect(cekaniNaSit()).toBe(0);

    const zacatek = Date.now();
    const druhy = pust(supabase.from('kegging').select('id, quantity').eq('beer_id', 'b2'));
    await dobehni();
    expect(druhy.hotovo!.data).toEqual([{ id: 'k2', quantity: 4 }]);        // bez čekání
    expect(dataZPametiOd(zacatek)).toBe(true);
    // Druhý dotaz na server vůbec nešel; ptá se jen lehká sonda (hlavička, jeden řádek číselníku).
    expect(cesty(volani)).toEqual(['GET beers', 'HEAD beers']);
    expect(volani[1].url.search).toBe('?select=id&limit=1');
  });

  it('dotaz, který čeká na delší limit, se dozví o výpadku od kratšího — a jeho požadavek se zruší', async () => {
    const volani = sit(() => 'visi');
    const maly = pust(supabase.from('beers').select('id').limit(1));
    const velky = pust(supabase.from('kegging').select('*'));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
    expect(maly.hotovo!.data).toEqual([{ id: 'b1' }]);
    expect(velky.hotovo!.data).toHaveLength(2);                              // nečekal svých 25 s
    const pozadavekVelkeho = volani.find((v) => v.url.pathname.endsWith('/kegging'))!;
    expect(pozadavekVelkeho.signal?.aborted).toBe(true);                     // zaseknutý dotaz nedrží spojení
  });

  it('na co telefon odpovědět neumí, na to se čeká dál — nehádá se', async () => {
    let serverZpet = false;
    sit((v) => (v.url.pathname.endsWith('/whatsapp_incoming') && serverZpet ? json([{ id: 'zprava-1' }]) : 'visi'));
    const prvni = pust(supabase.from('beers').select('id').limit(1));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
    expect(prvni.hotovo).not.toBeNull();
    expect(cekaniNaSit()).toBe(0);
    // Tabulka mimo kopii: i při čerstvém výpadku jde na server — a když ten odpoví, dostane obrazovka pravdu.
    serverZpet = true;
    const zpravy = pust(supabase.from('whatsapp_incoming').select('id').limit(5));
    await dobehni();
    expect(zpravy.hotovo!.data).toEqual([{ id: 'zprava-1' }]);
    expect(cekaniNaSit()).toBeNull();                                        // odpověď serveru jistič sepnula zpět
  });

  it('bez odpovědi z paměti i ze sítě skončí čtení jako dřív prázdným seznamem až po limitu', async () => {
    sit(() => 'visi');
    const prvni = pust(supabase.from('beers').select('id').limit(1));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
    expect(prvni.hotovo).not.toBeNull();
    const zpravy = pust(supabase.from('whatsapp_incoming').select('id').limit(5));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS - 1);
    expect(zpravy.hotovo).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(zpravy.hotovo!.data).toEqual([]);
  });

  it('po delší pauze dostane síť krátkou šanci — bez odpovědi zase kopie', async () => {
    const viditelnost = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');   // appka v kapse: sama se neptá
    try {
      sit(() => 'visi');
      pust(supabase.from('beers').select('id').limit(1));
      await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
      await vi.advanceTimersByTimeAsync(CERSTVY_VYPADEK_MS + 60_000);
      expect(cekaniNaSit()).toBe(KRATKE_CEKANI_MS);
      const dotaz = pust(supabase.from('kegging').select('id'));
      await vi.advanceTimersByTimeAsync(KRATKE_CEKANI_MS - 1);
      expect(dotaz.hotovo).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(dotaz.hotovo!.data).toEqual([{ id: 'k1' }, { id: 'k2' }]);
      expect(cekaniNaSit()).toBe(0);                                         // ticho = výpadek trvá
    } finally { viditelnost.mockRestore(); }
  });

  it('po delší pauze: když server mezitím naběhl, přijdou rovnou čerstvá data', async () => {
    const viditelnost = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      let serverZpet = false;
      sit(() => (serverZpet ? json([{ id: 'cerstve' }]) : 'visi'));
      pust(supabase.from('beers').select('id').limit(1));
      await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS + CERSTVY_VYPADEK_MS + 60_000);
      serverZpet = true;
      const zacatek = Date.now();
      const dotaz = pust(supabase.from('kegging').select('id'));
      await dobehni();
      expect(dotaz.hotovo!.data).toEqual([{ id: 'cerstve' }]);
      expect(dataZPametiOd(zacatek)).toBe(false);
      expect(cekaniNaSit()).toBeNull();
    } finally { viditelnost.mockRestore(); }
  });

  it('návrat serveru pozná appka sama (sonda) a ohlásí ho — další čtení jde na server', async () => {
    let serverZpet = false;
    const volani = sit(() => (serverZpet ? json([{ id: 'cerstve' }]) : 'visi'));
    const zpet = vi.fn();
    window.addEventListener(UDALOST_SPOJENI_ZPET, zpet);
    try {
      pust(supabase.from('beers').select('id').limit(1));
      await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
      expect(cekaniNaSit()).toBe(0);
      serverZpet = true;
      await vi.advanceTimersByTimeAsync(TIK_SOND_MS);                        // nikdo na nic nesahá
      await vi.advanceTimersByTimeAsync(5);                                  // odpověď sondy + zpráva o návratu
      expect(cesty(volani).filter((c) => c === 'HEAD beers').length).toBeGreaterThan(0);
      expect(cekaniNaSit()).toBeNull();
      expect(zpet).toHaveBeenCalledTimes(1);
      const dotaz = pust(supabase.from('kegging').select('id'));
      await dobehni();
      expect(dotaz.hotovo!.data).toEqual([{ id: 'cerstve' }]);
    } finally { window.removeEventListener(UDALOST_SPOJENI_ZPET, zpet); }
  });

  it('počet (odznak) se při výpadku bere z kopie hned', async () => {
    sit(() => 'visi');
    pust(supabase.from('beers').select('id').limit(1));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
    const pocet = pust(supabase.from('kegging').select('id', { count: 'exact', head: true }).eq('beer_id', 'b1'));
    await dobehni();
    expect(pocet.hotovo!.count).toBe(1);
  });

  it('zápis zkouší server i při výpadku (jistič na zápisy nesahá) a po limitu jde do fronty', async () => {
    const volani = sit(() => 'visi');
    pust(supabase.from('beers').select('id').limit(1));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS);
    const predtim = volani.length;
    const zapis = pust(supabase.from('kegging').update({ quantity: 13 }).eq('id', 'k1'));
    await vi.advanceTimersByTimeAsync(OFFLINE_FETCH_TIMEOUT_MS - 1);
    expect(zapis.hotovo).toBeNull();
    expect(cesty(volani.slice(predtim))).toContain('PATCH kegging');
    await vi.advanceTimersByTimeAsync(1);
    expect(zapis.hotovo!.error).toBeNull();
    expect(getQueue().map((o) => [o.table, o.op])).toEqual([['kegging', 'update']]);
    // … a čtení z kopie zápis z fronty hned ukáže.
    const cteni = pust(supabase.from('kegging').select('id, quantity').eq('id', 'k1'));
    await dobehni();
    expect(cteni.hotovo!.data).toEqual([{ id: 'k1', quantity: 13 }]);
  });
});

describe('co výpadek NENÍ', () => {
  it('rychlé selhání (telefon offline, server odmítl spojení) jistič neshodí — každý dotaz zkusí síť', async () => {
    const volani = sit(() => 'spadne');
    for (let i = 0; i < 3; i++) {
      const d = pust(supabase.from('beers').select('id').limit(1));
      await dobehni();
      expect(d.hotovo!.data).toEqual([{ id: 'b1' }]);
    }
    expect(cekaniNaSit()).toBeNull();
    expect(cesty(volani)).toEqual(['GET beers', 'GET beers', 'GET beers']);
  });

  it('dotaz zrušený volajícím o spojení nic neříká', async () => {
    sit(() => 'visi');
    const zrus = new AbortController();
    const dotaz = pust(supabase.from('beers').select('id').limit(1).abortSignal(zrus.signal));
    await vi.advanceTimersByTimeAsync(3000);
    zrus.abort();
    await dobehni();
    expect(dotaz.hotovo).not.toBeNull();
    expect(cekaniNaSit()).toBeNull();
  });

  it('pomalá, ale včasná odpověď není výpadek', async () => {
    sit(() => 'visi');
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((ok) => setTimeout(() => ok(json([{ id: 'pomalu' }])), VELKY_DOTAZ_TIMEOUT_MS - 100))));
    const dotaz = pust(supabase.from('kegging').select('id'));
    await vi.advanceTimersByTimeAsync(VELKY_DOTAZ_TIMEOUT_MS - 100);
    expect(dotaz.hotovo!.data).toEqual([{ id: 'pomalu' }]);
    expect(cekaniNaSit()).toBeNull();
  });
});

describe('fetchSJisticem', () => {
  it('odpověď serveru (i chybová) = server je na dosah; vypršení = výpadek', async () => {
    sit(() => json({ message: 'chyba' }, 500));
    expect((await fetchSJisticem('https://x.test/rest/v1/t')).status).toBe(500);
    expect(cekaniNaSit()).toBeNull();
    sit(() => 'visi');
    const slib = fetchSJisticem('https://x.test/rest/v1/t', undefined, 5000).catch((e: Error) => e.name);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await slib).toBe('AbortError');
    expect(cekaniNaSit()).toBe(0);
  });
});
