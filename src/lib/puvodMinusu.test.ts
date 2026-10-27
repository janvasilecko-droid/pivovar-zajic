import { describe, expect, it } from 'vitest';
import { puvodStavu } from './puvodMinusu';

describe('puvodStavu', () => {
  it('od poslední inventury, s průběžným stavem; Michal Fojtovice je od 27. 10. 2026 obyčejný závoz', () => {
    const pohyby: any[] = [
      { date: '2026-09-01', beer_id: 'sv', package_id: 'k50', qty: 5, kind: 'inventura' },
      { date: '2026-09-30', beer_id: 'sv', package_id: 'k50', qty: 4, kind: 'inventura' },
      { date: '2026-10-06', beer_id: 'sv', package_id: 'k50', qty: 6, kind: 'kegovani' },
      { date: '2026-10-07', beer_id: 'sv', package_id: 'k50', qty: -10, kind: 'zavoz', orderId: 'dd' },
      { date: '2026-10-08', beer_id: 'sv', package_id: 'k50', qty: -12, kind: 'zavoz', orderId: 'h' },
      { date: '2026-10-12', beer_id: 'sv', package_id: 'k50', qty: -1, kind: 'zavoz', orderId: 'h' },
      { date: '2026-10-07', beer_id: 'tm', package_id: 'k50', qty: -3, kind: 'zavoz', orderId: 'h' },
    ];
    const r = puvodStavu(pohyby, 'sv', 'k50', '2026-10-09', new Map([['dd', 'Michal Fojtovice'], ['h', 'Hospoda']]));
    expect(r.map((x) => [x.popis, x.kusu, x.stavPo, x.vlastniSudy])).toEqual([
      ['Inventura = 4', 4, 4, false],
      ['Stočeno (sudy)', 6, 10, false],
      ['Závoz Michal Fojtovice', -10, 0, false],
      ['Závoz Hospoda', -12, -12, false],
    ]);
  });
});

// Vlastní sudy odběratelů jsou zrušené (27. 10. 2026, lib/vlastniSudy.ts).
describe('puvodStavu — poznámka objednávky', () => {
  it('poznámka „do jejich sudu“ už závoz neoznačí jako vlastní sudy', () => {
    const pohyby: any[] = [
      { date: '2026-10-06', beer_id: 'sv', package_id: 'k20', qty: 2, kind: 'kegovani' },
      { date: '2026-10-07', beer_id: 'sv', package_id: 'k20', qty: -1, kind: 'zavoz', orderId: 'e' },
    ];
    const misto = new Map([['e', 'EGON']]);
    const bez = puvodStavu(pohyby, 'sv', 'k20', '2026-10-09', misto);
    const s = puvodStavu(pohyby, 'sv', 'k20', '2026-10-09', misto, new Map([['e', 'do jejich sudu']]));
    expect(bez.map((x) => x.vlastniSudy)).toEqual([false, false]);
    expect(s.map((x) => x.vlastniSudy)).toEqual([false, false]);
  });
});
