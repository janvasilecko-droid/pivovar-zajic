// @vitest-environment node
// 📴 Service worker: stránka „Bez připojení“ místo holého „Offline“ (public/sw.js).
// ---------------------------------------------------------------------------
// Šéfovi se na starším Androidu aplikace z ikony na ploše nespustila (25. 11. 2026). Jedna z možných cest:
// bez signálu a bez uložené kopie (Chrome ji na telefonu s málem místa smazal) vrátil service worker holé „Offline“
// — prázdná bílá stránka s jedním slovem. Teď vrátí srozumitelnou stránku, která se sama načte po připojení.
//
// Skutečný `public/sw.js` se tu pustí v izolovaném kontextu (node:vm) s atrapou úložiště a sítě; žádná síť,
// žádný skutečný prohlížeč. Skript samotné stránky se pak pustí v jsdom.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transformSync } from 'esbuild';

const SW = readFileSync('public/sw.js', 'utf8');
const ORIGIN = 'https://zajic-pivovar.pages.dev';

type Odpoved = Response;

/** Atrapa úložiště: název → (adresa → odpověď). */
function atrapaUloziste() {
  const sklad = new Map<string, Map<string, Response>>();
  const adresa = (r: any) => (typeof r === 'string' ? new URL(r, `${ORIGIN}/`).href : r.url);
  const otevri = async (nazev: string) => {
    if (!sklad.has(nazev)) sklad.set(nazev, new Map());
    const m = sklad.get(nazev)!;
    return {
      match: async (r: any) => { const hit = m.get(adresa(r)); return hit ? hit.clone() : undefined; },
      put: async (r: any, res: Response) => { m.set(adresa(r), res); },
      keys: async () => [...m.keys()].map((url) => ({ url })),
    };
  };
  return {
    sklad,
    caches: {
      open: otevri,
      keys: async () => [...sklad.keys()],
      delete: async (n: string) => sklad.delete(n),
    },
    /** Jako po úspěšné instalaci: nainstalovaná verze + uložené soubory. */
    async nainstaluj(soubory: Record<string, string>) {
      const meta = await otevri('pivovar-meta');
      await meta.put(`${ORIGIN}/__installed-cache__`, new Response('pivovar-2.1'));
      const c = await otevri('pivovar-2.1');
      for (const [u, telo] of Object.entries(soubory)) await c.put(u, new Response(telo, { status: 200 }));
    },
  };
}

type Sit = (url: string, init?: any) => Promise<Response>;

/** Načte skutečný sw.js a vrátí obslužné funkce událostí. */
function nactiSw(sit: Sit, uloziste = atrapaUloziste()) {
  const obsluha: Record<string, (e: any) => void> = {};
  const sandbox: any = {
    self: {
      location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
      registration: { scope: `${ORIGIN}/` },
      addEventListener: (n: string, f: (e: any) => void) => { obsluha[n] = f; },
      clients: { matchAll: async () => [], claim: async () => {} },
      skipWaiting: () => {},
    },
    URL, Response, Request, Headers, Promise, setTimeout, clearTimeout, console, Date,
    caches: uloziste.caches,
    fetch: (u: any, init?: any) => sit(typeof u === 'string' ? new URL(u, `${ORIGIN}/`).href : u.url, init),
    indexedDB: {},
  };
  vm.createContext(sandbox);
  new vm.Script(SW, { filename: 'sw.js' }).runInContext(sandbox);
  return {
    uloziste,
    /** Pošle do service workeru požadavek; vrátí odpověď, kterou by dostal prohlížeč (nebo `null`, když se SW neozval). */
    async pozadavek(url: string, opce: { mode?: string; method?: string } = {}): Promise<Odpoved | null> {
      let vysledek: Promise<Response> | null = null;
      const udalost = {
        request: { url, mode: opce.mode ?? 'navigate', method: opce.method ?? 'GET', headers: new Headers(), destination: 'document' },
        respondWith: (p: Promise<Response>) => { vysledek = Promise.resolve(p); },
        waitUntil: (_p: Promise<unknown>) => {},
      };
      obsluha.fetch(udalost);
      return vysledek;
    },
  };
}

const bezSite: Sit = async () => { throw new TypeError('Failed to fetch'); };

describe('service worker — navigace bez signálu', () => {
  it('bez sítě a bez uložené kopie vrátí českou stránku „Bez připojení“ (ne holé „Offline“)', async () => {
    const sw = nactiSw(bezSite);
    const res = (await sw.pozadavek(`${ORIGIN}/`))!;
    expect(res).not.toBeNull();
    expect(res.status).toBe(503);
    expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).not.toBe('Offline');
    expect(html).toContain('<html lang="cs">');
    expect(html).toContain('<h1>Bez připojení</h1>');
    expect(html).toContain('Zkusit znovu');
    expect(html).toContain('/diagnostika.html');
    expect(html).toContain('/instalace');
  });

  it('stejně i na jiné adrese v aplikaci (např. odkaz z e-mailu) — vždy stránka, nikdy holé slovo', async () => {
    const sw = nactiSw(bezSite);
    for (const u of [`${ORIGIN}/?page=orders`, `${ORIGIN}/instalace`, `${ORIGIN}/sladek/`]) {
      const html = await (await sw.pozadavek(u))!.text();
      expect(html, u).toContain('Bez připojení');
    }
  });

  it('s uloženou kopií aplikace se spustí z ní (stránka „Bez připojení“ se nepoužije)', async () => {
    const uloziste = atrapaUloziste();
    await uloziste.nainstaluj({ './index.html': '<!doctype html><div id="root">APLIKACE</div>' });
    const sw = nactiSw(bezSite, uloziste);
    const res = (await sw.pozadavek(`${ORIGIN}/?page=orders`))!;
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('APLIKACE');
  });

  it('se signálem projde odpověď serveru beze změny (i chyba serveru, ta není „bez připojení“)', async () => {
    const sw = nactiSw(async () => new Response('z-internetu', { status: 200 }));
    const ok = (await sw.pozadavek(`${ORIGIN}/`))!;
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('z-internetu');

    const chyba = nactiSw(async () => new Response('chyba serveru', { status: 500 }));
    const res = (await chyba.pozadavek(`${ORIGIN}/`))!;
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('chyba serveru');
  });

  it('podzdroje (skripty, data) bez signálu dál vrací holé „Offline“ — stránka patří jen navigaci', async () => {
    const sw = nactiSw(bezSite);
    const res = (await sw.pozadavek(`${ORIGIN}/manifest.webmanifest`, { mode: 'cors' }))!;
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('Offline');
  });

  it('stránka není v seznamu předem ukládaných souborů — bylo by v cache smazaná spolu se zbytkem', () => {
    const precache = /const PRECACHE = \[([\s\S]*?)\];/.exec(SW)![1];
    expect(precache).not.toMatch(/offline/i);
  });
});

describe('stránka „Bez připojení“ — chování ve stránce', () => {
  const otevrena: JSDOM[] = [];
  afterEach(() => { while (otevrena.length) otevrena.pop()!.window.close(); });

  async function stranka() {
    return (await (await nactiSw(bezSite).pozadavek(`${ORIGIN}/`))!.text());
  }

  /** Otevře stránku; „znovunačtení“ jsdom nezná a hlásí ho jako nepodporovanou navigaci — to se tu počítá. */
  async function otevri(opce: { html?: string; xhr?: (w: any) => void } = {}) {
    const html = opce.html ?? (await stranka());
    const navigace: string[] = [];
    const konzole = new VirtualConsole();
    konzole.on('jsdomError', (e: any) => { if (/navigation/i.test(String(e && e.message))) navigace.push(String(e.message)); });
    const dom = new JSDOM(html, {
      url: `${ORIGIN}/`, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: konzole,
      beforeParse(w: any) { w.__xhr = []; opce.xhr?.(w); },
    });
    otevrena.push(dom);
    return { w: dom.window as any, navigace };
  }
  const cekej = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const atrapaXhr = (stav: number | 'chyba') => (w: any) => {
    w.XMLHttpRequest = class {
      timeout = 0; status = 0; onload: (() => void) | null = null;
      open(_m: string, u: string) { w.__xhr.push(u); }
      send() {
        w.setTimeout(() => {
          if (stav === 'chyba') return;
          this.status = stav;
          this.onload?.();
        }, 1);
      }
    };
  };

  it('skript stránky je čisté ES5 (musí jít spustit i v nejstarším WebView)', async () => {
    const skript = /<script>([\s\S]*?)<\/script>/.exec(await stranka())![1];
    expect(() => transformSync(skript, { target: 'es5', loader: 'js' })).not.toThrow();
  });

  it('nic nenačítá z cizích serverů a odkazuje jen na vlastní stránky', async () => {
    const html = await stranka();
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(['/diagnostika.html', '/instalace']);
  });

  it('tlačítko „Zkusit znovu“ znovu načte stránku a řekne, že se zkouší připojit', async () => {
    const { w, navigace } = await otevri();
    expect(navigace).toHaveLength(0);
    w.document.getElementById('znovu').click();
    expect(w.document.getElementById('stav').textContent).toBe('Zkouším se připojit…');
    expect(navigace).toHaveLength(1);
  });

  it('když se vrátí připojení (událost „online“), načte se aplikace sama', async () => {
    const { w, navigace } = await otevri();
    w.dispatchEvent(new w.Event('online'));
    expect(navigace).toHaveLength(1);
  });

  describe('ověřování serveru každých 15 s', () => {
    it('interval je 15 s (a test ho pro rychlost zkrátí)', async () => {
      expect(await stranka()).toContain('var PAUZA = 15000;');
    });

    const rychle = async () => (await stranka()).replace('var PAUZA = 15000;', 'var PAUZA = 15;');

    it('ozve-li se server (200), načte se aplikace; ptá se na version.json s čerstvou adresou', async () => {
      const { w, navigace } = await otevri({ html: await rychle(), xhr: atrapaXhr(200) });
      await cekej(80);
      expect(navigace.length).toBeGreaterThan(0);
      expect(w.__xhr.length).toBeGreaterThan(0);
      expect(w.__xhr[0]).toMatch(/^\/version\.json\?t=\d+$/);
      // Každý dotaz má jinou adresu (jinak by ho odpověděla uložená kopie).
      expect(new Set(w.__xhr).size).toBe(w.__xhr.length);
    });

    it('odpoví-li service worker „Offline“ (503), nenačítá se dokola — jen se dál ptá', async () => {
      const { w, navigace } = await otevri({ html: await rychle(), xhr: atrapaXhr(503) });
      await cekej(80);
      expect(w.__xhr.length).toBeGreaterThan(1);
      expect(navigace).toHaveLength(0);
    });

    it('selže-li dotaz úplně (bez signálu), nic se neděje a nic nespadne', async () => {
      const { w, navigace } = await otevri({ html: await rychle(), xhr: atrapaXhr('chyba') });
      await cekej(80);
      expect(w.__xhr.length).toBeGreaterThan(1);
      expect(navigace).toHaveLength(0);
    });

    it('na skryté stránce (telefon zamčený, jiná záložka) se neptá', async () => {
      const { w, navigace } = await otevri({
        html: await rychle(),
        xhr: (win) => { atrapaXhr(200)(win); Object.defineProperty(win.document, 'hidden', { get: () => true, configurable: true }); },
      });
      await cekej(80);
      expect(w.__xhr).toHaveLength(0);
      expect(navigace).toHaveLength(0);
    });
  });
});
