// 📱 Upozornění na starší prohlížeč v telefonu — kdy se ukáže, jak často a co řekne.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const varovani = vi.fn();
vi.mock('./toast', () => ({ varovani: (...a: unknown[]) => varovani(...a) }));

import { upozorniNaStarySystem, textUpozorneni, ODSTUP_MS, ADRESA_DIAGNOSTIKY } from './upozorneniStarehoTelefonu';

const ua = (chrome: number) =>
  `Mozilla/5.0 (Linux; Android 9; SM-J530F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome}.0.0.0 Mobile Safari/537.36`;
const KLIC = 'minipivovar_stary_prohlizec_upozorneno';
const NYNI = Date.UTC(2026, 10, 25, 12, 0, 0);

beforeEach(() => { varovani.mockClear(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('upozorniNaStarySystem', () => {
  it('moderní prohlížeč (Chrome 130, 90) nevidí nic a nic se nezapíše', () => {
    for (const v of [130, 90]) {
      expect(upozorniNaStarySystem(ua(v), NYNI)).toBe(false);
    }
    expect(varovani).not.toHaveBeenCalled();
    expect(localStorage.getItem(KLIC)).toBeNull();
  });

  it('prohlížeč, který není Chromium (Firefox, Safari), nevidí nic', () => {
    expect(upozorniNaStarySystem('Mozilla/5.0 (Android 11; Mobile; rv:109.0) Gecko/109.0 Firefox/115.0', NYNI)).toBe(false);
    expect(upozorniNaStarySystem('', NYNI)).toBe(false);
    expect(varovani).not.toHaveBeenCalled();
  });

  it('starší prohlížeč (Chrome 74, 89, 66) uvidí upozornění s odkazem na diagnostiku', () => {
    for (const v of [74, 89, 66]) {
      varovani.mockClear();
      localStorage.clear();
      expect(upozorniNaStarySystem(ua(v), NYNI), `Chrome ${v}`).toBe(true);
      expect(varovani).toHaveBeenCalledTimes(1);
      const [text, opce] = varovani.mock.calls[0];
      expect(text).toBe(textUpozorneni(ua(v)));
      expect(text).toContain(`Chrome ${v}`);
      expect(opce.trvani).toBe(20000);
      expect(opce.akce.label).toBe('Diagnostika telefonu');
    }
  });

  it('prohlížeč pod podlahou (Chrome 65) upozornění nedostane — aplikace se tam stejně nespustí', () => {
    expect(upozorniNaStarySystem(ua(65), NYNI)).toBe(false);
    expect(varovani).not.toHaveBeenCalled();
  });

  it('text říká, co s tím: aktualizovat WebView a Chrome, a od jaké verze je to v pořádku', () => {
    const t = textUpozorneni(ua(74));
    expect(t).toContain('Prohlížeč v tomhle telefonu je starší (Chrome 74)');
    expect(t).toContain('Android System WebView');
    expect(t).toContain('Obchodě Play');
    expect(t).toContain('od verze 90');
  });

  it('podruhé se neukáže dřív než za 14 dní, přesně po 14 dnech zase ano', () => {
    expect(upozorniNaStarySystem(ua(74), NYNI)).toBe(true);
    expect(upozorniNaStarySystem(ua(74), NYNI + 1000)).toBe(false);
    expect(upozorniNaStarySystem(ua(74), NYNI + ODSTUP_MS - 1)).toBe(false);
    expect(varovani).toHaveBeenCalledTimes(1);
    expect(ODSTUP_MS).toBe(14 * 24 * 60 * 60 * 1000);
    expect(upozorniNaStarySystem(ua(74), NYNI + ODSTUP_MS)).toBe(true);
    expect(varovani).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(KLIC)).toBe(String(NYNI + ODSTUP_MS));
  });

  it('poškozený zápis v úložišti se bere jako „ještě nikdy“', () => {
    for (const hlava of ['abc', '', '0', '-5', 'NaN']) {
      varovani.mockClear();
      localStorage.setItem(KLIC, hlava);
      expect(upozorniNaStarySystem(ua(74), NYNI), `zápis „${hlava}“`).toBe(true);
    }
  });

  it('nejdřív se zapíše, pak ukáže: když se zápis nepovede, neukáže se nic (jinak by otravovalo při každém startu)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('plné úložiště'); });
    expect(upozorniNaStarySystem(ua(74), NYNI)).toBe(false);
    expect(varovani).not.toHaveBeenCalled();
  });

  it('když se úložiště nedá ani číst, upozornění se přesto ukáže (zápis proběhl)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('zakázáno'); });
    expect(upozorniNaStarySystem(ua(74), NYNI)).toBe(true);
  });

  it('bez předaného řetězce používá prohlížeč, ve kterém běží', () => {
    vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(ua(74));
    expect(upozorniNaStarySystem()).toBe(true);
    expect(varovani).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem(KLIC))).toBeGreaterThan(Date.now() - 5000);
  });

  it('tlačítko v upozornění otevře Diagnostiku telefonu', () => {
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, configurable: true });
    upozorniNaStarySystem(ua(74), NYNI);
    varovani.mock.calls[0][1].akce.onClick();
    expect(assign).toHaveBeenCalledWith('/diagnostika.html');
    expect(ADRESA_DIAGNOSTIKY).toBe('/diagnostika.html');
  });
});

describe('zapojení v main.tsx', () => {
  it('main.tsx zavolá upozornění až po startu (se zpožděním), ne při načtení modulu', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main).toContain("import { upozorniNaStarySystem } from './lib/upozorneniStarehoTelefonu';");
    expect(main).toMatch(/setTimeout\(\(\) => upozorniNaStarySystem\(\), \d{4,}\);/);
  });
});
