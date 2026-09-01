import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, stockMapAsOf, stockKey, movementsFor, expectedForMonth, stockAtStartOfDay } from './stockLedger';

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

describe('expectedForMonth — základ pro inventuru', () => {
  const zaklad = {
    packages,
    inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 20, note: 'Počáteční stav' }],
    keggingRows: [{ entry_date: '2026-08-10', beer_id: B, package_id: P30, quantity: 6 }],
    fasovaniRows: [{ entry_date: '2026-08-12', beer_id: B, package_id: P30, quantity: 4 }],
  };

  it('počítá počáteční stav + pohyby měsíce', () => {
    const e = expectedForMonth(buildMovements(zaklad), '2026-08');
    expect(e.get(K)!.qty).toBe(22); // 20 + 6 − 4
  });

  // Tohle je jádro věci: kdyby se uložená fyzická inventura brala jako výchozí
  // bod, očekávaný stav by se jí rovnal a manko by vyšlo vždycky nula.
  it('fyzická inventura uvnitř měsíce očekávaný stav NEovlivní', () => {
    const src = {
      ...zaklad,
      inventoryRows: [
        ...zaklad.inventoryRows,
        { entry_date: '2026-08-20', beer_id: B, package_id: P30, quantity: 15, note: 'Fyzická inventura' },
      ],
    };
    const e = expectedForMonth(buildMovements(src), '2026-08');
    expect(e.get(K)!.qty).toBe(22); // pořád teoretický stav, ne napočítaných 15
    // …ale běžný stav skladu už tu inventuru respektuje:
    expect(stockMapAsOf(buildMovements(src), '2026-08-31')[K]).toBe(15);
  });

  it('navazuje na inventuru z minulého měsíce', () => {
    const src = {
      packages,
      inventoryRows: [{ entry_date: '2026-07-31', beer_id: B, package_id: P30, quantity: 8, note: 'Schválená inventura' }],
      keggingRows: [{ entry_date: '2026-08-05', beer_id: B, package_id: P30, quantity: 2 }],
    };
    const e = expectedForMonth(buildMovements(src), '2026-08');
    expect(e.get(K)!.qty).toBe(10);
    expect(e.get(K)!.baselineDate).toBe('2026-07-31');
  });

  it('nezapočítá pohyby z dalšího měsíce', () => {
    const src = {
      ...zaklad,
      keggingRows: [...zaklad.keggingRows, { entry_date: '2026-09-03', beer_id: B, package_id: P30, quantity: 100 }],
    };
    expect(expectedForMonth(buildMovements(src), '2026-08').get(K)!.qty).toBe(22);
  });
});

describe('stockAtStartOfDay — stav k ránu', () => {
  it('inventura z toho dne se započítá, stáčení z toho dne ne', () => {
    const mv = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-08-24', beer_id: B, package_id: P30, quantity: 2, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-08-24', beer_id: B, package_id: P30, quantity: 19 }],
    });
    expect(stockAtStartOfDay(mv, '2026-08-24').get(K)!.qty).toBe(2);
    // Ke KONCI téhož dne už se stáčení projeví.
    expect(stockMapAsOf(mv, '2026-08-24')[K]).toBe(21);
  });

  it('pohyby z předchozích dnů se počítají', () => {
    const mv = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-08-01', beer_id: B, package_id: P30, quantity: 10, note: 'Počáteční stav' }],
      keggingRows: [{ entry_date: '2026-08-20', beer_id: B, package_id: P30, quantity: 5 }],
      fasovaniRows: [{ entry_date: '2026-08-23', beer_id: B, package_id: P30, quantity: 3 }],
    });
    expect(stockAtStartOfDay(mv, '2026-08-24').get(K)!.qty).toBe(12);
  });
});

describe('vracení sudů při opravě manka lahví', () => {
  const packages = [
    { id: 'k50', kind: 'keg', volume_l: 50 },
    { id: 'p1', kind: 'bottle', volume_l: 1 },
  ];

  it('záporné kegs_used vrátí sudy do skladu', () => {
    // Lahve se nenastáčely, takže se sudy nenačaly a pořád leží ve skladu.
    // Dřív se takový řádek zahodil (podmínka `kegsUsed <= 0`) a sudy zůstaly
    // odepsané, i když se z nich nestáčelo.
    const mv = buildMovements({
      bottlingRows: [{
        entry_date: '2026-08-31', beer_id: 'b1', package_id: 'p1',
        quantity: -45, kegs_used: -1, kegs_used_package_id: 'k50', source_volume_l: -50,
      }],
      packages,
    } as any);
    const sudy = mv.filter((m) => m.kind === 'sud_na_lahve');
    expect(sudy).toHaveLength(1);
    expect(sudy[0].qty).toBe(1);          // + = zpátky do skladu
    expect(sudy[0].package_id).toBe('k50');
  });

  it('kladné kegs_used pořád odečítá', () => {
    const mv = buildMovements({
      bottlingRows: [{
        entry_date: '2026-08-31', beer_id: 'b1', package_id: 'p1',
        quantity: 45, kegs_used: 1, kegs_used_package_id: 'k50', source_volume_l: 50,
      }],
      packages,
    } as any);
    expect(mv.find((m) => m.kind === 'sud_na_lahve')?.qty).toBe(-1);
  });

  it('nula sudů nedělá žádný pohyb', () => {
    const mv = buildMovements({
      bottlingRows: [{
        entry_date: '2026-08-31', beer_id: 'b1', package_id: 'p1',
        quantity: 45, kegs_used: 0, kegs_used_package_id: 'k50',
      }],
      packages,
    } as any);
    expect(mv.filter((m) => m.kind === 'sud_na_lahve')).toHaveLength(0);
  });

  it('záporné bez určeného obalu se nedopočítává — nemá z čeho', () => {
    const mv = buildMovements({
      bottlingRows: [{
        entry_date: '2026-08-31', beer_id: 'b1', package_id: 'p1',
        quantity: -45, kegs_used: -1, source_volume_l: -50,
      }],
      packages,
    } as any);
    expect(mv.filter((m) => m.kind === 'sud_na_lahve')).toHaveLength(0);
  });
});
