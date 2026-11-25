// @vitest-environment node
// 📲 Stránka Instalace (public/instalace.html) a krátký odkaz /apk (public/_redirects).
// ---------------------------------------------------------------------------
// Šéfovi na starším Androidu šla aplikace z odkazu v e-mailu v prohlížeči, ale po „Přidat na plochu“ se z ikony
// nespustila (25. 11. 2026). Ikona z prohlížeče je na starých telefonech křehká, skutečná aplikace (APK) s vlastní
// ikonou na ní nezávisí. Stránka Instalace pozná telefon a ukáže JEDEN postup, který na něm funguje; /apk je
// krátký odkaz na nejnovější APK, který jde nadiktovat do telefonu.
//
// Testuje se dvojím způsobem:
//  • soubory: ES5, žádné cizí servery, pravidlo /apk je PŘED obecným pravidlem a míří na soubor, který skutečně
//    vystavuje deploy.yml;
//  • celá stránka v jsdom s různými telefony (řetězec prohlížeče, instalovaná aplikace, schránka…) — co se ukáže
//    jako první a co jako „jiné postupy“.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import { transformSync } from 'esbuild';
import { PODLAHA_CHROME } from './podlahaProhlizece';
import { ODKAZ_APLIKACE } from './odkazAplikace';

const HTML = readFileSync('public/instalace.html', 'utf8');
const REDIRECTS = readFileSync('public/_redirects', 'utf8');
const DEPLOY = readFileSync('.github/workflows/deploy.yml', 'utf8');
const README = readFileSync('README.md', 'utf8');

/** Stálý odkaz na nejnovější APK — stejný, jaký vystavuje deploy.yml a uvádí README. */
const URL_APK = 'https://github.com/janvasilecko-droid/pivovar-zajic/releases/latest/download/pivovar-zajic.apk';

const UA = {
  android8: 'Mozilla/5.0 (Linux; Android 8.1.0; SM-J530F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.136 Mobile Safari/537.36',
  android7: 'Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.158 Mobile Safari/537.36',
  android6: 'Mozilla/5.0 (Linux; Android 6.0.1; SM-G920F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.83 Mobile Safari/537.36',
  android6Chrome66: 'Mozilla/5.0 (Linux; Android 6.0.1; SM-G920F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.158 Mobile Safari/537.36',
  android10Zamlzeny: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 12; Mobile; rv:109.0) Gecko/109.0 Firefox/115.0',
  androidWebView: 'Mozilla/5.0 (Linux; Android 9; SM-J530F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 11; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/390.0.0.0.0;]',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  iphoneMessenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]',
  // Prohlížeč uvnitř aplikace, která se nepřiznává (e-mail, Telegram…): jen „Mobile/…“, bez „Safari/“ a bez značky aplikace.
  iphoneNeznamaAplikace: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadJakoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windows7: 'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  nezname: 'Mozilla/5.0 (compatible; NeznamyProhlizec/1.0)',
};

type Info = Record<string, any>;
type Okno = Window & typeof globalThis & {
  __instalace: {
    zvolCestu: (i: Info) => { hlavni: string; jak?: string };
    zjisti: () => Info;
    popisTelefonu: (i: Info) => string;
    androidVerze: (i: Info) => number | null;
  };
  __chyby: string[];
};

const otevrena: JSDOM[] = [];
afterEach(() => { while (otevrena.length) otevrena.pop()!.window.close(); });

type Opce = {
  ua?: string;
  url?: string;
  /** Spuštěno jako aplikace (Capacitor / APK). */
  apk?: boolean;
  /** Libovolný objekt `window.Capacitor` (v prohlížeči existuje i bez APK — vytvoří ho import @capacitor/core). */
  capacitor?: unknown;
  /** Spuštěno z ikony na ploše (display-mode: standalone). */
  naploche?: boolean;
  /** iOS: navigator.standalone. */
  iosNaploche?: boolean;
  /** Dotykové body (iPad se tváří jako Mac, ale má víc než 1). */
  dotyk?: number;
  /** Odpověď userAgentData.getHighEntropyValues; `false` = odmítne. */
  platformVersion?: string | false;
  /** Schránka: `false` = není, jinak jak se zachová writeText. */
  schranka?: false | 'ok' | 'chyba';
  /** Výsledek document.execCommand('copy'); `undefined` = metoda neexistuje (jako v jsdom). */
  execCommand?: boolean;
  predSpustenim?: (w: any) => void;
};

function otevri(opce: Opce = {}): Okno {
  const { ua = UA.android8, url = 'https://zajic-pivovar.pages.dev/instalace', apk = false, capacitor, naploche = false, iosNaploche = false,
    dotyk = 0, platformVersion, schranka = false, execCommand, predSpustenim } = opce;
  const chyby: string[] = [];
  const konzole = new VirtualConsole();
  konzole.on('jsdomError', (e: any) => chyby.push(String(e && e.message ? e.message : e)));
  const dom = new JSDOM(HTML, {
    url,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: konzole,
    beforeParse(w: any) {
      w.__chyby = chyby;
      Object.defineProperty(w.navigator, 'userAgent', { get: () => ua, configurable: true });
      Object.defineProperty(w.navigator, 'maxTouchPoints', { get: () => dotyk, configurable: true });
      if (iosNaploche) Object.defineProperty(w.navigator, 'standalone', { get: () => true, configurable: true });
      if (apk) w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
      if (capacitor !== undefined) w.Capacitor = capacitor;
      if (naploche) w.matchMedia = (q: string) => ({ matches: /standalone/.test(q) });
      if (platformVersion !== undefined) {
        Object.defineProperty(w.navigator, 'userAgentData', {
          value: {
            getHighEntropyValues: (klice: string[]) => {
              w.__zeptano = klice;
              return platformVersion === false ? Promise.reject(new Error('odmítnuto')) : Promise.resolve({ platformVersion });
            },
          },
          configurable: true,
        });
      }
      if (schranka) {
        Object.defineProperty(w.navigator, 'clipboard', {
          value: {
            writeText: (t: string) => { w.__zkopirovano = t; return schranka === 'ok' ? Promise.resolve() : Promise.reject(new Error('zakázáno')); },
          },
          configurable: true,
        });
      }
      if (execCommand !== undefined) {
        w.document.execCommand = (p: string) => { w.__execCommand = p; w.__textVTextarea = (w.document.querySelector('textarea') || {}).value; return execCommand; };
      }
      predSpustenim?.(w);
    },
  });
  otevrena.push(dom);
  return dom.window as unknown as Okno;
}

const cekej = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Počká, až stránka dokončí zjišťování (atribut data-hotovo). */
async function pockejNaHotovo(w: Okno) {
  for (let i = 0; i < 100; i++) {
    if (w.document.documentElement.getAttribute('data-hotovo') === '1') return;
    await cekej(10);
  }
  throw new Error('Stránka Instalace se nedokončila do 1 s');
}
async function otevriHotovou(opce: Opce = {}): Promise<Okno> {
  const w = otevri(opce);
  await pockejNaHotovo(w);
  return w;
}

const doc = (w: Okno) => w.document;
const text = (w: Okno, id: string) => doc(w).getElementById(id)!.textContent!;
const cesta = (w: Okno) => doc(w).documentElement.getAttribute('data-cesta');
/** Id postupu, který je ve stránce úplně první (ten, který člověk uvidí jako hlavní). */
const prvni = (w: Okno) => doc(w).querySelector('#cesty > section')!.id;
/** Postupy schované v rozbalovacím „Postup pro jiný telefon“. */
const jine = (w: Okno) => [...doc(w).querySelectorAll('#jine-obsah > section')].map((s) => s.id.replace(/^c-/, ''));
/** Viditelné postupy (bez atributu hidden, mimo schované „jiné“). */
const viditelne = (w: Okno) => [...doc(w).querySelectorAll('#cesty > section')].filter((s) => !(s as HTMLElement).hidden).map((s) => s.id.replace(/^c-/, ''));

describe('instalace — soubor a jeho předpoklady', () => {
  it('adresa aplikace a číslo podlahy odpovídají zbytku repozitáře', () => {
    expect(HTML).toContain(`var APP = '${new URL(ODKAZ_APLIKACE).origin}';`);
    expect(HTML).toContain(`var PODLAHA_CHROME = ${PODLAHA_CHROME};`);
  });

  it('skript je čisté ES5 — musí jít otevřít i na telefonu, kde aplikace sama ne', () => {
    const m = /<script>([\s\S]*?)<\/script>/.exec(HTML)!;
    expect(() => transformSync(m[1], { target: 'es5', loader: 'js' })).not.toThrow();
  });

  it('nic nenačítá z cizích serverů (musí jít i bez internetu) a odkazuje jen na vlastní adresu', () => {
    expect(HTML).not.toMatch(/<script[^>]+src=/i);
    expect(HTML).not.toMatch(/<link[^>]+rel=["']?stylesheet/i);
    expect(HTML).not.toMatch(/@import|url\(/i);
    const hosty = new Set([...HTML.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
    expect([...hosty]).toEqual(['zajic-pivovar.pages.dev']);
  });

  it('je česky, nezobrazuje se v hledání a funguje na úzké obrazovce', () => {
    expect(HTML).toContain('<html lang="cs">');
    expect(HTML).toContain('<meta name="robots" content="noindex">');
    expect(HTML).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
  });

  it('odkaz ke stažení míří na /apk a název souboru je ten, který vystavuje deploy.yml', () => {
    expect(HTML).toMatch(/<a [^>]*id="stahnout"[^>]*href="\/apk"/);
    expect(DEPLOY).toContain('cp "$APK" "pivovar-zajic.apk"');
    expect(HTML).toContain('pivovar-zajic.apk');
  });

  it('bez JavaScriptu zůstanou vidět všechny postupy za sebou, APK první', () => {
    const dom = new JSDOM(HTML); // žádné skripty se nespustí
    const sekce = [...dom.window.document.querySelectorAll('#cesty > section')];
    expect(sekce.map((s) => s.id)).toEqual(['c-hotovo', 'c-apk', 'c-chrome', 'c-vlozeny', 'c-ios', 'c-pocitac']);
    // Jen „aplikace je nainstalovaná“ je schované (platí jen po zjištění); rozbalovací seznam i varování taky.
    expect(sekce.filter((s) => (s as HTMLElement).hidden).map((s) => s.id)).toEqual(['c-hotovo']);
    expect((dom.window.document.getElementById('jine') as HTMLElement).hidden).toBe(true);
    expect((dom.window.document.getElementById('stary') as HTMLElement).hidden).toBe(true);
    dom.window.close();
  });

  it('každý odkaz uvnitř stránky vede na existující místo', () => {
    const hrefy = [...HTML.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefy)).toEqual(new Set(['/apk', '/', '/diagnostika.html']));
    expect(() => readFileSync('public/diagnostika.html')).not.toThrow();
  });
});

describe('instalace — krátký odkaz /apk (public/_redirects)', () => {
  /** Pravidla tak, jak je čte Cloudflare Pages: řádek „zdroj cíl [stav]“; komentáře a cizí řádky se přeskočí. */
  function pravidla(txt: string) {
    return txt.split(/\r?\n/).map((r) => r.trim()).filter((r) => r && !r.startsWith('#'))
      .map((r) => r.split(/\s+/))
      .filter((t) => t.length >= 2 && t.length <= 3 && t[0].startsWith('/'))
      .map((t) => ({ zdroj: t[0], cil: t[1], stav: t[2] ? Number(t[2]) : 301 }));
  }

  it('/apk přesměruje dočasně (302) na soubor pivovar-zajic.apk v nejnovějším vydání', () => {
    const r = pravidla(REDIRECTS).find((x) => x.zdroj === '/apk');
    expect(r).toEqual({ zdroj: '/apk', cil: URL_APK, stav: 302 });
  });

  it('pravidlo /apk je PŘED obecným „všechno na index.html“ (platí první shoda)', () => {
    const r = pravidla(REDIRECTS);
    const apk = r.findIndex((x) => x.zdroj === '/apk');
    const zaloha = r.findIndex((x) => x.zdroj === '/*');
    expect(apk).toBeGreaterThanOrEqual(0);
    expect(zaloha).toBeGreaterThan(apk);
    expect(r[zaloha]).toEqual({ zdroj: '/*', cil: '/index.html', stav: 200 });
  });

  it('stejný stálý odkaz vystavuje deploy.yml a uvádí README (jedna pravda, ne tři)', () => {
    expect(DEPLOY).toContain('releases/latest/download/pivovar-zajic.apk');
    expect(README).toContain(`<${URL_APK}>`);
    // Soubor pod stálým jménem se do vydání opravdu nahrává (jinak by /apk skončilo chybou 404).
    expect(DEPLOY).toMatch(/gh release (upload|create) "v\$VERZE" "pivovar-zajic-\$VERZE\.apk" "pivovar-zajic\.apk"/);
  });

  it('README o stránce /instalace a odkazu /apk říká', () => {
    expect(README).toContain('/instalace');
    expect(README).toContain('/apk');
  });
});

describe('instalace — který postup se ukáže jako první', () => {
  const pripady: [string, Opce, string, string[]][] = [
    // [popis, telefon, hlavní postup, ostatní postupy v rozbalovacím seznamu (v pořadí)]
    ['Android 8 s Chromem 74 → aplikace (APK)', { ua: UA.android8 }, 'apk', ['chrome', 'vlozeny', 'ios', 'pocitac']],
    ['Android 7.0 (nejstarší, který APK umí) → aplikace (APK)', { ua: UA.android7 }, 'apk', ['chrome', 'vlozeny', 'ios', 'pocitac']],
    ['Android 6 → APK se nenainstaluje (ani se nenabízí), zbývá ikona z Chromu', { ua: UA.android6Chrome66 }, 'chrome', ['vlozeny', 'ios', 'pocitac']],
    ['Android s Chromem ≥ 110 (zamlžená verze „Android 10; K“) → APK', { ua: UA.android10Zamlzeny }, 'apk', ['chrome', 'vlozeny', 'ios', 'pocitac']],
    ['Samsung Internet → APK', { ua: UA.androidSamsung }, 'apk', ['chrome', 'vlozeny', 'ios', 'pocitac']],
    ['Firefox na Androidu (bez Chromu) → APK', { ua: UA.androidFirefox }, 'apk', ['chrome', 'vlozeny', 'ios', 'pocitac']],
    ['Android WebView („; wv)“, např. odkaz v jiné aplikaci) → nejdřív otevřít v prohlížeči', { ua: UA.androidWebView }, 'vlozeny', ['apk', 'chrome', 'ios', 'pocitac']],
    ['Facebook / Messenger na Androidu → nejdřív otevřít v prohlížeči', { ua: UA.androidFacebook }, 'vlozeny', ['apk', 'chrome', 'ios', 'pocitac']],
    ['iPhone, Safari → ikona ze Safari (APK iPhonu nic neříká)', { ua: UA.iphone }, 'ios', ['chrome', 'vlozeny', 'pocitac']],
    ['iPhone, prohlížeč uvnitř jiné aplikace (bez „Safari/“) → otevřít v prohlížeči', { ua: UA.iphoneMessenger }, 'vlozeny', ['chrome', 'ios', 'pocitac']],
    ['iPhone, prohlížeč uvnitř aplikace, která se nepřiznává (jen „Mobile/…“, bez „Safari/“) → otevřít v prohlížeči', { ua: UA.iphoneNeznamaAplikace }, 'vlozeny', ['chrome', 'ios', 'pocitac']],
    ['iPad, který se tváří jako Mac (dotykové body) → iOS', { ua: UA.ipadJakoMac, dotyk: 5 }, 'ios', ['chrome', 'vlozeny', 'pocitac']],
    ['skutečný Mac (bez dotyku) → počítač', { ua: UA.mac }, 'pocitac', ['chrome', 'vlozeny', 'ios']],
    ['Windows → počítač', { ua: UA.windows }, 'pocitac', ['chrome', 'vlozeny', 'ios']],
    ['Windows 7 s Chromem 109 → počítač', { ua: UA.windows7 }, 'pocitac', ['chrome', 'vlozeny', 'ios']],
  ];
  for (const [popis, opce, hlavni, ostatni] of pripady) {
    it(popis, async () => {
      const w = await otevriHotovou(opce);
      expect(cesta(w)).toBe(hlavni);
      expect(prvni(w)).toBe(`c-${hlavni}`);
      expect(jine(w)).toEqual(ostatni);
      // „Ukáže JEDEN postup“: mimo rozbalovací seznam je vidět jen ten hlavní — žádná další karta pod ním (APK se na
      // iPhonu, v počítači a na Androidu pod 7 schová úplně, ne že by zůstala v hlavním seznamu).
      expect(viditelne(w)).toEqual([hlavni]);
      // Hlavní postup je zvýrazněný, rozbalovací seznam existuje a je vidět.
      expect(doc(w).getElementById(`c-${hlavni}`)!.className).toBe('cesta hlavni');
      expect((doc(w).getElementById('jine') as HTMLElement).hidden).toBe(false);
      // Postup se vyznačí nejvýš jednou a „aplikace je nainstalovaná“ se neukáže.
      expect((doc(w).getElementById('c-hotovo') as HTMLElement).hidden).toBe(true);
      // Stránka nespadla na žádné chybě.
      expect(w.__chyby).toEqual([]);
    });
  }

  it('APK se na iPhonu a v počítači schová úplně (nic jim neříká), na Androidu 7+ je vidět', async () => {
    for (const ua of [UA.iphone, UA.windows, UA.mac]) {
      expect((doc(await otevriHotovou({ ua })).getElementById('c-apk') as HTMLElement).hidden, ua).toBe(true);
    }
    for (const ua of [UA.android7, UA.android8, UA.androidFirefox]) {
      expect((doc(await otevriHotovou({ ua })).getElementById('c-apk') as HTMLElement).hidden, ua).toBe(false);
    }
  });

  it('řetězec prohlížeče, který nepoznáme → všechny postupy za sebou, nic se neschovává', async () => {
    const w = await otevriHotovou({ ua: UA.nezname });
    expect(cesta(w)).toBe('vse');
    expect((doc(w).getElementById('jine') as HTMLElement).hidden).toBe(true);
    expect(viditelne(w)).toEqual(['apk', 'chrome', 'vlozeny', 'ios', 'pocitac']);
    expect(text(w, 'poznano')).toBe('Telefon jsem nepoznal, proto ukazuju všechny postupy.');
    expect(w.__chyby).toEqual([]);
  });

  it('věta „Poznal jsem“ říká, co se poznalo (verze Androidu, Chrome, způsob spuštění)', async () => {
    expect(text(await otevriHotovou({ ua: UA.android8 }), 'poznano')).toBe('Poznal jsem: Android 8.1.0 · Chrome 74.');
    expect(text(await otevriHotovou({ ua: UA.androidWebView }), 'poznano')).toBe('Poznal jsem: Android 9 · Chrome 74 · otevřeno uvnitř jiné aplikace.');
    expect(text(await otevriHotovou({ ua: UA.iphone }), 'poznano')).toBe('Poznal jsem: iPhone nebo iPad.');
    expect(text(await otevriHotovou({ ua: UA.windows }), 'poznano')).toBe('Poznal jsem: Windows · Chrome 130.');
    expect(text(await otevriHotovou({ ua: UA.mac }), 'poznano')).toBe('Poznal jsem: počítač · Chrome 130.');
    // Zamlžená verze se nevydává za skutečnou.
    expect(text(await otevriHotovou({ ua: UA.android10Zamlzeny }), 'poznano')).toBe('Poznal jsem: Android (verzi telefon neříká) · Chrome 130.');
  });

  describe('už nainstalováno', () => {
    it('spuštěno jako APK → „hotovo“, jen jeden postup viditelný, bez pobízení k instalaci', async () => {
      const w = await otevriHotovou({ ua: UA.androidWebView, apk: true });
      expect(cesta(w)).toBe('hotovo');
      expect(prvni(w)).toBe('c-hotovo');
      expect(viditelne(w)).toEqual(['hotovo']);
      expect((doc(w).getElementById('c-hotovo') as HTMLElement).hidden).toBe(false);
      expect(doc(w).getElementById('c-hotovo')!.className).toBe('cesta hotovo');
      expect(text(w, 'hotovo-text')).toContain('(APK)');
      expect(text(w, 'poznano')).toContain('spuštěno jako aplikace (APK)');
      // WebView v APK nesmí zmást: nejde o „odkaz uvnitř jiné aplikace“ (řetězec obsahuje „; wv)“).
      expect(text(w, 'poznano')).not.toContain('uvnitř jiné aplikace');
      expect(w.__chyby).toEqual([]);
    });

    // `window.Capacitor` existuje v KAŽDÉM prohlížeči, kde se načetla aplikace (vytvoří ho import @capacitor/core). Stránka
    // Instalace je sice samostatný soubor bez té knihovny, ale rozhoduje se stejně jako lib/zarizeni.ts: podle funkce, ne podle existence.
    it('Capacitor z webu (objekt existuje, ale APK to není) není „hotovo“ — pořád se nabízí instalace', async () => {
      const w = await otevriHotovou({ ua: UA.android8, capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } });
      expect(cesta(w)).toBe('apk');
      expect(w.__instalace.zjisti().apk).toBe(false);
    });

    it('APK se pozná i podle samotného getPlatform() === "android" nebo samotného isNativePlatform()', async () => {
      expect(cesta(await otevriHotovou({ ua: UA.android8, capacitor: { getPlatform: () => 'android' } }))).toBe('hotovo');
      expect(cesta(await otevriHotovou({ ua: UA.android8, capacitor: { isNativePlatform: () => true } }))).toBe('hotovo');
    });

    it('Capacitor bez funkcí, nebo takový, který při dotazu spadne, stránku nerozbije a APK není', async () => {
      for (const capacitor of [{}, null, { isNativePlatform: () => { throw new Error('x'); } }]) {
        const w = await otevriHotovou({ ua: UA.android8, capacitor });
        expect(cesta(w), String(capacitor)).toBe('apk');
        expect(w.__chyby).toEqual([]);
      }
    });

    it('spuštěno z ikony na ploše (standalone) → „hotovo“, text o ikoně', async () => {
      const w = await otevriHotovou({ ua: UA.android8, naploche: true });
      expect(cesta(w)).toBe('hotovo');
      expect(text(w, 'hotovo-text')).toContain('z ikony na ploše');
      expect(text(w, 'hotovo-text')).not.toContain('APK');
      expect(text(w, 'poznano')).toContain('spuštěno z ikony na ploše');
    });

    it('iPhone z ikony na ploše (navigator.standalone) → „hotovo“', async () => {
      expect(cesta(await otevriHotovou({ ua: UA.iphone, iosNaploche: true }))).toBe('hotovo');
    });

    it('APK má přednost před „z ikony na ploše“ (v APK je display-mode taky standalone)', async () => {
      const w = await otevriHotovou({ ua: UA.android8, apk: true, naploche: true });
      expect(w.__instalace.zvolCestu(w.__instalace.zjisti())).toEqual({ hlavni: 'hotovo', jak: 'apk' });
    });

    it('instalované má přednost před vloženým prohlížečem a před verzí Androidu', async () => {
      // Android 6 + standalone: nic se neinstaluje, je hotovo.
      expect(cesta(await otevriHotovou({ ua: UA.android6Chrome66, naploche: true }))).toBe('hotovo');
      // WebView + standalone (např. WebAPK některých výrobců): hotovo, ne „otevři v prohlížeči“.
      expect(cesta(await otevriHotovou({ ua: UA.androidWebView, naploche: true }))).toBe('hotovo');
    });

    it('v hotovém stavu se ostatní postupy dál nabízejí v rozbalovacím seznamu (kdyby chtěl jinou cestu)', async () => {
      const w = await otevriHotovou({ ua: UA.android8, naploche: true });
      expect(jine(w)).toEqual(['apk', 'chrome', 'vlozeny', 'ios', 'pocitac']);
    });
  });

  describe('verze Androidu, kterou telefon skrývá (Chrome ≥ 110)', () => {
    it('zeptá se jen na verzi platformy (nic víc) a skutečnou verzi ukáže', async () => {
      const w = await otevriHotovou({ ua: UA.android10Zamlzeny, platformVersion: '14.0.0' });
      expect((w as any).__zeptano).toEqual(['platformVersion']);
      expect(text(w, 'poznano')).toBe('Poznal jsem: Android 14.0.0 · Chrome 130.');
      expect(cesta(w)).toBe('apk');
      expect(w.__chyby).toEqual([]);
    });

    it('když se telefon odmítne, zůstane to u APK a stránka se dokončí', async () => {
      const w = await otevriHotovou({ ua: UA.android10Zamlzeny, platformVersion: false });
      expect(cesta(w)).toBe('apk');
      expect(text(w, 'poznano')).toContain('verzi telefon neříká');
      expect(w.__chyby).toEqual([]);
    });

    it('na telefonu, který verzi neskrývá, se na nic neptá', async () => {
      const w = await otevriHotovou({ ua: UA.android8, platformVersion: '99.0.0' });
      expect((w as any).__zeptano).toBeUndefined();
      expect(text(w, 'poznano')).toContain('Android 8.1.0');
    });

    it('stránka se po doručení skutečné verze překreslí z jednoho stavu do jiného (nezdvojí postupy)', async () => {
      const w = await otevriHotovou({ ua: UA.android10Zamlzeny, platformVersion: '6.0.1' });
      // Skutečná verze říká Android 6 → APK nejde, zbývá ikona z Chromu; každý postup je ve stránce právě jednou.
      expect(cesta(w)).toBe('chrome');
      expect(prvni(w)).toBe('c-chrome');
      expect(doc(w).querySelectorAll('section.cesta')).toHaveLength(6);
      expect(jine(w)).toEqual(['vlozeny', 'ios', 'pocitac']);
      expect((doc(w).getElementById('android-stary') as HTMLElement).hidden).toBe(false);
      // Po překreslení je APK schované (před doručením skutečné verze se ještě nabízelo) a vidět je jen hlavní postup.
      expect((doc(w).getElementById('c-apk') as HTMLElement).hidden).toBe(true);
      expect(viditelne(w)).toEqual(['chrome']);
    });
  });

  describe('Android starší než 7', () => {
    it('říká, že aplikace ke stažení nejde, a nabídne ikonu nebo záložku z Chromu', async () => {
      const w = await otevriHotovou({ ua: UA.android6Chrome66 });
      const v = doc(w).getElementById('android-stary') as HTMLElement;
      expect(v.hidden).toBe(false);
      expect(v.textContent).toContain('starší než 7');
      // Záložka je cesta, která nezávisí na tom, jestli se ikona z Chromu na tomhle telefonu povede.
      expect(doc(w).getElementById('c-chrome')!.textContent).toContain('Přidat do záložek');
      // APK se nenabízí vůbec (v telefonu pod Androidem 7 by skončilo „Aplikace není nainstalována“): není ani mezi
      // jinými postupy, ani vidět v hlavním seznamu.
      expect((doc(w).getElementById('c-apk') as HTMLElement).hidden).toBe(true);
      expect(jine(w)).not.toContain('apk');
      expect(viditelne(w)).toEqual(['chrome']);
    });

    it('na Androidu 7 a novějším, u zamlžené verze, na iPhonu ani počítači to neříká', async () => {
      for (const ua of [UA.android7, UA.android8, UA.android10Zamlzeny, UA.iphone, UA.windows, UA.nezname]) {
        const w = await otevriHotovou({ ua });
        expect((doc(w).getElementById('android-stary') as HTMLElement).hidden, ua).toBe(true);
      }
    });
  });

  describe('příliš starý prohlížeč (pod podlahou)', () => {
    it(`Chrome ${PODLAHA_CHROME - 1} → varování s číslem verze, nad postupem`, async () => {
      const w = await otevriHotovou({ ua: UA.android7.replace('Chrome/66', `Chrome/${PODLAHA_CHROME - 1}`) });
      const v = doc(w).getElementById('stary') as HTMLElement;
      expect(v.hidden).toBe(false);
      expect(text(w, 'stary-v')).toBe(String(PODLAHA_CHROME - 1));
      expect(v.textContent).toContain('WebView');
      expect(v.getAttribute('role')).toBe('alert');
      expect(v.querySelector('a')!.getAttribute('href')).toBe('/diagnostika.html');
      // Varování je před postupy.
      expect(v.compareDocumentPosition(doc(w).getElementById('cesty')!) & 4 /* FOLLOWING */).toBeTruthy();
    });

    it(`Chrome ${PODLAHA_CHROME} (přesně podlaha) varování nemá`, async () => {
      const w = await otevriHotovou({ ua: UA.android7 });
      expect((doc(w).getElementById('stary') as HTMLElement).hidden).toBe(true);
      expect(text(w, 'stary-v')).toBe('');
    });

    it('prohlížeč bez Chromu (Firefox, Safari) varování nemá — verzi nehádáme', async () => {
      for (const ua of [UA.androidFirefox, UA.iphone]) {
        expect((doc(await otevriHotovou({ ua })).getElementById('stary') as HTMLElement).hidden, ua).toBe(true);
      }
    });
  });
});

describe('instalace — čistá funkce zvolCestu (hranice)', () => {
  // Funkce jsou schované ve stránce, proto každé volání dostane vlastní (hned zavřené) okno.
  const z = (nad: Info) => {
    return otevri().__instalace.zvolCestu({
      android: null, androidSkryty: false, androidReal: null, chrome: null, jeAndroid: false, jeIos: false, jeDesktop: false,
      jeWindows: false, vlozeny: false, apk: false, naploche: false, ...nad,
    });
  };

  it('Android 7 je hranice: 6.9 → ikona z Chromu, 7 → APK', () => {
    expect(z({ jeAndroid: true, android: '6.9' }).hlavni).toBe('chrome');
    expect(z({ jeAndroid: true, android: '7' }).hlavni).toBe('apk');
    expect(z({ jeAndroid: true, android: '7.0' }).hlavni).toBe('apk');
    expect(z({ jeAndroid: true, android: '4.4.2' }).hlavni).toBe('chrome');
    expect(z({ jeAndroid: true, android: '14' }).hlavni).toBe('apk');
  });

  it('verze Androidu, kterou telefon neříká, se nehádá: APK (Chrome ≥ 110 běží jen na Androidu 7+)', () => {
    expect(z({ jeAndroid: true, android: '10', androidSkryty: true, chrome: 130 }).hlavni).toBe('apk');
    // I zamlžená „10“ se nesmí vzít jako skutečná, když je skutečná verze jiná.
    expect(z({ jeAndroid: true, android: '10', androidSkryty: true, androidReal: '6.0' }).hlavni).toBe('chrome');
  });

  it('skutečná verze (userAgentData) má přednost před tou z řetězce prohlížeče', () => {
    expect(z({ jeAndroid: true, android: '10', androidReal: '12.0.0' }).hlavni).toBe('apk');
    expect(z({ jeAndroid: true, android: '8', androidReal: '5.1' }).hlavni).toBe('chrome');
  });

  it('pořadí pravidel: APK > ikona > vložený prohlížeč > iOS > Android > počítač > nic', () => {
    expect(z({ apk: true, naploche: true, vlozeny: true, jeAndroid: true, android: '9' })).toEqual({ hlavni: 'hotovo', jak: 'apk' });
    expect(z({ naploche: true, vlozeny: true, jeAndroid: true, android: '9' })).toEqual({ hlavni: 'hotovo', jak: 'ikona' });
    expect(z({ vlozeny: true, jeAndroid: true, android: '9' }).hlavni).toBe('vlozeny');
    expect(z({ vlozeny: true, jeIos: true }).hlavni).toBe('vlozeny');
    expect(z({ jeIos: true }).hlavni).toBe('ios');
    expect(z({ jeAndroid: true, android: '9' }).hlavni).toBe('apk');
    expect(z({ jeDesktop: true }).hlavni).toBe('pocitac');
    expect(z({}).hlavni).toBe('vse');
  });

  it('„vložený“ prohlížeč na počítači nic neznamená (počítač má vlastní postup)', () => {
    expect(z({ vlozeny: true, jeDesktop: true }).hlavni).toBe('pocitac');
  });

  it('androidVerze: číslo nebo null (nikdy NaN)', () => {
    const okno = otevri();
    const v = (nad: Info) => okno.__instalace.androidVerze({ android: null, androidSkryty: false, androidReal: null, ...nad });
    expect(v({ android: '8.1.0' })).toBe(8.1);
    expect(v({ android: '7' })).toBe(7);
    expect(v({ android: null })).toBeNull();
    expect(v({ android: '10', androidSkryty: true })).toBeNull();
    expect(v({ android: '10', androidSkryty: true, androidReal: '13.0.0' })).toBe(13);
    expect(v({ android: 'x' })).toBeNull();
  });
});

describe('instalace — kopírování odkazu na stránku', () => {
  const ODKAZ = `${new URL(ODKAZ_APLIKACE).origin}/instalace`;
  const klik = async (w: Okno) => { (doc(w).getElementById('kopirovat') as HTMLElement).click(); await cekej(10); };

  it('zkopíruje adresu této stránky (ne adresu e-mailu ani jiné aplikace) a řekne, co dál', async () => {
    const w = await otevriHotovou({ ua: UA.androidWebView, schranka: 'ok', url: 'https://jina-adresa.example/instalace?x=1' });
    await klik(w);
    expect((w as any).__zkopirovano).toBe(ODKAZ);
    expect(text(w, 'stav-kopie')).toContain('Odkaz je zkopírovaný');
  });

  it('když schránka odmítne, zkusí nouzový způsob a podaří-li se, řekne totéž', async () => {
    const w = await otevriHotovou({ schranka: 'chyba', execCommand: true });
    await klik(w);
    expect((w as any).__execCommand).toBe('copy');
    expect((w as any).__textVTextarea).toBe(ODKAZ);
    expect(text(w, 'stav-kopie')).toContain('Odkaz je zkopírovaný');
    // Pomocné pole se uklidí — nesmí zůstat ve stránce.
    expect(doc(w).querySelectorAll('textarea')).toHaveLength(0);
  });

  it('bez schránky se použije nouzový způsob rovnou', async () => {
    const w = await otevriHotovou({ schranka: false, execCommand: true });
    await klik(w);
    expect((w as any).__execCommand).toBe('copy');
    expect(text(w, 'stav-kopie')).toContain('Odkaz je zkopírovaný');
  });

  it('když nejde nic, řekne, co má člověk opsat (celou adresu)', async () => {
    const w = await otevriHotovou({ schranka: 'chyba', execCommand: false });
    await klik(w);
    expect(text(w, 'stav-kopie')).toBe(`Zkopírování se nepovedlo. Opiš do prohlížeče: ${ODKAZ}`);
    expect(doc(w).querySelectorAll('textarea')).toHaveLength(0);
  });

  it('i bez schránky a bez execCommand (starý prohlížeč) řekne, co opsat, a nespadne', async () => {
    const w = await otevriHotovou({ schranka: false });
    await klik(w);
    expect(text(w, 'stav-kopie')).toContain(ODKAZ);
    expect(w.__chyby).toEqual([]);
  });

  it('adresa v tlačítku „Otevřít aplikaci“ vede na kořen a tlačítko kopírování je opravdu tlačítko', () => {
    expect(HTML).toMatch(/<button type="button" class="tl" id="kopirovat">/);
    expect(HTML).toMatch(/<a class="tl" href="\/">Otevřít aplikaci<\/a>/);
  });
});
