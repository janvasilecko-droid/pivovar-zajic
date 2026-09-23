import { describe, it, expect } from 'vitest';
import { sestavCoNalozit } from './coNalozit';

const obaly = [
  { id: 'k50', label: 'KEG 50l', kind: 'keg' },
  { id: 'k30', label: 'KEG 30l', kind: 'keg' },
  { id: 'pet1', label: 'PET 1l', kind: 'bottle' },
];
const zkrat = (l: string) => l.replace(/^(KEG|PET|Lahve)\s+/i, '');

describe('sestavCoNalozit', () => {
  // 🔴 Z provozu 22. 9. 2026: „mám tam 10×50 12sv a 3×50 12sv, ale píše mi
  // naložit jen 10×50". Byly to dva řádky — sčítalo se podle TEXTU popisku
  // a `beer_name` se u obou objednávek lišil.
  it('stejné pivo a obal ze dvou objednávek se sečte do JEDNOHO řádku', () => {
    const r = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 10 },
      { beer_id: 'b12', beer_name: '12 sv', package_id: 'k50', quantity: 3 },
    ], obaly, zkrat);
    expect(r.kegs).toHaveLength(1);
    expect(r.kegs[0].qty).toBe(13);
    expect(r.totalKegs).toBe(13);
    expect(r.totalCount).toBe(13);
  });

  it('různá piva ve stejném obalu zůstanou oddělená', () => {
    const r = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 10 },
      { beer_id: 'b10', beer_name: '10° Desítka', package_id: 'k50', quantity: 3 },
    ], obaly, zkrat);
    expect(r.kegs).toHaveLength(2);
    expect(r.totalKegs).toBe(13);
  });

  it('stejné pivo v různém obalu zůstane oddělené', () => {
    const r = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 10 },
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k30', quantity: 3 },
    ], obaly, zkrat);
    expect(r.kegs).toHaveLength(2);
    expect(r.totalKegs).toBe(13);
  });

  it('sudy a lahve se počítají zvlášť', () => {
    const r = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 4 },
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'pet1', quantity: 24 },
    ], obaly, zkrat);
    expect(r.totalKegs).toBe(4);
    expect(r.totalBottles).toBe(24);
    expect(r.totalCount).toBe(28);
    expect(r.totalLabels).toBe(2);
  });

  it('bez beer_id se sloučí aspoň podle názvu (starší záznamy)', () => {
    const r = sestavCoNalozit([
      { beer_name: 'Jantar', package_id: 'k50', quantity: 2 },
      { beer_name: ' jantar ', package_id: 'k50', quantity: 1 },
    ], obaly, zkrat);
    expect(r.kegs).toHaveLength(1);
    expect(r.kegs[0].qty).toBe(3);
  });

  it('nachystáno se sčítá taky — řádek je hotový, až když sedí celý', () => {
    const r = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 10, is_prepared: true },
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 3 },
    ], obaly, zkrat);
    expect(r.kegs[0].qty).toBe(13);
    expect(r.kegs[0].preparedQty).toBe(10);
    expect(r.preparedCount).toBe(0); // 10 z 13 → ještě ne

    const hotovo = sestavCoNalozit([
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 10, is_prepared: true },
      { beer_id: 'b12', beer_name: '12° Světlá', package_id: 'k50', quantity: 3, is_prepared: true },
    ], obaly, zkrat);
    expect(hotovo.preparedCount).toBe(1);
  });

  it('prázdný závoz nespadne', () => {
    const r = sestavCoNalozit([], obaly, zkrat);
    expect(r.totalCount).toBe(0);
    expect(r.kegs).toEqual([]);
  });
});
