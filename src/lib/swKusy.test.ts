// @vitest-environment node
// 📴 Service worker ukládá do telefonu VŠECHNY obrazovky hned při instalaci verze (public/sw.js, KUSY).
// ---------------------------------------------------------------------------
// Majitel 27. 11. 2026: „napíše to, že to je offline, a neukážou se mi žádný data." Jedna z příčin: kus
// obrazovky se do telefonu dostal, až když ji člověk se signálem poprvé otevřel — a po každé aktualizaci znovu.
// Sklad se tak bez signálu vůbec nenačetl.
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

function nactiSw(opce: { verze?: string; kusy?: string[]; sit?: Sit; uloziste?: ReturnType<typeof atrapaUloziste> } = {}) {
  const verze = opce.verze ?? '2.2';
  const uloziste = opce.uloziste ?? atrapaUloziste();
  const stazeno: string[] = [];
  let soubezne = 0;
  let nejvicSoubezne = 0;
  const sit: Sit = opce.sit ?? ((u) => new Response(`ze-site:${new URL(u).pathname}`, { status: 200 }));
  const obsluha: Record<string, (e: any) => void> = {};
  const klientum: unknown[] = [];
  const sandbox: any = {
    self: {
      location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
      registration: { scope: `${ORIGIN}/` },
      addEventListener: (n: string, f: (e: any) => void) => { obsluha[n] = f; },
      clients: { matchAll: async () => [{ postMessage: (z: unknown) => klientum.push(z) }], claim: async () => {} },
      skipWaiting: () => {},
    },
    URL, Response, Request, Headers, Promise, setTimeout: (f: () => void) => setTimeout(f, 0), clearTimeout, console, Date,
    caches: uloziste.caches,
    fetch: async (u: any) => {
      const url = typeof u === 'string' ? abs(u) : u.url;
      if (new URL(url).pathname === '/version.json') return new Response(JSON.stringify({ version: verze }), { status: 200 });
      stazeno.push(new URL(url).pathname);
      soubezne++;
      nejvicSoubezne = Math.max(nejvicSoubezne, soubezne);
      try {
        await new Promise((r) => setTimeout(r, 1));
        return await sit(url);
      } finally { soubezne--; }
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
    kusyZeSite: () => stazeno.filter((p) => KUSY.concat(opce.kusy ?? []).some((k) => abs(k).endsWith(p))),
    nejvicSoubezne: () => nejvicSoubezne,
    instaluj: () => udalost('install'),
    aktivuj: () => udalost('activate'),
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

describe('instalace verze', () => {
  it('uloží všechny obrazovky — i ty, které nikdo neotevřel', async () => {
    const sw = nactiSw();
    await sw.instaluj();
    for (const k of [...KUSY, ...SHELL, './index.html']) expect(sw.uloziste.ma('pivovar-2.2', k), k).toBe(true);
  });

  it('bez signálu se pak neotevřená obrazovka načte z telefonu', async () => {
    const uloziste = atrapaUloziste();
    await nactiSw({ uloziste }).instaluj();
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
    await sw.instaluj();
    expect(sw.kusyZeSite().sort()).toEqual(['/assets/Kegging-FFFFFFFF.js', '/assets/Zavoz-EEEEEEEE.js']);
    expect(await uloziste.sklad.get('pivovar-2.2')!.get(abs('./assets/Dashboard-CCCCCCCC.js'))!.clone().text()).toBe('uloženo:./assets/Dashboard-CCCCCCCC.js');
    expect(uloziste.ma('pivovar-2.2', './assets/Stary-HHHHHHHH.js')).toBe(false);   // co nová verze nezná, nepřenáší
  });

  it('stahuje nejvýš po šesti naráz (slabý signál by sto souběžných stahování zahltilo)', async () => {
    const hodne = Array.from({ length: 40 }, (_, i) => `./assets/Kus${i}-${String(i).padStart(8, 'X')}.js`);
    const sw = nactiSw({ kusy: hodne });
    await sw.instaluj();
    expect(sw.nejvicSoubezne()).toBeLessThanOrEqual(6 + 13);   // 6 kusů + soubory základu (ikony, písma) souběžně
    expect(hodne.every((k) => sw.uloziste.ma('pivovar-2.2', k))).toBe(true);
  });

  it('kus, který se nepodařilo stáhnout, instalaci neshodí — a neuloží se jako chyba', async () => {
    const sw = nactiSw({ sit: (u) => (u.includes('Zavoz') ? new Response('nenalezeno', { status: 404 }) : new Response('ok', { status: 200 })) });
    await sw.instaluj();
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
    await uloziste.vloz('pivovar-2.2', KUSY);
    await uloziste.nainstalovano('pivovar-2.2');
    const sw = nactiSw({ uloziste });
    expect(await sw.zprava({ type: 'DOPLN_OFFLINE' })).toEqual([{ type: 'OFFLINE_STAV', ulozeno: 4, celkem: 4 }]);
    expect(sw.stazeno).toEqual([]);
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

describe('uložená kopie se najde i při hlavičce Vary', () => {
  it('hledá se s ignoreVary', async () => {
    const uloziste = atrapaUloziste();
    await nactiSw({ uloziste }).instaluj();
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
