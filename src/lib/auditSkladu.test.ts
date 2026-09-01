import { describe, expect, it } from 'vitest';
import { AUDIT_SLOUPCE, auditRadek, bunkaAuditu, konecZeSloupcu, maCoUkazat, porovnejPolozku } from './auditSkladu';
import { buildMovements, expectedForMonth, stockAsOf, stockKey } from './stockLedger';
import type { StockLine } from './stockLedger';

function radek(baselineQty: number, byKind: StockLine['byKind'], qty: number): StockLine {
  return { key: 'b__p', beer_id: 'b', package_id: 'p', qty, baselineDate: '2026-08-01', baselineQty, byKind };
}

describe('auditRadek', () => {
  it('rozloží pohyby na sloupce a odbyt otočí na kladné „tolik ubylo"', () => {
    const r = auditRadek(radek(10, {
      kegovani: 20, staceni: 5, zavoz: -12, fasovani: -2, prodejna: -3,
      akce: -1, odpis: -4, sud_na_lahve: -6, prefuk_do: 7, prefuk_z: -8, dorovnani: 2,
    }, 8));
    expect(r).toEqual({
      pocatecni: 10, stoceno: 25, objednavky: 12, fasovani: 2, prodejna: 3,
      akce: 1, odpis: 4, sudyNaLahve: 6, prefuk: -1, dorovnani: 2, konec: 8,
    });
  });

  it('sudy odečtené kvůli lahvím mají vlastní sloupec, nemíchají se do objednávek', () => {
    const r = auditRadek(radek(0, { zavoz: -3, sud_na_lahve: -17 }, -20));
    expect(r.objednavky).toBe(3);
    expect(r.sudyNaLahve).toBe(17);
  });

  it('chybějící řádek dá samé nuly, ne prázdno', () => {
    const r = auditRadek(undefined);
    expect(AUDIT_SLOUPCE.every((s) => r[s] === 0)).toBe(true);
  });
});

describe('konecZeSloupcu', () => {
  it('součet sloupců dá výsledný stav', () => {
    const r = auditRadek(radek(10, { kegovani: 20, zavoz: -12, sud_na_lahve: -6 }, 12));
    expect(konecZeSloupcu(r)).toBe(12);
  });

  it('pozná, že do sloupců nespadl nějaký druh pohybu', () => {
    // Kdyby do skladové knihy přibyl nový druh a zapomnělo se ho doplnit,
    // konec by nesouhlasil se součtem — přesně tohle to má odchytit.
    const r = auditRadek({ ...radek(10, { kegovani: 20 }, 25), qty: 25 });
    expect(konecZeSloupcu(r)).toBe(30);
    expect(konecZeSloupcu(r)).not.toBe(r.konec);
  });
});

describe('porovnejPolozku', () => {
  it('shodné řádky nehlásí žádný rozdíl', () => {
    const l = radek(10, { kegovani: 20, zavoz: -12 }, 18);
    const p = porovnejPolozku(l, l);
    expect(p.rozdilne).toEqual([]);
    expect(p.rozdilKonec).toBe(0);
    expect(p.soucetNesedi).toBe(false);
  });

  it('ukáže KTERÝ sloupec se rozešel, ne jen výsledek', () => {
    const p = porovnejPolozku(
      radek(10, { kegovani: 20, zavoz: -12 }, 18),
      radek(10, { kegovani: 20, zavoz: -18 }, 12),
    );
    expect(p.rozdilne).toEqual(['objednavky', 'konec']);
    expect(p.rozdilKonec).toBe(-6);
  });

  it('rozdíl jen v počátečním stavu se pozná taky', () => {
    const p = porovnejPolozku(radek(10, {}, 10), radek(4, {}, 4));
    expect(p.rozdilne).toEqual(['pocatecni', 'konec']);
  });

  it('chybějící řádek na jedné straně se porovná proti nulám', () => {
    const p = porovnejPolozku(radek(5, { zavoz: -2 }, 3), undefined);
    expect(p.rozdilne).toContain('pocatecni');
    expect(p.rozdilne).toContain('objednavky');
    expect(p.rozdilKonec).toBe(-3);
  });
});

describe('maCoUkazat', () => {
  it('položku bez jediného pohybu a bez zásoby schová', () => {
    expect(maCoUkazat(porovnejPolozku(undefined, undefined))).toBe(false);
  });

  it('samotná zásoba bez pohybů stačí', () => {
    expect(maCoUkazat(porovnejPolozku(radek(7, {}, 7), radek(7, {}, 7)))).toBe(true);
  });
});

describe('na skutečné skladové knize', () => {
  const B = 'pivo', P = 'keg50';
  const zaklad = [
    { beer_id: B, package_id: P, entry_date: '2026-08-01', quantity: 10, note: 'Počáteční stav' },
  ];
  const kegging = [{ beer_id: B, package_id: P, entry_date: '2026-08-10', quantity: 20 }];
  const zavoz = [{ beer_id: B, package_id: P, deduct_date: '2026-08-12', quantity: 12 }];

  it('bez uložené inventury musí Inventura a Sklad vyjít NA KUS STEJNĚ', () => {
    const mv = buildMovements({ inventoryRows: zaklad, keggingRows: kegging, zavozDeductionRows: zavoz });
    const k = stockKey(B, P);
    const p = porovnejPolozku(expectedForMonth(mv, '2026-08').get(k), stockAsOf(mv, '2026-08-31').get(k));
    expect(p.rozdilne).toEqual([]);
    expect(p.inventura.konec).toBe(18);
    expect(p.sklad.konec).toBe(18);
  });

  it('po uložení fyzické inventury se liší PŘESNĚ o napočítané manko', () => {
    // Fyzická inventura se ukládá k prvnímu dni měsíce (viz InventoryScreen).
    // Sklad ji bere jako nový výchozí bod, Inventura ji záměrně ignoruje —
    // jinak by se očekávaný stav porovnával sám se sebou a manko by nešlo
    // zjistit. Rozdíl proto NENÍ chyba, ale právě to napočítané manko.
    const mv = buildMovements({
      inventoryRows: [
        ...zaklad,
        { beer_id: B, package_id: P, entry_date: '2026-08-01', quantity: 7, note: 'Fyzická inventura' },
      ],
      keggingRows: kegging,
      zavozDeductionRows: zavoz,
    });
    const k = stockKey(B, P);
    const p = porovnejPolozku(expectedForMonth(mv, '2026-08').get(k), stockAsOf(mv, '2026-08-31').get(k));
    expect(p.inventura.pocatecni).toBe(10);
    expect(p.sklad.pocatecni).toBe(7);
    expect(p.rozdilKonec).toBe(-3);
    // Pohyby uvnitř měsíce musí sedět i tak — rozdíl smí být JEN v základu.
    expect(p.rozdilne).toEqual(['pocatecni', 'konec']);
  });

  it('součet sloupců sedí i na skutečné knize včetně sudů na lahve', () => {
    const mv = buildMovements({
      inventoryRows: zaklad,
      keggingRows: kegging,
      zavozDeductionRows: zavoz,
      bottlingRows: [{
        beer_id: B, package_id: 'lahev1', entry_date: '2026-08-20', quantity: 300,
        kegs_used: 6, kegs_used_package_id: P, created_at: 'x',
      }],
      packages: [{ id: P, kind: 'keg', volume_l: 50 }],
    });
    const r = auditRadek(stockAsOf(mv, '2026-08-31').get(stockKey(B, P)));
    expect(r.sudyNaLahve).toBe(6);
    expect(konecZeSloupcu(r)).toBe(r.konec);
    expect(r.konec).toBe(12); // 10 + 20 − 12 − 6
  });
});

describe('bunkaAuditu', () => {
  it('stavy se píšou jak jsou, i záporné', () => {
    expect(bunkaAuditu('pocatecni', 10)).toBe('10');
    expect(bunkaAuditu('konec', -11)).toBe('-11');
    expect(bunkaAuditu('konec', 0)).toBe('0');
  });

  it('přírůstky dostanou plus, ať je poznat příjem', () => {
    expect(bunkaAuditu('stoceno', 25)).toBe('+25');
    expect(bunkaAuditu('prefuk', 3)).toBe('+3');
    expect(bunkaAuditu('dorovnani', -2)).toBe('-2');
  });

  it('odbyt se píše s minusem — jinak nejde poznat výdej od příjmu', () => {
    expect(bunkaAuditu('objednavky', 12)).toBe('−12');
    expect(bunkaAuditu('sudyNaLahve', 17)).toBe('−17');
    expect(bunkaAuditu('fasovani', 0)).toBe('0');
  });
});

describe('chybiZaklad', () => {
  const sPohyby = (baselineDate: string | null, baselineQty: number, qty: number): StockLine =>
    ({ key: 'b__p', beer_id: 'b', package_id: 'p', qty, baselineDate, baselineQty, byKind: { kegovani: qty - baselineQty } });

  it('pozná, že Inventura nemá od čeho počítat', () => {
    // Přesně červenec 2026: u části položek leží k 1. 7. jen „Schválená
    // inventura" a chybí „Počáteční stav". Inventura pak sčítá od začátku
    // evidence, Sklad počítá od té schválené — rozejdou se i v pohybech.
    const p = porovnejPolozku(sPohyby(null, 0, 55), sPohyby('2026-07-01', 3, 35));
    expect(p.chybiZaklad).toBe(true);
  });

  it('když základ mají obě strany, nehlásí nic', () => {
    const p = porovnejPolozku(sPohyby('2026-08-01', 3, 20), sPohyby('2026-08-01', 3, 20));
    expect(p.chybiZaklad).toBe(false);
    expect(p.rozdilne).toEqual([]);
  });

  it('když nemá základ ani jedna strana, není to tenhle případ', () => {
    // Nové pivo bez jediné inventury — obě strany počítají od nuly a shodnou se.
    const p = porovnejPolozku(sPohyby(null, 0, 12), sPohyby(null, 0, 12));
    expect(p.chybiZaklad).toBe(false);
  });
});
