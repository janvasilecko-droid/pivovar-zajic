// @vitest-environment node
// 📱 Diagnostika telefonu (public/diagnostika.html) — verdikt, zpráva a kontrola spojení.
// ---------------------------------------------------------------------------
// Šéfovi nejde aplikace na starším telefonu (25. 11. 2026) a nikdo nevěděl proč. Diagnostika je samostatná
// stránka v ES5 bez knihoven, která na jakémkoli telefonu řekne, co mu chybí. Testuje se dvojím způsobem:
//  • čistá funkce `zhodnot` (verdikt) na vymyšlených údajích o telefonu — hranice verzí, každá nutná funkce zvlášť;
//  • celá stránka v jsdom s atrapami prohlížeče (XMLHttpRequest, fetch, schránka…) — nic nesmí jít na skutečnou
//    síť, proto je atrapa XHR i fetch vždy, i když je test nepřepíše.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transformSync } from 'esbuild';
import { PODLAHA_CHROME, DOPORUCENO_CHROME } from './podlahaProhlizece';
import { ODKAZ_APLIKACE } from './odkazAplikace';

const HTML = readFileSync('public/diagnostika.html', 'utf8');

const UA_STARY = 'Mozilla/5.0 (Linux; Android 7.0; SM-G930F Build/NRD90M; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/58.0.3029.83 Mobile Safari/537.36';
const UA_NOVY = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_STREDNI = 'Mozilla/5.0 (Linux; Android 9; SM-J530F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.136 Mobile Safari/537.36';

type Okno = Window & typeof globalThis & {
  __diagnostika: {
    zhodnot: (i: any) => any;
    sestavZpravu: (i: any, v: any) => string;
    zjisti: () => any;
    PODLAHA_CHROME: number;
    DOPORUCENO_CHROME: number;
  };
  __sit: { xhr: string[]; fetch: { url: string; init?: any }[] };
};

const otevrena: JSDOM[] = [];
afterEach(() => { while (otevrena.length) otevrena.pop()!.window.close(); });

type Opce = {
  ua?: string;
  url?: string;
  /** Prohlížeč má moduly, fetch, IndexedDB, service worker a mezery v řádcích (jako moderní telefon). */
  moderni?: boolean;
  /** Jak odpoví XMLHttpRequest na version.json: `false` = síťová chyba. */
  xhr?: false | { datum?: Date | null; verze?: string; stav?: number };
  /** Zda se podaří spojení s databází (fetch bez CORS). */
  databaze?: boolean;
  predSpustenim?: (w: any) => void;
};

function otevri(opce: Opce = {}): Okno {
  const { ua = UA_NOVY, url = 'https://zajic-pivovar.pages.dev/diagnostika.html', moderni = true, xhr = {}, databaze = true, predSpustenim } = opce;
  const konzole = new VirtualConsole();
  const dom = new JSDOM(HTML, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: konzole,
    beforeParse(w: any) {
      Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
      w.__sit = { xhr: [], fetch: [] };
      // XMLHttpRequest je vždy atrapa — jsdom by jinak opravdu šel na internet.
      w.XMLHttpRequest = class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        ontimeout: (() => void) | null = null;
        timeout = 0;
        status = 200;
        responseText = '';
        private datum: Date | null = null;
        open(_m: string, u: string) { w.__sit.xhr.push(u); }
        getResponseHeader(n: string) { return n.toLowerCase() === 'date' && this.datum ? this.datum.toUTCString() : null; }
        send() {
          // Časovač OKNA: po window.close() se zruší. S časovačem Node by atrapa volala stránku, která už neexistuje.
          w.setTimeout(() => {
            if (xhr === false) { this.onerror?.(); return; }
            this.status = xhr.stav ?? 200;
            this.datum = xhr.datum === undefined ? new Date() : xhr.datum;
            this.responseText = JSON.stringify({ version: xhr.verze ?? '2.9999' });
            this.onload?.();
          }, 2);
        }
      };
      if (moderni) {
        Object.defineProperty(w.HTMLScriptElement.prototype, 'noModule', { value: false, configurable: true });
        w.fetch = (u: string, init?: any) => {
          w.__sit.fetch.push({ url: u, init });
          return databaze ? Promise.resolve({}) : Promise.reject(new TypeError('Failed to fetch'));
        };
        w.indexedDB = {};
        Object.defineProperty(w.navigator, 'serviceWorker', { value: {}, configurable: true });
        // Sloupec ze dvou prázdných prvků s mezerou 1 px je 1 px vysoký — to je celý trik Modernizru.
        Object.defineProperty(w.Element.prototype, 'scrollHeight', {
          get() { return this.style && this.style.rowGap === '1px' ? 1 : 0; },
          configurable: true,
        });
      }
      predSpustenim?.(w);
    },
  });
  otevrena.push(dom);
  return dom.window as unknown as Okno;
}

const cekej = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Počká, až stránka dokončí kontrolu spojení (atribut data-hotovo). */
async function pockejNaHotovo(w: Okno) {
  for (let i = 0; i < 100; i++) {
    if (w.document.documentElement.getAttribute('data-hotovo') === '1') return;
    await cekej(10);
  }
  throw new Error('Diagnostika se nedokončila do 1 s');
}
const text = (w: Okno, id: string) => w.document.getElementById(id)!.textContent!;
const radky = (w: Okno, id: string) => [...w.document.querySelectorAll(`#${id} tr`)].map((tr) => [tr.querySelector('th')!.textContent, tr.querySelector('td')!.textContent, tr.querySelector('td')!.className] as [string, string, string]);
const radek = (w: Okno, id: string, nazev: string | RegExp) => radky(w, id).find(([n]) => (typeof nazev === 'string' ? n === nazev : nazev.test(n!)))!;

/** Údaje o telefonu, které „všechno umí“ — testy z nich ubírají jednu věc po druhé. */
const vseOk = (nad: Record<string, unknown> = {}) => ({
  ua: UA_NOVY, chrome: 130, android: '10', androidSkryty: true, jeWebView: false, jeApk: false, naploche: false,
  pamet: 4, jadra: 8, obrazovka: '360×800 @3', jazyk: 'cs-CZ', pasmo: 'Europe/Prague', sit: '4g', online: true,
  moduly: true, dynamickyImport: true, fetch: true, promise: true, abort: true, ukladani: true, indexedDb: true, serviceWorker: true,
  zaplaty: [] as string[], cssGap: true, cssIs: true, cssMax: true, cssDvh: true, cssAspect: true, cssBlur: true, cssHas: true,
  appOk: true, appMs: 120, appVerze: '2.1043', dbOk: true, dbMs: 200, rozdilMin: 0.1, model: null, androidReal: null, chromePlna: null,
  ...nad,
});

describe('diagnostika — soubor a jeho předpoklady', () => {
  it('čísla podlahy a doporučené verze jsou stejná jako v lib/podlahaProhlizece.ts', () => {
    expect(HTML).toContain(`var PODLAHA_CHROME = ${PODLAHA_CHROME};`);
    expect(HTML).toContain(`var DOPORUCENO_CHROME = ${DOPORUCENO_CHROME};`);
    const w = otevri();
    expect(w.__diagnostika.PODLAHA_CHROME).toBe(PODLAHA_CHROME);
    expect(w.__diagnostika.DOPORUCENO_CHROME).toBe(DOPORUCENO_CHROME);
  });

  it('adresa aplikace a projektu databáze odpovídají zbytku repozitáře', () => {
    const host = (u: string) => new URL(u).origin;
    expect(HTML).toContain(`var APP = '${host(ODKAZ_APLIKACE)}';`);
    const ref = /var DB = 'https:\/\/([a-z0-9]+)\.supabase\.co';/.exec(HTML);
    expect(ref, 'v diagnostice chybí adresa databáze').toBeTruthy();
    // Stejný projekt, do kterého nasazuje deploy.yml (jinak by diagnostika zkoušela cizí/starou databázi).
    expect(readFileSync('.github/workflows/deploy.yml', 'utf8')).toContain(`--project-ref ${ref![1]}`);
  });

  it('skript je čisté ES5 — musí jít rozebrat i tam, kde se aplikace rozebrat nedá', () => {
    const m = /<script>([\s\S]*?)<\/script>/.exec(HTML)!;
    expect(() => transformSync(m[1], { target: 'es5', loader: 'js' })).not.toThrow();
  });

  it('nic nenačítá z cizích serverů (musí jít i bez internetu) a odkazuje jen na známé adresy', () => {
    expect(HTML).not.toMatch(/<script[^>]+src=/i);
    expect(HTML).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(HTML).not.toMatch(/@import|url\(/i);
    const hosty = new Set([...HTML.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
    expect([...hosty].sort()).toEqual(['play.google.com', 'wa.me', 'zajic-pivovar.pages.dev'].concat(/var DB = 'https:\/\/([a-z0-9]+\.supabase\.co)'/.exec(HTML)![1]).sort());
  });

  it('je česky, nezobrazuje se v hledání a má odkazy na aktualizaci WebView, Chromu a Firefoxu', () => {
    expect(HTML).toContain('<html lang="cs">');
    expect(HTML).toContain('<meta name="robots" content="noindex">');
    expect(HTML).toContain('name="viewport"');
    for (const id of ['com.google.android.webview', 'com.android.chrome', 'org.mozilla.firefox']) {
      expect(HTML).toContain(`https://play.google.com/store/apps/details?id=${id}`);
    }
  });
});

describe('diagnostika — verdikt (zhodnot)', () => {
  const z = (nad: Record<string, unknown> = {}) => otevri().__diagnostika.zhodnot(vseOk(nad));

  it('moderní telefon se vším v pořádku: „v pořádku“, bez kroků', () => {
    const v = z();
    expect(v.uroven).toBe('ok');
    expect(v.nadpis).toBe('Telefon je v pořádku');
    expect(v.kroky).toEqual([]);
    expect(v.tvrde).toEqual([]);
    expect(v.mekke).toEqual([]);
  });

  const tvrde: [string, Record<string, unknown>, string][] = [
    ['moduly', { moduly: false }, 'moduly JavaScriptu'],
    ['dynamický import', { dynamickyImport: false }, 'dynamický import'],
    ['fetch', { fetch: false }, 'fetch'],
    ['Promise', { promise: false }, 'Promise'],
    ['AbortController', { abort: false }, 'AbortController'],
    ['ukládání dat', { ukladani: false }, 'ukládat data'],
  ];
  for (const [nazev, nad, slovo] of tvrde) {
    it(`bez funkce „${nazev}“ se aplikace nespustí (chyba) a řekne se proč`, () => {
      const v = z(nad);
      expect(v.uroven).toBe('chyba');
      expect(v.nadpis).toBe('Aplikace se na tomhle telefonu nespustí');
      expect(v.tvrde).toHaveLength(1);
      expect(v.tvrde[0]).toContain(slovo);
      expect(v.text).toContain(slovo);
    });
  }

  it('hranice podlahy: Chrome 65 se nespustí, Chrome 66 ano (ale s varováním, je starý)', () => {
    expect(z({ chrome: PODLAHA_CHROME - 1 }).uroven).toBe('chyba');
    expect(z({ chrome: PODLAHA_CHROME - 1 }).tvrde[0]).toContain(`Chrome ${PODLAHA_CHROME - 1}`);
    const v = z({ chrome: PODLAHA_CHROME });
    expect(v.uroven).toBe('varovani');
    expect(v.tvrde).toEqual([]);
    expect(v.mekke[0]).toContain(`Chrome ${PODLAHA_CHROME}`);
  });

  it('hranice doporučené verze: Chrome 89 varuje, Chrome 90 je v pořádku', () => {
    expect(z({ chrome: DOPORUCENO_CHROME - 1 }).uroven).toBe('varovani');
    // Starší, ale funkční prohlížeč: aktualizovat, a když to nejde, zkusit jiný (ne jen u chyby).
    expect(z({ chrome: DOPORUCENO_CHROME - 1 }).kroky).toEqual(['aktualizovat', 'jinyProhlizec']);
    expect(z({ chrome: DOPORUCENO_CHROME }).uroven).toBe('ok');
    expect(z({ chrome: DOPORUCENO_CHROME }).kroky).toEqual([]);
  });

  it('prohlížeč, který není Chromium (verze neznámá), se podle verze nesoudí — jen podle funkcí', () => {
    const v = z({ chrome: null });
    expect(v.uroven).toBe('ok');
    expect(z({ chrome: null, cssGap: false }).uroven).toBe('varovani');
  });

  it('chybějící vzhledové funkce jsou varování, ne chyba; gap a :is() radí aktualizovat, max() jen varuje', () => {
    const gap = z({ cssGap: false });
    expect(gap.uroven).toBe('varovani');
    expect(gap.mekke[0]).toContain('gap');
    expect(gap.kroky).toContain('aktualizovat');
    const jeIs = z({ cssIs: false });
    expect(jeIs.mekke[0]).toContain(':is()');
    expect(jeIs.kroky).toContain('aktualizovat');
    const max = z({ cssMax: false });
    expect(max.uroven).toBe('varovani');
    expect(max.mekke[0]).toContain('max()');
    expect(max.kroky).not.toContain('aktualizovat');
  });

  it('funkce, které si aplikace doplní, se vypíší jménem a jsou jen varování', () => {
    const v = z({ zaplaty: ['crypto.randomUUID', 'Array.flat'] });
    expect(v.uroven).toBe('varovani');
    expect(v.mekke[0]).toContain('crypto.randomUUID, Array.flat');
    expect(v.mekke[0]).toContain('doplní sama');
  });

  it('spojení: aplikace nebo databáze nedostupná → varování a krok „zkontroluj internet“', () => {
    const a = z({ appOk: false });
    expect(a.uroven).toBe('varovani');
    expect(a.mekke[0]).toContain('s aplikací');
    expect(a.kroky).toEqual(['spojeni']);
    const d = z({ dbOk: false });
    expect(d.mekke[0]).toContain('s databází');
    expect(d.kroky).toEqual(['spojeni']);
    expect(z({ appOk: null, dbOk: null }).uroven).toBe('ok'); // dosud nezjištěno ≠ nejde
  });

  it('hodiny: odchylka do 5 minut nevadí, víc je varování a krok „nastav datum a čas“', () => {
    expect(z({ rozdilMin: 5 }).uroven).toBe('ok');
    expect(z({ rozdilMin: -5 }).uroven).toBe('ok');
    const napred = z({ rozdilMin: 5.01 });
    expect(napred.uroven).toBe('varovani');
    expect(napred.mekke[0]).toBe('hodiny v telefonu jdou o 5 min napřed');
    expect(napred.kroky).toEqual(['hodiny']);
    const pozadu = z({ rozdilMin: -120.4 });
    expect(pozadu.mekke[0]).toBe('hodiny v telefonu jdou o 120 min pozadu');
    expect(z({ rozdilMin: null }).uroven).toBe('ok');
  });

  it('Android 6 a starší dostane radu, že APK nenainstaluje; Android 7 a skrytá verze ne', () => {
    expect(z({ android: '6.0.1', androidSkryty: false, chrome: 50 }).kroky).toContain('android6');
    expect(z({ android: '7.0', androidSkryty: false, chrome: 58 }).kroky).not.toContain('android6');
    expect(z({ android: '10', androidSkryty: true, androidReal: null }).kroky).not.toContain('android6');
    // Skutečná verze z userAgentData má přednost před zamlženou z řetězce prohlížeče.
    expect(z({ android: '10', androidSkryty: true, androidReal: '6.0.1' }).kroky).toContain('android6');
    expect(z({ android: '5.1', androidSkryty: false, androidReal: '9.0.0' }).kroky).not.toContain('android6');
  });

  it('chyba má přednost před varováním a kroky se neopakují ani nemíchají', () => {
    const v = z({ moduly: false, cssGap: false, appOk: false, chrome: 58, android: '7.0', androidSkryty: false });
    expect(v.uroven).toBe('chyba');
    expect(v.tvrde.length).toBeGreaterThanOrEqual(2);
    expect(v.mekke.length).toBeGreaterThanOrEqual(2);
    expect(v.kroky).toEqual(['aktualizovat', 'spojeni', 'jinyProhlizec']);
  });
});

describe('diagnostika — zpráva pro správce (sestavZpravu)', () => {
  const w = () => otevri();
  it('obsahuje všechny důležité údaje a řetězec prohlížeče', () => {
    const win = w();
    const info = vseOk({ ua: UA_STREDNI, chrome: 74, android: '9', androidSkryty: false, jeWebView: true, jeApk: true, model: 'SM-J530F', chromePlna: '74.0.3729.136', rozdilMin: 7.04, zaplaty: ['crypto.randomUUID'] });
    const z = win.__diagnostika.sestavZpravu(info, win.__diagnostika.zhodnot(info));
    expect(z.split('\n')[0]).toBe('Diagnostika telefonu — Pivovar Zajíc');
    for (const radek of [
      'Výsledek: VAROVÁNÍ',
      'Android: 9 · SM-J530F',
      'Prohlížeč: Chrome 74.0.3729.136 (WebView)',
      'Spuštěno jako: aplikace APK',
      'Verze aplikace na serveru: 2.1043',
      'Paměť: 4 GB · jádra: 8 · obrazovka: 360×800 @3',
      'Jazyk: cs-CZ · pásmo: Europe/Prague · síť: 4g',
      'Hodiny proti serveru: +7 min',
      'Spojení: aplikace ok (120 ms) · databáze ok (200 ms)',
      'Nutné funkce: moduly ano, import ano, fetch ano, AbortController ano, ukládání ano, IndexedDB ano, service worker ano',
      'Vzhled: gap ano, :is() ano, max() ano, dvh ano, aspect-ratio ano, blur ano, :has() ano',
      'Doplní aplikace: crypto.randomUUID',
      `UA: ${UA_STREDNI}`,
    ]) expect(z, radek).toContain(radek);
  });

  it('chyby a nedostupné věci jsou ve zprávě velkými písmeny, aby je správce hned uviděl', () => {
    const win = w();
    const info = vseOk({ moduly: false, fetch: false, appOk: false, dbOk: false, online: false, cssGap: false });
    const z = win.__diagnostika.sestavZpravu(info, win.__diagnostika.zhodnot(info));
    expect(z).toContain('Výsledek: CHYBA — aplikace se nespustí');
    expect(z).toContain('moduly NE');
    expect(z).toContain('fetch NE');
    expect(z).toContain('aplikace NEJDE');
    expect(z).toContain('databáze NEJDE');
    expect(z).toContain('(OFFLINE)');
    expect(z).toContain('gap NE');
    expect(z).toMatch(/Problémy: .*moduly JavaScriptu/);
    expect(z).toMatch(/Upozornění: .*gap/);
  });

  it('zpráva v pořádku nemá řádky Problémy ani Upozornění ani Doplní aplikace', () => {
    const win = w();
    const info = vseOk();
    const z = win.__diagnostika.sestavZpravu(info, win.__diagnostika.zhodnot(info));
    expect(z).toContain('Výsledek: v pořádku');
    expect(z).not.toMatch(/Problémy:|Upozornění:|Doplní aplikace:/);
  });

  it('neznámé hodnoty se píšou jako otazník, ne jako undefined ani null', () => {
    const win = w();
    const info = vseOk({ android: null, androidSkryty: false, chrome: null, pamet: null, jadra: null, obrazovka: '', jazyk: '', pasmo: '', sit: '', appOk: null, dbOk: null, rozdilMin: null, appVerze: null });
    const z = win.__diagnostika.sestavZpravu(info, win.__diagnostika.zhodnot(info));
    expect(z).not.toMatch(/undefined|null|NaN/);
    expect(z).toContain('Android: neznámý');
    expect(z).toContain('Prohlížeč: neznámý');
    expect(z).toContain('Paměť: ? · jádra: ? · obrazovka: ?');
    expect(z).toContain('Hodiny proti serveru: nezjištěno');
    expect(z).toContain('Spojení: aplikace ? · databáze ?');
    expect(z).not.toContain('Verze aplikace na serveru');
  });
});

describe('diagnostika — celá stránka s atrapami prohlížeče', () => {
  it('moderní telefon: verdikt v pořádku, tabulky vyplněné a zpráva připravená ke kopírování', async () => {
    const w = otevri({ ua: UA_NOVY });
    await pockejNaHotovo(w);
    const box = w.document.getElementById('verdikt')!;
    // V jsdom nejde změřit výrobní schopnosti CSS (max(), dvh, aspect-ratio), takže „v pořádku“ tu nevyjde — verdikt ale
    // nesmí být chyba a stránka musí být kompletní.
    expect(box.className).not.toBe('chyba');
    expect(box.querySelector('h2')).toBeTruthy();
    expect(radky(w, 'telefon').map((r) => r[0])).toEqual([
      'Android', 'Prohlížeč', 'Spuštěno jako', 'Paměť', 'Jádra procesoru', 'Obrazovka', 'Jazyk · časové pásmo', 'Hodiny telefonu',
    ]);
    expect(radky(w, 'funkce')).toHaveLength(15);
    expect(radky(w, 'spojeni').map((r) => r[0])).toEqual(['Aplikace (zajic-pivovar.pages.dev)', 'Databáze', 'Hodiny telefonu proti serveru', 'Verze aplikace na serveru']);
    expect(radek(w, 'telefon', 'Android')[1]).toBe('skryto prohlížečem');
    expect(radek(w, 'telefon', 'Prohlížeč')[1]).toBe('Chrome 130');
    expect(radek(w, 'telefon', 'Prohlížeč')[2]).toBe('ano');
    expect(radek(w, 'funkce', 'Moduly JavaScriptu (nutné)')).toEqual(['Moduly JavaScriptu (nutné)', 'ano', 'ano']);
    expect(radek(w, 'funkce', 'Mezery v řádcích (gap)')[1]).toBe('ano');
    const zprava = (w.document.getElementById('zprava') as HTMLTextAreaElement).value;
    expect(zprava).toContain('Diagnostika telefonu — Pivovar Zajíc');
    expect(zprava).toContain(`UA: ${UA_NOVY}`);
  });

  it('starý prohlížeč bez modulů a bez fetch: červený verdikt, s důvodem a kroky', async () => {
    const w = otevri({ ua: UA_STARY, moderni: false });
    await pockejNaHotovo(w);
    const box = w.document.getElementById('verdikt')!;
    expect(box.className).toBe('chyba');
    expect(box.textContent).toContain('Aplikace se na tomhle telefonu nespustí');
    expect(box.textContent).toContain('Chrome 58 je starší než nejnižší podporovaná verze 66');
    expect([...box.querySelectorAll('li')].map((li) => li.textContent)).toEqual(expect.arrayContaining([
      expect.stringContaining('Android System WebView'),
      expect.stringContaining('Firefox'),
    ]));
    expect(radek(w, 'telefon', 'Android')[1]).toBe('7.0');
    expect(radek(w, 'telefon', 'Prohlížeč')).toEqual(['Prohlížeč', 'Chrome 58 (WebView)', 'ne']);
    expect(radek(w, 'funkce', 'Moduly JavaScriptu (nutné)')).toEqual(['Moduly JavaScriptu (nutné)', 'NE', 'ne']);
    expect(radek(w, 'funkce', 'Mezery v řádcích (gap)')[1]).toBe('ne — vzhled se může lišit');
    expect(radek(w, 'funkce', 'Mezery v řádcích (gap)')[2]).toBe('pozor');
    expect(radek(w, 'funkce', 'Novější funkce JavaScriptu')).toEqual(['Novější funkce JavaScriptu', 'všechny jsou', 'ano']);
  });

  it('prohlížeč bez fetch: databáze zůstane „nezjištěno“, ne věčné „zjišťuju…“ ani „NEJDE“', async () => {
    const w = otevri({ moderni: false });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Databáze')).toEqual(['Databáze', 'nezjištěno', '']);
    expect(w.document.getElementById('verdikt')!.textContent).not.toContain('nejde se spojit s databází');
  });

  it('dokud kontrola spojení běží, řádky ukazují „zjišťuju…“ a stránka ještě není hotová', async () => {
    const w = otevri({
      predSpustenim: (win) => { win.fetch = () => new Promise(() => {}); },
    });
    await cekej(40);
    expect(w.document.documentElement.getAttribute('data-hotovo')).toBeNull();
    expect(radek(w, 'spojeni', 'Databáze')[1]).toBe('zjišťuju…');
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')[1]).toMatch(/^v pořádku/); // XHR už doběhla
  });

  it('chybějící novější funkce se ve výpisu spočítají a označí jako „doplní aplikace“', async () => {
    const w = otevri({
      predSpustenim: (win) => {
        for (const [o, j] of [['Array.prototype', 'flat'], ['Object', 'fromEntries'], ['crypto', 'randomUUID']] as const) {
          const cil = o.split('.').reduce((x: any, k) => x[k], win);
          delete cil[j];
          if (typeof cil[j] === 'function') Object.defineProperty(cil, j, { value: undefined, configurable: true, writable: true });
        }
      },
    });
    await pockejNaHotovo(w);
    expect(radek(w, 'funkce', 'Novější funkce JavaScriptu')).toEqual(['Novější funkce JavaScriptu', 'chybí 3 — aplikace si je doplní', 'pozor']);
    expect(text(w, 'verdikt')).toContain('crypto.randomUUID');
  });

  it('střední telefon (Chrome 74) je žlutý a doporučí aktualizaci', async () => {
    const w = otevri({ ua: UA_STREDNI });
    await pockejNaHotovo(w);
    expect(w.document.getElementById('verdikt')!.className).toBe('varovani');
    expect(radek(w, 'telefon', 'Prohlížeč')[2]).toBe('pozor');
    expect(radek(w, 'telefon', 'Android')[1]).toBe('9');
  });

  it('spojení: verze aplikace ze serveru, hodiny proti serveru a dosažitelnost databáze', async () => {
    const w = otevri({ xhr: { datum: new Date(Date.now() - 7 * 60000), verze: '2.1050' }, databaze: true });
    await pockejNaHotovo(w);
    expect(w.__sit.xhr).toHaveLength(1);
    expect(w.__sit.xhr[0]).toMatch(/^\/version\.json\?_=\d+$/);
    expect(radek(w, 'spojeni', 'Verze aplikace na serveru')[1]).toBe('2.1050');
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')[1]).toMatch(/^v pořádku \(\d+ ms\)$/);
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')[2]).toBe('ano');
    expect(radek(w, 'spojeni', 'Databáze')[2]).toBe('ano');
    const hodiny = radek(w, 'spojeni', 'Hodiny telefonu proti serveru');
    expect(hodiny[1]).toMatch(/^\+7 min — špatně$/);
    expect(hodiny[2]).toBe('ne');
    expect(w.document.getElementById('verdikt')!.textContent).toContain('hodiny v telefonu jdou o 7 min napřed');
    expect(w.document.getElementById('verdikt')!.textContent).toContain('Nastav v telefonu automatické datum a čas');
    // databáze se zkouší bez CORS (jen dosažitelnost) a bez mezipaměti
    expect(w.__sit.fetch).toHaveLength(1);
    expect(w.__sit.fetch[0].url).toMatch(/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/$/);
    expect(w.__sit.fetch[0].init).toEqual({ mode: 'no-cors', cache: 'no-store' });
  });

  it('hodiny jdou správně → ve spojení „+0 min“ bez poznámky „špatně“', async () => {
    const w = otevri({ xhr: { datum: new Date() } });
    await pockejNaHotovo(w);
    const hodiny = radek(w, 'spojeni', 'Hodiny telefonu proti serveru');
    expect(hodiny[1]).toMatch(/^[+-]?0(\.\d)? min$/);
    expect(hodiny[2]).toBe('ano');
  });

  it('server bez hlavičky Date: hodiny se nezjistí a nic se nevymýšlí', async () => {
    const w = otevri({ xhr: { datum: null } });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Hodiny telefonu proti serveru')[1]).toBe('nezjištěno');
    expect((w.document.getElementById('zprava') as HTMLTextAreaElement).value).toContain('Hodiny proti serveru: nezjištěno');
  });

  it('aplikace nedostupná (síťová chyba): červený řádek ve spojení a varování', async () => {
    const w = otevri({ xhr: false });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')).toEqual(['Aplikace (zajic-pivovar.pages.dev)', 'NEJDE — zkontroluj internet', 'ne']);
    expect(w.document.getElementById('verdikt')!.textContent).toContain('nejde se spojit s aplikací');
  });

  it('server odpoví chybou (404/500) → aplikace se bere jako nedostupná', async () => {
    const w = otevri({ xhr: { stav: 503 } });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')[2]).toBe('ne');
  });

  it('databáze nedostupná (třeba špatný certifikát na starém Androidu): řádek „NEJDE“ a rada o datu telefonu', async () => {
    const w = otevri({ databaze: false });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Databáze')).toEqual(['Databáze', 'NEJDE — zkontroluj internet a datum telefonu', 'ne']);
    expect(w.document.getElementById('verdikt')!.textContent).toContain('nejde se spojit s databází');
  });

  it('v APK (stránka z adresy localhost) se živá aplikace jen zkouší dosáhnout, bez XMLHttpRequestu', async () => {
    const w = otevri({ url: 'https://localhost/diagnostika.html', predSpustenim: (win) => { win.Capacitor = { isNativePlatform: () => true }; } });
    await pockejNaHotovo(w);
    expect(w.__sit.xhr).toEqual([]);
    expect(w.__sit.fetch.map((f) => f.url)).toEqual([
      expect.stringMatching(/^https:\/\/zajic-pivovar\.pages\.dev\/version\.json\?_=\d+$/),
      expect.stringMatching(/^https:\/\/[a-z0-9]+\.supabase\.co\/rest\/v1\/$/),
    ]);
    expect(radek(w, 'telefon', 'Spuštěno jako')[1]).toBe('aplikace APK');
    expect(radek(w, 'spojeni', 'Hodiny telefonu proti serveru')[1]).toBe('nezjištěno');
  });

  it('v APK při nedostupné živé aplikaci ukáže „NEJDE“', async () => {
    const w = otevri({
      url: 'https://localhost/diagnostika.html',
      predSpustenim: (win) => { win.fetch = () => Promise.reject(new TypeError('Failed to fetch')); },
    });
    await pockejNaHotovo(w);
    expect(radek(w, 'spojeni', 'Aplikace (zajic-pivovar.pages.dev)')[2]).toBe('ne');
  });

  it('rozpozná spuštění jako aplikaci z plochy (PWA)', async () => {
    const w = otevri({ predSpustenim: (win) => { win.matchMedia = (q: string) => ({ matches: q === '(display-mode: standalone)' }); } });
    await pockejNaHotovo(w);
    expect(radek(w, 'telefon', 'Spuštěno jako')[1]).toBe('aplikace z plochy (PWA)');
  });

  it('prohlížeč, který skrývá model a verzi Androidu, je na požádání prozradí (userAgentData)', async () => {
    const w = otevri({
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'userAgentData', {
          value: { getHighEntropyValues: (k: string[]) => { win.__vyzadano = k; return Promise.resolve({ platformVersion: '8.1.0', model: 'Moto G6', uaFullVersion: '138.0.7204.179' }); } },
          configurable: true,
        });
      },
    });
    await pockejNaHotovo(w);
    expect((w as any).__vyzadano).toEqual(['platformVersion', 'model', 'uaFullVersion']);
    expect(radek(w, 'telefon', 'Android')[1]).toBe('8.1.0 · Moto G6');
    expect(radek(w, 'telefon', 'Prohlížeč')[1]).toBe('Chrome 138.0.7204.179');
    expect((w.document.getElementById('zprava') as HTMLTextAreaElement).value).toContain('Android: 8.1.0 · Moto G6');
  });

  it('když userAgentData selže, stránka se přesto dokončí', async () => {
    const w = otevri({
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'userAgentData', {
          value: { getHighEntropyValues: () => Promise.reject(new Error('zakázáno')) }, configurable: true,
        });
      },
    });
    await pockejNaHotovo(w);
    expect(radek(w, 'telefon', 'Android')[1]).toBe('skryto prohlížečem');
  });

  it('WhatsApp odkaz nese celou zprávu zakódovanou a po dokončení kontroly se obnoví', async () => {
    const w = otevri({ xhr: { verze: '2.7777' } });
    await pockejNaHotovo(w);
    const zprava = (w.document.getElementById('zprava') as HTMLTextAreaElement).value;
    const href = w.document.getElementById('whatsapp')!.getAttribute('href')!;
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(href.slice('https://wa.me/?text='.length))).toBe(zprava);
    // Zakódované: bez mezer a zalomení řádků, které by odkaz rozbily.
    expect(href).not.toMatch(/[ \n]/);
    expect(href).toContain('%0A');
    expect(zprava).toContain('Verze aplikace na serveru: 2.7777');
  });

  it('odkaz „Otevřít aplikaci“ vede na kořen', () => {
    const w = otevri();
    const a = [...w.document.querySelectorAll('a.tl')].find((x) => x.textContent === 'Otevřít aplikaci')!;
    expect(a.getAttribute('href')).toBe('/');
  });

  it('žádná hodnota od prohlížeče se nevkládá jako HTML (jen jako text) — ani model a verze z userAgentData', async () => {
    const zly = '<img src=x onerror=window.__xss=1>';
    const w = otevri({
      ua: `Mozilla/5.0 (Linux; Android 7.0; ${zly}) Chrome/58.0.1 Mobile Safari/537.36`,
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'userAgentData', {
          value: { getHighEntropyValues: () => Promise.resolve({ platformVersion: zly, model: zly, uaFullVersion: zly }) },
          configurable: true,
        });
      },
    });
    await pockejNaHotovo(w);
    // Skutečně se zobrazilo (jako text), takže test nic nepřeskočil:
    expect(radek(w, 'telefon', 'Android')[1]).toBe(`${zly} · ${zly}`);
    expect(w.document.querySelectorAll('img').length).toBe(0);
    expect((w as any).__xss).toBeUndefined();
  });
});

describe('diagnostika — kopírování zprávy', () => {
  const hlaska = (w: Okno) => w.document.getElementById('stav-kopie')!.textContent!;

  it('přes schránku prohlížeče: zkopíruje celou zprávu a potvrdí', async () => {
    const zkopirovano: string[] = [];
    const w = otevri({
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: (t: string) => { zkopirovano.push(t); return Promise.resolve(); } }, configurable: true });
      },
    });
    await pockejNaHotovo(w);
    (w.document.getElementById('kopirovat') as HTMLButtonElement).click();
    await cekej(10);
    expect(zkopirovano).toEqual([(w.document.getElementById('zprava') as HTMLTextAreaElement).value]);
    expect(hlaska(w)).toContain('Zpráva je zkopírovaná');
  });

  it('když schránka odmítne, zkusí starý způsob (označit a kopírovat) a pak textovému poli vrátí „jen ke čtení“', async () => {
    const w = otevri({
      predSpustenim: (win) => {
        Object.defineProperty(win.navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('zakázáno')) }, configurable: true });
        win.document.execCommand = (p: string) => { (win as any).__prikaz = p; return true; };
      },
    });
    await pockejNaHotovo(w);
    (w.document.getElementById('kopirovat') as HTMLButtonElement).click();
    await cekej(20);
    expect((w as any).__prikaz).toBe('copy');
    expect(hlaska(w)).toContain('Zpráva je zkopírovaná');
    expect(w.document.getElementById('zprava')!.hasAttribute('readonly')).toBe(true);
  });

  it('bez schránky použije starý způsob rovnou', async () => {
    const w = otevri({ predSpustenim: (win) => { win.document.execCommand = () => true; } });
    await pockejNaHotovo(w);
    (w.document.getElementById('kopirovat') as HTMLButtonElement).click();
    await cekej(10);
    expect(hlaska(w)).toContain('Zpráva je zkopírovaná');
  });

  it('když nejde nic, řekne, jak zprávu zkopírovat ručně', async () => {
    const w = otevri({ predSpustenim: (win) => { win.document.execCommand = () => false; } });
    await pockejNaHotovo(w);
    (w.document.getElementById('kopirovat') as HTMLButtonElement).click();
    await cekej(10);
    expect(hlaska(w)).toContain('Zkopírování se nepovedlo');
    expect(hlaska(w)).toContain('Vybrat vše');
    expect(w.document.getElementById('zprava')!.hasAttribute('readonly')).toBe(true);
  });

  it('i když prohlížeč při kopírování hodí výjimku, stránka zůstane funkční a poradí ručně', async () => {
    const w = otevri({ predSpustenim: (win) => { win.document.execCommand = () => { throw new Error('nelze'); }; } });
    await pockejNaHotovo(w);
    (w.document.getElementById('kopirovat') as HTMLButtonElement).click();
    await cekej(10);
    expect(hlaska(w)).toContain('Zkopírování se nepovedlo');
  });
});

describe('diagnostika — sondy prohlížeče', () => {
  it('mezery v řádcích (flex gap): rozpozná podle výšky sloupce s mezerou 1 px', async () => {
    const ano = otevri();
    expect(ano.__diagnostika.zjisti().cssGap).toBe(true);
    // Sloupec se mezerou 1 px nemá výšku 1 px (prohlížeč `gap` v řádku neumí) → nepodporováno.
    const ne = otevri({ predSpustenim: (win) => { Object.defineProperty(win.Element.prototype, 'scrollHeight', { get: () => 0, configurable: true }); } });
    expect(ne.__diagnostika.zjisti().cssGap).toBe(false);
    // Výška 2 px (mezera se přičetla, ale i prázdné prvky něco zabraly) taky není „1 px“ → nepodporováno.
    const dva = otevri({ predSpustenim: (win) => { Object.defineProperty(win.Element.prototype, 'scrollHeight', { get: () => 2, configurable: true }); } });
    expect(dva.__diagnostika.zjisti().cssGap).toBe(false);
    expect(otevri({ moderni: false }).__diagnostika.zjisti().cssGap).toBe(false);
    // Zkušební prvek se vždy uklidí.
    expect(ano.document.body.querySelectorAll('[style*="flex"]').length).toBe(0);
  });

  it('selektor :is() a :has(): pozná, že je prohlížeč zahodí (insertRule hodí chybu)', () => {
    const w = otevri({
      predSpustenim: (win) => {
        const puvodni = win.CSSStyleSheet.prototype.insertRule;
        win.CSSStyleSheet.prototype.insertRule = function (pravidlo: string, i?: number) {
          if (/^:(is|has)\(/.test(pravidlo)) throw new win.DOMException('neznámý selektor', 'SyntaxError');
          return puvodni.call(this, pravidlo, i);
        };
      },
    });
    const i = w.__diagnostika.zjisti();
    expect(i.cssIs).toBe(false);
    expect(i.cssHas).toBe(false);
    // dočasný <style> se vždy uklidí
    expect(w.document.querySelectorAll('style').length).toBe(1);
  });

  it('moduly pozná podle vlastnosti noModule a dynamický import podle toho, že se přeloží', () => {
    expect(otevri().__diagnostika.zjisti()).toMatchObject({ moduly: true, dynamickyImport: true });
    expect(otevri({ moderni: false }).__diagnostika.zjisti().moduly).toBe(false);
  });

  it('ukládání: když localStorage zakáže zápis (soukromý režim), je to chyba', () => {
    const w = otevri({
      predSpustenim: (win) => {
        Object.defineProperty(win, 'localStorage', { get: () => { throw new win.DOMException('zakázáno', 'SecurityError'); }, configurable: true });
      },
    });
    expect(w.__diagnostika.zjisti().ukladani).toBe(false);
    expect(w.__diagnostika.zhodnot(vseOk({ ukladani: false })).uroven).toBe('chyba');
  });

  it('dopočítá, které novější funkce prohlížeči chybí (a jsou v index.html doplněny)', () => {
    const bezZaplat = otevri({
      predSpustenim: (win) => {
        for (const [o, j] of [['Array.prototype', 'flat'], ['Object', 'fromEntries'], ['crypto', 'randomUUID']] as const) {
          const cil = o.split('.').reduce((x: any, k) => x[k], win);
          delete cil[j];
          if (typeof cil[j] === 'function') Object.defineProperty(cil, j, { value: undefined, configurable: true, writable: true });
        }
      },
    });
    expect(bezZaplat.__diagnostika.zjisti().zaplaty).toEqual(expect.arrayContaining(['crypto.randomUUID', 'Object.fromEntries', 'Array.flat']));
    expect(otevri().__diagnostika.zjisti().zaplaty).toEqual(expect.not.arrayContaining(['Array.flat']));
  });

  it('APK: pozná Capacitor podle isNativePlatform i podle getPlatform', () => {
    expect(otevri({ predSpustenim: (w) => { w.Capacitor = { isNativePlatform: () => true }; } }).__diagnostika.zjisti().jeApk).toBe(true);
    expect(otevri({ predSpustenim: (w) => { w.Capacitor = { getPlatform: () => 'android' }; } }).__diagnostika.zjisti().jeApk).toBe(true);
    expect(otevri({ predSpustenim: (w) => { w.Capacitor = { getPlatform: () => 'web', isNativePlatform: () => false }; } }).__diagnostika.zjisti().jeApk).toBe(false);
    expect(otevri().__diagnostika.zjisti().jeApk).toBe(false);
  });

  it('WebView pozná podle značky „; wv)“, Chrome ne', () => {
    expect(otevri({ ua: UA_STARY }).__diagnostika.zjisti().jeWebView).toBe(true);
    expect(otevri({ ua: UA_NOVY }).__diagnostika.zjisti().jeWebView).toBe(false);
  });

  it('zamlžená verze Androidu (Chrome 110+ píše vždy „Android 10; K“) se pozná, starší Chrome ne', () => {
    expect(otevri({ ua: UA_NOVY }).__diagnostika.zjisti().androidSkryty).toBe(true);
    expect(otevri({ ua: UA_STREDNI }).__diagnostika.zjisti().androidSkryty).toBe(false);
    const stary10 = 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Mobile Safari/537.36';
    expect(otevri({ ua: stary10 }).__diagnostika.zjisti().androidSkryty).toBe(false);
  });
});
