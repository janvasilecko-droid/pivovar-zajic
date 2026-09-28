// Rychlé odpočty v liště na ploše (28. 9. 2026): CO2 2 min, kotel 2 min,
// malý sud 8 min, velký sud 15 min.
import { describe, it, expect } from 'vitest';
import { RYCHLE_ODPOCTY, prepniRychlyOdpocet, rychlyBezi, rychlyZbyva } from './rychleOdpocty';
import { zastavOdpocetVSeznamu, CO2_ID } from './co2Foukani';

const MIN = 60_000;

describe('rychlé odpočty', () => {
  it('mají délky podle zadání', () => {
    expect(RYCHLE_ODPOCTY.map((r) => [r.kratce, r.delkaMs / MIN])).toEqual([
      ['CO2', 2], ['Kotel', 2], ['Malý sud', 8], ['Velký sud', 15],
    ]);
  });

  it('klepnutí spustí, další zastaví a odpočet zmizí', () => {
    const ted = 1_000_000;
    const bezi = prepniRychlyOdpocet([], 'rychly-sud-velky', ted);
    expect(rychlyBezi(bezi, 'rychly-sud-velky')).toBe(true);
    expect(bezi[0].targetAt).toBe(ted + 15 * MIN);
    expect(prepniRychlyOdpocet(bezi, 'rychly-sud-velky', ted)).toEqual([]);
  });

  it('CO2 z lišty je tentýž odpočet jako dlaždice CO2', () => {
    const bezi = prepniRychlyOdpocet([], CO2_ID);
    expect(bezi[0].id).toBe(CO2_ID);
  });

  it('běží víc naráz a jeden neshodí druhý', () => {
    let l = prepniRychlyOdpocet([], 'rychly-kotel');
    l = prepniRychlyOdpocet(l, 'rychly-sud-maly');
    expect(l.map((t) => t.id).sort()).toEqual(['rychly-kotel', 'rychly-sud-maly']);
    l = prepniRychlyOdpocet(l, 'rychly-kotel');
    expect(l.map((t) => t.id)).toEqual(['rychly-sud-maly']);
  });

  it('klepnutí na pásek upozornění rychlý odpočet smaže (jako CO2)', () => {
    const l = prepniRychlyOdpocet([], 'rychly-sud-maly');
    expect(zastavOdpocetVSeznamu(l, 'rychly-sud-maly')).toEqual([]);
  });

  it('neběžící ukazuje celou délku', () => {
    expect(rychlyZbyva([], 'rychly-sud-maly')).toBe(8 * MIN);
  });
});
