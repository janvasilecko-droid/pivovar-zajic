// Rozbor za měsíc a za jednoho odběratele (lib/rozborObdobi.ts).
// Z provozu 15. 10. 2026: „ten rozbor udělej i měsíční s tím, že si tam můžu
// vyfiltrovat i odběratele." Data níž jsou zkrácená skutečná říjnová data
// Restaurace (včetně zdvojené objednávky na 11. 10.).
import { describe, expect, it } from 'vitest';
import {
  BEZ_ODBERATELE, klicOdberatele, objednavkyObdobi, odberateleObdobi, pocetObjednavek, radkyRozboruObdobi,
  type ObjednavkaRozboru, type PolozkaObjednavkyRozboru,
} from './rozborObdobi';

const piva = [
  { id: 'sv', name: '12° Světlá' },
  { id: 'de', name: '10° Desítka' },
  { id: 'tm', name: '12° Tmavá' },
  { id: 'ja', name: 'Jantar' },
];
const obaly = [
  { id: 'k50', label: 'KEG 50l', kind: 'keg' },
  { id: 'k30', label: 'KEG 30l', kind: 'keg' },
  { id: 'p15', label: 'PET 1,5 l', kind: 'bottle' },
];

const obj = (id: string, place_name: string | null, delivery_date: string | null, order_date: string, extra: Partial<ObjednavkaRozboru> = {}): ObjednavkaRozboru =>
  ({ id, place_name, delivery_date, order_date, status: 'nova', ...extra });
const pol = (order_id: string, beer_id: string, package_id: string, quantity: number | string): PolozkaObjednavkyRozboru =>
  ({ order_id, beer_id, package_id, quantity });

const objednavky: ObjednavkaRozboru[] = [
  obj('r-6', 'Restaurace', '2026-10-06', '2026-10-05'),
  obj('r-11a', 'Restaurace', '2026-10-11', '2026-10-11'),
  obj('r-11b', 'Restaurace', '2026-10-11', '2026-10-13'),   // zdvojená, zadaná zpětně
  obj('r-12', 'Restaurace', '2026-10-12', '2026-10-13'),
  obj('r-bez-data', 'restaurace ', null, '2026-10-03'),        // bez data dovozu → podle zadání
  obj('r-storno', 'Restaurace', '2026-10-13', '2026-10-13', { status: 'storno' }),
  obj('r-zari', 'Restaurace', '2026-09-30', '2026-09-28'),
  obj('r-listopad', 'Restaurace', '2026-11-02', '2026-10-30'), // zadaná v říjnu, vezte se v listopadu
  obj('l-12', 'Hospoda U Lípy', '2026-10-12', '2026-10-12'),
  obj('x-1', null, '2026-10-20', '2026-10-20'),
];
const polozky: PolozkaObjednavkyRozboru[] = [
  pol('r-6', 'de', 'k50', 1), pol('r-6', 'tm', 'k30', 1), pol('r-6', 'sv', 'k50', 2),
  pol('r-11a', 'de', 'k30', 1), pol('r-11a', 'sv', 'k50', 1),
  pol('r-11b', 'de', 'k30', 1), pol('r-11b', 'tm', 'k50', 1), pol('r-11b', 'sv', 'k50', 1),
  pol('r-12', 'ja', 'p15', 5), pol('r-12', 'ja', 'p15', 5), pol('r-12', 'sv', 'p15', 5),
  pol('r-bez-data', 'sv', 'p15', '5'),
  pol('r-storno', 'sv', 'k50', 9),
  pol('r-zari', 'sv', 'k50', 7),
  pol('r-listopad', 'sv', 'k50', 4),
  pol('l-12', 'sv', 'k50', 3),
  pol('x-1', 'de', 'k30', 2),
];

const ZARI_LISTOPAD = { od: '2026-10-01', doDne: '2026-10-31' };
const radek = (radky: ReturnType<typeof radkyRozboruObdobi>['radky'], klic: string) => radky.find((r) => r.key === klic);

describe('klicOdberatele', () => {
  it('velká písmena, diakritika a mezery nic nemění; prázdné jméno má vlastní klíč', () => {
    expect(klicOdberatele('Restaurace')).toBe(klicOdberatele('  restaurace '));
    expect(klicOdberatele('Hospoda U Lípy')).toBe(klicOdberatele('hospoda u lipy'));
    expect(klicOdberatele(null)).toBe(BEZ_ODBERATELE);
    expect(klicOdberatele('   ')).toBe(BEZ_ODBERATELE);
    expect(klicOdberatele('Restaurace')).not.toBe(klicOdberatele('Terasa'));
  });
});

describe('objednavkyObdobi', () => {
  it('počítá podle data dovozu, a když chybí, podle data zadání; krajní dny patří do období', () => {
    const ids = objednavkyObdobi(objednavky, ZARI_LISTOPAD.od, ZARI_LISTOPAD.doDne).map((o) => o.id);
    expect(ids).toEqual(['r-6', 'r-11a', 'r-11b', 'r-12', 'r-bez-data', 'l-12', 'x-1']);
    // zadaná v říjnu, ale dovoz v listopadu → patří do listopadu
    expect(objednavkyObdobi(objednavky, '2026-11-01', '2026-11-30').map((o) => o.id)).toEqual(['r-listopad']);
    // krajní dny: 30. 9. je ještě září, 1. 10. už říjen
    expect(objednavkyObdobi([obj('a', 'A', '2026-10-01', '2026-10-01'), obj('b', 'B', '2026-09-30', '2026-09-30'), obj('c', 'C', '2026-10-31', '2026-10-31')], '2026-10-01', '2026-10-31').map((o) => o.id)).toEqual(['a', 'c']);
  });

  it('stornované objednávky se nepočítají', () => {
    expect(objednavkyObdobi(objednavky, ZARI_LISTOPAD.od, ZARI_LISTOPAD.doDne).some((o) => o.id === 'r-storno')).toBe(false);
  });

  it('objednávka bez jakéhokoli data se nepočítá nikam', () => {
    expect(objednavkyObdobi([{ id: 'z', place_name: 'A', delivery_date: null, order_date: null }], '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('odberateleObdobi', () => {
  it('stejného odběratele v různém psaní sloučí, spočítá objednávky a seřadí abecedně', () => {
    expect(odberateleObdobi(objednavky, ZARI_LISTOPAD.od, ZARI_LISTOPAD.doDne)).toEqual([
      { klic: klicOdberatele('Hospoda U Lípy'), jmeno: 'Hospoda U Lípy', objednavek: 1 },
      { klic: klicOdberatele('Restaurace'), jmeno: 'Restaurace', objednavek: 5 },
      { klic: BEZ_ODBERATELE, jmeno: 'Bez odběratele', objednavek: 1 },
    ]);
  });

  it('jméno je to psaní, které se v období použilo nejčastěji', () => {
    const o = [
      obj('1', 'restaurace', '2026-10-01', '2026-10-01'), obj('2', 'Restaurace', '2026-10-02', '2026-10-02'),
      obj('3', 'Restaurace', '2026-10-03', '2026-10-03'), obj('4', 'RESTAURACE ', '2026-10-04', '2026-10-04'),
    ];
    expect(odberateleObdobi(o, '2026-10-01', '2026-10-31')[0].jmeno).toBe('Restaurace');
  });

  it('odběratel bez objednávky v období v nabídce není', () => {
    expect(odberateleObdobi(objednavky, '2026-09-01', '2026-09-30').map((o) => o.jmeno)).toEqual(['Restaurace']);
    expect(odberateleObdobi(objednavky, '2026-08-01', '2026-08-31')).toEqual([]);
  });
});

describe('radkyRozboruObdobi — všichni odběratelé', () => {
  const vsichni = (extra: Partial<Parameters<typeof radkyRozboruObdobi>[0]> = {}) => radkyRozboruObdobi({
    objednavky, polozky, kegging: [], bottling: [], ...ZARI_LISTOPAD, odberatel: null, piva, obaly, ...extra,
  });

  it('součet objednaných kusů po pivu a obalu za celý měsíc, bez storna a bez jiných měsíců', () => {
    const { radky, objednavek } = vsichni();
    expect(objednavek).toBe(7);
    // Světlá 50 l: 2 (6. 10.) + 1 + 1 (zdvojená 11. 10.) + 3 (Lípa) — storno 9, září 7 a listopad 4 ne
    expect(radek(radky, 'sv__k50')).toMatchObject({ objednano: 7, stoceno: 0, stocit: 0, dluh: 0, lahve: false });
    expect(radek(radky, 'de__k30')).toMatchObject({ objednano: 4 });   // 1 + 1 + 2 (bez odběratele)
    expect(radek(radky, 'de__k50')).toMatchObject({ objednano: 1 });
    expect(radek(radky, 'tm__k30')).toMatchObject({ objednano: 1 });
    expect(radek(radky, 'tm__k50')).toMatchObject({ objednano: 1 });
    // dva řádky téhož piva a obalu v jedné objednávce se sečtou; množství jako text taky
    expect(radek(radky, 'ja__p15')).toMatchObject({ objednano: 10, lahve: true });
    expect(radek(radky, 'sv__p15')).toMatchObject({ objednano: 10, lahve: true });
  });

  it('sudy jsou před lahvemi, uvnitř podle piva a obalu; názvy z katalogu', () => {
    const { radky } = vsichni();
    expect(radky.map((r) => r.key)).toEqual([
      'de__k30', 'de__k50', 'sv__k50', 'tm__k30', 'tm__k50',
      'sv__p15', 'ja__p15',   // „12° Světlá" se řadí před „Jantar" (čísla před písmeny)
    ]);
    expect(radky[0]).toMatchObject({ beer_name: '10° Desítka', package_label: 'KEG 30l' });
  });

  it('stočené za měsíc se přidá (jen v období), i položka bez objednávky; sklad jen když se zásoba předá', () => {
    const kegging = [
      { entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k50', quantity: 3 },
      { entry_date: '2026-09-30', beer_id: 'sv', package_id: 'k50', quantity: 9 },
      { entry_date: '2026-10-31', beer_id: 'sv', package_id: 'k50', quantity: 1 },
    ];
    const bottling = [{ entry_date: '2026-10-20', beer_id: 'ja', package_id: 'p15', quantity: 40 }, { entry_date: '2026-10-21', beer_id: 'de', package_id: 'p15', quantity: 100 }];
    const bez = vsichni({ kegging, bottling });
    expect(radek(bez.radky, 'sv__k50')).toMatchObject({ stoceno: 4, objednano: 7, skladem: null });
    expect(radek(bez.radky, 'ja__p15')).toMatchObject({ stoceno: 40, objednano: 10 });
    expect(radek(bez.radky, 'de__p15')).toMatchObject({ stoceno: 100, objednano: 0, lahve: true });

    const sSkladem = vsichni({ kegging, bottling, zasoba: new Map([['sv__k50', 12], ['ja__p15', 3]]) });
    expect(radek(sSkladem.radky, 'sv__k50')!.skladem).toBe(12);
    expect(radek(sSkladem.radky, 'ja__p15')!.skladem).toBe(3);
    expect(radek(sSkladem.radky, 'de__k30')!.skladem).toBe(0);   // v zásobě není → 0, ne „neznámý"
  });

  it('řádky bez piva nebo obalu a nulová či neplatná množství se nepočítají', () => {
    const { radky } = radkyRozboruObdobi({
      objednavky: [obj('a', 'A', '2026-10-05', '2026-10-05')],
      polozky: [
        { order_id: 'a', beer_id: null, package_id: 'k50', quantity: 5 },
        { order_id: 'a', beer_id: 'sv', package_id: null, quantity: 5 },
        pol('a', 'sv', 'k50', 0), pol('a', 'sv', 'k50', 'x'), pol('a', 'sv', 'k50', -2),
        pol('a', 'de', 'k50', 2), pol('a', 'de', 'k50', -1),   // záporný řádek množství neubírá
      ],
      kegging: [], bottling: [], ...ZARI_LISTOPAD, odberatel: null, piva, obaly,
    });
    expect(radky.map((r) => [r.key, r.objednano])).toEqual([['de__k50', 2]]);
  });

  it('prázdné období nevrátí nic', () => {
    expect(radkyRozboruObdobi({ objednavky, polozky, kegging: [], bottling: [], od: '2026-08-01', doDne: '2026-08-31', odberatel: null, piva, obaly })).toEqual({ radky: [], objednavek: 0 });
  });
});

describe('radkyRozboruObdobi — jeden odběratel', () => {
  const restaurace = (extra: Partial<Parameters<typeof radkyRozboruObdobi>[0]> = {}) => radkyRozboruObdobi({
    objednavky, polozky, kegging: [], bottling: [], ...ZARI_LISTOPAD, odberatel: klicOdberatele('Restaurace'), piva, obaly, ...extra,
  });

  it('jen objednávky toho odběratele (i v jiném psaní), zdvojená 11. 10. se počítá obě', () => {
    const { radky, objednavek } = restaurace();
    expect(objednavek).toBe(5);
    expect(radek(radky, 'sv__k50')).toMatchObject({ objednano: 4 });   // 2 + 1 + 1, ne Lípa
    expect(radek(radky, 'de__k30')).toMatchObject({ objednano: 2 });   // 11. 10. dvakrát, ne „bez odběratele"
    expect(radek(radky, 'sv__p15')).toMatchObject({ objednano: 10 });  // „restaurace " bez data dovozu
    expect(radek(radky, 'ja__p15')).toMatchObject({ objednano: 10 });
  });

  it('stočeno ani sklad se u odběratele neukazuje, ani když jsou data k dispozici', () => {
    const { radky } = restaurace({
      kegging: [{ entry_date: '2026-10-06', beer_id: 'sv', package_id: 'k50', quantity: 3 }],
      bottling: [{ entry_date: '2026-10-20', beer_id: 'tm', package_id: 'p15', quantity: 40 }],
      zasoba: new Map([['sv__k50', 12]]),
    });
    expect(radek(radky, 'sv__k50')).toMatchObject({ stoceno: 0, skladem: null });
    // položka, která se jen stočila a odběratel ji neobjednal, mezi jeho řádky nepatří
    expect(radek(radky, 'tm__p15')).toBeUndefined();
  });

  it('odběratel bez jména (null) se dá vybrat taky', () => {
    const { radky, objednavek } = restaurace({ odberatel: BEZ_ODBERATELE });
    expect(objednavek).toBe(1);
    expect(radky.map((r) => [r.key, r.objednano])).toEqual([['de__k30', 2]]);
  });

  it('odběratel, který v období nic neobjednal, dá prázdný výsledek', () => {
    expect(restaurace({ odberatel: klicOdberatele('Terasa') })).toEqual({ radky: [], objednavek: 0 });
  });
});

describe('pocetObjednavek', () => {
  it.each([[0, '0 objednávek'], [1, '1 objednávka'], [2, '2 objednávky'], [4, '4 objednávky'], [5, '5 objednávek'], [11, '11 objednávek']])('%i → %s', (n, text) => {
    expect(pocetObjednavek(n)).toBe(text);
  });
});
