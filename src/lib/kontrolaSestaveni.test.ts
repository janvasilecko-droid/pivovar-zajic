// @vitest-environment node
// 🔎 Kontrola sestavení pro starší Android — část o /apk, stránce Instalace a stránce „Bez připojení“
// (scripts/zkontroluj-css-podlaha.mjs). V CI běží nad složkou dist; tady se zkouší na zdrojových souborech a na
// záměrně pokažených kopiích — kontrola, která nikdy nespadne, by nechránila nic.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — skript je .mjs bez typů, testují se jeho čisté funkce
import { zkontrolujRedirects, zkontrolujSw, zkontrolujInstalaci } from '../../scripts/zkontroluj-css-podlaha.mjs';

const REDIRECTS = readFileSync('public/_redirects', 'utf8');
const SW = readFileSync('public/sw.js', 'utf8');
const INSTALACE = readFileSync('public/instalace.html', 'utf8');
const URL_APK = 'https://github.com/janvasilecko-droid/pivovar-zajic/releases/latest/download/pivovar-zajic.apk';

describe('zkontrolujRedirects — /apk', () => {
  it('skutečný public/_redirects je v pořádku', () => {
    expect(zkontrolujRedirects(REDIRECTS)).toEqual([]);
  });

  it('chybějící pravidlo /apk se pozná', () => {
    const bez = REDIRECTS.split('\n').filter((r) => !r.startsWith('/apk')).join('\n');
    const p = zkontrolujRedirects(bez);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('nemá pravidlo pro /apk');
  });

  it('pravidlo za obecným /* se pozná (první shoda vyhrává)', () => {
    const p = zkontrolujRedirects(`/*  /index.html  200\n/apk  ${URL_APK}  302\n`);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('až za pravidlem');
  });

  it('trvalé přesměrování (301 nebo bez stavu) se pozná', () => {
    expect(zkontrolujRedirects(`/apk  ${URL_APK}  301\n/*  /index.html  200\n`)[0]).toContain('má být 302');
    expect(zkontrolujRedirects(`/apk  ${URL_APK}\n/*  /index.html  200\n`)[0]).toContain('má být 302');
  });

  it('jiný cíl než nejnovější APK se pozná (starý konkrétní soubor, jiné jméno, jiný server)', () => {
    for (const cil of [
      'https://github.com/janvasilecko-droid/pivovar-zajic/releases/download/v2.1044/pivovar-zajic.apk',
      'https://github.com/janvasilecko-droid/pivovar-zajic/releases/latest/download/app-debug.apk',
      'https://example.com/releases/latest/download/pivovar-zajic.apk',
      'http://github.com/janvasilecko-droid/pivovar-zajic/releases/latest/download/pivovar-zajic.apk',
    ]) {
      const p = zkontrolujRedirects(`/apk  ${cil}  302\n/*  /index.html  200\n`);
      expect(p, cil).toHaveLength(1);
      expect(p[0]).toContain('/apk míří na');
    }
  });

  it('zakomentované pravidlo se nepočítá', () => {
    expect(zkontrolujRedirects(`# /apk  ${URL_APK}  302\n/*  /index.html  200\n`)[0]).toContain('nemá pravidlo pro /apk');
  });

  it('bez obecného pravidla /* je /apk v pořádku', () => {
    expect(zkontrolujRedirects(`/apk  ${URL_APK}  302\n`)).toEqual([]);
  });
});

describe('zkontrolujSw — stránka „Bez připojení“', () => {
  it('skutečný public/sw.js je v pořádku', () => {
    expect(zkontrolujSw(SW)).toEqual([]);
  });

  it('návrat k holému „Offline“ v navigaci se pozná', () => {
    const stary = SW.replace('return fallback || odpovedOffline();', "return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });");
    expect(stary).not.toBe(SW);
    const p = zkontrolujSw(stary);
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('Navigace v sw.js');
  });

  it('chybějící stránka se pozná', () => {
    const bez = SW.replace('const STRANKA_OFFLINE = `', 'const JINA_PROMENNA = `');
    expect(bez).not.toBe(SW);
    expect(zkontrolujSw(bez).some((x) => x.includes('STRANKA_OFFLINE'))).toBe(true);
  });
});

describe('zkontrolujInstalaci — stránka Instalace v dist', () => {
  it('skutečná public/instalace.html je v pořádku', () => {
    expect(zkontrolujInstalaci(INSTALACE)).toEqual([]);
  });

  it('odkaz ke stažení jinam než na /apk se pozná', () => {
    const p = zkontrolujInstalaci(INSTALACE.replace('id="stahnout" href="/apk"', 'id="stahnout" href="/jinam"'));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('/apk');
  });

  it('stránka bez skriptu, který pozná telefon, se pozná', () => {
    const p = zkontrolujInstalaci(INSTALACE.replace('window.__instalace', 'window.__neco'));
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('skript');
  });
});
