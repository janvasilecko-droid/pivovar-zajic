// @vitest-environment node
// 📴 Service worker ukládá do telefonu VŠECHNY obrazovky předem (public/sw.js, KUSY).
// ---------------------------------------------------------------------------
// Majitel 27. 11. 2026: „napíše to, že to je offline, a neukážou se mi žádný data." Jedna z příčin: kus
// obrazovky se do telefonu dostal, až když ji člověk se signálem poprvé otevřel — a po každé aktualizaci znovu.
// Sklad se tak bez signálu vůbec nenačetl.
//
// 28. 11. 2026 (změřeno v prohlížeči, docs/offline.md): nová verze se smí zapnout, až když je v telefonu CELÁ —
// jinak by po aktualizaci bez signálu chyběly obrazovky. Instalace proto stahuje všechno a neúplná selže
// (starší verze běží dál). Aktivace na síť nečeká vůbec: při serveru, který neodpovídal, zůstala appka až
// 5 minut bílá. A nic nesmí viset donekonečna — stahování hlídá hlídač ticha.
//
// Skutečný `public/sw.js` se tu pustí v izolovaném kontextu (node:vm) s atrapou úložiště a sítě.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { vlozKusy, vlozShell, vyberKusy, MIMO_KUSY } from '../../scripts/shell-do-sw.mjs';

const ORIGIN = 'https://zajic-pivovar.pages.dev';
const ZDROJ = readFileSync('public/sw.js', 'utf8');
const SHELL = ['./assets/index-AAAAAAAA.js', './assets/index-BBBBBBBB.css'];
const KUSY = ['./assets/Dashboard-CCCCCCCC.js', './assets/Orders-DDDDDDDD.js', './assets/Zavoz-EEEEEEEE.js', './assets/Kegging-FFFFFFFF.js'];
const abs = (c: string) => new URL(c, `${ORIGIN}/`).href;
/** Jádro aplikace (PRECACHE v sw.js) — vyčtené ze zdrojáku, ať se seznam neudržuje na dvou místech. */
const JADRO = [...(ZDROJ.match(/const PRECACHE = \[([\s\S]*?)\.\.\.SHELL,\n\];/)?.[1].match(/'[^']+'/g) ?? []).map((x) => x.slice(1, -1)), ...SHELL];

function atrapaUloziste() {
  const sklad = new Map<string, Map<string, Response>>();
  const volby: unknown[] = [];
  const adresa = (r: any) => (typeof r === 'string' ? abs(r) : r.url);
  const otevri = async (nazev: string) => {
    if (!sklad.has(nazev)) sklad.set(nazev, new Map());
    const m = sklad.get(nazev)!;
    return {
      nazev,
      match: async (r: any, opce?: unknown) => { volby.push(opce); const hit = m.get(adresa(r)); return hit ? hit.clone() : undefined; },
      put: async (r: any, res: Response) => { m.set(adresa(r), res); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
    };
  };
  return {
    sklad, volby,
    caches: { open: otevri, keys: async () => [...sklad.keys()], delete: async (n: string) => sklad.delete(n) },
    ma: (cache: string, cesta: string) => !!sklad.get(cache)?.has(abs(cesta)),
    async vloz(cache: string, soubory: string[]) {
      const c = await otevri(cache);
      for (const s of soubory) await c.put(abs(s), new Response(`uloženo:${s}`, { status: 200 }));
    },
    async nainstalovano(cache: string) {
      const meta = await otevri('pivovar-meta');
      await meta.put(`${ORIGIN}/__installed-cache__`, new Response(cache));
    },
  };
}

type Sit = (url: string) => Promise<Response> | Response;

/** Vteřiny service workeru běží v testu 250× rychleji: tik hlídače 5 s = 20 ms, minuta ticha = 240 ms. */
const ZRYCHLENI = 250;
const nikdy = () => new Promise<Response>(() => {});

function nactiSw(opce: { verze?: string; kusy?: string[]; sit?: Sit; sitVerze?: Sit; uloziste?: ReturnType<typeof atrapaUloziste>; zrychleni?: number } = {}) {
  const verze = opce.verze ?? '2.2';
  const zrychleni = opce.zrychleni ?? ZRYCHLENI;
  const uloziste = opce.uloziste ?? atrapaUloziste();
  const stazeno: string[] = [];
  const kusyVse = KUSY.concat(opce.kusy ?? []).map((k) => new URL(abs(k)).pathname);
  let soubezne = 0;
  let nejvicSoubezne = 0;
  let sit: Sit = opce.sit ?? ((u) => new Response(`ze-site:${new URL(u).pathname}`, { status: 200 }));
  const sitVerze: Sit = opce.sitVerze ?? (() => new Response(JSON.stringify({ version: verze }), { status: 200 }));
  const obsluha: Record<string, (e: any) => void> = {};
  const klientum: unknown[] = [];
  /** Odpověď sítě — nebo chyba, když si service worker stahování mezitím zrušil (AbortController). */
  const seZrusenim = (slib: Promise<Response> | Response, signal?: AbortSignal) => Promise.race([
    Promise.resolve(slib),
    new Promise<Response>((_, odmitni) => {
      const zrus = () => odmitni(new DOMException('zrušeno', 'AbortError'));
      if (signal?.aborted) zrus(); else signal?.addEventListener('abort', zrus);
    }),
  ]);
  const sandbox: any = {
    self: {
      location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
      registration: { scope: `${ORIGIN}/` },
      addEventListener: (n: string, f: (e: any) => void) => { obsluha[n] = f; },
      clients: { matchAll: async () => [{ postMessage: (z: unknown) => klientum.push(z) }], claim: async () => {} },
      skipWaiting: () => {},
    },
    URL, Response, Request, Headers, Promise, AbortController, clearTimeout, console, Date,
    setTimeout: (f: () => void, ms?: number) => setTimeout(f, (ms ?? 0) >= 1000 ? (ms ?? 0) / zrychleni : 0),
    caches: uloziste.caches,
    fetch: async (u: any, init?: { signal?: AbortSignal }) => {
      const url = typeof u === 'string' ? abs(u) : u.url;
      const cesta = new URL(url).pathname;
      if (cesta === '/version.json') return seZrusenim(sitVerze(url), init?.signal);
      stazeno.push(cesta);
      const jeKus = kusyVse.includes(cesta);
      if (jeKus) { soubezne++; nejvicSoubezne = Math.max(nejvicSoubezne, soubezne); }
      try {
        await new Promise((r) => setTimeout(r, 1));
        return await seZrusenim(sit(url), init?.signal);
      } finally { if (jeKus) soubezne--; }
    },
    indexedDB: {},
  };
  vm.createContext(sandbox);
  const zdroj = vlozKusy(vlozShell(ZDROJ, SHELL), opce.kusy ?? KUSY);
  new vm.Script(zdroj, { filename: 'sw.js' }).runInContext(sandbox);
  const udalost = async (jmeno: string, data: Record<string, unknown> = {}) => {
    let slib: Promise<unknown> = Promise.resolve();
    obsluha[jmeno]({ ...data, waitUntil: (p: Promise<unknown>) => { slib = p; } });
    await slib;
  };
  return {
    uloziste, stazeno, klientum,
    kusyZeSite: () => stazeno.filter((p) => kusyVse.includes(p)),
    /** Nejvíc kusů stahovaných naráz. */
    nejvicSoubezne: () => nejvicSoubezne,
    nastavSit: (nova: Sit) => { sit = nova; },
    instaluj: () => udalost('install'),
    aktivuj: () => udalost('activate'),
    /** Počká, až doběhne stahování na pozadí (to, které instalace a aktivace jen spustí a nečekají na něj). */
    dobehni: (): Promise<{ ulozeno: number; celkem: number }> => sandbox.doplnNaPozadi(),
    zprava: async (data: unknown) => {
      const odpovedi: any[] = [];
      await udalost('message', { data, source: { postMessage: (z: unknown) => odpovedi.push(z) } });
      return odpovedi;
    },
    async pozadavek(cesta: string): Promise<Response | null> {
      let vysledek: Promise<Response> | null = null;
      obsluha.fetch({
        request: { url: abs(cesta), mode: 'cors', method: 'GET', headers: new Headers(), destination: 'script' },
        respondWith: (p: Promise<Response>) => { vysledek = Promise.resolve(p); },
        waitUntil: () => {},
      });
      return vysledek;
    },
  };
}

const bezSite: Sit = async () => { throw new TypeError('Failed to fetch'); };

/** „hotovo", když slib doběhne do limitu; jinak „čeká". Limit je hluboko pod dobou, po které to vzdá hlídač. */
const doLimitu = (slib: Promise<unknown>, ms: number) => Promise.race([
  slib.then(() => 'hotovo' as const),
  new Promise<'čeká'>((r) => setTimeout(() => r('čeká'), ms)),
]);

/** Počká, až podmínka začne platit (nejdéle `ms`) — pro práci, kterou service worker jen spustí a nečeká na ni. */
async function az(podminka: () => boolean, ms = 2000) {
  const konec = Date.now() + ms;
  while (!podminka()) {
    if (Date.now() > konec) throw new Error('podmínka se do limitu nesplnila');
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** Instalace; vrací, kolik obrazovek je pak v telefonu (zeptá se stejně jako stránka — nic dalšího se nestahuje). */
async function nainstaluj(sw: ReturnType<typeof nactiSw>) {
  await sw.instaluj();
  return sw.dobehni();
}

describe('instalace verze', () => {
  it('uloží všechny obrazovky — i ty, které nikdo neotevřel', async () => {
    const sw = nactiSw();
    await sw.instaluj();
    for (const k of [...KUSY, ...SHELL, './index.html']) expect(sw.uloziste.ma('pivovar-2.2', k), k).toBe(true);
    const stazenoPriInstalaci = sw.stazeno.length;
    expect(await sw.dobehni()).toEqual({ ulozeno: 4, celkem: 4 });
    expect(sw.stazeno.length).toBe(stazenoPriInstalaci);       // po instalaci už není co stahovat
  });

  it('server přestane odpovídat → instalace nezůstane viset: po minutě ticha to vzdá', async () => {
    // Na konci instalace závisí i zrušení registrace (tlačítko „Vynutit stažení nejnovější verze").
    const sw = nactiSw({ sit: (u) => (u.includes('/assets/') && !u.includes('index-') ? nikdy() : new Response('ok', { status: 200 })) });
    const zacatek = Date.now();
    await sw.instaluj();                                       // bez hlídače by se nikdy nedočkal
    expect(Date.now() - zacatek).toBeGreaterThanOrEqual(200);  // 12 tiků po 20 ms
    // V telefonu žádná starší verze není → nainstaluje se i neúplná (jádro má, obrazovky doplní na pozadí).
    for (const k of [...SHELL, './', './index.html']) expect(sw.uloziste.ma('pivovar-2.2', k), k).toBe(true);
    expect(sw.uloziste.ma('pivovar-meta', './__installed-cache__')).toBe(true);
    for (const k of KUSY) expect(sw.uloziste.ma('pivovar-2.2', k), k).toBe(false);
  });

  it('obrazovka se nestáhla a v telefonu je starší verze → instalace selže; stažené zůstává a příští pokus doplní jen zbytek', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', ['./', './assets/index-STARY000.js']);
    await uloziste.nainstalovano('pivovar-2.1');
    const prvni = nactiSw({ uloziste, sit: (u) => { if (u.includes('Zavoz')) throw new TypeError('Failed to fetch'); return new Response('ok', { status: 200 }); } });
    await expect(prvni.instaluj()).rejects.toThrow(/starší verze/);
    expect(await uloziste.sklad.get('pivovar-meta')!.get(`${ORIGIN}/__installed-cache__`)!.clone().text()).toBe('pivovar-2.1');   // pořád platí starší
    expect(uloziste.ma('pivovar-2.1', './')).toBe(true);
    expect(uloziste.ma('pivovar-2.2', './assets/Orders-DDDDDDDD.js')).toBe(true);        // co se stáhlo, zůstalo
    // Signál se zlepšil, prohlížeč to zkusí znovu:
    const druhy = nactiSw({ uloziste });
    await druhy.instaluj();
    expect(druhy.kusyZeSite()).toEqual(['/assets/Zavoz-EEEEEEEE.js']);                   // jen to, co chybělo
    expect(await uloziste.sklad.get('pivovar-meta')!.get(`${ORIGIN}/__installed-cache__`)!.clone().text()).toBe('pivovar-2.2');
  });

  it('paměť rozdělané instalace mezitím smazala aktivace jiné verze → instalace selže (nezapne se s prázdnou pamětí)', async () => {
    // Dvě nasazení těsně po sobě: mezitím co se instaluje 2.2, někdo zapne jinou verzi a ta cizí cache maže.
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', ['./', './assets/index-STARY000.js']);
    await uloziste.nainstalovano('pivovar-2.1');
    let smazano = false;
    const sw = nactiSw({ uloziste, sit: (u) => {
      if (!smazano && u.includes('Dashboard')) { smazano = true; uloziste.sklad.delete('pivovar-2.2'); }
      return new Response('ok', { status: 200 });
    } });
    await expect(sw.instaluj()).rejects.toThrow(/starší verze/);
    expect(smazano).toBe(true);
    expect(await uloziste.sklad.get('pivovar-meta')!.get(`${ORIGIN}/__installed-cache__`)!.clone().text()).toBe('pivovar-2.1');
  });

  it('nová verze čeká celá: po instalaci přes starší nic nechybí', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', ['./', './assets/Dashboard-CCCCCCCC.js']);
    await uloziste.nainstalovano('pivovar-2.1');
    const sw = nactiSw({ uloziste });
    await sw.instaluj();
    for (const k of [...JADRO, ...KUSY]) expect(uloziste.ma('pivovar-2.2', k), k).toBe(true);
    expect(uloziste.sklad.has('pivovar-2.1')).toBe(true);      // starší verzi maže až aktivace
  });

  it('jádro se nestáhlo a v telefonu je starší verze → instalace selže a starší verze zůstane (nenahradí ji neúplná)', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', ['./', './assets/index-STARY000.js']);
    await uloziste.nainstalovano('pivovar-2.1');
    const sw = nactiSw({ uloziste, sit: (u) => { if (u.includes('index-AAAAAAAA')) throw new TypeError('Failed to fetch'); return new Response('ok', { status: 200 }); } });
    await expect(sw.instaluj()).rejects.toThrow(/starší verze/);
    expect(uloziste.ma('pivovar-2.1', './')).toBe(true);                                  // starší verze nedotčená
    expect(await uloziste.sklad.get('pivovar-meta')!.get(`${ORIGIN}/__installed-cache__`)!.clone().text()).toBe('pivovar-2.1');
  });

  it('jádro se nestáhlo, ale žádná starší verze v telefonu není → nainstaluje se i tak (ukáže aspoň „Bez připojení")', async () => {
    const sw = nactiSw({ sit: bezSite });
    await sw.instaluj();
    expect(sw.uloziste.ma('pivovar-meta', './__installed-cache__')).toBe(true);
  });

  it('seznam jádra v testu sedí se zdrojákem', () => {
    expect(JADRO).toContain('./');
    expect(JADRO).toContain('./index.html');
    expect(JADRO.length).toBe(13 + SHELL.length);
  });

  it('bez signálu se pak neotevřená obrazovka načte z telefonu', async () => {
    const uloziste = atrapaUloziste();
    await nainstaluj(nactiSw({ uloziste }));
    const offline = nactiSw({ uloziste, sit: bezSite });
    const res = (await offline.pozadavek('/assets/Dashboard-CCCCCCCC.js'))!;
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ze-site:/assets/Dashboard-CCCCCCCC.js');
    expect(offline.stazeno).toEqual([]);                       // ze sítě se nic nezkoušelo
    // Kus, který v telefonu není (těžká knihovna), bez signálu nahlásí chybu — ne nesmysl.
    expect((await offline.pozadavek('/assets/xlsx-GGGGGGGG.js'))!.status).toBe(504);
  });

  it('po aktualizaci se nezměněné kusy jen zkopírují ze staré verze — stahují se jen nové', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', ['./assets/Dashboard-CCCCCCCC.js', './assets/Orders-DDDDDDDD.js', './assets/Stary-HHHHHHHH.js']);
    await uloziste.nainstalovano('pivovar-2.1');
    const sw = nactiSw({ uloziste });
    await nainstaluj(sw);
    expect(sw.kusyZeSite().sort()).toEqual(['/assets/Kegging-FFFFFFFF.js', '/assets/Zavoz-EEEEEEEE.js']);
    expect(await uloziste.sklad.get('pivovar-2.2')!.get(abs('./assets/Dashboard-CCCCCCCC.js'))!.clone().text()).toBe('uloženo:./assets/Dashboard-CCCCCCCC.js');
    expect(uloziste.ma('pivovar-2.2', './assets/Stary-HHHHHHHH.js')).toBe(false);   // co nová verze nezná, nepřenáší
  });

  it('stahuje nejvýš po šesti naráz (slabý signál by sto souběžných stahování zahltilo)', async () => {
    const hodne = Array.from({ length: 40 }, (_, i) => `./assets/Kus${i}-${String(i).padStart(8, 'X')}.js`);
    const sw = nactiSw({ kusy: hodne });
    await nainstaluj(sw);
    expect(sw.nejvicSoubezne()).toBe(6);
    expect(hodne.every((k) => sw.uloziste.ma('pivovar-2.2', k))).toBe(true);
  });

  it('kus, který se nepodařilo stáhnout, instalaci neshodí — a neuloží se jako chyba', async () => {
    const sw = nactiSw({ sit: (u) => (u.includes('Zavoz') ? new Response('nenalezeno', { status: 404 }) : new Response('ok', { status: 200 })) });
    expect(await nainstaluj(sw)).toEqual({ ulozeno: 3, celkem: 4 });
    expect(sw.uloziste.ma('pivovar-2.2', './assets/Zavoz-EEEEEEEE.js')).toBe(false);
    expect(sw.uloziste.ma('pivovar-2.2', './assets/Orders-DDDDDDDD.js')).toBe(true);
  });
});

describe('aktivace verze', () => {
  it('doplní, co při instalaci nedoběhlo — ze staré verze dřív, než ji smaže', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', KUSY);
    await uloziste.nainstalovano('pivovar-2.2');               // instalace 2.2 „proběhla", ale kusy se nestihly
    const sw = nactiSw({ uloziste, sit: bezSite });
    await sw.aktivuj();
    for (const k of KUSY) expect(uloziste.ma('pivovar-2.2', k), k).toBe(true);
    expect(uloziste.sklad.has('pivovar-2.1')).toBe(false);     // stará verze je pryč až potom
    expect(sw.klientum).toContainEqual({ type: 'SW_ACTIVATED', version: 'pivovar-2.2' });
  });

  it('NEČEKÁ na síť — server neodpovídá a aktivace přesto hned doběhne (jinak se appka neotevře)', async () => {
    // Dokud aktivace běží, prohlížeč nepustí otevření stránky. Dřív tu čekala na nové stažení celého jádra.
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.1', KUSY.slice(0, 2));
    await uloziste.vloz('pivovar-2.2', ['./index.html']);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste, zrychleni: 25, sit: nikdy, sitVerze: nikdy });
    expect(await doLimitu(sw.aktivuj(), 1000)).toBe('hotovo');  // se starým kódem by se nedočkal
    expect(sw.klientum).toContainEqual({ type: 'SW_ACTIVATED', version: 'pivovar-2.2' });
    expect(uloziste.sklad.has('pivovar-2.1')).toBe(false);
    for (const k of KUSY.slice(0, 2)) expect(uloziste.ma('pivovar-2.2', k), k).toBe(true);   // zkopírováno z telefonu
  });

  it('nezná jméno své cache a server neodpovídá ani na číslo verze → po limitu si poradí sama (nezůstane viset)', async () => {
    const sw = nactiSw({ sit: nikdy, sitVerze: nikdy });        // úložiště prázdné: žádný záznam o instalaci
    await sw.aktivuj();
    expect(sw.klientum).toHaveLength(1);
    expect(String((sw.klientum[0] as { version: string }).version)).toMatch(/^pivovar-[a-z0-9]+$/);   // náhradní jméno podle času
  });

  it('co v telefonu chybí — jádro i obrazovky — se po aktivaci dotáhne na pozadí', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', ['./index.html']);      // instalaci přerušil slabý signál
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    await sw.aktivuj();
    // Aktivace si doplnění spustí SAMA (nikdo se o ně neříká) — jen na ně nečeká.
    await az(() => [...KUSY, ...SHELL, './', './manifest.webmanifest'].every((k) => uloziste.ma('pivovar-2.2', k)));
    expect(await sw.dobehni()).toEqual({ ulozeno: 4, celkem: 4 });
    expect(sw.stazeno.filter((p) => p === '/index.html')).toEqual([]);   // co v telefonu je, se znovu nestahuje
  });
});

describe('stahování na pozadí (doplnNaPozadi)', () => {
  it('běží jen jedno naráz — dvě žádosti po sobě nestahují nic dvakrát', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    const [a, b] = await Promise.all([sw.zprava({ type: 'DOPLN_OFFLINE' }), sw.zprava({ type: 'DOPLN_OFFLINE' })]);
    expect(a).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 4, celkem: 4 }]);
    expect(b).toEqual(a);
    expect(sw.kusyZeSite().sort()).toEqual(KUSY.map((k) => new URL(abs(k)).pathname).sort());   // každý kus jednou
  });

  it('server neodpovídá → po minutě ticha to vzdá, řekne pravdu a příští pokus začne znovu', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', [...JADRO, KUSY[0]]);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste, sit: nikdy });
    const zacatek = Date.now();
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 1, celkem: 4 }]);
    expect(Date.now() - zacatek).toBeGreaterThanOrEqual(200);  // 12 tiků po 20 ms — ne hned, ne nikdy
    // Signál se vrátil: další žádost se nepřidá k zaseknutému běhu, stáhne zbytek.
    sw.nastavSit(() => new Response('ok', { status: 200 }));
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 4, celkem: 4 }]);
  });

  it('pomalé spojení, na kterém soubory přibývají, hlídač nepřeruší', async () => {
    const hodne = Array.from({ length: 30 }, (_, i) => `./assets/Pomaly${i}-${String(i).padStart(8, 'Y')}.js`);
    const uloziste = atrapaUloziste();
    await uloziste.nainstalovano('pivovar-2.2');
    // Každý soubor 60 ms (= 15 s času service workeru), po šesti naráz: celkem přes 300 ms, tedy déle než
    // „minuta ticha" (240 ms) — ale něco pořád dotéká.
    const sw = nactiSw({ uloziste, kusy: hodne, sit: async () => { await new Promise((r) => setTimeout(r, 60)); return new Response('ok', { status: 200 }); } });
    const stav = await sw.dobehni();
    expect(stav).toEqual({ ulozeno: 30, celkem: 30 });
  });
});

describe('zpráva DOPLN_OFFLINE (stránka si říká o chybějící obrazovky)', () => {
  it('doplní chybějící a odpoví, kolik jich v telefonu je', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', KUSY.slice(0, 1));
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 4, celkem: 4 }]);
    expect(sw.kusyZeSite()).toHaveLength(3);
  });

  it('když nic nechybí, nic nestahuje', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', [...JADRO, ...KUSY]);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 4, celkem: 4 }]);
    expect(sw.stazeno).toEqual([]);
  });

  it('doplní i chybějící jádro aplikace (instalace na slabém signálu nestáhla všechno)', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', [...JADRO.filter((j) => j !== './' && !j.includes('index-BBBBBBBB')), ...KUSY]);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    await sw.zprava({ type: 'DOPLN_OFFLINE' });
    expect(sw.stazeno.sort()).toEqual(['/', '/assets/index-BBBBBBBB.css']);
    expect(uloziste.ma('pivovar-2.2', './')).toBe(true);
  });

  it('bez signálu řekne pravdu — kolik chybí', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', KUSY.slice(0, 3));
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste, sit: bezSite });
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 3, celkem: 4 }]);
  });

  it('jiné zprávy nic nestahují', async () => {
    const sw = nactiSw();
    expect(await sw.zprava({ type: 'NECO_JINEHO' })).toEqual([]);
    expect(await sw.zprava(null)).toEqual([]);
    expect(sw.stazeno).toEqual([]);
  });
});

describe('kontrola verze (version.json)', () => {
  const pozadavekNa = (sw: ReturnType<typeof nactiSw>, cesta: string) => sw.pozadavek(cesta);

  it('adresa s parametrem se do paměti neukládá — je pokaždé jiná a jen by tam přibývala', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    for (const t of [1, 2, 3]) expect((await pozadavekNa(sw, `/version.json?t=${t}`))!.status).toBe(200);
    expect((await pozadavekNa(sw, '/version.json'))!.status).toBe(200);
    await new Promise((r) => setTimeout(r, 5));                // ukládání běží vedle odpovědi
    const ulozeno = [...(uloziste.sklad.get('pivovar-2.2')?.keys() ?? [])];
    expect(ulozeno).toEqual([abs('/version.json')]);
  });

  it('bez spojení odpoví na adresu s parametrem 503 — podle toho appka pozná, že server opravdu neodpovídá', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.vloz('pivovar-2.2', ['./version.json']);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste, sitVerze: bezSite });
    expect((await pozadavekNa(sw, '/version.json?t=42'))!.status).toBe(503);
    expect((await pozadavekNa(sw, '/version.json'))!.status).toBe(200);     // holá adresa má kopii z instalace
  });
});

describe('uložená kopie se najde i při hlavičce Vary', () => {
  it('hledá se s ignoreVary', async () => {
    const uloziste = atrapaUloziste();
    await nainstaluj(nactiSw({ uloziste }));
    uloziste.volby.length = 0;
    await nactiSw({ uloziste, sit: bezSite }).pozadavek('/assets/Orders-DDDDDDDD.js');
    expect(uloziste.volby).toContainEqual({ ignoreVary: true });
  });
});

describe('build: seznam kusů pro service worker (scripts/shell-do-sw.mjs)', () => {
  const soubory = ['index-AAAAAAAA.js', 'index-BBBBBBBB.css', 'Dashboard-CCCCCCCC.js', 'Orders-DDDDDDDD.js', 'Orders-EEEEEEEE.css',
    'pdf-FFFFFFFF.js', 'pdf.worker-GGGGGGGG.mjs', 'xlsx-HHHHHHHH.js', 'logo-IIIIIIII.svg', 'modul-JJJJJJJJ.mjs'];

  it('všechny skripty a styly kromě vstupního shellu a těžkých knihoven, seřazené', () => {
    expect(vyberKusy(soubory, SHELL)).toEqual([
      './assets/Dashboard-CCCCCCCC.js', './assets/Orders-DDDDDDDD.js', './assets/Orders-EEEEEEEE.css', './assets/modul-JJJJJJJJ.mjs',
    ]);
  });

  it('těžké knihovny (PDF, Excel) se předem neukládají; obrazovka s podobným názvem ano', () => {
    for (const f of ['pdf-abc.js', 'pdf.worker-abc.mjs', 'xlsx-abc.js']) expect(MIMO_KUSY.test(f), f).toBe(true);
    for (const f of ['Dashboard-abc.js', 'ExportPdf-abc.js', 'index-abc.js']) expect(MIMO_KUSY.test(f), f).toBe(false);
  });

  it('vloží seznam na místo prázdného KUSY; bez místa radši spadne', () => {
    const sw = vlozKusy('x\nconst KUSY = [];\ny', ['./assets/a.js', './assets/b.css']);
    expect(sw).toBe("x\nconst KUSY = ['./assets/a.js', './assets/b.css'];\ny");
    expect(() => vlozKusy('const NECO = [];', [])).toThrow(/KUSY/);
  });

  it('zdroják service workeru má místo pro kusy a build je opravdu doplňuje', () => {
    expect(ZDROJ).toMatch(/const KUSY = \[\];/);
    const skript = readFileSync('scripts/shell-do-sw.mjs', 'utf8');
    expect(skript).toMatch(/vlozKusy\(/);
    expect(skript).toMatch(/kusy\.length < 20/);               // podezřele málo kusů = build spadne
  });
});
