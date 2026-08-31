// 🔍 AUDIT CELÉHO ŘETĚZCE — od prázdné aplikace až po inventuru.
// ---------------------------------------------------------------------------
// Prochází výrobu tak, jak jde v pivovaru za sebou, a u každého kroku ptá se
// na jedno: promítlo se to tam, kam mělo, a NEPROMÍTLO tam, kam nemělo?
//
// Řetězec: tank → sudy → lahve → výdej → přefuk → inventura → dorovnání.
//
// Objem tanku sám ve skladové knize NENÍ (tanky jsou litry, sklad jsou kusy) —
// odečítá ho RPC `adjust_tank_volume` přímo v Kegging.tsx. Test proto u sudů
// kontroluje `source_volume_l`, což je přesně to číslo, které se z tanku
// odečte, a hlídá, že u lahví zůstává vázané na sudy, ne na tank.
import { describe, expect, it } from 'vitest';
import { buildMovements, stockAsOf, expectedForMonth } from './stockLedger';
import { navrhSudu } from './bottlingYield';

const KEG50 = { id: 'keg50', kind: 'keg', volume_l: 50 };
const KEG30 = { id: 'keg30', kind: 'keg', volume_l: 30 };
const PET1 = { id: 'pet1', kind: 'bottle', volume_l: 1 };
const OBALY = [KEG50, KEG30, PET1];
const PIVO = 'lezak';

const klic = (pkgId: string) => `${PIVO}__${pkgId}`;
/** Stav skladu k datu, po jednotlivých obalech. */
function sklad(zdroje: any, datum = '2026-08-31') {
  const l = stockAsOf(buildMovements({ ...zdroje, packages: OBALY }), datum);
  return (pkgId: string) => l.get(klic(pkgId))?.qty ?? 0;
}

describe('1. Prázdná aplikace', () => {
  it('bez jediného zápisu je sklad prázdný, ne nula-z-nouze', () => {
    const pohyby = buildMovements({ packages: OBALY });
    expect(pohyby).toHaveLength(0);
    expect(stockAsOf(pohyby, '2026-08-31').size).toBe(0);
  });
});

describe('2. Stáčení sudů (tank → sudy)', () => {
  const keggingRows = [
    { beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-05', quantity: 10,
      cellar_tank_id: 'tank1', source_volume_l: 10 * 50 },
  ];

  it('sudy přibudou do skladu', () => {
    expect(sklad({ keggingRows })(KEG50.id)).toBe(10);
  });

  it('objem k odečtu z tanku = počet sudů × objem sudu', () => {
    // Přesně tenhle součet posílá Kegging.tsx do adjust_tank_volume.
    expect(keggingRows[0].source_volume_l).toBe(500);
  });

  it('stáčení do sudů se nesmí promítnout do jiných obalů', () => {
    const s = sklad({ keggingRows });
    expect(s(KEG30.id)).toBe(0);
    expect(s(PET1.id)).toBe(0);
  });
});

describe('3. Stáčení lahví (sudy → lahve)', () => {
  // 45 × 1l PET z jednoho 50l sudu — 10% ztráta, vzorec z bottlingYield.ts.
  const bottlingRows = [
    { beer_id: PIVO, package_id: PET1.id, entry_date: '2026-08-10', quantity: 45,
      kegs_used: 1, kegs_used_package_id: KEG50.id, source_volume_l: 50, created_at: 'c1' },
  ];
  const zdroje = {
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-05', quantity: 10, source_volume_l: 500 }],
    bottlingRows,
  };

  it('dopočet sudů z lahví sedí na vzorec', () => {
    expect(navrhSudu([{ volumeL: 1, qty: 45 }], 50)?.sudy).toBe(1);
  });

  it('lahve přibudou do skladu', () => {
    expect(sklad(zdroje)(PET1.id)).toBe(45);
  });

  it('a ZÁROVEŇ se spotřebovaný sud odečte ze skladu', () => {
    // 10 nastočených − 1 spotřebovaný na lahve = 9
    expect(sklad(zdroje)(KEG50.id)).toBe(9);
  });

  it('odečte se jen ta velikost sudu, která se opravdu použila', () => {
    expect(sklad(zdroje)(KEG30.id)).toBe(0);
  });

  it('bez vyplněných sudů se ze skladu neodečte nic', () => {
    const bezSudu = { ...zdroje, bottlingRows: [{ ...bottlingRows[0], kegs_used: null, kegs_used_package_id: null, source_volume_l: null }] };
    expect(sklad(bezSudu)(PET1.id)).toBe(45);
    expect(sklad(bezSudu)(KEG50.id)).toBe(10);
  });

  it('sourozenecké řádky jednoho zápisu odečtou sudy JEN JEDNOU', () => {
    // Lahve 1/2/3 z téhož stáčení sdílí jeden odečet sudů (stejné created_at).
    const tri = [
      { ...bottlingRows[0], package_id: PET1.id, quantity: 20, created_at: 'davka' },
      { ...bottlingRows[0], package_id: PET1.id, quantity: 15, created_at: 'davka' },
      { ...bottlingRows[0], package_id: PET1.id, quantity: 10, created_at: 'davka' },
    ];
    const s = sklad({ ...zdroje, bottlingRows: tri });
    expect(s(PET1.id)).toBe(45);
    expect(s(KEG50.id)).toBe(9);
  });
});

describe('4. Výdej ze skladu', () => {
  const zaklad = {
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 100, source_volume_l: 5000 }],
  };

  it('fasování ubírá', () => {
    expect(sklad({ ...zaklad, fasovaniRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-11', quantity: 5 }] })(KEG50.id)).toBe(95);
  });

  it('prodejna ubírá', () => {
    expect(sklad({ ...zaklad, prodejnaRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-11', quantity: 7 }] })(KEG50.id)).toBe(93);
  });

  it('odpis ubírá', () => {
    expect(sklad({ ...zaklad, writeoffsRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-11', quantity: 3 }] })(KEG50.id)).toBe(97);
  });

  it('zavezená objednávka ubírá (a jede podle deduct_date, ne entry_date)', () => {
    expect(sklad({ ...zaklad, zavozDeductionRows: [{ beer_id: PIVO, package_id: KEG50.id, deduct_date: '2026-08-12', quantity: 20 }] })(KEG50.id)).toBe(80);
  });

  it('akce ubírá jen ČISTÝ odběr — co se vrátilo, se nepočítá', () => {
    const akceRows = [{ entry_date: '2026-08-13', items: [{ beer_id: PIVO, package_id: KEG50.id, quantity_taken: 12, quantity_returned: 4 }] }];
    expect(sklad({ ...zaklad, akceRows })(KEG50.id)).toBe(92);
  });

  it('vrácené sudy z minulé akce se naopak PŘIČTOU', () => {
    const akceRows = [{ entry_date: '2026-08-13', items: [{ beer_id: PIVO, package_id: KEG50.id, quantity_taken: 0, quantity_returned: 6 }] }];
    expect(sklad({ ...zaklad, akceRows })(KEG50.id)).toBe(106);
  });

  it('sklad smí jít do MÍNUSU — to je platná odpověď, ne chyba k oříznutí', () => {
    expect(sklad({ fasovaniRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-11', quantity: 5 }] })(KEG50.id)).toBe(-5);
  });
});

describe('5. Přefuk mezi obaly', () => {
  const zdroje = {
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 20, source_volume_l: 1000 }],
    prefukRows: [{ beer_id: PIVO, entry_date: '2026-08-15', from_package_id: KEG50.id, from_count: 6, to_package_id: KEG30.id, to_count: 10 }],
  };

  it('z jednoho obalu ubude a do druhého přibude', () => {
    const s = sklad(zdroje);
    expect(s(KEG50.id)).toBe(14);
    expect(s(KEG30.id)).toBe(10);
  });
});

describe('6. Inventura jako nový výchozí bod', () => {
  const zdroje = {
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 100, source_volume_l: 5000 }],
    inventoryRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-20', quantity: 60, note: 'Fyzická inventura' }],
    fasovaniRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-25', quantity: 10 }],
  };

  it('sklad se od inventury počítá znovu, starší pohyby se zahodí', () => {
    // 60 napočítáno 20. 8., pak −10 → 50. Těch 100 z 1. 8. se už nepočítá.
    expect(sklad(zdroje)(KEG50.id)).toBe(50);
  });

  it('inventura se nikdy nezapočítá jako pohyb navíc', () => {
    const line = stockAsOf(buildMovements({ ...zdroje, packages: OBALY }), '2026-08-31').get(klic(KEG50.id))!;
    expect(line.baselineQty).toBe(60);
    expect(line.byKind.inventura).toBeUndefined();
  });
});

describe('7. Očekávaný stav pro inventuru — čistá teorie', () => {
  const zdroje = {
    inventoryRows: [
      { beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 100, note: 'Počáteční stav' },
      // Napočítaná skutečnost — ukládá se na STEJNÉ datum jako počáteční stav.
      { beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-01', quantity: 111, note: 'Fyzická inventura' },
    ],
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-10', quantity: 50, source_volume_l: 2500 }],
    fasovaniRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-20', quantity: 30 }],
    adjustmentRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-28', quantity: -9 }],
  };
  const pohyby = buildMovements({ ...zdroje, packages: OBALY });

  it('očekávaný stav vychází z POČÁTEČNÍHO stavu, ne z napočítaného', () => {
    const line = expectedForMonth(pohyby, '2026-08').get(klic(KEG50.id))!;
    expect(line.baselineQty).toBe(100);
    expect(line.qty).toBe(120); // 100 + 50 − 30
  });

  it('dorovnání téhož měsíce se do očekávaného stavu nepočítá', () => {
    expect(expectedForMonth(pohyby, '2026-08').get(klic(KEG50.id))!.byKind.dorovnani).toBeUndefined();
  });

  it('manko tedy vyjde a po dorovnání sedí na nulu', () => {
    const ocekavano = expectedForMonth(pohyby, '2026-08').get(klic(KEG50.id))!.qty;
    const napocitano = 111;
    expect(napocitano - ocekavano).toBe(-9);
    expect(napocitano - (ocekavano + -9)).toBe(0);
  });

  it('do SKUTEČNÉHO skladu se ale napočítaný stav i dorovnání promítnou', () => {
    // Sklad musí ukazovat realitu: 111 napočítáno + 50 − 30 − 9 = 122.
    expect(stockAsOf(pohyby, '2026-08-31').get(klic(KEG50.id))!.qty).toBe(122);
  });
});

describe('8. Celý řetězec najednou', () => {
  // Tank 1000 l → 20 sudů po 50 l → z 2 sudů 90 × 1l PET → výdeje.
  const zdroje = {
    keggingRows: [{ beer_id: PIVO, package_id: KEG50.id, entry_date: '2026-08-02', quantity: 20, cellar_tank_id: 'tank1', source_volume_l: 1000 }],
    bottlingRows: [{ beer_id: PIVO, package_id: PET1.id, entry_date: '2026-08-06', quantity: 90, kegs_used: 2, kegs_used_package_id: KEG50.id, source_volume_l: 100, created_at: 'x' }],
    fasovaniRows: [{ beer_id: PIVO, package_id: PET1.id, entry_date: '2026-08-08', quantity: 12 }],
    zavozDeductionRows: [{ beer_id: PIVO, package_id: KEG50.id, deduct_date: '2026-08-09', quantity: 5 }],
  };

  it('sudy: 20 nastočeno − 2 na lahve − 5 zavezeno = 13', () => {
    expect(sklad(zdroje)(KEG50.id)).toBe(13);
  });

  it('lahve: 90 nastočeno − 12 vyfasováno = 78', () => {
    expect(sklad(zdroje)(PET1.id)).toBe(78);
  });

  it('objem odečtený z tanku odpovídá jen KEGOVÁNÍ, lahve tank neubírají', () => {
    // Lahve berou ze sudů, a ty tank ubraly už při kegování — jinak by se
    // stejné pivo odečetlo z tanku dvakrát.
    const zTanku = zdroje.keggingRows.reduce((s, r) => s + Number(r.source_volume_l || 0), 0);
    expect(zTanku).toBe(1000);
    expect(zdroje.bottlingRows[0]).not.toHaveProperty('cellar_tank_id');
  });

  it('rozpad ukáže, odkud každé číslo je', () => {
    const line = stockAsOf(buildMovements({ ...zdroje, packages: OBALY }), '2026-08-31').get(klic(KEG50.id))!;
    expect(line.byKind.kegovani).toBe(20);
    expect(line.byKind.sud_na_lahve).toBe(-2);
    expect(line.byKind.zavoz).toBe(-5);
  });
});
