// @vitest-environment node
import { clearTimeout as nodeClearTimeout, setTimeout as nodeSetTimeout } from 'node:timers';
import { describe, expect, it } from 'vitest';
import { hlidejCasovace } from './casovace';

/**
 * Vlastní cíl s PŮVODNÍMI časovači Node (globální setTimeout už obaluje
 * src/test/setup.ts) — každý test má čerstvý obal a vlastní evidenci.
 */
function cil() {
  return { setTimeout: nodeSetTimeout, clearTimeout: nodeClearTimeout } as unknown as Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'>;
}
const pockej = (ms: number) => new Promise((ok) => nodeSetTimeout(ok, ms));

describe('hlídání časovačů po konci testového souboru', () => {
  it('zrusBezici zruší časovač, který ještě neproběhl — callback se už nezavolá', async () => {
    const c = cil();
    const hlidac = hlidejCasovace(c);
    let zavolano = 0;
    c.setTimeout(() => { zavolano++; }, 20);
    expect(hlidac.zrusBezici()).toBe(1);
    await pockej(60);
    expect(zavolano).toBe(0);
  });

  it('proběhlý ani ručně zrušený časovač se nepočítá; argumenty a návratová hodnota sedí', async () => {
    const c = cil();
    const hlidac = hlidejCasovace(c);
    const prijato: unknown[] = [];
    c.setTimeout((a: unknown, b: unknown) => { prijato.push(a, b); }, 1, 'a', 2);
    const zruseny = c.setTimeout(() => { prijato.push('nemelo'); }, 5);
    c.clearTimeout(zruseny);
    await pockej(30);
    expect(prijato).toEqual(['a', 2]);
    expect(hlidac.zrusBezici()).toBe(0);
  });

  it('opakované zapnutí nad stejným cílem obal nevrší a sdílí evidenci', () => {
    const c = cil();
    const prvni = hlidejCasovace(c);
    const obal = c.setTimeout;
    const druhy = hlidejCasovace(c);
    expect(c.setTimeout).toBe(obal);
    c.setTimeout(() => {}, 1000);
    expect(druhy.zrusBezici()).toBe(1);
    expect(prvni.zrusBezici()).toBe(0);
  });
});
