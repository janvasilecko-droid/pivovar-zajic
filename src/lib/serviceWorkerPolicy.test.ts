import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — build skript je .mjs bez typů, testují se jeho čisté funkce
import { vytahniShell, vlozShell } from '../../scripts/shell-do-sw.mjs';

describe('service worker update policy', () => {
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');
  const installHandler = source.slice(
    source.indexOf("self.addEventListener('install'"),
    source.indexOf("self.addEventListener('activate'"),
  );

  // Cache.addAll je atomicke: kdyz jediny fetch z PRECACHE selze (napr.
  // docasny sitovy zaskuk pri castych nasazenich), CELY install tise selze
  // a offline shell se nikdy neulozi. Zivym testem na produkci overeno, ze
  // se to skutecne delo. Zamerne proto misto atomickeho addAll cachujeme
  // kazdy soubor zvlast (viz ensurePrecached v sw.js) - selhani jednoho
  // souboru uz nezablokuje ulozeni ostatnich.
  it('cachuje precache soubory jednotlive (ne atomickym addAll) a neskippuje waiting', () => {
    expect(installHandler).toContain('ensurePrecached(c)');
    expect(installHandler).not.toContain('await c.addAll(PRECACHE)');
    expect(installHandler).not.toContain('skipWaiting');
  });

  it('limits cache cleanup to the application prefix', () => {
    expect(source).toContain('key.startsWith(CACHE_PREFIX)');
    expect(source).not.toContain('keys.filter((k) => k !== CACHE)');
  });

  // ── Appka bez vzhledu (6. 9. 2026) ────────────────────────────────────────
  // Na telefonu se Kalkulačky vykreslily patkovým písmem, s holými tlačítky
  // a bez rozvržení. Nebyla to změna grafiky — nedorazil stylopis.
  //
  // Šlo to takhle: soubory s otiskem obsahu (`/assets/index-B4LPMgHR.css`) se
  // tahaly ze sítě při KAŽDÉM spuštění, a ještě s `cache: 'no-cache'`, tedy
  // s vynuceným dotazem na server. Když dotaz na mobilních datech neuspěl,
  // sáhlo se do cache — jenže tam stylopis nebyl, protože „offline shell"
  // obsahoval jen index.html, ikony a písma. Service worker tedy vrátil
  // „503 Offline" a prohlížeč stránku vykreslil BEZ STYLŮ.
  //
  // Obojí je opravené a obojí si tu hlídá svůj test.
  describe('stylopis se musí dostat k appce', () => {
    it('soubory s otiskem obsahu se berou z cache dřív než ze sítě', () => {
      const vetev = source.slice(source.indexOf('if (JE_OTISK.test(url.pathname))'));
      const telo = vetev.slice(0, vetev.indexOf('// Network-first strategy'));
      // Cache se ptá jako první — jinak je appka při každém startu závislá
      // na tom, jestli zrovna projde síť.
      expect(telo.indexOf('matchInInstalledCache')).toBeGreaterThan(-1);
      expect(telo.indexOf('matchInInstalledCache')).toBeLessThan(telo.indexOf('stahniSOpakovanim'));
      // A hlavně: žádné vynucené obcházení HTTP cache u neměnného souboru.
      expect(telo).not.toContain("cache: 'no-cache'");
    });

    it('otisk se pozná u kusů aplikace, ne u version.json a spol.', () => {
      const zdroj = source.match(/const JE_OTISK = (\/.+\/);/)?.[1];
      expect(zdroj).toBeTruthy();
      const re: RegExp = eval(zdroj!);
      for (const a of [
        '/assets/index-D4AU_CB0.js',
        '/assets/index-B4LPMgHR.css',
        '/assets/vendor-charts-gRZU2am8.js',
      ]) expect(re.test(a), a).toBe(true);
      // Tyhle MUSÍ zůstat network-first, jinak by appka nikdy nepoznala
      // novou verzi (version.json) ani neaktualizovala service worker.
      for (const a of [
        '/version.json', '/manifest.webmanifest', '/sw.js', '/index.html',
      ]) expect(re.test(a), a).toBe(false);
    });

    it('offline shell obsahuje i vstupní JS a CSS', () => {
      expect(source).toContain('const SHELL = []');
      expect(source).toContain('...SHELL,');
    });

    it('stylopis nekončí jako 503 — sáhne se i do cache jiné verze', () => {
      // Křížení verzí je jinde zakázané (starý JS + nové HTML = nefunkční
      // appka). U STYLŮ je to obráceně: o pár tříd starší vzhled je proti
      // žádnému vzhledu pořád čitelná, ovladatelná aplikace.
      expect(source).toContain('stylZJakekolivVerze');
      const fce = source.slice(source.indexOf('async function stylZJakekolivVerze'));
      expect(fce.slice(0, fce.indexOf('\n}'))).toContain('caches.keys()');
    });
  });

  describe('build doplňuje otisky do offline shellu', () => {
    const HTML = `<!doctype html><html><head>
      <script type="module" crossorigin src="/assets/index-D4AU_CB0.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/vendor-react-abc12345.js">
      <link rel="stylesheet" crossorigin href="/assets/index-B4LPMgHR.css">
    </head><body></body></html>`;

    it('vytáhne z index.html vstupní skript i stylopis', () => {
      expect(vytahniShell(HTML)).toEqual([
        './assets/index-D4AU_CB0.js',
        './assets/index-B4LPMgHR.css',
      ]);
    });

    it('nebere ostatní kusy z modulepreload — shell má zůstat malý', () => {
      expect(vytahniShell(HTML).join()).not.toContain('vendor-react');
    });

    it('vloží seznam na místo prázdného SHELL', () => {
      const out = vlozShell('const SHELL = [];\nconst PRECACHE = [];', ['./a.css']);
      expect(out).toContain("const SHELL = ['./a.css'];");
    });

    it('když v sw.js místo pro shell není, radši spadne', () => {
      // Tiché nevložení by znamenalo návrat k neúplnému shellu — tedy přesně
      // ta chyba, kvůli které tenhle skript vznikl.
      expect(() => vlozShell('žádné místo', ['./a.css'])).toThrow();
    });

    it('build ho opravdu pouští', () => {
      const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'));
      expect(pkg.scripts.build).toContain('shell-do-sw.mjs');
    });
  });
});
