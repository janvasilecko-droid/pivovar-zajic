import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, stockMapAsOf, stockKey, movementsFor } from './stockLedger';

const B = 'beer-11';
const P30 = 'pkg-30';
const P50 = 'pkg-50';
const K = stockKey(B, P30);

const packages = [
  { id: P30, kind: 'keg', volume_l: 30 },
  { id: P50, kind: 'keg', volume_l: 50 },
  { id: 'pet15', kind: 'bottle', volume_l: 1.5 },
];

const qty = (src: Parameters<typeof buildMovements>[0], date: string, key = K) =>
  stockMapAsOf(buildMovements({ packages, ...src }), date)[key] ?? 0;

describe('buildMovements — znaménka pohybů', () => {
  it('příjmy přičítá, výdeje odečítá', () => {
    const m = buildMovements({
      packages,
      keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 10 }],
      bottlingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: 'pet15', quantity: 24 }],
      fasovaniRows: [{ entry_date: '2026-08-06', beer_id: B, package_id: P30, quantity: 2 }],
      prodejnaRows: [{ entry_date: '2026-08-06', beer_id: B, package_id: P30, quantity: 1 }],
      writeoffsRows: [{ entry_date: '2026-08-06', beer_id: B, package_id: P30, quantity: 1 }],
      zavozDeductionRows: [{ deduct_date: '2026-08-07', beer_id: B, package_id: P30, quantity: 3 }],
    });
    const kegy = m.filter((x) => x.package_id === P30);
    expect(kegy.find((x) => x.kind === 'kegovani')!.qty).toBe(10);
    expect(kegy.find((x) => x.kind === 'fasovani')!.qty).toBe(-2);
    expect(kegy.find((x) => x.kind === 'prodejna')!.qty).toBe(-1);
    expect(kegy.find((x) => x.kind === 'odpis')!.qty).toBe(-1);
    expect(kegy.find((x) => x.kind === 'zavoz')!.qty).toBe(-3);
    expect(m.find((x) => x.kind === 'staceni')!.qty).toBe(24);
  });

  it('akce počítá čistý odběr (odvezeno − vráceno)', () => {
    const m = buildMovements({
      packages,
      akceRows: [{ entry_date: '2026-08-10', items: [{ beer_id: B, package_id: P30, quantity_taken: 10, quantity_returned: 4 }] }],
    });
    expect(m.find((x) => x.kind === 'akce')!.qty).toBe(-6);
  });

  it('přefuk ubere z jednoho obalu a přidá do druhého', () => {
    const m = buildMovements({
      packages,
      prefukRows: [{ entry_date: '2026-08-11', beer_id: B, from_package_id: P50, from_count: 3, to_package_id: P30, to_count: 5 }],
    });
    expect(m.find((x) => x.kind === 'prefuk_z')!.qty).toBe(-3);
    expect(m.find((x) => x.kind === 'prefuk_do')!.qty).toBe(5);
  });

  it('sud spotřebovaný na lahve se odečte ze sudů', () => {
    const m = buildMovements({
      packages,
      bottlingRows: [{ entry_date: '2026-08-12', beer_id: B, package_id: 'pet15', quantity: 20, kegs_used: 2, kegs_used_package_id: P50 }],
    });
    expect(m.find((x) => x.kind === 'sud_na_lahve')!.qty).toBe(-2);
    expect(m.find((x) => x.kind === 'sud_na_lahve')!.package_id).toBe(P50);
  });

  it('dorovnání může být i záporné (manko)', () => {
    const m = buildMovements({
      packages,
      adjustmentRows: [{ entry_date: '2026-08-13', beer_id: B, package_id: P30, quantity: -4 }],
    });
    expect(m.find((x) => x.kind === 'dorovnani')!.qty).toBe(-4);
  });
});

describe('stockAsOf — inventura jako reset', () => {
  const inv = [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 20, note: 'Počáteční stav' }];

  it('počítá od poslední inventury', () => {
    expect(qty({ inventoryRows: inv, keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 6 }] }, '2026-08-31')).toBe(26);
  });

  it('pohyby PŘED inventurou se ignorují — inventura je fyzický fakt', () => {
    const src = {
      inventoryRows: inv,
      keggingRows: [
        { entry_date: '2026-07-15', beer_id: B, package_id: P30, quantity: 999 },
        { entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 6 },
      ],
    };
    expect(qty(src, '2026-08-31')).toBe(26);
  });

  it('novější inventura přebije starší', () => {
    const src = {
      inventoryRows: [
        ...inv,
        { entry_date: '2026-08-20', beer_id: B, package_id: P30, quantity: 7, note: 'Fyzická inventura' },
      ],
      keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 6 }],
      fasovaniRows: [{ entry_date: '2026-08-25', beer_id: B, package_id: P30, quantity: 2 }],
    };
    expect(qty(src, '2026-08-31')).toBe(5); // 7 − 2, srpnové stáčení před inventurou se neřeší
  });

  it('při shodném datu vyhraje schválená inventura nad počátečním stavem', () => {
    const src = {
      inventoryRows: [
        { entry_date: '2026-07-01', beer_id: B, package_id: P30, quantity: 100, note: 'Počáteční stav (převod z inventury)' },
        { entry_date: '2026-07-01', beer_id: B, package_id: P30, quantity: 40, note: 'Schválená inventura' },
      ],
    };
    expect(qty(src, '2026-07-31')).toBe(40);
  });

  it('bez inventury se sčítá všechno od začátku', () => {
    const src = { keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 6 }] };
    expect(qty(src, '2026-08-31')).toBe(6);
  });

  it('stav k datu nezapočítá pozdější pohyby', () => {
    const src = {
      inventoryRows: inv,
      keggingRows: [{ entry_date: '2026-08-20', beer_id: B, package_id: P30, quantity: 6 }],
    };
    expect(qty(src, '2026-08-10')).toBe(20);
    expect(qty(src, '2026-08-20')).toBe(26);
  });
});

// Tohle je hlavní důvod, proč kniha vznikla. Starý model ořezával každý pohyb
// zvlášť na nulu, takže schodek zmizel — a čerstvé stáčení pak nejdřív umazávalo
// neexistující dluh místo aby zvýšilo stav. Reálný případ: 11° Světlá 30l měla
// v srpnu 2026 saldo −12 a aplikace ukazovala 0.
describe('záporný stav se NEschovává', () => {
  it('vydáno víc, než bylo — vyjde mínus', () => {
    const src = {
      inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 0, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-08-10', beer_id: B, package_id: P30, quantity: 34 }],
      zavozDeductionRows: [{ deduct_date: '2026-08-15', beer_id: B, package_id: P30, quantity: 46 }],
    };
    expect(qty(src, '2026-08-31')).toBe(-12);
  });

  it('další stočení schodek zmenší přesně o svoje množství', () => {
    const zaklad = {
      inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 0, note: 'Počáteční stav' }],
      zavozDeductionRows: [{ deduct_date: '2026-08-15', beer_id: B, package_id: P30, quantity: 46 }],
    };
    const bez = qty({ ...zaklad, keggingRows: [{ entry_date: '2026-08-10', beer_id: B, package_id: P30, quantity: 34 }] }, '2026-08-31');
    const s5 = qty({ ...zaklad, keggingRows: [
      { entry_date: '2026-08-10', beer_id: B, package_id: P30, quantity: 34 },
      { entry_date: '2026-08-16', beer_id: B, package_id: P30, quantity: 5 },
    ] }, '2026-08-31');
    expect(bez).toBe(-12);
    expect(s5).toBe(-7); // přesně o 5 lepší, ne "pořád nula"
  });

  it('na pořadí pohybů nezáleží', () => {
    const pohyby = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 5, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-08-10', beer_id: B, package_id: P30, quantity: 8 }],
      fasovaniRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 10 }],
    });
    const a = stockMapAsOf(pohyby, '2026-08-31')[K];
    const b = stockMapAsOf([...pohyby].reverse(), '2026-08-31')[K];
    expect(a).toBe(3);
    expect(b).toBe(3);
  });
});

describe('rozpad pro obrazovku', () => {
  it('vrací, z čeho se číslo skládá', () => {
    const pohyby = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 20, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 10 }],
      zavozDeductionRows: [{ deduct_date: '2026-08-06', beer_id: B, package_id: P30, quantity: 4 }],
      fasovaniRows: [{ entry_date: '2026-08-07', beer_id: B, package_id: P30, quantity: 1 }],
    });
    const line = stockAsOf(pohyby, '2026-08-31').get(K)!;
    expect(line.qty).toBe(25);
    expect(line.baselineDate).toBe('2026-08-01');
    expect(line.baselineQty).toBe(20);
    expect(line.byKind.kegovani).toBe(10);
    expect(line.byKind.zavoz).toBe(-4);
    expect(line.byKind.fasovani).toBe(-1);
  });

  it('movementsFor vrací pohyby položky od nejnovějšího', () => {
    const pohyby = buildMovements({
      packages,
      keggingRows: [
        { entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 10 },
        { entry_date: '2026-08-20', beer_id: B, package_id: P30, quantity: 3 },
      ],
      fasovaniRows: [{ entry_date: '2026-08-10', beer_id: B, package_id: P50, quantity: 1 }],
    });
    const list = movementsFor(pohyby, B, P30);
    expect(list.map((m) => m.date)).toEqual(['2026-08-20', '2026-08-05']);
  });
});
