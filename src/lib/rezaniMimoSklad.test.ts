import { describe, expect, it } from 'vitest';
import { jeMimoSklad, vyslednePivoRezu, ZNACKA_MIMO_SKLAD } from './rezani';
import { buildMovements } from './stockLedger';

const piva = [{ id: 'a', name: '12° Světlá' }, { id: 'b', name: '10° Desítka' }, { id: 'c', name: '11° Světlá' }];

describe('řez 12° + 10°', () => {
  it('dá 11°', () => {
    expect(vyslednePivoRezu('a', 'b', piva)).toBe('c');
    expect(vyslednePivoRezu('a', 'a', piva)).toBeNull();
    expect(vyslednePivoRezu('a', null, piva)).toBeNull();
  });
  it('značka mimo sklad', () => {
    expect(jeMimoSklad(`Řez: x · ${ZNACKA_MIMO_SKLAD}`)).toBe(true);
    expect(jeMimoSklad('Řez: x')).toBe(false);
  });
});

it('sudy mimo sklad se do pohybů nezapočítají', () => {
  const r = (note: string) => ({ entry_date: '2026-10-19', beer_id: 'c', package_id: 'k30', quantity: 7, note }) as any;
  const m = buildMovements({ keggingRows: [r('Řez: x [mimo-sklad]'), r('Řez: y')] } as any);
  expect(m.filter((x) => x.kind === 'kegovani')).toHaveLength(1);
});
