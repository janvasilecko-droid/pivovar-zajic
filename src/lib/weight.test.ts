import { describe, it, expect } from 'vitest';
import { packageWeightKg, orderWeightKg } from './weight';
import type { Package } from './supabase';

const pkg = (id: string, kind: 'keg' | 'bottle', volume_l: number) => ({ id, kind, volume_l, label: `${volume_l}l` }) as unknown as Package;

describe('váha obalů', () => {
  it('sudy: objem + tára', () => {
    expect(packageWeightKg(pkg('a', 'keg', 50))).toBe(62);
    expect(packageWeightKg(pkg('a', 'keg', 30))).toBe(40);
    expect(packageWeightKg(pkg('a', 'keg', 15))).toBe(22.5);
  });
  it('skleněné lahve 0,5 l i 0,33 l: 550 g za kus', () => {
    expect(packageWeightKg(pkg('a', 'bottle', 0.5))).toBe(0.55);
    expect(packageWeightKg(pkg('a', 'bottle', 0.33))).toBe(0.55);
  });
  it('PET 1 l a 1,5 l se nemění', () => {
    expect(packageWeightKg(pkg('a', 'bottle', 1))).toBe(1);
    expect(packageWeightKg(pkg('a', 'bottle', 1.5))).toBe(1.5);
  });
  it('objednávka: 40 lahví 0,5 l = 22 kg', () => {
    expect(orderWeightKg([{ package_id: 'l', quantity: 40 }], [pkg('l', 'bottle', 0.5)])).toBeCloseTo(22, 5);
  });
});
