import { describe, it, expect } from 'vitest';
import { soucetUlozenehoDnes } from './jizUlozeno';

const z = (entry_date: string, beer_id: string, package_id: string, quantity: number) =>
  ({ entry_date, beer_id, package_id, quantity });

describe('soucetUlozenehoDnes', () => {
  it('sečte víc uložení téhož dne, piva a obalu — přesně případ „teď 5, za chvíli 3"', () => {
    const radky = [z('2026-09-08', 'b1', 'p50', 5), z('2026-09-08', 'b1', 'p50', 3)];
    expect(soucetUlozenehoDnes(radky, '2026-09-08', 'b1', 'p50')).toBe(8);
  });

  it('nesčítá jiný den', () => {
    const radky = [z('2026-09-07', 'b1', 'p50', 5), z('2026-09-08', 'b1', 'p50', 3)];
    expect(soucetUlozenehoDnes(radky, '2026-09-08', 'b1', 'p50')).toBe(3);
  });

  it('nesčítá jiné pivo ani jiný obal', () => {
    const radky = [z('2026-09-08', 'b2', 'p50', 5), z('2026-09-08', 'b1', 'p30', 5)];
    expect(soucetUlozenehoDnes(radky, '2026-09-08', 'b1', 'p50')).toBe(0);
  });

  it('bez záznamů je nula', () => {
    expect(soucetUlozenehoDnes([], '2026-09-08', 'b1', 'p50')).toBe(0);
  });
});
