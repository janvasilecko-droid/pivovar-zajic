import { describe, it, expect } from 'vitest';
import { denniRozpad, dnyObdobi } from './rozkladSkladu';
import type { Movement } from './stockLedger';

const PIVO = 'pivo-10';
const KEG50 = 'keg-50';

function pohyb(date: string, qty: number, kind: Movement['kind'], extra: Partial<Movement> = {}): Movement {
  return { date, beer_id: PIVO, package_id: KEG50, qty, kind, ...extra };
}

describe('dnyObdobi', () => {
  it('vypíše všechny dny od-do včetně krajů', () => {
    expect(dnyObdobi('2026-09-07', '2026-09-13')).toEqual([
      '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13',
    ]);
  });

  it('jeden den vrátí jednoprvkové pole', () => {
    expect(dnyObdobi('2026-09-07', '2026-09-07')).toEqual(['2026-09-07']);
  });
});

describe('denniRozpad', () => {
  // Z provozu: 4×50l stočeno v pondělí, ve středu 1×50l na objednávku,
  // ve čtvrtek 1×50l spotřebovaný jako zdroj na lahve → na skladě zůstávají 2.
  const pohyby: Movement[] = [
    pohyb('2026-09-07', 4, 'kegovani'),
    pohyb('2026-09-09', -1, 'zavoz', { orderId: 'obj-1' }),
    pohyb('2026-09-10', -1, 'sud_na_lahve'),
  ];

  it('rozdělí pohyby po dnech a spočítá běžící stav', () => {
    const dny = denniRozpad(pohyby, PIVO, KEG50, '2026-09-07', '2026-09-13');
    expect(dny).toHaveLength(7);
    expect(dny[0]).toMatchObject({ datum: '2026-09-07', stavNaZacatku: 0, stavNaKonci: 4 });
    expect(dny[2]).toMatchObject({ datum: '2026-09-09', stavNaZacatku: 4, stavNaKonci: 3 });
    expect(dny[3]).toMatchObject({ datum: '2026-09-10', stavNaZacatku: 3, stavNaKonci: 2 });
    expect(dny[6].stavNaKonci).toBe(2);
  });

  it('den bez pohybu zůstává na stejném stavu a nemá žádné řádky', () => {
    const dny = denniRozpad(pohyby, PIVO, KEG50, '2026-09-07', '2026-09-13');
    expect(dny[1].pohyby).toEqual([]);
    expect(dny[1].stavNaZacatku).toBe(dny[1].stavNaKonci);
  });

  it('nese celý pohyb (i orderId) v den kdy nastal', () => {
    const dny = denniRozpad(pohyby, PIVO, KEG50, '2026-09-07', '2026-09-13');
    expect(dny[2].pohyby).toEqual([pohyb('2026-09-09', -1, 'zavoz', { orderId: 'obj-1' })]);
  });

  it('jiné pivo nebo obal do rozpadu nespadnou', () => {
    const smisene: Movement[] = [...pohyby, pohyb('2026-09-07', 99, 'kegovani', { beer_id: 'jine-pivo' }), pohyb('2026-09-07', 99, 'kegovani', { package_id: 'keg-30' })];
    const dny = denniRozpad(smisene, PIVO, KEG50, '2026-09-07', '2026-09-13');
    expect(dny[0].stavNaKonci).toBe(4);
  });

  it('zohledňuje inventuru před obdobím jako reset stavu', () => {
    const sReset: Movement[] = [
      { date: '2026-09-05', beer_id: PIVO, package_id: KEG50, qty: 10, kind: 'inventura', note: 'Fyzická' },
      ...pohyby,
    ];
    const dny = denniRozpad(sReset, PIVO, KEG50, '2026-09-07', '2026-09-13');
    expect(dny[0].stavNaZacatku).toBe(10);
    expect(dny[6].stavNaKonci).toBe(12);
  });
});
