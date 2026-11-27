import { describe, it, expect } from 'vitest';
import { buildMovements, type Movement } from './stockLedger';
import { popisPohybu, SKUPINY_POHYBU, rozpadPoPolozkach, sestavPohybyObdobi, sloupceSPohybem, sloupecPohybu, tabulkaPoDnech } from './pohybySkladu';

// Týden 21.–27. 9. 2026, 12° Světlá (b12) v sudech 30 l a 50 l.
const PO = '2026-09-21';
const UT = '2026-09-22';
const ST = '2026-09-23';
const NE = '2026-09-27';

const pohyby = buildMovements({
  inventoryRows: [
    { entry_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 15, note: 'Počáteční stav' },
    { entry_date: PO, beer_id: 'b12', package_id: 'k50', quantity: 4, note: 'Počáteční stav' },
  ],
  keggingRows: [
    { entry_date: UT, beer_id: 'b12', package_id: 'k30', quantity: 6 },
    { entry_date: '2026-09-14', beer_id: 'b12', package_id: 'k30', quantity: 99 }, // minulý týden
    { entry_date: UT, beer_id: 'b10', package_id: 'k30', quantity: 5 },            // jiné pivo
  ],
  zavozDeductionRows: [
    { deduct_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 14, order_id: 'o1' },
    { deduct_date: ST, beer_id: 'b12', package_id: 'k30', quantity: 3, order_id: 'o2' },
    { deduct_date: ST, beer_id: 'b12', package_id: 'k50', quantity: 5, order_id: 'o2' },
  ],
  fasovaniRows: [{ entry_date: UT, beer_id: 'b12', package_id: 'k50', quantity: 1 }],
});
const jmena: Record<string, string> = { o1: 'U Zajíce', o2: 'Maneo' };
const odberatel = (id: string) => jmena[id];

describe('sestavPohybyObdobi', () => {
  it('jen vybraný týden a pivo — minulý týden ani jiné pivo se nevypíšou', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12' }, odberatel);
    expect(r.dny).toHaveLength(7);
    const vsechny = r.dny.flatMap((d) => d.radky);
    expect(vsechny.every((x) => x.beer_id === 'b12')).toBe(true);
    expect(vsechny.some((x) => x.mnozstvi === 99)).toBe(false);
  });

  it('stav večer sedí se skladovou knihou den po dni', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30' }, odberatel);
    const vecer = (datum: string) => r.dny.find((d) => d.datum === datum)!.vecer[0].mnozstvi;
    expect(vecer(PO)).toBe(1);  // 15 − 14
    expect(vecer(UT)).toBe(7);  // + 6 stočeno
    expect(vecer(ST)).toBe(4);  // − 3 Maneo
    expect(vecer(NE)).toBe(4);
  });

  it('u závozu je jméno odběratele', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30' }, odberatel);
    const pondeli = r.dny[0].radky;
    const zavoz = pondeli.find((x) => x.druh === 'zavoz')!;
    expect(zavoz.kdo).toBe('U Zajíce');
    expect(zavoz.mnozstvi).toBe(-14);
    // Inventura je v rámci dne první — výchozí bod.
    expect(pondeli[0].druh).toBe('inventura');
  });

  it('filtr druhu schová řádky, ale stav večer zůstává stejný jako ve Skladu', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', packageId: 'k30', skupiny: ['zavoz'] }, odberatel);
    const vsechny = r.dny.flatMap((d) => d.radky);
    expect(vsechny.every((x) => x.druh === 'zavoz')).toBe(true);
    expect(r.dny.find((d) => d.datum === UT)!.vecer[0].mnozstvi).toBe(7);
  });

  it('souhrn: ráno, přibylo, ubylo a konec pro každý obal zvlášť', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12' }, odberatel);
    const k30 = r.souhrn.find((s) => s.package_id === 'k30')!;
    const k50 = r.souhrn.find((s) => s.package_id === 'k50')!;
    expect(k30).toMatchObject({ rano: 15, prijem: 6, vydej: 17, inventura: true, konec: 4 });
    expect(k50).toMatchObject({ rano: 4, prijem: 0, vydej: 6, konec: -2 });
  });

  it('bez filtru piva jsou vidět všechna piva, co se hýbala', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE }, odberatel);
    expect(new Set(r.souhrn.map((s) => s.beer_id))).toEqual(new Set(['b12', 'b10']));
  });
});

// 1. 10. 2026: „ať jde po každém odečtení vidět aktuální stav — objednávka
// Maneo −2× 30, na skladě 6, stočeno 18, na skladě 24…"
describe('stav po každém pohybu', () => {
  it('jde krok po kroku od večera předchozího dne a sedí se stavem večer', () => {
    const pohyby: Movement[] = [
      { date: '2026-09-01', beer_id: 'b', package_id: 'k30', qty: 8, kind: 'inventura', note: 'Počáteční stav' },
      { date: '2026-09-02', beer_id: 'b', package_id: 'k30', qty: -2, kind: 'zavoz', orderId: 'maneo' },
      { date: '2026-09-02', beer_id: 'b', package_id: 'k30', qty: 18, kind: 'kegovani' },
      { date: '2026-09-02', beer_id: 'b', package_id: 'k30', qty: -10, kind: 'zavoz', orderId: 'jiny' },
    ];
    const v = sestavPohybyObdobi(pohyby, { od: '2026-09-02', doDne: '2026-09-02' });
    const den = v.dny[0];
    // Pořadí dne: nejdřív co přibylo (stáčení), pak co ubylo.
    expect(den.radky.map((r) => [r.mnozstvi, r.stavPo])).toEqual([[18, 26], [-2, 24], [-10, 14]]);
    expect(den.vecer[0].mnozstvi).toBe(14);
  });
});

describe('popis vrácení', () => {
  it('vrácení z objednávky není dorovnání inventury', async () => {
    const { popisPohybu } = await import('./pohybySkladu');
    expect(popisPohybu({ kind: 'dorovnani', note: 'Zrušená objednávka, vráceno na sklad — 1× KEG 15l (Mutěnice)', orderId: 'o' })).toBe('Vráceno na sklad — zrušená objednávka');
    expect(popisPohybu({ kind: 'dorovnani', note: 'Vráceno z objednávky — 2× KEG 30l', orderId: 'o' })).toBe('Vráceno z objednávky');
    expect(popisPohybu({ kind: 'dorovnani', note: 'Dorovnání z inventury týden 39 — KEG 30l', orderId: null })).toBe('Dorovnání inventury');
    expect(popisPohybu({ kind: 'dorovnani', note: null, orderId: null, ztrata: true })).toBe('Ztráta (měsíční inventura)');
  });
});

describe('souhrn s inventurou v období', () => {
  it('začátek + přibylo − ubylo ± srovnání inventurou = teď', () => {
    const pohyby: Movement[] = [
      { date: '2026-09-01', beer_id: 'b', package_id: 'k', qty: 2, kind: 'inventura', note: 'Počáteční stav' },
      { date: '2026-09-29', beer_id: 'b', package_id: 'k', qty: 2, kind: 'kegovani' },
      { date: '2026-09-29', beer_id: 'b', package_id: 'k', qty: -2, kind: 'zavoz', orderId: 'o' },
      { date: '2026-09-30', beer_id: 'b', package_id: 'k', qty: 4, kind: 'inventura', note: 'Fyzická inventura' },
    ];
    const s = sestavPohybyObdobi(pohyby, { od: '2026-09-28', doDne: '2026-10-04' }).souhrn[0];
    expect(s).toMatchObject({ rano: 2, prijem: 2, vydej: 2, konec: 4, srovnani: 2, inventuraDatum: '2026-09-30', inventuraStav: 4 });
  });

  it('inventura napočítaná první den období se nepočítá do „Na začátku"', () => {
    // 1. 10. 2026: „na začátku týdne 4, byla 0… konečný výsledek sedí".
    const pohyby: Movement[] = [
      { date: '2026-08-31', beer_id: 'b', package_id: 'k', qty: 4, kind: 'inventura', note: 'Fyzická inventura' },
    ];
    const s = sestavPohybyObdobi(pohyby, { od: '2026-08-31', doDne: '2026-09-06' }).souhrn[0];
    expect(s).toMatchObject({ rano: 0, konec: 4, srovnani: 4, inventuraStav: 4 });
  });
});

describe('inventura: napočítáno vs. podle evidence', () => {
  it('u řádku inventury je i stav podle evidence těsně před ní', () => {
    const pohyby: Movement[] = [
      { date: '2026-09-01', beer_id: 'b', package_id: 'l15', qty: 40, kind: 'inventura', note: 'Počáteční stav' },
      { date: '2026-09-30', beer_id: 'b', package_id: 'l15', qty: 5, kind: 'staceni' },
      { date: '2026-09-30', beer_id: 'b', package_id: 'l15', qty: 10, kind: 'inventura', note: 'Fyzická inventura' },
    ];
    const v = sestavPohybyObdobi(pohyby, { od: '2026-09-28', doDne: '2026-10-04' });
    const inv = v.dny.flatMap((d) => d.radky).find((r) => r.druh === 'inventura')!;
    expect(inv).toMatchObject({ mnozstvi: 10, podleEvidence: 45 });
    expect(v.souhrn[0].konec - v.souhrn[0].srovnani).toBe(45);
  });
});

describe('stav „teď" místo „večer"', () => {
  it('poslední den s pohybem do dneška je „teď", když období dnešek obsahuje', () => {
    // Čtvrtek 24. 9.: poslední pohyb byl ve středu → středa je „teď".
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', dnes: '2026-09-24' }, odberatel);
    expect(r.dny.filter((d) => d.ted).map((d) => d.datum)).toEqual([ST]);
  });

  it('minulý týden (bez dneška) nemá „teď" nikde', () => {
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', dnes: '2026-10-01' }, odberatel);
    expect(r.dny.some((d) => d.ted)).toBe(false);
  });

  it('pohyb schovaný filtrem druhu „teď" posune — stav ze dne předtím už neplatí', () => {
    // S filtrem jen Stočeno je vidět jen úterý. Ve středu je ale závoz, takže
    // „teď" patří (schované) středě a úterý zůstane „večer".
    const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, beerId: 'b12', skupiny: ['stoceno'], dnes: '2026-09-24' }, odberatel);
    expect(r.dny.find((d) => d.ted)?.datum).toBe(ST);
  });
});

describe('tabulka rozboru — sloupce podle druhu pohybu', () => {
  const r = sestavPohybyObdobi(pohyby, { od: PO, doDne: NE, dnes: NE }, odberatel);

  it('druh pohybu → sloupec; inventura nastavuje stav, takže do žádného', () => {
    expect(sloupecPohybu('kegovani')).toBe('stoceno');
    expect(sloupecPohybu('staceni')).toBe('stoceno');
    expect(sloupecPohybu('zavoz')).toBe('zavoz');
    expect(sloupecPohybu('prodejna')).toBe('fasovani');
    expect(sloupecPohybu('fasovani')).toBe('fasovani');
    expect(sloupecPohybu('odpis')).toBe('odpis');
    expect(sloupecPohybu('akce')).toBe('akce');
    expect(sloupecPohybu('prefuk_z')).toBe('ostatni');
    expect(sloupecPohybu('dorovnani')).toBe('ostatni');
    expect(sloupecPohybu('inventura')).toBeNull();
  });

  it('součty po pivu a obalu za celé období', () => {
    const m = rozpadPoPolozkach(r.dny);
    expect(m.get('b12__k30')).toEqual({ stoceno: 6, zavoz: -17, fasovani: 0, akce: 0, odpis: 0, ostatni: 0 });
    expect(m.get('b12__k50')).toEqual({ stoceno: 0, zavoz: -5, fasovani: -1, akce: 0, odpis: 0, ostatni: 0 });
    expect(m.get('b10__k30')).toEqual({ stoceno: 5, zavoz: 0, fasovani: 0, akce: 0, odpis: 0, ostatni: 0 });
  });

  it('prázdné sloupce se vynechají', () => {
    expect(sloupceSPohybem([...rozpadPoPolozkach(r.dny).values()])).toEqual(['stoceno', 'zavoz', 'fasovani']);
    expect(sloupceSPohybem([])).toEqual([]);
  });

  it('den po dni pro jednu položku: jen dny s pohybem, stav večer ze skladové knihy', () => {
    const dny = tabulkaPoDnech(r.dny, 'b12', 'k30');
    expect(dny.map((d) => d.datum)).toEqual([PO, UT, ST]);
    expect(dny[0]).toMatchObject({ inventura: 15, stav: 1, ted: false });
    expect(dny[0].bunky).toEqual({ stoceno: 0, zavoz: -14, fasovani: 0, akce: 0, odpis: 0, ostatni: 0 });
    expect(dny[1]).toMatchObject({ inventura: null, stav: 7 });
    expect(dny[1].bunky.stoceno).toBe(6);
    expect(dny[2]).toMatchObject({ stav: 4 });
    expect(dny[2].bunky.zavoz).toBe(-3);
  });

  it('jiná položka nebo žádný pohyb: prázdná tabulka', () => {
    expect(tabulkaPoDnech(r.dny, 'b12', 'neexistuje')).toEqual([]);
  });

  it('komu se vydalo: odběratel u závozu se součtem za den, jinak druh pohybu; stočené nemá komu', () => {
    const dny = tabulkaPoDnech(r.dny, 'b12', 'k30');
    expect(dny[0].komu).toEqual([{ jmeno: 'U Zajíce', mnozstvi: -14 }]);
    expect(dny[1].komu).toEqual([]);
    expect(dny[2].komu).toEqual([{ jmeno: 'Maneo', mnozstvi: -3 }]);
    const fas = tabulkaPoDnech(r.dny, 'b12', 'k50').find((d) => d.datum === UT)!;
    expect(fas.komu).toEqual([{ jmeno: 'Fasování personál', mnozstvi: -1 }]);
  });

  it('stejný odběratel dvakrát ve dni se sečte; jiný zůstane zvlášť', () => {
    const p = buildMovements({
      zavozDeductionRows: [
        { deduct_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 2, order_id: 'o1' },
        { deduct_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 3, order_id: 'o1' },
        { deduct_date: PO, beer_id: 'b12', package_id: 'k30', quantity: 1, order_id: 'o2' },
      ],
    });
    const x = sestavPohybyObdobi(p, { od: PO, doDne: PO }, odberatel);
    expect(tabulkaPoDnech(x.dny, 'b12', 'k30')[0].komu).toEqual([
      { jmeno: 'U Zajíce', mnozstvi: -5 },
      { jmeno: 'Maneo', mnozstvi: -1 },
    ]);
  });
});

describe('popisky pohybů se sudy na lahve', () => {
  it('sud spotřebovaný na lahve se píše jen „Lahve" (16. 10. 2026)', () => {
    expect(popisPohybu({ kind: 'sud_na_lahve', note: null, orderId: undefined, ztrata: false })).toBe('Lahve');
    expect(SKUPINY_POHYBU.find((s) => s.id === 'prefuk')!.label).toBe('Přefuk a lahve');
  });
});


// 26. 11. 2026 (majitel): „fasování personál, musí být vidět kdo fasoval" — v Pohybech u řádku a v tabulce po
// dnech („komu se ten den vydalo"). Jména i důvody jsou vymyšlené (repozitář je veřejný).
describe('Pohyby — kdo fasoval a proč se odepsalo', () => {
  const D = '2026-11-20';
  const zdroje = buildMovements({
    inventoryRows: [{ entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 20, note: 'Počáteční stav' }],
    fasovaniRows: [
      { entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 2, who: 'Eva' },
      { entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 1, who: 'Jana' },
      { entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 1, who: 'Eva' },
    ],
    writeoffsRows: [{ entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 3, who: 'Výhra v tombole' }],
    zavozDeductionRows: [{ deduct_date: D, beer_id: 'b12', package_id: 'k30', quantity: 4, order_id: 'o1' }],
  });
  const r = sestavPohybyObdobi(zdroje, { od: D, doDne: D, beerId: 'b12', packageId: 'k30', dnes: D }, (id) => (id === 'o1' ? 'U Zajíce' : undefined));
  const radky = r.dny[0].radky;

  it('řádek fasování personálu nese jméno, odpisu důvod, závozu odběratele', () => {
    expect(radky.filter((x) => x.druh === 'fasovani').map((x) => x.kdo).sort()).toEqual(['Eva', 'Eva', 'Jana']);
    expect(radky.find((x) => x.druh === 'odpis')!.kdo).toBe('Výhra v tombole');
    expect(radky.find((x) => x.druh === 'zavoz')!.kdo).toBe('U Zajíce');
  });

  it('v tabulce po dnech je „komu“ rozepsané: Fasování personál · Eva (součet za den), Odpis · důvod, odběratel sám', () => {
    const [den] = tabulkaPoDnech(r.dny, 'b12', 'k30');
    const komu = Object.fromEntries(den.komu.map((k) => [k.jmeno, k.mnozstvi]));
    expect(komu).toEqual({
      'U Zajíce': -4,
      'Fasování personál · Eva': -3,
      'Fasování personál · Jana': -1,
      'Odpis · Výhra v tombole': -3,
    });
  });

  it('řádek bez jména se popisuje jako dřív', () => {
    const bez = buildMovements({
      inventoryRows: [{ entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 5, note: 'Počáteční stav' }],
      fasovaniRows: [{ entry_date: D, beer_id: 'b12', package_id: 'k30', quantity: 1 }],
    });
    const rr = sestavPohybyObdobi(bez, { od: D, doDne: D, beerId: 'b12', packageId: 'k30', dnes: D }, () => undefined);
    expect(rr.dny[0].radky.find((x) => x.druh === 'fasovani')!.kdo).toBe('');
    expect(tabulkaPoDnech(rr.dny, 'b12', 'k30')[0].komu).toEqual([{ jmeno: 'Fasování personál', mnozstvi: -1 }]);
  });
});

// ── Úprava skladu v Pohybech (majitel 27. 11. 2026) ─────────────────────────────────────────────
// „Když se zadá Úprava skladu, tak se tam objeví úprava skladu — číslo, rozdíl (pokud se bude dofasovávat zpětně,
// to číslo se může měnit, zmenšovat), ale stav skladu je daný úpravou skladu a od té doby se počítá s tímhle číslem,
// dokud se neudělá zase úprava skladu; pokud se neudělá, počítá se s aktuálním číslem."
// Vymyšlená data: pivo b8 v lahvích 1 l (l1), listopad 2026.
describe('Úprava skladu v Pohybech — číslo, rozdíl a stav od ní', () => {
  const B = 'b8';
  const P = 'l1';
  const UPRAVA = { entry_date: '2026-11-20', beer_id: B, package_id: P, quantity: 30, note: 'Týdenní inventura týdne 2026-11-16 (konec dne)', created_at: '2026-11-20T08:00:00Z' };
  const zaklad = {
    inventoryRows: [
      { entry_date: '2026-11-01', beer_id: B, package_id: P, quantity: 60, note: 'Počáteční stav' },
      UPRAVA,
    ],
    fasovaniRows: [{ entry_date: '2026-11-10', beer_id: B, package_id: P, quantity: 10, who: 'Eva' }],
    bottlingRows: [{ entry_date: '2026-11-12', beer_id: B, package_id: P, quantity: 20 }],
    zavozDeductionRows: [{ deduct_date: '2026-11-21', beer_id: B, package_id: P, quantity: 5, order_id: 'o9' }],
  };
  const radekUpravy = (r: ReturnType<typeof sestavPohybyObdobi>) => r.dny.flatMap((d) => d.radky).find((x) => x.druh === 'inventura')!;
  const filtr = { od: '2026-11-16', doDne: '2026-11-27', beerId: B, packageId: P };

  it('řádek se jmenuje Úprava skladu a nese číslo, rozdíl proti evidenci a stav po ní; vnitřní poznámka se neukazuje', () => {
    const r = radekUpravy(sestavPohybyObdobi(buildMovements(zaklad), filtr));
    expect(r.popis).toBe('Úprava skladu');
    expect(r.uprava).toBe(true);
    expect(r.mnozstvi).toBe(30); // napočítáno
    expect(r.podleEvidence).toBe(70); // 60 − 10 + 20
    expect(r.rozdil).toBe(-40);
    expect(r.stavPo).toBe(30);
    expect(r.poznamka).toBe('');
  });

  it('zpětně dofasovaný výdej PŘED počítáním rozdíl zmenší, stav po Úpravě zůstává napočítané číslo', () => {
    const zpetne = buildMovements({
      ...zaklad,
      // Zapsáno až po počítání, ale za den před ním — dohánění papírů.
      fasovaniRows: [...zaklad.fasovaniRows, { entry_date: '2026-11-15', beer_id: B, package_id: P, quantity: 15, who: 'Eva', created_at: '2026-11-21T10:00:00Z' }],
    });
    const vysledek = sestavPohybyObdobi(zpetne, filtr);
    const r = radekUpravy(vysledek);
    expect(r.podleEvidence).toBe(55);
    expect(r.rozdil).toBe(-25);
    expect(r.stavPo).toBe(30);
    expect(vysledek.dny.find((d) => d.datum === '2026-11-20')!.vecer[0].mnozstvi).toBe(30);
  });

  it('od Úpravy se počítá s napočítaným číslem dál; bez další Úpravy platí aktuální číslo', () => {
    const vysledek = sestavPohybyObdobi(buildMovements(zaklad), filtr);
    const vecer = (datum: string) => vysledek.dny.find((d) => d.datum === datum)!.vecer[0].mnozstvi;
    expect(vecer('2026-11-20')).toBe(30);
    expect(vecer('2026-11-21')).toBe(25); // 30 − 5 závoz
    expect(vecer('2026-11-27')).toBe(25); // nic dalšího se nestalo
  });

  it('další Úprava skladu nastaví nový základ a rozdíl se počítá proti stavu před ní', () => {
    const druha = { entry_date: '2026-11-27', beer_id: B, package_id: P, quantity: 40, note: 'Týdenní inventura týdne 2026-11-23 (konec dne)', created_at: '2026-11-27T08:00:00Z' };
    const vysledek = sestavPohybyObdobi(buildMovements({ ...zaklad, inventoryRows: [...zaklad.inventoryRows, druha] }), filtr);
    const upravy = vysledek.dny.flatMap((d) => d.radky).filter((x) => x.druh === 'inventura');
    expect(upravy.map((x) => [x.datum, x.mnozstvi, x.podleEvidence, x.rozdil])).toEqual([
      ['2026-11-20', 30, 70, -40],
      ['2026-11-27', 40, 25, 15],
    ]);
    expect(vysledek.dny.find((d) => d.datum === '2026-11-27')!.vecer[0].mnozstvi).toBe(40);
  });

  it('měsíční inventura zůstává „Inventura" a nese svou poznámku', () => {
    const mesicni = buildMovements({
      inventoryRows: [
        { entry_date: '2026-11-01', beer_id: B, package_id: P, quantity: 60, note: 'Počáteční stav' },
        { entry_date: '2026-11-20', beer_id: B, package_id: P, quantity: 50, note: 'Schválená inventura' },
      ],
    });
    const r = radekUpravy(sestavPohybyObdobi(mesicni, filtr));
    expect(r.popis).toBe('Inventura');
    expect(r.uprava).toBe(false);
    expect(r.poznamka).toBe('Schválená inventura');
    expect(r.rozdil).toBe(-10);
  });

  it('souhrn i tabulka po dnech vědí, že šlo o Úpravu skladu', () => {
    const vysledek = sestavPohybyObdobi(buildMovements(zaklad), filtr);
    expect(vysledek.souhrn[0]).toMatchObject({ inventura: true, inventuraUprava: true, inventuraStav: 30, srovnani: -40 });
    const den = tabulkaPoDnech(vysledek.dny, B, P).find((d) => d.datum === '2026-11-20')!;
    expect(den).toMatchObject({ inventura: 30, inventuraUprava: true });
  });
});
