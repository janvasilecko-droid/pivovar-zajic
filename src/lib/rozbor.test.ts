import { describe, expect, it } from 'vitest';
import { radkyRozboru } from './rozbor';
import { buildMovements, stockAsOf } from './stockLedger';
import { rozdilSkladu, sestavPohybyObdobi } from './pohybySkladu';
import { computeKeggingPlan, mergeWeekPlan } from './keggingPlan';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';
import { tydenniDoSkladu } from './tydenniInventura';

const piva = [{ id: 'tm', name: 'Tmavé' }, { id: 'sv', name: '12° Světlá' }];
const obaly = [{ id: 'l033', label: 'Lahev 0,33 l' }, { id: 'k50', label: 'KEG 50l' }];

describe('Rozbor', () => {
  it('ukáže i stočené lahve bez objednávky (9. 10. 2026)', () => {
    const r = radkyRozboru({
      planSudy: [{ key: 'sv__k50', beer_id: 'sv', beer_name: '12° Světlá', package_id: 'k50', package_label: 'KEG 50l', ordered: 4, missing: 1 }],
      planLahve: [],
      kegging: [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k50', quantity: 3 }, { entry_date: '2026-10-01', beer_id: 'sv', package_id: 'k50', quantity: 9 }],
      bottling: [{ entry_date: '2026-10-07', beer_id: 'tm', package_id: 'l033', quantity: 100 }],
      od: '2026-10-05',
      doDne: '2026-10-11',
      zasoba: new Map([['tm__l033', 100], ['sv__k50', 2]]),
      piva,
      obaly,
    });
    expect(r).toEqual([
      expect.objectContaining({ key: 'sv__k50', stoceno: 3, objednano: 4, stocit: 1, skladem: 2, lahve: false }),
      expect.objectContaining({ key: 'tm__l033', beer_name: 'Tmavé', package_label: 'Lahev 0,33 l', stoceno: 100, objednano: 0, stocit: 0, skladem: 100, lahve: true }),
    ]);
  });
});

describe('Rozbor — týdenní inventura (11. 10. 2026)', () => {
  it('ukáže napočítaný počet u položky i položku jen s napočítaným počtem', () => {
    const r = radkyRozboru({
      planSudy: [], planLahve: [],
      kegging: [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k50', quantity: 3 }],
      bottling: [],
      od: '2026-10-05', doDne: '2026-10-11',
      piva, obaly: [...obaly.map((o) => ({ ...o, kind: o.id === 'k50' ? 'keg' : 'bottle' }))],
      inventura: new Map([
        ['sv__k50', { kusu: 7, den: '2026-10-06', minulyTyden: false }],
        ['tm__l033', { kusu: 40, den: '2026-10-06', minulyTyden: false }],
      ]),
    });
    expect(r.find((x) => x.key === 'sv__k50')!.inventura).toEqual({ kusu: 7, den: '2026-10-06', minulyTyden: false });
    expect(r.find((x) => x.key === 'tm__l033')).toEqual(expect.objectContaining({ stoceno: 0, objednano: 0, lahve: true, inventura: expect.objectContaining({ kusu: 40 }) }));
  });
});

describe('fasování prodejny před inventurou (26. 10. 2026)', () => {
  const OD = '2026-10-19';
  const PATEK = '2026-10-23';
  const INVENTURA = '2026-10-25';
  const DEN = '2026-10-26';
  const piva = [{ id: 'sv', name: '12° Světlá' }];
  const obaly = [{ id: 'l033', label: '0,33 l', kind: 'bottle', volume_l: 0.33 }];
  const zdroje = {
    inventoryRows: [{ entry_date: INVENTURA, beer_id: 'sv', package_id: 'l033', quantity: 80, note: 'Týdenní inventura 19. 10. (konec dne)' }],
    bottlingRows: [{ entry_date: '2026-10-20', beer_id: 'sv', package_id: 'l033', quantity: 90 }],
    prodejnaRows: [{ entry_date: PATEK, beer_id: 'sv', package_id: 'l033', quantity: 10 }],
    packages: obaly,
  };
  const pohyby = buildMovements(zdroje);

  it('sklad zůstane 80, v týdnu s pátkem je fasování a přebytek o něj klesne, chybí 20', () => {
    expect(stockAsOf(pohyby, DEN).get('sv__l033')!.qty).toBe(80);

    const bezProdejny = buildMovements({ ...zdroje, prodejnaRows: [] });
    const sProdejnou = rozdilSkladu(pohyby, OD, INVENTURA, 'sv__l033');
    const bez = rozdilSkladu(bezProdejny, OD, INVENTURA, 'sv__l033');
    expect(sProdejnou).toBe(bez + 10);

    const souhrn = sestavPohybyObdobi(pohyby, { od: OD, doDne: INVENTURA, beerId: 'sv', packageId: 'l033' }).souhrn[0];
    expect(souhrn.konec).toBe(80);
    expect(souhrn.srovnani).toBe(sProdejnou);
    expect(souhrn.vydej).toBe(10);

    const zasoba = new Map([['sv__l033', stockAsOf(pohyby, DEN).get('sv__l033')!.qty]]);
    const tyden = mergeWeekPlan(computeKeggingPlan({
      beers: piva, packages: obaly,
      orders: [{ id: 'o1', delivery_date: DEN, order_date: DEN, status: 'nova', place_name: 'Hospoda' }],
      orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'sv', package_id: 'l033', quantity: 100 }],
      keggingRows: [], weekKey: isoWeekKey(DEN),
      jeCilovyObal: (kind) => kind !== 'keg',
      currentStockMap: zasoba,
    }), 'týden');
    expect(tyden.items[0].missing).toBe(20);

    const radky = radkyRozboru({
      planSudy: [], planLahve: tyden.items,
      kegging: [], bottling: zdroje.bottlingRows, prodejna: zdroje.prodejnaRows,
      od: OD, doDne: INVENTURA, zasoba, pohyby, piva, obaly,
    });
    const r = radky.find((x) => x.key === 'sv__l033')!;
    expect(r.skladem).toBe(80);
    expect(r.fasovani).toBe(10);
    expect(r.objednano).toBe(100);
    expect(r.stocit).toBe(20);
    expect(r.rozdil).toBe(sProdejnou);
  });
});

describe('Winter PET 1 l — napočítaná nula (27. 10. 2026)', () => {
  const OD = '2026-10-26';
  const DEN = '2026-10-27';
  const piva = [{ id: 'wi', name: 'Winter' }];
  const obaly = [{ id: 'p1', label: 'PET 1 l', kind: 'bottle', volume_l: 1 }];
  const pocitani = tydenniDoSkladu([
    { tyden_od: OD, tyden_do: '2026-11-01', beer_id: 'wi', package_id: 'p1', napocitano: 0, updated_at: '2026-10-26T16:00:00Z' },
  ]);
  const zdroje = {
    inventoryRows: [
      { entry_date: '2026-10-01', beer_id: 'wi', package_id: 'p1', quantity: 0, note: 'Počáteční stav' },
      ...pocitani,
    ],
    bottlingRows: [{ entry_date: '2026-10-20', beer_id: 'wi', package_id: 'p1', quantity: 27 }],
    packages: obaly,
  };
  const pohyby = buildMovements(zdroje as any);

  it('sklad je 0, stočit = objednávka, 27 před inventurou není skladem', () => {
    expect(stockAsOf(pohyby, DEN).get('wi__p1')!.qty).toBe(0);
    const zasoba = new Map([['wi__p1', 0]]);
    const tyden = mergeWeekPlan(computeKeggingPlan({
      beers: piva, packages: obaly,
      orders: [{ id: 'o1', delivery_date: DEN, order_date: DEN, status: 'nova', place_name: 'Hospoda' }],
      orderItems: [{ id: 'i1', order_id: 'o1', beer_id: 'wi', package_id: 'p1', quantity: 27 }],
      keggingRows: [], weekKey: isoWeekKey(DEN),
      jeCilovyObal: (kind) => kind !== 'keg',
      currentStockMap: zasoba,
    }), 'týden');
    expect(tyden.items[0].missing).toBe(27);
    const radky = radkyRozboru({
      planSudy: [], planLahve: tyden.items,
      kegging: [], bottling: zdroje.bottlingRows,
      od: OD, doDne: '2026-11-01', zasoba, pohyby, piva, obaly,
      inventura: new Map([['wi__p1', { kusu: 0, den: OD, minulyTyden: false }]]),
    });
    const r = radky.find((x) => x.key === 'wi__p1')!;
    expect(r.skladem).toBe(0);
    expect(r.stocit).toBe(27);
    expect(r.inventura?.kusu).toBe(0);
    expect(r.objednano).toBe(27);
  });
});

describe('slucInventuruSKonceptem', () => {
  it('rozepsané doplní jen to, co v databázi není, a neplatné vynechá', async () => {
    const { slucInventuruSKonceptem } = await import('./rozbor');
    const db = new Map([['a__b', { kusu: 5, den: '2026-10-06', minulyTyden: false }]]);
    const m = slucInventuruSKonceptem(db, { 'a__b': '9', 'c__d': '3,5', 'e__f': '', 'g__h': 'x' }, '2026-10-11');
    expect(m.get('a__b')!.kusu).toBe(5);
    expect(m.get('c__d')).toEqual({ kusu: 3.5, den: '2026-10-11', minulyTyden: false, rozepsano: true });
    expect(m.has('e__f')).toBe(false);
    expect(m.has('g__h')).toBe(false);
  });
});
