import { describe, expect, it } from 'vitest';
import { puvodStavu } from './puvodMinusu';

describe('puvodStavu', () => {
  it('od poslední inventury, s průběžným stavem a závozem odběratele s vlastními sudy', () => {
    const pohyby: any[] = [
      { date: '2026-09-01', beer_id: 'sv', package_id: 'k50', qty: 5, kind: 'inventura' },
      { date: '2026-09-30', beer_id: 'sv', package_id: 'k50', qty: 4, kind: 'inventura' },
      { date: '2026-10-06', beer_id: 'sv', package_id: 'k50', qty: 6, kind: 'kegovani' },
      { date: '2026-10-07', beer_id: 'sv', package_id: 'k50', qty: -10, kind: 'zavoz', orderId: 'dd' },
      { date: '2026-10-08', beer_id: 'sv', package_id: 'k50', qty: -12, kind: 'zavoz', orderId: 'h' },
      { date: '2026-10-12', beer_id: 'sv', package_id: 'k50', qty: -1, kind: 'zavoz', orderId: 'h' },
      { date: '2026-10-07', beer_id: 'tm', package_id: 'k50', qty: -3, kind: 'zavoz', orderId: 'h' },
    ];
    const r = puvodStavu(pohyby, 'sv', 'k50', '2026-10-09', new Map([['dd', 'Duck and Dog'], ['h', 'Hospoda']]));
    expect(r.map((x) => [x.popis, x.kusu, x.stavPo, x.vlastniSudy])).toEqual([
      ['Inventura = 4', 4, 4, false],
      ['Stočeno (sudy)', 6, 10, false],
      ['Závoz Duck and Dog', -10, 0, true],
      ['Závoz Hospoda', -12, -12, false],
    ]);
  });
});
