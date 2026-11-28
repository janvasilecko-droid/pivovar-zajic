import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('version check lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(window, 'caches');
  });

  it('creates only one initial timeout and one interval', async () => {
    const { startVersionCheck, stopVersionCheck } = await import('./versionCheck');

    startVersionCheck();
    startVersionCheck();

    expect(vi.getTimerCount()).toBe(2);
    stopVersionCheck();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears only application-owned cache entries', async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(['pivovar-1.0', 'pivovar-meta', 'another-app-cache']),
        delete: deleteCache,
      },
    });
    const { clearAppCaches } = await import('./versionCheck');

    await clearAppCaches();

    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(deleteCache).toHaveBeenCalledWith('pivovar-1.0');
    expect(deleteCache).toHaveBeenCalledWith('pivovar-meta');
    expect(deleteCache).not.toHaveBeenCalledWith('another-app-cache');
  });
});

// 🛑 Aktualizace nesmí smazat kopii aplikace v telefonu, když není odkud vzít novou.
// ---------------------------------------------------------------------------
// Změřeno v prohlížeči 28. 11. 2026 (docs/offline.md): klepnutí na „Aktualizovat" bez signálu zrušilo service
// worker, smazalo uloženou aplikaci a stránka skončila chybou prohlížeče — appka nešla spustit ani z ikony,
// dokud se signál nevrátil. Stejnou cestou si ji appka mazala sama při „automatické opravě" (main.tsx).
describe('forceRefresh — bez spojení nic nemaže', () => {
  type Prostredi = {
    online?: boolean;
    sit?: () => Promise<Response>;
    odregistrace?: () => Promise<boolean>;
    bezServiceWorkeru?: boolean;
  };
  const verzeOk = () => Promise.resolve(new Response(JSON.stringify({ version: '9.9', date: 'x' }), { status: 200 }));

  async function priprav(p: Prostredi = {}) {
    const unregister = vi.fn(p.odregistrace ?? (() => Promise.resolve(true)));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { getRegistration: vi.fn().mockResolvedValue(p.bezServiceWorkeru ? undefined : { unregister }) },
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => p.online ?? true });
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', {
      configurable: true,
      value: { keys: vi.fn().mockResolvedValue(['pivovar-2.1', 'pivovar-meta', 'cizi']), delete: deleteCache },
    });
    const fetchMock = vi.fn(p.sit ?? verzeOk);
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./versionCheck');
    const reload = vi.spyOn(mod.obnova, 'nactiZnovu').mockImplementation(() => {});
    return { mod, unregister, deleteCache, fetchMock, reload };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'onLine');
    Reflect.deleteProperty(window, 'caches');
  });

  it('server odpovídá → zruší registraci, smaže cache aplikace a načte stránku znovu', async () => {
    const { mod, unregister, deleteCache, reload, fetchMock } = await priprav();
    await expect(mod.forceRefresh()).resolves.toBe('obnovuji');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\.\/version\.json\?t=\d+$/);   // jedinečná adresa — uložená kopie neodpoví
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(deleteCache.mock.calls.map((c) => c[0]).sort()).toEqual(['pivovar-2.1', 'pivovar-meta']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('telefon ví, že je offline → nezeptá se, nic nesmaže, nic nenačítá', async () => {
    const { mod, unregister, deleteCache, reload, fetchMock } = await priprav({ online: false });
    await expect(mod.forceRefresh()).resolves.toBe('bez-spojeni');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(unregister).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    ['síť selže', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['service worker odpoví 503 (uloženou kopii té adresy nemá)', () => Promise.resolve(new Response('Offline', { status: 503 }))],
    ['odpověď není číslo verze (přihlašovací stránka hotelové wifi)', () => Promise.resolve(new Response('<html>přihlaste se</html>', { status: 200 }))],
    ['chybová odpověď, i kdyby v ní číslo verze bylo', () => Promise.resolve(new Response(JSON.stringify({ version: '9.9' }), { status: 503 }))],
  ])('%s → nic nesmaže', async (_popis, sit) => {
    const { mod, unregister, deleteCache, reload } = await priprav({ sit });
    await expect(mod.forceRefresh()).resolves.toBe('bez-spojeni');
    expect(unregister).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('server mlčí (slabý signál) → po limitu to vzdá a nic nesmaže', async () => {
    const { mod, unregister, deleteCache, reload } = await priprav({ sit: () => new Promise<Response>(() => {}) });
    const beh = mod.forceRefresh();
    await vi.advanceTimersByTimeAsync(mod.OVERENI_SPOJENI_MS - 1);
    let hotovo = false;
    void beh.then(() => { hotovo = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(hotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(beh).resolves.toBe('bez-spojeni');
    expect(unregister).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('po „bez spojení" jde zkusit znovu — a až server odpoví, aktualizuje se', async () => {
    let dole = true;
    const { mod, reload } = await priprav({ sit: () => (dole ? Promise.reject(new TypeError('Failed to fetch')) : verzeOk()) });
    await expect(mod.forceRefresh()).resolves.toBe('bez-spojeni');
    dole = false;
    await expect(mod.forceRefresh()).resolves.toBe('obnovuji');
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('zrušení registrace visí za běžící instalací → po půl minutě to vzdá a NIC nesmaže', async () => {
    // Smazat cache pod rukama rozdělané instalaci by nechalo v telefonu service worker s prázdnou pamětí.
    const { mod, deleteCache, reload } = await priprav({ odregistrace: () => new Promise<boolean>(() => {}) });
    const beh = mod.forceRefresh();
    await vi.advanceTimersByTimeAsync(mod.CEKANI_NA_ODREGISTRACI_MS - 100);
    let hotovo = false;
    void beh.then(() => { hotovo = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(hotovo).toBe(false);                                // ještě čeká na prohlížeč
    await vi.advanceTimersByTimeAsync(200);
    await expect(beh).resolves.toBe('stahuje-se');
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(mod.textVysledkuObnovy('stahuje-se')).toMatch(/ještě stahuje/);
  });

  it('zrušení registrace selže chybou → pokračuje (smaže cache a načte znovu)', async () => {
    const { mod, deleteCache, reload } = await priprav({ odregistrace: () => Promise.reject(new Error('InvalidStateError')) });
    await expect(mod.forceRefresh()).resolves.toBe('obnovuji');
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('opakované klepnutí během běžící aktualizace nespustí nic dalšího', async () => {
    let pust: (v: boolean) => void = () => {};
    const { mod, unregister, reload } = await priprav({ odregistrace: () => new Promise<boolean>((r) => { pust = r; }) });
    const prvni = mod.forceRefresh();
    const druhy = mod.forceRefresh();
    expect(druhy).toBe(prvni);
    await vi.advanceTimersByTimeAsync(10);
    pust(true);
    await expect(prvni).resolves.toBe('obnovuji');
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('bez service workeru (starý prohlížeč) se po ověření spojení jen smaže cache a načte znovu', async () => {
    const { mod, deleteCache, reload } = await priprav({ bezServiceWorkeru: true });
    await expect(mod.forceRefresh()).resolves.toBe('obnovuji');
    expect(deleteCache).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('úklid selže (plný telefon, soukromý režim) → stránka se načte znovu i tak', async () => {
    const { mod, reload } = await priprav();
    (window.caches.keys as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('QuotaExceededError'));
    await expect(mod.forceRefresh()).resolves.toBe('obnovuji');
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

// 🔁 Tlačítko „Aktualizovat" přepíná na verzi, která už je v telefonu stažená celá — a nic nemaže.
describe('aktualizuj — šetrná aktualizace', () => {
  type Stav = 'installing' | 'installed' | 'activating' | 'activated' | 'redundant';
  function atrapaWorkeru(stav: Stav) {
    const posluchaci = new Set<() => void>();
    const zpravy: unknown[] = [];
    const w = {
      state: stav,
      postMessage: (z: unknown) => { zpravy.push(z); },
      addEventListener: (_j: string, f: () => void) => { posluchaci.add(f); },
      removeEventListener: (_j: string, f: () => void) => { posluchaci.delete(f); },
    };
    return { w, zpravy, zmen: (novy: Stav) => { w.state = novy; for (const f of [...posluchaci]) f(); }, posloucha: () => posluchaci.size };
  }

  async function priprav(p: { ceka?: ReturnType<typeof atrapaWorkeru> | null; instaluje?: ReturnType<typeof atrapaWorkeru> | null; bezRegistrace?: boolean; online?: boolean; poUpdate?: () => void } = {}) {
    const unregister = vi.fn(() => Promise.resolve(true));
    const reg: any = {
      waiting: p.ceka ? p.ceka.w : null,
      installing: p.instaluje ? p.instaluje.w : null,
      unregister,
      update: vi.fn(async () => { p.poUpdate?.(); }),
    };
    const naPrevzeti = new Set<() => void>();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn().mockResolvedValue(p.bezRegistrace ? undefined : reg),
        addEventListener: (j: string, f: () => void) => { if (j === 'controllerchange') naPrevzeti.add(f); },
        removeEventListener: (_j: string, f: () => void) => { naPrevzeti.delete(f); },
      },
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => p.online ?? true });
    const deleteCache = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, 'caches', { configurable: true, value: { keys: vi.fn().mockResolvedValue(['pivovar-2.1', 'pivovar-meta']), delete: deleteCache } });
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: '9.9' }), { status: 200 })));
    vi.stubGlobal('fetch', fetchMock);
    const mod = await import('./versionCheck');
    const reload = vi.spyOn(mod.obnova, 'nactiZnovu').mockImplementation(() => {});
    return { mod, reg, unregister, deleteCache, fetchMock, reload, prevezmi: () => { for (const f of [...naPrevzeti]) f(); }, cekaNaPrevzeti: () => naPrevzeti.size };
  }

  beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); sessionStorage.clear(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'onLine');
    Reflect.deleteProperty(window, 'caches');
  });

  it('nová verze čeká stažená → řekne jí, ať převezme stránku, a načte znovu — nic nemaže, síť nepotřebuje', async () => {
    const ceka = atrapaWorkeru('installed');
    const { mod, unregister, deleteCache, fetchMock, reload, prevezmi } = await priprav({ ceka, online: false });
    const beh = mod.aktualizuj();
    await vi.advanceTimersByTimeAsync(0);
    expect(ceka.zpravy).toEqual([{ type: 'SKIP_WAITING' }]);
    expect(reload).not.toHaveBeenCalled();                     // čeká, až nová verze stránku převezme
    prevezmi();
    await expect(beh).resolves.toBe('obnovuji');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(unregister).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('převzetí se neohlásí → po limitu se stránka načte znovu tak jako tak', async () => {
    const { mod, reload, cekaNaPrevzeti } = await priprav({ ceka: atrapaWorkeru('installed') });
    const beh = mod.aktualizuj();
    await vi.advanceTimersByTimeAsync(mod.CEKANI_NA_PREVZETI_MS - 1);
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await expect(beh).resolves.toBe('obnovuji');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(cekaNaPrevzeti()).toBe(0);                          // posluchač po sobě uklidil
  });

  it('nová verze se dostahuje během čekání → přepne se na ni', async () => {
    const instaluje = atrapaWorkeru('installing');
    const priStahovani = vi.fn();
    const { mod, reg, reload, prevezmi } = await priprav({ instaluje });
    const beh = mod.aktualizuj(priStahovani);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(priStahovani).toHaveBeenCalledTimes(1);             // obrazovka ukáže „Stahuji novou verzi…"
    expect(instaluje.zpravy).toEqual([]);
    reg.installing = null; reg.waiting = instaluje.w;
    instaluje.zmen('installed');
    await vi.advanceTimersByTimeAsync(0);
    expect(instaluje.zpravy).toEqual([{ type: 'SKIP_WAITING' }]);
    prevezmi();
    await expect(beh).resolves.toBe('obnovuji');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(instaluje.posloucha()).toBe(0);
  });

  it('nová verze se nestihne dostahovat → řekne „stahuje se", nic nemaže a nenačítá', async () => {
    const instaluje = atrapaWorkeru('installing');
    const { mod, unregister, deleteCache, reload } = await priprav({ instaluje });
    const beh = mod.aktualizuj();
    await vi.advanceTimersByTimeAsync(mod.CEKANI_NA_INSTALACI_MS - 1);
    let hotovo = false;
    void beh.then(() => { hotovo = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(hotovo).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    await expect(beh).resolves.toBe('stahuje-se');
    expect(instaluje.zpravy).toEqual([]);
    expect(unregister).not.toHaveBeenCalled();
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(instaluje.posloucha()).toBe(0);
  });

  it('instalace nové verze selže (slabý signál) → „stahuje se", starší verze zůstává', async () => {
    const instaluje = atrapaWorkeru('installing');
    const { mod, deleteCache, reload } = await priprav({ instaluje });
    const beh = mod.aktualizuj();
    await vi.advanceTimersByTimeAsync(100);
    instaluje.zmen('redundant');
    await expect(beh).resolves.toBe('stahuje-se');
    expect(deleteCache).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('prohlížeč novou verzi ještě nezačal instalovat → řekne si o ni a pokračuje', async () => {
    const novy = atrapaWorkeru('installed');
    let registrace: any = null;
    const p = await priprav({ poUpdate: () => { registrace.waiting = novy.w; } });
    registrace = p.reg;
    const beh = p.mod.aktualizuj();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.reg.update).toHaveBeenCalledTimes(1);
    expect(novy.zpravy).toEqual([{ type: 'SKIP_WAITING' }]);
    p.prevezmi();
    await expect(beh).resolves.toBe('obnovuji');
  });

  it('žádná nová verze se neobjeví → „stahuje se"; po dvou marných pokusech sáhne třetí klepnutí po vynucené aktualizaci', async () => {
    const { mod, unregister, deleteCache, reload } = await priprav();
    await expect(mod.aktualizuj()).resolves.toBe('stahuje-se');
    await expect(mod.aktualizuj()).resolves.toBe('stahuje-se');
    expect(unregister).not.toHaveBeenCalled();
    expect(mod.POKUSU_PRED_VYNUCENIM).toBe(2);
    await expect(mod.aktualizuj()).resolves.toBe('obnovuji');   // ať nejde uvíznout na staré verzi
    expect(unregister).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalled();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('bez service workeru (starý prohlížeč) → vynucená aktualizace, a ta bez spojení nic nemaže', async () => {
    const online = await priprav({ bezRegistrace: true });
    await expect(online.mod.aktualizuj()).resolves.toBe('obnovuji');
    expect(online.reload).toHaveBeenCalledTimes(1);
    vi.resetModules();
    const offline = await priprav({ bezRegistrace: true, online: false });
    await expect(offline.mod.aktualizuj()).resolves.toBe('bez-spojeni');
    expect(offline.deleteCache).not.toHaveBeenCalled();
    expect(offline.reload).not.toHaveBeenCalled();
  });

  it('opakované klepnutí během přepínání nespustí nic dalšího', async () => {
    const ceka = atrapaWorkeru('installed');
    const { mod, reload, prevezmi } = await priprav({ ceka });
    const prvni = mod.aktualizuj();
    const druhy = mod.aktualizuj();
    expect(druhy).toBe(prvni);
    await vi.advanceTimersByTimeAsync(0);
    prevezmi();
    await prvni;
    expect(ceka.zpravy).toHaveLength(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('věty pro člověka: jen když to teď nejde', async () => {
    const { mod } = await priprav();
    expect(mod.textVysledkuObnovy('obnovuji')).toBeNull();
    expect(mod.textVysledkuObnovy('bez-spojeni')).toMatch(/server neodpovídá/);
    expect(mod.textVysledkuObnovy('stahuje-se')).toMatch(/ještě stahuje/);
  });
});

describe('serverOdpovida', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'onLine');
  });

  it('ano jen na skutečné číslo verze ze serveru', async () => {
    vi.resetModules();
    const mod = await import('./versionCheck');
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: '2.5' }), { status: 200 }))));
    await expect(mod.serverOdpovida()).resolves.toBe(true);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ neco: 1 }), { status: 200 }))));
    await expect(mod.serverOdpovida()).resolves.toBe(false);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 504 }))));
    await expect(mod.serverOdpovida()).resolves.toBe(false);
  });
});

