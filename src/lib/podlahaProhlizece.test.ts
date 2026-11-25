// 📱 Podlaha prohlížeče — verze Chromu z řetězce prohlížeče a hranice „nepodporovaný / starý / v pořádku“.
import { describe, it, expect } from 'vitest';
import { PODLAHA_CHROME, DOPORUCENO_CHROME, verzeChromu, stavProhlizece } from './podlahaProhlizece';

const ua = (chrome: string, android = '10') =>
  `Mozilla/5.0 (Linux; Android ${android}; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Mobile Safari/537.36`;

describe('verzeChromu', () => {
  it('přečte hlavní verzi z Chromu, WebView i Chromium', () => {
    expect(verzeChromu(ua('130.0.0.0'))).toBe(130);
    expect(verzeChromu(ua('58.0.3029.83', '7.0'))).toBe(58);
    expect(verzeChromu('Mozilla/5.0 (Linux; Android 7.0; wv) AppleWebKit/537.36 Version/4.0 Chrome/86.0.4240.198 Mobile Safari/537.36')).toBe(86);
    expect(verzeChromu('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chromium/118.0.5993.88 Chrome/118.0.5993.88 Safari/537.36')).toBe(118);
  });
  it('u jiných prohlížečů vrací null — verzi nehádá', () => {
    expect(verzeChromu('Mozilla/5.0 (Android 11; Mobile; rv:109.0) Gecko/109.0 Firefox/115.0')).toBeNull();
    expect(verzeChromu('Mozilla/5.0 (iPhone; CPU iPhone OS 9_3 like Mac OS X) AppleWebKit/601.1.46 Version/9.0 Mobile/13E233 Safari/601.1')).toBeNull();
    expect(verzeChromu('')).toBeNull();
  });
});

describe('stavProhlizece', () => {
  it('hranice: pod podlahou nepodporovaný, od podlahy starý, od doporučené verze v pořádku', () => {
    expect(stavProhlizece(ua(`${PODLAHA_CHROME - 1}.0.0.0`))).toBe('nepodporovany');
    expect(stavProhlizece(ua(`${PODLAHA_CHROME}.0.0.0`))).toBe('stary');
    expect(stavProhlizece(ua(`${DOPORUCENO_CHROME - 1}.0.0.0`))).toBe('stary');
    expect(stavProhlizece(ua(`${DOPORUCENO_CHROME}.0.0.0`))).toBe('v-poradku');
    expect(stavProhlizece(ua('150.0.0.0'))).toBe('v-poradku');
  });
  it('prohlížeč, který není Chromium, je „neznámý“', () => {
    expect(stavProhlizece('Mozilla/5.0 (Android 11; Mobile; rv:109.0) Gecko/109.0 Firefox/115.0')).toBe('neznamy');
  });
  it('podlaha a doporučená verze dávají smysl (podlaha < doporučená)', () => {
    expect(PODLAHA_CHROME).toBeLessThan(DOPORUCENO_CHROME);
    expect(PODLAHA_CHROME).toBeGreaterThanOrEqual(66); // AbortController — viz podlahaProhlizece.ts
  });
});
