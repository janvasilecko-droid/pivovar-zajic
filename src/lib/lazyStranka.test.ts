import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { jeChybaNacteniKusu } from './lazyStranka';

// 🛑 „Automatická oprava" v main.tsx maže kopii aplikace uloženou v telefonu a načítá ji celou znovu.
// Smí ji spustit jen chyba načtení KUSU aplikace (starý kus po nasazení) — ne jakékoliv selhání sítě.
// Dřív stačilo „Failed to fetch" kdekoliv: bez signálu si appka sama smazala všechno, z čeho běží
// (změřeno 28. 11. 2026, docs/offline.md).
describe('jeChybaNacteniKusu', () => {
  it.each([
    ['Chrome', 'Failed to fetch dynamically imported module: https://zajic-pivovar.pages.dev/assets/Sklad-AbCdEf12.js'],
    ['Firefox', 'error loading dynamically imported module: https://zajic-pivovar.pages.dev/assets/Sklad-AbCdEf12.js'],
    ['Safari', 'Importing a module script failed.'],
  ])('pozná chybu načtení kusu (%s)', (_prohlizec, zprava) => {
    expect(jeChybaNacteniKusu(new TypeError(zprava))).toBe(true);
    expect(jeChybaNacteniKusu(zprava)).toBe(true);
  });

  it.each([
    'Failed to fetch',
    'TypeError: Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'Load failed',
    'JWT expired',
    '',
  ])('holé selhání sítě to není: „%s"', (zprava) => {
    expect(jeChybaNacteniKusu(new TypeError(zprava))).toBe(false);
  });

  it('nespadne na ničem', () => {
    for (const x of [null, undefined, 0, {}, { message: null }]) expect(jeChybaNacteniKusu(x)).toBe(false);
  });
});

describe('main.tsx — automatická oprava', () => {
  const zdroj = readFileSync('src/main.tsx', 'utf8');

  it('rozhoduje se podle chyby načtení kusu, ne podle holého „Failed to fetch"', () => {
    expect(zdroj).not.toMatch(/includes\(['"]Failed to fetch['"]\)/);
    expect(zdroj.match(/if \(jeChybaNacteniKusu\(/g)).toHaveLength(2);
  });

  it('každé volání forceRefresh si vyřídí výsledek (bez spojení se nic nenačítá)', () => {
    expect(zdroj).not.toMatch(/void forceRefresh\(\);/);
    expect(zdroj).toMatch(/async function opravNactenimZnovu\(reloadKey: string\)[\s\S]{0,300}vysledek !== 'obnovuji'[\s\S]{0,80}sessionStorage\.removeItem\(reloadKey\)/);
  });
});
