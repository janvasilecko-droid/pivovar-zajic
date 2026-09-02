import { describe, it, expect } from 'vitest';
import {
  pondeliTydne, posunDnu, tydenObdobi, vychoziTyden, popisTydne, stitekTydne,
  radkyTydne, jenAktivni, souhrnTydne, zaznamKontroly,
  type TydenniRadek,
} from './tydenniInventura';
import { buildMovements, stockForObdobi, type StockLine } from './stockLedger';

const PIVA = [{ id: 'b1', name: '12° Světlá' }, { id: 'b2', name: '11° Světlá' }];
const OBALY = [
  { id: 'p1', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'p2', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
];

function line(beer: string, pkg: string, qty: number, byKind: StockLine['byKind'] = {}): StockLine {
  return {
    key: `${beer}__${pkg}`,
    beer_id: beer,
    package_id: pkg,
    qty,
    baselineDate: '2026-08-31',
    baselineQty: 0,
    byKind,
  };
}

const sklad = (...radky: StockLine[]) => new Map(radky.map((l) => [l.key, l]));

describe('období týdne', () => {
  it('týden jde od pondělí do neděle', () => {
    // 2026-09-02 je středa
    expect(pondeliTydne('2026-09-02')).toBe('2026-08-31');
    expect(tydenObdobi('2026-09-02')).toMatchObject({ od: '2026-08-31', do: '2026-09-06' });
  });

  it('neděle ještě patří k pondělí, které týden začalo', () => {
    // JS má neděli jako den 0; bez korekce by se posunula do dalšího týdne
    // a nedělní stáčení by z kontroly vypadlo.
    expect(pondeliTydne('2026-09-06')).toBe('2026-08-31');
    expect(pondeliTydne('2026-09-07')).toBe('2026-09-07');
  });

  it('posun o týdny zpátky drží pondělky', () => {
    expect(tydenObdobi('2026-09-02', -1).od).toBe('2026-08-24');
    expect(tydenObdobi('2026-09-02', -2)).toMatchObject({ od: '2026-08-17', do: '2026-08-23' });
  });

  it('u BĚŽÍCÍHO týdne se počítá jen po dnešek, ne po neděli', () => {
    // Jinak by očekávaný stav sahal do budoucnosti a srovnávací zápis by
    // dostal datum, které ještě nenastalo — tak zmizelo 17 sudů Summer Ale.
    const t = tydenObdobi('2026-09-02');
    expect(t.doPocitani).toBe('2026-09-02');
    expect(t.uzavreny).toBe(false);
  });

  it('u UZAVŘENÉHO týdne se počítá po neděli', () => {
    const t = tydenObdobi('2026-09-02', -1);
    expect(t.doPocitani).toBe('2026-08-30');
    expect(t.uzavreny).toBe(true);
  });

  it('neděle běžícího týdne je pořád ještě dnešek, ne budoucnost', () => {
    const t = tydenObdobi('2026-09-06');
    expect(t.do).toBe('2026-09-06');
    expect(t.doPocitani).toBe('2026-09-06');
    // Týden končí dnes — zbytek dne se ještě může stáčet, takže „uzavřený" ne.
    expect(t.uzavreny).toBe(false);
  });

  it('posun dnů přeleze konec měsíce i roku', () => {
    expect(posunDnu('2026-08-31', 6)).toBe('2026-09-06');
    expect(posunDnu('2026-12-28', 7)).toBe('2027-01-04');
  });

  it('v pondělí a v úterý se nabízí minulý týden, jinak běžící', () => {
    expect(vychoziTyden('2026-08-31')).toBe(-1); // pondělí
    expect(vychoziTyden('2026-09-01')).toBe(-1); // úterý
    expect(vychoziTyden('2026-09-02')).toBe(0);  // středa
    expect(vychoziTyden('2026-09-06')).toBe(0);  // neděle
  });

  it('popis týdne píše rok jen jednou a zvládne přelom měsíce', () => {
    expect(popisTydne('2026-08-31', '2026-09-06')).toBe('31. 8. – 6. 9. 2026');
  });

  it('štítek do poznámek nese pondělí, ať jde zápis zpětně najít', () => {
    expect(stitekTydne('2026-08-31')).toBe('týdne 2026-08-31');
  });
});

describe('řádky týdenní inventury', () => {
  it('nevyplněné pole NENÍ nula — nezadané se nepočítá jako manko', () => {
    const [r] = radkyTydne(sklad(line('b1', 'p1', 10)), PIVA, OBALY, {});
    expect(r.napocitano).toBeNull();
    expect(r.rozdil).toBe(0);
  });

  it('zadaná nula manko JE — „nic tu není" je platný výsledek', () => {
    const [r] = radkyTydne(sklad(line('b1', 'p1', 10)), PIVA, OBALY, { b1__p1: '0' });
    expect(r.napocitano).toBe(0);
    expect(r.rozdil).toBe(-10);
  });

  it('rozdíl je napočítáno − očekáváno', () => {
    const m = sklad(line('b1', 'p1', 10), line('b2', 'p2', 100));
    const r = radkyTydne(m, PIVA, OBALY, { b1__p1: '12', b2__p2: '90' });
    expect(r.find((x) => x.klic === 'b1__p1')!.rozdil).toBe(2);
    expect(r.find((x) => x.klic === 'b2__p2')!.rozdil).toBe(-10);
  });

  it('bere i desetinné číslo s čárkou — tak se píše na české klávesnici', () => {
    const [r] = radkyTydne(sklad(line('b1', 'p1', 10)), PIVA, OBALY, { b1__p1: '10,5' });
    expect(r.rozdil).toBeCloseTo(0.5);
  });

  it('nesmysl v poli se bere jako nevyplněno, ne jako nula', () => {
    // Jinak by překlep vyrobil manko na celý stav položky.
    const [r] = radkyTydne(sklad(line('b1', 'p1', 10)), PIVA, OBALY, { b1__p1: 'abc' });
    expect(r.napocitano).toBeNull();
    expect(r.rozdil).toBe(0);
  });

  it('položku mimo číselník vynechá — bez jména se počítat nedá', () => {
    const m = sklad(line('b1', 'p1', 5), line('duch', 'p1', 3), line('b1', 'duch', 3));
    expect(radkyTydne(m, PIVA, OBALY, {}).map((r) => r.klic)).toEqual(['b1__p1']);
  });

  it('řadí podle pořadí v číselníku, ne podle klíče', () => {
    const m = sklad(line('b2', 'p2', 1), line('b1', 'p2', 1), line('b1', 'p1', 1));
    expect(radkyTydne(m, PIVA, OBALY, {}).map((r) => r.klic))
      .toEqual(['b1__p1', 'b1__p2', 'b2__p2']);
  });

  it('pozná sud podle druhu obalu — rozhoduje, kam se rozdíl propíše', () => {
    const r = radkyTydne(sklad(line('b1', 'p1', 1), line('b1', 'p2', 1)), PIVA, OBALY, {});
    expect(r.find((x) => x.package_id === 'p1')!.sud).toBe(true);
    expect(r.find((x) => x.package_id === 'p2')!.sud).toBe(false);
  });

  it('pohyb za týden sčítá v absolutní hodnotě — příjem výdej nevyruší', () => {
    // Kdyby se sčítalo se znaménkem, položka, kde se 20 stočilo a 20 vydalo,
    // by vyšla jako mrtvá a ze seznamu ke spočítání by vypadla.
    const [r] = radkyTydne(sklad(line('b1', 'p1', 0, { kegovani: 20, zavoz: -20 })), PIVA, OBALY, {});
    expect(r.pohybuVTydnu).toBe(40);
  });
});

describe('výběr toho, co se má počítat', () => {
  const zaklad = (over: Partial<TydenniRadek>): TydenniRadek => ({
    klic: 'b1__p1', beer_id: 'b1', beer_name: '12° Světlá',
    package_id: 'p1', package_label: 'KEG 50 l', package_kind: 'keg',
    ocekavano: 0, napocitano: null, rozdil: 0, pohybuVTydnu: 0, sud: true,
    ...over,
  });

  it('mrtvou kombinaci schová — jinak by se klikalo přes tři sta řádků', () => {
    expect(jenAktivni([zaklad({})])).toEqual([]);
  });

  it('nechá to, co má stav, co se hýbalo, nebo do čeho už někdo psal', () => {
    const radky = [
      zaklad({ klic: 'a', ocekavano: 5 }),
      zaklad({ klic: 'b', pohybuVTydnu: 12 }),
      zaklad({ klic: 'c', napocitano: 0 }),
      zaklad({ klic: 'd' }),
    ];
    expect(jenAktivni(radky).map((r) => r.klic)).toEqual(['a', 'b', 'c']);
  });

  it('položka v mínusu se schovat NESMÍ — právě ta je podezřelá', () => {
    expect(jenAktivni([zaklad({ ocekavano: -3 })])).toHaveLength(1);
  });

  it('souhrn počítá jen spočítané řádky', () => {
    const s = souhrnTydne([
      zaklad({ napocitano: 5, rozdil: 0 }),
      zaklad({ napocitano: 7, rozdil: 2 }),
      zaklad({ napocitano: 1, rozdil: -3 }),
      zaklad({}), // nespočítáno
    ]);
    expect(s).toEqual({ spocitano: 3, sedi: 1, prebytku: 1, manek: 1, prebytekKusu: 2, mankoKusu: 3 });
  });

  it('záznam o kontrole nese obě strany, ne jen výsledek', () => {
    const obdobi = tydenObdobi('2026-09-02', -1);
    const z = zaznamKontroly(zaklad({ ocekavano: 10, napocitano: 8, rozdil: -2 }), obdobi, 'staceni');
    expect(z).toMatchObject({
      tyden_od: '2026-08-24', tyden_do: '2026-08-30',
      ocekavano: 10, napocitano: 8, rozdil: -2, vyreseno: 'staceni',
    });
  });
});

describe('očekávaný stav za týden vychází ze skladové knihy', () => {
  // Nejde o novou matematiku: týden je jen jiné okno téhož rozpadu, jaký
  // dělá Sklad. Kdyby si týdenní kontrola počítala po svém, vyrobila by
  // třetí verzi pravdy — přesně to, co má odhalovat.
  const pohyby = buildMovements({
    keggingRows: [
      { beer_id: 'b1', package_id: 'p1', quantity: 20, entry_date: '2026-08-20' }, // před týdnem
      { beer_id: 'b1', package_id: 'p1', quantity: 8, entry_date: '2026-09-02' },  // v týdnu
    ],
    zavozDeductionRows: [
      { beer_id: 'b1', package_id: 'p1', quantity: 5, deduct_date: '2026-09-03' },
    ],
    packages: [{ id: 'p1', kind: 'keg', volume_l: 50 }],
  });

  it('počátek dopočítá z historie a přičte jen pohyby v týdnu', () => {
    const t = tydenObdobi('2026-09-04');
    const m = stockForObdobi(pohyby, t.od, t.doPocitani);
    const l = m.get('b1__p1')!;
    expect(l.baselineQty).toBe(20); // co bylo v pondělí ráno
    expect(l.qty).toBe(23);         // 20 + 8 − 5
    expect(l.byKind).toEqual({ kegovani: 8, zavoz: -5 });
  });

  it('u běžícího týdne nezapočítá, co se ještě nestalo', () => {
    // Kontrola ve středu nesmí čekat čtvrteční závoz.
    const t = tydenObdobi('2026-09-02');
    const m = stockForObdobi(pohyby, t.od, t.doPocitani);
    expect(m.get('b1__p1')!.qty).toBe(28); // 20 + 8, závoz z 3. 9. ještě ne
  });

  it('rozdíl se počítá proti témuž číslu, jaké ukazuje sklad', () => {
    const t = tydenObdobi('2026-09-04');
    const m = stockForObdobi(pohyby, t.od, t.doPocitani);
    const [r] = radkyTydne(m, [{ id: 'b1', name: '12° Světlá' }], OBALY, { b1__p1: '21' });
    expect(r.ocekavano).toBe(23);
    expect(r.rozdil).toBe(-2);
  });
});
