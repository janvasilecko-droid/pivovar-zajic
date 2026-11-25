// @vitest-environment node
// 📱 Nastavení APK (Capacitor) pro starší Android — minimální WebView a místní chybová stránka.
// ---------------------------------------------------------------------------
// APK jen načítá živý web (server.url) v systémovém WebView. Capacitor má vestavěnou kontrolu verze WebView, ale
// když je starší než minimum a není nastavená chybová stránka, jen zapíše řádek do logu a načte web stejně —
// člověk vidí bílou obrazovku (25. 11. 2026, starší telefon šéfa). Chybová stránka je diagnostika.html, která je
// v APK zabalená, takže se ukáže i bez internetu.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { PODLAHA_CHROME } from './podlahaProhlizece';
import { ODKAZ_APLIKACE } from './odkazAplikace';

const KONFIG = JSON.parse(readFileSync('capacitor.config.json', 'utf8')) as {
  webDir: string;
  server: { url: string; errorPath?: string; androidScheme?: string };
  android?: { minWebViewVersion?: number };
};

describe('capacitor.config.json — starší Android', () => {
  it('nejnižší WebView je stejná podlaha jako v lib/podlahaProhlizece.ts', () => {
    expect(KONFIG.android?.minWebViewVersion).toBe(PODLAHA_CHROME);
    // Capacitor hodnoty pod 55 přepíše výchozí — číslo musí být nad touhle hranicí, jinak nastavení nic neznamená.
    expect(KONFIG.android!.minWebViewVersion!).toBeGreaterThanOrEqual(55);
  });

  it('chybová stránka je diagnostika.html a soubor opravdu existuje v public/ (a tím se zabalí do APK)', () => {
    expect(KONFIG.server.errorPath).toBe('diagnostika.html');
    expect(existsSync(`public/${KONFIG.server.errorPath}`)).toBe(true);
  });

  it('APK dál načítá živý web přes https (nic se nezměnilo mimo chybovou stránku)', () => {
    expect(KONFIG.server.url).toBe(ODKAZ_APLIKACE.replace(/\/$/, ''));
    expect(KONFIG.server.androidScheme).toBe('https');
    expect(KONFIG.webDir).toBe('dist');
  });

  it('nejnižší Android pro APK je 7 (API 24) a diagnostika to říká lidem správně', () => {
    const gradle = readFileSync('android/variables.gradle', 'utf8');
    expect(/minSdkVersion\s*=\s*24\b/.test(gradle), 'minSdkVersion v android/variables.gradle není 24 — uprav i texty (diagnostika.html, InstalaceKroky, NavodPouziti, README)').toBe(true);
    expect(readFileSync('public/diagnostika.html', 'utf8')).toContain('potřebuje Android 7');
    expect(readFileSync('src/components/InstalaceKroky.tsx', 'utf8')).toContain('APK potřebuje Android 7');
  });
});
