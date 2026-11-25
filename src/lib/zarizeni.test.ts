// 📲 Jak a na čem se aplikace používá (lib/zarizeni.ts) — způsob spuštění, systém, prohlížeč, model.
// ---------------------------------------------------------------------------
// Šéfovi se na starším Androidu aplikace z ikony na ploše nespustila (25. 11. 2026) a z přehledu verzí nešlo poznat,
// jak ji lidé otevírají: zápis „Android (Capacitor)“ vznikl z toho, že `window.Capacitor` existuje v KAŽDÉM
// prohlížeči (vytvoří ho už import @capacitor/core). Tyhle testy hlídají, že se o APK rozhoduje podle skutečné
// funkce Capacitoru a že stránka Instalace (samostatný ES5 soubor) pozná totéž.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';
import {
  jeApk, jeVerzeSkryta, popisTohotoZarizeni, popisZarizeni, vstupSDoplnenymiUdaji, vstupZOkna, zpusobSpusteni,
  POPIS_ZPUSOBU, type VstupZarizeni,
} from './zarizeni';

const UA = {
  android8: 'Mozilla/5.0 (Linux; Android 8.1.0; SM-J530F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.136 Mobile Safari/537.36',
  android7: 'Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.158 Mobile Safari/537.36',
  android6: 'Mozilla/5.0 (Linux; Android 6.0.1; SM-G920F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.83 Mobile Safari/537.36',
  android10Zamlzeny: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 12; Mobile; rv:109.0) Gecko/109.0 Firefox/115.0',
  androidOpera: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Mobile Safari/537.36 OPR/75.0.0.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 12; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36 EdgA/108.0.1462.48',
  androidWebView: 'Mozilla/5.0 (Linux; Android 9; SM-J530F Build/PPR1.180610.011; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/74.0.3729.136 Mobile Safari/537.36',
  androidFacebook: 'Mozilla/5.0 (Linux; Android 11; SM-A525F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.127 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/390.0.0.0.0;]',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  iphoneIkona: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.5993.69 Mobile/15E148 Safari/604.1',
  iphoneMessenger: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/400.0]',
  ipadJakoMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Safari/605.1.15',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.46',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  chromeos: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

/** Capacitor tak, jak ho do prohlížeče vloží samotný import @capacitor/core (web). */
const CAPACITOR_WEB = { isNativePlatform: () => false, getPlatform: () => 'web' };
/** Capacitor v APK. */
const CAPACITOR_APK = { isNativePlatform: () => true, getPlatform: () => 'android' };

const v = (nad: Partial<VstupZarizeni> & { ua: string }): VstupZarizeni => ({ capacitor: CAPACITOR_WEB, naploche: false, maxTouchPoints: 0, ...nad });

describe('zarizeni — jeApk (existence objektu Capacitor nestačí)', () => {
  it('Capacitor z webu (importem @capacitor/core vzniká v každém prohlížeči) APK není', () => {
    expect(jeApk(CAPACITOR_WEB)).toBe(false);
    expect(jeApk({})).toBe(false);
    expect(jeApk(null)).toBe(false);
    expect(jeApk(undefined)).toBe(false);
  });

  it('nativní platforma je APK — podle isNativePlatform i podle getPlatform', () => {
    expect(jeApk(CAPACITOR_APK)).toBe(true);
    expect(jeApk({ isNativePlatform: () => true })).toBe(true);
    expect(jeApk({ getPlatform: () => 'android' })).toBe(true);
    expect(jeApk({ getPlatform: () => 'ios' })).toBe(false);
  });

  it('Capacitor, který při dotazu spadne, aplikaci nerozbije — není APK', () => {
    expect(jeApk({ isNativePlatform: () => { throw new Error('x'); } })).toBe(false);
  });
});

describe('zarizeni — způsob spuštění', () => {
  it('APK má přednost před vším ostatním (v APK je i „standalone“ i „; wv)“)', () => {
    expect(zpusobSpusteni(v({ ua: UA.androidWebView, capacitor: CAPACITOR_APK, naploche: true }))).toBe('apk');
  });

  it('ikona na ploše má přednost před vloženým prohlížečem (WebAPK některých výrobců má „; wv)“)', () => {
    expect(zpusobSpusteni(v({ ua: UA.androidWebView, naploche: true }))).toBe('ikona');
    expect(zpusobSpusteni(v({ ua: UA.android8, naploche: true }))).toBe('ikona');
    // iPhone z ikony: v řetězci chybí „Safari/“, přesto je to ikona, ne vložený prohlížeč.
    expect(zpusobSpusteni(v({ ua: UA.iphoneIkona, naploche: true }))).toBe('ikona');
  });

  it('prohlížeč uvnitř jiné aplikace (WebView, Facebook, iPhone bez „Safari/“)', () => {
    expect(zpusobSpusteni(v({ ua: UA.androidWebView }))).toBe('vlozeny');
    expect(zpusobSpusteni(v({ ua: UA.androidFacebook }))).toBe('vlozeny');
    expect(zpusobSpusteni(v({ ua: UA.iphoneMessenger }))).toBe('vlozeny');
    expect(zpusobSpusteni(v({ ua: UA.iphoneIkona }))).toBe('vlozeny');
  });

  it('obyčejný prohlížeč, i na iPadu, který se tváří jako Mac', () => {
    for (const ua of [UA.android8, UA.android10Zamlzeny, UA.androidSamsung, UA.androidFirefox, UA.iphone, UA.iphoneChrome, UA.windows, UA.mac, UA.linuxFirefox]) {
      expect(zpusobSpusteni(v({ ua })), ua).toBe('prohlizec');
    }
    expect(zpusobSpusteni(v({ ua: UA.ipadJakoMac, maxTouchPoints: 5 }))).toBe('prohlizec');
  });

  it('popisy způsobů jsou česky a každý je jiný', () => {
    expect(POPIS_ZPUSOBU).toEqual({ apk: 'Aplikace (APK)', ikona: 'Ikona na ploše', vlozeny: 'Vložený prohlížeč', prohlizec: 'Prohlížeč' });
  });
});

describe('zarizeni — popis do přehledu verzí', () => {
  const popis = (ua: string, nad: Partial<VstupZarizeni> = {}) => popisZarizeni(v({ ua, ...nad }));

  it('starší Android: způsob spuštění, systém, prohlížeč, model', () => {
    expect(popis(UA.android8)).toBe('Prohlížeč / Android 8.1 / Chrome 74 / SM-J530F');
    expect(popis(UA.android8, { naploche: true })).toBe('Ikona na ploše / Android 8.1 / Chrome 74 / SM-J530F');
    expect(popis(UA.android7)).toBe('Prohlížeč / Android 7 / Chrome 66 / SM-G930F');
    expect(popis(UA.android6)).toBe('Prohlížeč / Android 6 / Chrome 58 / SM-G920F');
  });

  it('APK ukáže verzi WebView (ta rozhoduje, jestli aplikace poběží), model bez „Build/…“', () => {
    expect(popis(UA.androidWebView, { capacitor: CAPACITOR_APK, naploche: true })).toBe('Aplikace (APK) / Android 9 / WebView 74 / SM-J530F');
    expect(popis(UA.androidWebView)).toBe('Vložený prohlížeč / Android 9 / WebView 74 / SM-J530F');
  });

  it('Chrome od verze 110 skrývá systém i model — bez doplnění se nehádá, s doplněním se ukáže skutečné', () => {
    expect(popis(UA.android10Zamlzeny)).toBe('Prohlížeč / Android / Chrome 130');
    expect(popis(UA.android10Zamlzeny, { platformVersion: '14.0.0', model: 'Pixel 8' })).toBe('Prohlížeč / Android 14 / Chrome 130 / Pixel 8');
    expect(popis(UA.android10Zamlzeny, { platformVersion: '8.1.0' })).toBe('Prohlížeč / Android 8.1 / Chrome 130');
    // Zamlžené „10“ se nikdy nevydává za skutečnou verzi.
    expect(popis(UA.android10Zamlzeny)).not.toContain('Android 10');
  });

  it('ostatní prohlížeče na Androidu se nezaměňují za Chrome', () => {
    expect(popis(UA.androidSamsung)).toBe('Prohlížeč / Android 13 / Samsung Internet 23 / SM-S918B');
    expect(popis(UA.androidFirefox)).toBe('Prohlížeč / Android 12 / Firefox 115');
    expect(popis(UA.androidOpera)).toBe('Prohlížeč / Android 11 / Opera 75 / Pixel 5');
    expect(popis(UA.androidEdge)).toBe('Prohlížeč / Android 12 / Edge 108 / SM-A525F');
  });

  it('iPhone, iPad, počítače', () => {
    expect(popis(UA.iphone)).toBe('Prohlížeč / iOS 15 / Safari 15');
    expect(popis(UA.iphoneChrome)).toBe('Prohlížeč / iOS 16 / Chrome 118');
    expect(popis(UA.iphoneIkona, { naploche: true })).toBe('Ikona na ploše / iOS 15');
    expect(popis(UA.ipadJakoMac, { maxTouchPoints: 5 })).toBe('Prohlížeč / iOS / Safari 16');
    expect(popis(UA.windows)).toBe('Prohlížeč / Windows / Chrome 130');
    expect(popis(UA.windowsEdge)).toBe('Prohlížeč / Windows / Edge 130');
    expect(popis(UA.mac)).toBe('Prohlížeč / macOS / Chrome 130');
    expect(popis(UA.macSafari)).toBe('Prohlížeč / macOS / Safari 17');
    expect(popis(UA.linuxFirefox)).toBe('Prohlížeč / Linux / Firefox 128');
    expect(popis(UA.chromeos)).toBe('Prohlížeč / ChromeOS / Chrome 130');
  });

  it('co se nepoznalo, se vynechá (nic se nehádá); prázdný řetězec dá aspoň způsob spuštění', () => {
    expect(popis('')).toBe('Prohlížeč');
    expect(popis('Mozilla/5.0 (compatible; NeznamyProhlizec/1.0)')).toBe('Prohlížeč');
    // Model se píše jen u Androidu (v řetězci iPhonu žádný není).
    expect(popis(UA.iphone, { model: 'iPhone14,2' })).not.toContain('iPhone14');
  });

  it('nikdy nezmiňuje Capacitor (starý zápis „Android (Capacitor)“ vznikal i v prohlížeči) a drží se mezí', () => {
    for (const ua of Object.values(UA)) {
      const p = popis(ua);
      expect(p).not.toMatch(/capacitor/i);
      expect(p.length).toBeLessThanOrEqual(120);
    }
    expect(popis(UA.android8, { model: 'M'.repeat(500) })).toHaveLength(120);
  });

  it('model z userAgentData má přednost před modelem z řetězce prohlížeče', () => {
    expect(popis(UA.android8, { model: 'SM-J530FM' })).toBe('Prohlížeč / Android 8.1 / Chrome 74 / SM-J530FM');
  });
});

describe('zarizeni — skrytá verze systému (Chrome ≥ 110)', () => {
  it('jeVerzeSkryta: jen Chrome 110+ s „Android 10; K“', () => {
    expect(jeVerzeSkryta(UA.android10Zamlzeny)).toBe(true);
    expect(jeVerzeSkryta(UA.android10Zamlzeny.replace('Chrome/130', 'Chrome/109'))).toBe(false);
    expect(jeVerzeSkryta(UA.android10Zamlzeny.replace('Chrome/130', 'Chrome/110'))).toBe(true);
    expect(jeVerzeSkryta(UA.android8)).toBe(false);
    expect(jeVerzeSkryta(UA.windows)).toBe(false);
    expect(jeVerzeSkryta('')).toBe(false);
  });
});

describe('zarizeni — údaje z okna prohlížeče', () => {
  /** Okno z jsdom s nastavitelným prohlížečem (nic ze skutečného prostředí testů). */
  const dom: JSDOM[] = [];
  afterEach(() => { while (dom.length) dom.pop()!.window.close(); });
  function okno(opce: {
    ua?: string; capacitor?: unknown; standalone?: boolean; iosStandalone?: boolean; dotyk?: number;
    matchMedia?: 'chybi' | 'spadne'; userAgentData?: unknown;
  } = {}): Window {
    const d = new JSDOM('<!doctype html><html></html>', { url: 'https://zajic-pivovar.pages.dev/', pretendToBeVisual: true });
    dom.push(d);
    const w = d.window as any;
    Object.defineProperty(w.navigator, 'userAgent', { get: () => opce.ua ?? UA.android8, configurable: true });
    Object.defineProperty(w.navigator, 'maxTouchPoints', { get: () => opce.dotyk ?? 0, configurable: true });
    if (opce.iosStandalone) Object.defineProperty(w.navigator, 'standalone', { get: () => true, configurable: true });
    if (opce.capacitor !== undefined) w.Capacitor = opce.capacitor;
    if (opce.matchMedia === 'spadne') w.matchMedia = () => { throw new Error('x'); };
    else if (opce.matchMedia !== 'chybi') w.matchMedia = (q: string) => ({ matches: !!opce.standalone && /standalone/.test(q) });
    if (opce.userAgentData !== undefined) Object.defineProperty(w.navigator, 'userAgentData', { value: opce.userAgentData, configurable: true });
    return w as Window;
  }

  it('přečte řetězec prohlížeče, Capacitor, dotykové body a režim zobrazení', () => {
    const w = okno({ ua: UA.ipadJakoMac, capacitor: CAPACITOR_WEB, dotyk: 5, standalone: true });
    expect(vstupZOkna(w)).toEqual({ ua: UA.ipadJakoMac, capacitor: CAPACITOR_WEB, naploche: true, maxTouchPoints: 5 });
  });

  it('z ikony: display-mode standalone, minimal-ui i navigator.standalone (iOS)', () => {
    expect(vstupZOkna(okno({ standalone: true })).naploche).toBe(true);
    expect(vstupZOkna(okno({ iosStandalone: true })).naploche).toBe(true);
    expect(vstupZOkna(okno()).naploche).toBe(false);
    const w = okno();
    (w as any).matchMedia = (q: string) => ({ matches: /minimal-ui/.test(q) });
    expect(vstupZOkna(w).naploche).toBe(true);
  });

  it('bez matchMedia nebo když spadne, je to „není z ikony“ (nikdy výjimka)', () => {
    expect(vstupZOkna(okno({ matchMedia: 'chybi' })).naploche).toBe(false);
    expect(vstupZOkna(okno({ matchMedia: 'spadne' })).naploche).toBe(false);
  });

  it('bez Capacitoru je capacitor null', () => {
    expect(vstupZOkna(okno()).capacitor).toBeNull();
  });

  it('celý popis tohoto zařízení: ikona na starém Androidu', async () => {
    const w = okno({ ua: UA.android8, capacitor: CAPACITOR_WEB, standalone: true });
    expect(await popisTohotoZarizeni(w)).toBe('Ikona na ploše / Android 8.1 / Chrome 74 / SM-J530F');
  });

  it('prohlížeč s Capacitorem z webu se nepopíše jako APK (původní chyba)', async () => {
    const w = okno({ ua: UA.android8, capacitor: CAPACITOR_WEB });
    expect(await popisTohotoZarizeni(w)).toBe('Prohlížeč / Android 8.1 / Chrome 74 / SM-J530F');
  });

  it('APK: nativní Capacitor + WebView', async () => {
    const w = okno({ ua: UA.androidWebView, capacitor: CAPACITOR_APK, standalone: true });
    expect(await popisTohotoZarizeni(w)).toBe('Aplikace (APK) / Android 9 / WebView 74 / SM-J530F');
  });

  describe('doplnění z userAgentData', () => {
    const data = (h: unknown, zaznam: string[][] = []) => ({
      getHighEntropyValues: (klice: string[]) => { zaznam.push(klice); return typeof h === 'function' ? (h as () => Promise<unknown>)() : Promise.resolve(h); },
    });

    it('zeptá se jen na verzi systému a model, a jen když je řetězec prohlížeče skrývá', async () => {
      const zaznam: string[][] = [];
      const w = okno({ ua: UA.android10Zamlzeny, userAgentData: data({ platformVersion: '14.0.0', model: 'Pixel 8' }, zaznam) });
      const vstup = await vstupSDoplnenymiUdaji(w);
      expect(zaznam).toEqual([['platformVersion', 'model']]);
      expect(vstup.platformVersion).toBe('14.0.0');
      expect(vstup.model).toBe('Pixel 8');
      expect(await popisTohotoZarizeni(w)).toBe('Prohlížeč / Android 14 / Chrome 130 / Pixel 8');

      const zaznam2: string[][] = [];
      const w2 = okno({ ua: UA.android8, userAgentData: data({ platformVersion: '99.0.0' }, zaznam2) });
      expect((await vstupSDoplnenymiUdaji(w2)).platformVersion).toBeUndefined();
      expect(zaznam2).toEqual([]);
    });

    it('telefon se odmítne → zůstane to u toho, co řetězec prohlížeče říká (žádné číslo systému)', async () => {
      const w = okno({ ua: UA.android10Zamlzeny, userAgentData: data(() => Promise.reject(new Error('odmítnuto'))) });
      expect(await popisTohotoZarizeni(w)).toBe('Prohlížeč / Android / Chrome 130');
    });

    it('telefon neodpoví vůbec → po časovém limitu se pokračuje (zápis verze se nezdrží)', async () => {
      const w = okno({ ua: UA.android10Zamlzeny, userAgentData: data(() => new Promise(() => {})) });
      const t0 = Date.now();
      const vstup = await vstupSDoplnenymiUdaji(w, 30);
      expect(Date.now() - t0).toBeLessThan(1000);
      expect(vstup.platformVersion).toBeUndefined();
    });

    it('prázdná odpověď nic nepřepíše', async () => {
      const w = okno({ ua: UA.android10Zamlzeny, userAgentData: data({}) });
      const vstup = await vstupSDoplnenymiUdaji(w);
      expect(vstup.platformVersion).toBeNull();
      expect(vstup.model).toBeNull();
      expect(await popisTohotoZarizeni(w)).toBe('Prohlížeč / Android / Chrome 130');
    });

    it('userAgentData bez getHighEntropyValues se přeskočí', async () => {
      const w = okno({ ua: UA.android10Zamlzeny, userAgentData: {} });
      expect(await popisTohotoZarizeni(w)).toBe('Prohlížeč / Android / Chrome 130');
    });
  });
});

describe('zarizeni — stejné rozhodnutí jako stránka Instalace (public/instalace.html)', () => {
  // Stránka Instalace je samostatný ES5 soubor bez importů, takže pravidla „APK → ikona → vložený prohlížeč“
  // má dvakrát. Tenhle test hlídá, že se nerozejdou: pro stejný telefon řeknou totéž.
  const HTML = readFileSync('public/instalace.html', 'utf8');
  const dom: JSDOM[] = [];
  afterEach(() => { while (dom.length) dom.pop()!.window.close(); });

  function stranka(vstup: VstupZarizeni) {
    const d = new JSDOM(HTML, {
      url: 'https://zajic-pivovar.pages.dev/instalace', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
      beforeParse(w: any) {
        Object.defineProperty(w.navigator, 'userAgent', { get: () => vstup.ua, configurable: true });
        Object.defineProperty(w.navigator, 'maxTouchPoints', { get: () => vstup.maxTouchPoints ?? 0, configurable: true });
        // I webový Capacitor (objekt existuje, APK to ale není) se stránce předá — přesně jako v prohlížeči.
        if (vstup.capacitor) w.Capacitor = vstup.capacitor;
        if (vstup.naploche) w.matchMedia = (q: string) => ({ matches: /standalone/.test(q) });
      },
    });
    dom.push(d);
    const w = d.window as any;
    return w.__instalace.zvolCestu(w.__instalace.zjisti()) as { hlavni: string; jak?: string };
  }

  /** Jak by stránka Instalace rozlišila způsob spuštění. */
  const zpusobPodleStranky = (c: { hlavni: string; jak?: string }): string =>
    c.hlavni === 'hotovo' ? (c.jak === 'apk' ? 'apk' : 'ikona') : c.hlavni === 'vlozeny' ? 'vlozeny' : 'prohlizec';

  const pripady: [string, VstupZarizeni][] = [
    ['Android 8 v Chromu', v({ ua: UA.android8 })],
    ['Android 6 v Chromu', v({ ua: UA.android6 })],
    ['Android 10 (zamlžená verze)', v({ ua: UA.android10Zamlzeny })],
    ['Samsung Internet', v({ ua: UA.androidSamsung })],
    ['Firefox na Androidu', v({ ua: UA.androidFirefox })],
    ['Android z ikony', v({ ua: UA.android8, naploche: true })],
    ['APK (WebView + Capacitor + standalone)', v({ ua: UA.androidWebView, capacitor: CAPACITOR_APK, naploche: true })],
    ['WebView bez Capacitoru (odkaz v jiné aplikaci)', v({ ua: UA.androidWebView })],
    ['WebView z ikony (WebAPK)', v({ ua: UA.androidWebView, naploche: true })],
    ['Facebook na Androidu', v({ ua: UA.androidFacebook })],
    ['iPhone v Safari', v({ ua: UA.iphone })],
    ['iPhone z ikony', v({ ua: UA.iphoneIkona, naploche: true })],
    ['iPhone ve Messengeru', v({ ua: UA.iphoneMessenger })],
    ['iPhone v aplikaci, která se nepřiznává (bez „Safari/“ a bez značky)', v({ ua: UA.iphoneIkona })],
    ['iPad jako Mac', v({ ua: UA.ipadJakoMac, maxTouchPoints: 5 })],
    ['Windows', v({ ua: UA.windows })],
    ['Mac', v({ ua: UA.mac })],
  ];
  for (const [popis, vstup] of pripady) {
    it(popis, () => {
      expect(zpusobPodleStranky(stranka(vstup))).toBe(zpusobSpusteni(vstup));
    });
  }
});
