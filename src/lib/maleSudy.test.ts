// Z provozu 29. 9. 2026: „když mám 3× 15, hlídej, že můžu celkem použít
// jen 3× 15, ne třeba 6× 15."
import { describe, it, expect } from 'vitest';
import {
  hlidejMaleSudy, jeMalySud, odjelaPoZadani, plneKZadani, prazdneMaleSudy, sudyObjednavky, volneProObjednavku, zadaniMalychSudu,
} from './maleSudy';
import { kratkyDen, popisOdvezenych } from './maleSudyPopis';

const o = (id: string, delivery_date: string | null, extra: Record<string, unknown> = {}) => ({ id, delivery_date, status: 'nova', is_delivered: false, ...extra });
const p = (id: string, order_id: string, package_id: string, quantity: number) => ({ id, order_id, package_id, quantity });

describe('malé sudy', () => {
  it('malý sud je KEG pod 30 l', () => {
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 15 })).toBe(true);
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 20 })).toBe(true);
    expect(jeMalySud({ id: 'a', kind: 'keg', volume_l: 30 })).toBe(false);
    expect(jeMalySud({ id: 'a', kind: 'bottle', volume_l: 1 })).toBe(false);
  });

  it('3× 15 l na skladě, objednávky chtějí 6 — tři se označí jako nad počet', () => {
    const r = hlidejMaleSudy(
      { k15: 3 },
      [o('A', '2026-09-30'), o('B', '2026-10-01')],
      [p('a1', 'A', 'k15', 2), p('b1', 'B', 'k15', 4)],
    );
    expect(r.souhrn).toEqual([{ package_id: 'k15', mame: 3, objednano: 6, nad: 3, plneSkladem: {}, zapocitanoPlnych: 0, zadano: 3, odvezeno: 0, odvezenoZ: [] }]);
    // Dřívější dovoz má přednost: A se vejde celá, B jen 1 ze 4.
    expect(r.nadPoPolozce.get('a1')).toBeUndefined();
    expect(r.nadPoPolozce.get('b1')).toBe(3);
  });

  it('storno, zavezené a vyřízené se nepočítají', () => {
    const r = hlidejMaleSudy(
      { k15: 3 },
      [o('A', '2026-09-30', { status: 'storno' }), o('B', '2026-09-30', { is_delivered: true }), o('C', '2026-09-30', { status: 'vyrizeno_zavoz' }), o('D', '2026-10-01')],
      [p('a', 'A', 'k15', 5), p('b', 'B', 'k15', 5), p('c', 'C', 'k15', 5), p('d', 'D', 'k15', 3)],
    );
    expect(r.souhrn[0]).toMatchObject({ objednano: 3, nad: 0 });
    expect(r.nadPoPolozce.size).toBe(0);
  });

  it('obal bez naklikaného počtu se nehlídá', () => {
    const r = hlidejMaleSudy({}, [o('A', '2026-09-30')], [p('a', 'A', 'k15', 99)]);
    expect(r.souhrn).toEqual([]);
    expect(r.nadPoPolozce.size).toBe(0);
  });

  it('objednávka bez data dovozu jde na konec fronty', () => {
    const r = hlidejMaleSudy(
      { k20: 2 },
      [o('bezData', null), o('A', '2026-10-02')],
      [p('x', 'bezData', 'k20', 2), p('a', 'A', 'k20', 2)],
    );
    expect(r.nadPoPolozce.get('a')).toBeUndefined();
    expect(r.nadPoPolozce.get('x')).toBe(2);
  });

  it('nula znamená, že nemáme žádný — vše je nad počet', () => {
    const r = hlidejMaleSudy({ k10: 0 }, [o('A', '2026-09-30')], [p('a', 'A', 'k10', 1)]);
    expect(r.nadPoPolozce.get('a')).toBe(1);
  });
});

import { volneProObjednavku } from './maleSudy';

describe('volné malé sudy pro jednu objednávku', () => {
  const souhrn = [{ package_id: 'k15', mame: 3, objednano: 2, nad: 0 }];
  it('nová objednávka smí jen to, co zbylo', () => {
    expect(volneProObjednavku(souhrn, 'k15')).toBe(1);
  });
  it('úprava objednávky uvolní její původní kusy', () => {
    expect(volneProObjednavku(souhrn, 'k15', 2)).toBe(3);
  });
  it('nehlídaný obal → null', () => {
    expect(volneProObjednavku(souhrn, 'k20')).toBeNull();
    expect(volneProObjednavku(souhrn, null)).toBeNull();
  });
  it('když je přečerpáno, vyjde záporné číslo', () => {
    expect(volneProObjednavku([{ package_id: 'k15', mame: 3, objednano: 5, nad: 2 }], 'k15')).toBe(-2);
  });
});

import { rozdelMaleSudyVObjednavce, silaPiva } from './maleSudy';

describe('malé sudy po řádcích objednávky', () => {
  // „mám 1× 20 a 2× 15, je tam 2× 20 12° → oranžově −1× 20; 2× 15 normálně;
  // zbytek malých červeně; 30 l a PET normálně"
  const souhrn = [
    { package_id: 'k20', mame: 1, objednano: 0, nad: 0 },
    { package_id: 'k15', mame: 2, objednano: 0, nad: 0 },
  ];
  it('příklad z provozu', () => {
    const r = rozdelMaleSudyVObjednavce(souhrn, [
      { klic: 'a', pkgId: 'k20', qty: 2, sila: 12 },
      { klic: 'b', pkgId: 'k15', qty: 2, sila: 12 },
      { klic: 'c', pkgId: 'k15', qty: 1, sila: 10 },
      { klic: 'd', pkgId: 'k30', qty: 4, sila: 12 },
      { klic: 'e', pkgId: 'pet1', qty: 20, sila: 12 },
    ]);
    expect(r.get('a')).toEqual({ kryto: 1, chybi: 1 });
    expect(r.get('b')).toEqual({ kryto: 2, chybi: 0 });
    expect(r.get('c')).toEqual({ kryto: 0, chybi: 1 });
    expect(r.has('d')).toBe(false);
    expect(r.has('e')).toBe(false);
  });
  it('nejsilnější pivo dostane sud první, i když je v objednávce níž', () => {
    const r = rozdelMaleSudyVObjednavce(souhrn, [
      { klic: 'desitka', pkgId: 'k20', qty: 1, sila: 10 },
      { klic: 'dvanactka', pkgId: 'k20', qty: 1, sila: 12 },
    ]);
    expect(r.get('dvanactka')).toEqual({ kryto: 1, chybi: 0 });
    expect(r.get('desitka')).toEqual({ kryto: 0, chybi: 1 });
  });
  it('síla piva z degree nebo z názvu', () => {
    expect(silaPiva({ degree: '12°' })).toBe(12);
    expect(silaPiva({ degree: '11,5' })).toBe(11.5);
    expect(silaPiva({ degree: null, name: '10 Výčepní' })).toBe(10);
    expect(silaPiva({ name: 'Jantar' })).toBe(0);
  });
  it('mezi objednávkami platí dovoz, uvnitř objednávky síla', () => {
    const r = hlidejMaleSudy(
      { k20: 1 },
      [o('A', '2026-09-30')],
      [{ id: 'x10', order_id: 'A', package_id: 'k20', quantity: 1, beer_id: 'b10' }, { id: 'x12', order_id: 'A', package_id: 'k20', quantity: 1, beer_id: 'b12' }],
      new Map([['b10', 10], ['b12', 12]]),
    );
    expect(r.nadPoPolozce.get('x12')).toBeUndefined();
    expect(r.nadPoPolozce.get('x10')).toBe(1);
  });
});

import { chystaSeOd } from './maleSudy';

describe('staré nezavezené objednávky sudy nedrží (29. 9. 2026)', () => {
  // „v malých sudech mi to píše, že chybí přes 100 sudů"
  it('objednávka z minulého týdne se nepočítá, dnešní a pozdější ano', () => {
    const r = hlidejMaleSudy(
      { k15: 2 },
      [o('stara', '2026-09-15'), o('dnes', '2026-09-29'), o('zitra', '2026-09-30')],
      [p('s', 'stara', 'k15', 50), p('d', 'dnes', 'k15', 1), p('z', 'zitra', 'k15', 1)],
      undefined,
      '2026-09-29',
    );
    expect(r.souhrn[0]).toMatchObject({ objednano: 2, nad: 0 });
    expect(r.poPolozce.get('d')).toMatchObject({ kryto: 1, chybi: 0 });
    expect(r.poPolozce.has('s')).toBe(false);
  });
  it('bez data závozu: týden od objednání', () => {
    expect(chystaSeOd({ id: 'a', delivery_date: null, order_date: '2026-09-25' }, '2026-09-29')).toBe(true);
    expect(chystaSeOd({ id: 'a', delivery_date: null, order_date: '2026-09-01' }, '2026-09-29')).toBe(false);
  });
});

// 30. 9. 2026: „v otevřených objednávkách mi píše, že chybí malé sudy —
// všechny malé sudy odešly, 1× 20 11° jsem stáhl ze zrušeného Manea."
describe('malé sudy — odjeté a stočené skladem', () => {
  it('objednávka už odepsaná ze skladu (sudy odjely) nebere sud z počtu', () => {
    const r = hlidejMaleSudy(
      { k20: 1 },
      [o('DNES', '2026-09-30'), o('ZITRA', '2026-10-01')],
      [p('a', 'DNES', 'k20', 1), p('b', 'ZITRA', 'k20', 1)],
      undefined, '2026-09-30', { odepsane: new Set(['DNES']) },
    );
    expect(r.souhrn).toMatchObject([{ package_id: 'k20', mame: 1, objednano: 1, nad: 0 }]);
    expect(r.poPolozce.has('a')).toBe(false);
  });

  // 6. 10. 2026: „žádné plné, tohle jsou prázdné, z těch se dělají
  // objednávky — pokud jsou na skladě plné, upozorni na to akorát."
  it('plný sud skladem počet prázdných nemění, jen se ukáže jako upozornění', () => {
    const r = hlidejMaleSudy(
      { k20: 0 },
      [o('A', '2026-10-01')],
      [{ ...p('a', 'A', 'k20', 2), beer_id: 'b11' }],
      undefined, '2026-09-30', { skladem: new Map([['b11__k20', 1]]) },
    );
    expect(r.souhrn[0]).toMatchObject({ objednano: 2, nad: 2, plneSkladem: { b11: 1 } });
    expect(r.poPolozce.get('a')).toEqual({ kryto: 0, chybi: 2, zeSkladu: 0 });
  });

  it('záporný stav skladu se jako plné sudy neukáže', () => {
    const r = hlidejMaleSudy(
      { k20: 1 },
      [o('A', '2026-10-01')],
      [{ ...p('a', 'A', 'k20', 1), beer_id: 'b11' }],
      undefined, '2026-09-30', { skladem: new Map([['b11__k20', -2]]) },
    );
    expect(r.poPolozce.get('a')).toEqual({ kryto: 1, chybi: 0, zeSkladu: 0 });
    expect(r.souhrn[0].plneSkladem).toEqual({});
  });
});

describe('prazdneMaleSudy — počet platí týden, stočení ho neubírá (21. 10. 2026)', () => {
  const den = (iso: string) => iso.slice(0, 10);
  const r = (pocet: number, updated_at: string) => ({ package_id: 'p15', pocet, updated_at });

  it('ukáže přesně naklikané číslo', () => {
    expect(prazdneMaleSudy([r(3, '2026-10-05T06:00:00Z')], '2026-10-07', den)).toEqual({ p15: 3 });
  });

  it('počet z minulého týdne se nehlídá', () => {
    expect(prazdneMaleSudy([r(3, '2026-10-01T06:00:00Z')], '2026-10-05', den)).toEqual({});
    // Neděle téhož týdne ještě platí.
    expect(prazdneMaleSudy([r(3, '2026-10-05T06:00:00Z')], '2026-10-11', den)).toEqual({ p15: 3 });
  });
});

// 6. 10. 2026: „ty malé sudy jsou špatně" — Food truck 3× 20 l a 2× 10 l
// 10° Desítky, prázdných 3× 20 l a 4× 10 l, skladem 2 plné 20l Desítky.
describe('malé sudy — každý objednaný sud bere prázdný (6. 10. 2026)', () => {
  it('3 prázdné 20 l a objednávka 3× 20 l = 0 volných; plné 20l Desítky jen upozorní', () => {
    const r = hlidejMaleSudy(
      { k20: 3, k10: 4 },
      [o('FOOD', '2026-10-09')],
      [{ ...p('a', 'FOOD', 'k20', 3), beer_id: 'b10' }, { ...p('b', 'FOOD', 'k10', 2), beer_id: 'b10' }],
      undefined, '2026-10-06', { skladem: new Map([['b10__k20', 2]]) },
    );
    const k20 = r.souhrn.find((s) => s.package_id === 'k20');
    const k10 = r.souhrn.find((s) => s.package_id === 'k10');
    expect(k20).toMatchObject({ mame: 3, objednano: 3, nad: 0, plneSkladem: { b10: 2 } });
    expect(k10).toMatchObject({ mame: 4, objednano: 2, nad: 0, plneSkladem: {} });
    expect(r.poPolozce.get('a')).toEqual({ kryto: 3, chybi: 0, zeSkladu: 0 });
  });

  // „…přidej otázku, zda se mají započítat — když ne, nepočítej je, když jo,
  // tak je počítej."
  it('se „započítat plné" u 20 l pokryjí plné Desítky dva sudy, prázdný se bere na zbytek', () => {
    const r = hlidejMaleSudy(
      { k20: 3, k10: 4 },
      [o('FOOD', '2026-10-07')],
      [{ ...p('a', 'FOOD', 'k20', 3), beer_id: 'b10' }, { ...p('b', 'FOOD', 'k10', 2), beer_id: 'b10' }],
      undefined, '2026-10-06', { skladem: new Map([['b10__k20', 2], ['b10__k10', 1]]), zapocitatPlne: new Set(['k20']) },
    );
    expect(r.souhrn.find((s) => s.package_id === 'k20')).toMatchObject({ objednano: 1, zapocitanoPlnych: 2, plneSkladem: { b10: 2 } });
    // 10 l se nezapočítává — plný 10l sud skladem jen upozorní.
    expect(r.souhrn.find((s) => s.package_id === 'k10')).toMatchObject({ objednano: 2, zapocitanoPlnych: 0, plneSkladem: { b10: 1 } });
    expect(r.poPolozce.get('a')).toEqual({ kryto: 3, chybi: 0, zeSkladu: 2 });
  });
});

// 6. 10. 2026: „…to samý Martin malý sudy" — vozí si svoje.
describe('malé sudy — odběratel s vlastními sudy nebere prázdné pivovaru', () => {
  it('Martinova objednávka 2× 20 l z naklikaných prázdných nic nebere', () => {
    const r = hlidejMaleSudy(
      { k20: 3 },
      [{ ...o('M', '2026-10-07'), place_name: 'MARTIN' }, { ...o('H', '2026-10-07'), place_name: 'Hospoda' }],
      [p('m', 'M', 'k20', 2), p('h', 'H', 'k20', 1)],
      undefined, '2026-10-06',
    );
    expect(r.souhrn[0]).toMatchObject({ mame: 3, objednano: 1, nad: 0 });
    expect(r.poPolozce.has('m')).toBe(false);
  });
});

// 14. 10. 2026, Egon: „do jejich sudu“ v objednávce — nemá se psát „nejsou sudy“.
describe('malé sudy — objednávka s poznámkou „do vlastního sudu“', () => {
  it('nebere prázdný sud pivovaru a neukáže „nejsou sudy“, ani když žádné nejsou', () => {
    const r = hlidejMaleSudy(
      { k20: 0 },
      [{ ...o('E', '2026-10-14'), place_name: 'EGON', note: 'do vlastního sudu' }],
      [p('e', 'E', 'k20', 1)],
      undefined, '2026-10-14',
    );
    expect(r.poPolozce.has('e')).toBe(false);
    expect(r.nadPoPolozce.has('e')).toBe(false);
    expect(r.souhrn[0]).toMatchObject({ mame: 0, objednano: 0, nad: 0 });
  });

  it('stejný odběratel bez poznámky o vlastním sudu sud pivovaru potřebuje', () => {
    const r = hlidejMaleSudy(
      { k20: 0 },
      [{ ...o('E', '2026-10-14'), place_name: 'EGON', note: 'vyzvednout prázdné sudy' }],
      [p('e', 'E', 'k20', 1)],
      undefined, '2026-10-14',
    );
    expect(r.poPolozce.get('e')).toMatchObject({ kryto: 0, chybi: 1 });
  });

  it('ostatním objednávkám zbudou sudy, které by si vzala', () => {
    const r = hlidejMaleSudy(
      { k20: 1 },
      [
        { ...o('E', '2026-10-14'), place_name: 'EGON', note: 'do jejich sudu' },
        { ...o('H', '2026-10-14'), place_name: 'Hospoda' },
      ],
      [p('e', 'E', 'k20', 1), p('h', 'H', 'k20', 1)],
      undefined, '2026-10-14',
    );
    expect(r.souhrn[0]).toMatchObject({ mame: 1, objednano: 1, nad: 0 });
    expect(r.poPolozce.get('h')).toMatchObject({ kryto: 1, chybi: 0 });
  });
});

// 1. 11. 2026: „v malých sudech vidím počty… ty se měly odečíst podle
// objednávek, měly by tam být jen 2× 10 prázdné." Naklikáno v úterý 27. 10.
// (20 l = 4, 15 l = 2, 10 l = 8), Maneo ve čtvrtek odvezlo 4× 20, 2× 15
// a 6× 10 — a jakmile se odepsalo, sudy se k počtu zase „vrátily".
describe('malé sudy — objednávky odjeté od zadání počet zmenší (1. 11. 2026)', () => {
  const ZADANO = '2026-10-27T08:43:05.807+00:00';
  const zadano = { k20: { cas: ZADANO, den: '2026-10-27' }, k15: { cas: ZADANO, den: '2026-10-27' }, k10: { cas: ZADANO, den: '2026-10-27' } };
  const zavezena = (id: string, den: string, created_at: string, extra: Record<string, unknown> = {}) =>
    o(id, den, { is_delivered: true, created_at, ...extra });
  const objednavky = [
    zavezena('MANEO', '2026-10-29', '2026-10-27T12:16:00+00:00', { place_name: 'Maneo' }),
    zavezena('EGON', '2026-10-28', '2026-10-27T11:19:00+00:00', { place_name: 'EGON', note: 'do vlastního sudu' }),
    zavezena('MARTIN', '2026-10-29', '2026-10-29T08:38:00+00:00', { place_name: 'MARTIN' }),
    zavezena('RADEK', '2026-10-22', '2026-10-20T10:16:00+00:00', { place_name: 'Radek' }),
  ];
  const polozky = [
    p('m1', 'MANEO', 'k10', 3), p('m2', 'MANEO', 'k15', 2), p('m3', 'MANEO', 'k10', 3),
    p('m4', 'MANEO', 'k20', 1), p('m5', 'MANEO', 'k20', 1), p('m6', 'MANEO', 'k20', 2),
    p('e1', 'EGON', 'k20', 1), p('t1', 'MARTIN', 'k10', 1), p('r1', 'RADEK', 'k10', 2),
  ];

  it('příklad z provozu: zbudou jen 2× 10 l prázdné', () => {
    const r = hlidejMaleSudy({ k20: 4, k15: 2, k10: 8 }, objednavky, polozky, undefined, '2026-11-01', {
      odepsane: new Set(['MANEO', 'EGON', 'MARTIN', 'RADEK']), zadano,
    });
    const s = (k: string) => r.souhrn.find((x) => x.package_id === k);
    expect(s('k20')).toMatchObject({ zadano: 4, odvezeno: 4, mame: 0, objednano: 0, nad: 0 });
    expect(s('k15')).toMatchObject({ zadano: 2, odvezeno: 2, mame: 0, objednano: 0, nad: 0 });
    expect(s('k10')).toMatchObject({ zadano: 8, odvezeno: 6, mame: 2, objednano: 0, nad: 0 });
    // Egon i Martin vozí vlastní sudy, Radek odjel minulý týden — nic neberou.
    expect(s('k10')!.odvezenoZ).toEqual([{ order_id: 'MANEO', nazev: 'Maneo', den: '2026-10-29', kusu: 6, plnych: 0 }]);
    expect(popisOdvezenych(s('k10')!, '2026-10-27')).toBe('Naklikáno 8 (út 27. 10.), od té doby odjelo 6: Maneo 6× (čt 29. 10.).');
    // Odjeté objednávky se mezi „nad počet" ani do řádků objednávek nepletou.
    expect(r.poPolozce.size).toBe(0);
    expect(r.nadPoPolozce.size).toBe(0);
  });

  it('K dispozici se odvozem nezmění — sud se počítá jednou (dřív v objednávkách, pak v odjetých)', () => {
    const maneo = (odjela: boolean) => o('MANEO', '2026-10-29', { created_at: '2026-10-27T12:16:00+00:00', place_name: 'Maneo', is_delivered: odjela });
    const pred = hlidejMaleSudy({ k10: 8 }, [maneo(false)], [p('m1', 'MANEO', 'k10', 6)], undefined, '2026-10-28', { zadano });
    const po = hlidejMaleSudy({ k10: 8 }, [maneo(true)], [p('m1', 'MANEO', 'k10', 6)], undefined, '2026-10-29', {
      odepsane: new Set(['MANEO']), zadano,
    });
    expect(pred.souhrn[0]).toMatchObject({ mame: 8, objednano: 6, odvezeno: 0 });
    expect(po.souhrn[0]).toMatchObject({ mame: 2, objednano: 0, odvezeno: 6 });
    expect(pred.souhrn[0].mame - pred.souhrn[0].objednano).toBe(po.souhrn[0].mame - po.souhrn[0].objednano);
  });

  it('bez času zadání (stará data) se nic neodečítá', () => {
    const r = hlidejMaleSudy({ k10: 8 }, objednavky, polozky, undefined, '2026-11-01', { odepsane: new Set(['MANEO']) });
    expect(r.souhrn[0]).toMatchObject({ mame: 8, odvezeno: 0, odvezenoZ: [] });
  });

  it('storno, zpětně zapsaná a dřív odvezená počet nemění; odjelo víc než naklikáno → 0, ne mínus', () => {
    const r = hlidejMaleSudy(
      { k10: 3 },
      [
        o('STORNO', '2026-10-29', { status: 'storno', created_at: '2026-10-27T12:00:00Z' }),
        // Zapsaná po zadání, ale závoz už v neděli — sudy odjely před počítáním.
        zavezena('ZPETNE', '2026-10-25', '2026-10-27T12:00:00Z'),
        zavezena('VELKA', '2026-10-30', '2026-10-27T12:00:00Z', { place_name: 'Hospoda' }),
        o('OTEVRENA', '2026-11-03', { created_at: '2026-10-30T12:00:00Z' }),
      ],
      [p('s', 'STORNO', 'k10', 2), p('z', 'ZPETNE', 'k10', 2), p('v', 'VELKA', 'k10', 5), p('ot', 'OTEVRENA', 'k10', 1)],
      undefined, '2026-11-01', { odepsane: new Set(['ZPETNE', 'VELKA']), zadano },
    );
    expect(r.souhrn[0]).toMatchObject({ zadano: 3, odvezeno: 5, mame: 0, objednano: 1, nad: 1 });
    expect(r.nadPoPolozce.get('ot')).toBe(1);
  });

  // Revize 1. 11. 2026: krýt smějí jen plné sudy, které ležely ve skladu už při
  // zadání počtu. Stočené po zadání jsou z naklikaných prázdných.
  it('„započítat plné": plné z doby zadání kryjí před odvozem i po něm, K dispozici neposkočí', () => {
    const polozka = { ...p('a', 'FOOD', 'k20', 3), beer_id: 'b10' };
    const food = (odjela: boolean) => o('FOOD', '2026-10-29', { created_at: '2026-10-27T12:00:00Z', is_delivered: odjela });
    const volby = { zadano, zapocitatPlne: new Set(['k20']), plnePriZadani: new Map([['b10__k20', 2]]) };
    // Před odvozem: 2 plné Desítky z doby zadání pokryjí 2 sudy, prázdný se bere na 1.
    const pred = hlidejMaleSudy({ k20: 4 }, [food(false)], [polozka], undefined, '2026-10-28', { ...volby, skladem: new Map([['b10__k20', 2]]) });
    expect(pred.souhrn[0]).toMatchObject({ mame: 4, objednano: 1, zapocitanoPlnych: 2, plneSkladem: { b10: 2 } });
    // Dostočený třetí sud (sklad 3) krytí nezvětší — je z naklikaných prázdných.
    const stoceno = hlidejMaleSudy({ k20: 4 }, [food(false)], [polozka], undefined, '2026-10-28', { ...volby, skladem: new Map([['b10__k20', 3]]) });
    expect(stoceno.souhrn[0]).toMatchObject({ mame: 4, objednano: 1, zapocitanoPlnych: 2, plneSkladem: { b10: 2 } });
    // Po odvozu (sklad 0): plné z doby zadání pokryjí totéž, z prázdných odjel 1.
    const po = hlidejMaleSudy({ k20: 4 }, [food(true)], [polozka], undefined, '2026-10-29', {
      ...volby, skladem: new Map([['b10__k20', 0]]), odepsane: new Set(['FOOD']),
      odpocty: [{ order_id: 'FOOD', order_item_id: 'a', deduct_date: '2026-10-29', created_at: '2026-10-28T23:05:00Z' }],
    });
    expect(po.souhrn[0]).toMatchObject({ mame: 3, objednano: 0, odvezeno: 1, plneSkladem: {} });
    expect(pred.souhrn[0].mame - pred.souhrn[0].objednano).toBe(po.souhrn[0].mame - po.souhrn[0].objednano);
  });

  it('„započítat plné": sudy stočené až po zadání nekryjí — odvoz počet zmenší celý', () => {
    const polozka = { ...p('a', 'MANEO', 'k20', 3), beer_id: 'b10' };
    const volby = { zadano, zapocitatPlne: new Set(['k20']), plnePriZadani: new Map<string, number>() };
    // Ve středu stočené 3 sudy (sklad 3) — „plné skladem" se neukážou ani nepokryjí.
    const st = hlidejMaleSudy({ k20: 4 }, [o('MANEO', '2026-10-29', { created_at: '2026-10-27T12:00:00Z' })], [polozka], undefined, '2026-10-28', {
      ...volby, skladem: new Map([['b10__k20', 3]]),
    });
    expect(st.souhrn[0]).toMatchObject({ mame: 4, objednano: 3, zapocitanoPlnych: 0, plneSkladem: {} });
    // Čtvrtek po odvozu: z naklikaných 4 zbude 1.
    const ct = hlidejMaleSudy({ k20: 4 }, [o('MANEO', '2026-10-29', { created_at: '2026-10-27T12:00:00Z', is_delivered: true })], [polozka], undefined, '2026-10-29', {
      ...volby, skladem: new Map([['b10__k20', 0]]), odepsane: new Set(['MANEO']),
      odpocty: [{ order_id: 'MANEO', order_item_id: 'a', deduct_date: '2026-10-29', created_at: '2026-10-28T23:05:00Z' }],
    });
    expect(ct.souhrn[0]).toMatchObject({ mame: 1, objednano: 0, odvezeno: 3 });
  });

  it('objednávka bez data závozu: databáze ji odepíše v pátek — K dispozici neposkočí', () => {
    // Zapsaná v pondělí bez dne i data (WhatsApp bez dne) — ve čtvrtek ještě otevřená.
    const bezData = o('B', null, { order_date: '2026-10-26', created_at: '2026-10-26T09:00:00Z' });
    const polozky = [p('b1', 'B', 'k10', 2)];
    const ct = hlidejMaleSudy({ k10: 8 }, [bezData], polozky, undefined, '2026-10-29', { zadano });
    expect(ct.souhrn[0]).toMatchObject({ mame: 8, objednano: 2 });
    const pa = hlidejMaleSudy({ k10: 8 }, [bezData], polozky, undefined, '2026-10-30', {
      zadano, odepsane: new Set(['B']), odpocty: [{ order_id: 'B', order_item_id: 'b1', deduct_date: '2026-10-30', created_at: '2026-10-29T23:05:00Z' }],
    });
    expect(pa.souhrn[0]).toMatchObject({ mame: 6, objednano: 0, odvezeno: 2 });
    expect(pa.souhrn[0].odvezenoZ).toEqual([{ order_id: 'B', nazev: null, den: '2026-10-30', kusu: 2, plnych: 0 }]);
  });

  it('přesun závozu na den zadání (odepsáno hned po zadání) se odečte; odepsané ráno před zadáním ne', () => {
    const radek = o('R', '2026-10-27', { created_at: '2026-10-26T10:00:00Z' });
    const presun = hlidejMaleSudy({ k10: 8 }, [radek], [p('r1', 'R', 'k10', 3)], undefined, '2026-10-27', {
      zadano, odepsane: new Set(['R']), odpocty: [{ order_id: 'R', order_item_id: 'r1', deduct_date: '2026-10-27', created_at: '2026-10-27T12:00:00Z' }],
    });
    expect(presun.souhrn[0]).toMatchObject({ mame: 5, odvezeno: 3 });
    const rano = hlidejMaleSudy({ k10: 8 }, [radek], [p('r1', 'R', 'k10', 3)], undefined, '2026-10-27', {
      zadano, odepsane: new Set(['R']), odpocty: [{ order_id: 'R', order_item_id: 'r1', deduct_date: '2026-10-27', created_at: '2026-10-26T23:05:00Z' }],
    });
    expect(rano.souhrn[0]).toMatchObject({ mame: 8, odvezeno: 0 });
  });
});

describe('odjela objednávka po zadání počtu?', () => {
  const z = { cas: '2026-10-27T08:43:05Z', den: '2026-10-27' };
  const odpocet = (deduct_date: string, created_at: string) => ({ order_id: 'A', order_item_id: 'a1', deduct_date, created_at });

  it('pozdější den odjezdu ano, dřívější ne (i objednávka zapsaná zpětně)', () => {
    expect(odjelaPoZadani(o('A', '2026-10-28'), z)).toBe(true);
    expect(odjelaPoZadani(o('A', '2026-10-26', { created_at: '2026-10-27T10:00:00Z' }), z)).toBe(false);
    expect(odjelaPoZadani(o('A', '2026-10-26', { created_at: '2026-10-27T10:00:00Z' }), z, [odpocet('2026-10-25', '2026-10-27T10:00:00Z')])).toBe(false);
  });

  it('den odjezdu je den odpočtu ze skladu, ne datum v objednávce', () => {
    expect(odjelaPoZadani(o('A', null, { order_date: '2026-10-26' }), z, [odpocet('2026-10-30', '2026-10-29T23:05:00Z')])).toBe(true);
    expect(odjelaPoZadani(o('A', '2026-10-30'), z, [odpocet('2026-10-26', '2026-10-25T23:05:00Z')])).toBe(false);
    // Rozjeté datum (1. 9. 2026: odpočty o týden vedle data doručení): rozhoduje sklad.
    expect(odjelaPoZadani(o('A', '2026-10-26'), z, [odpocet('2026-10-28', '2026-10-27T23:05:00Z')])).toBe(true);
  });

  it('odepsaná nebo zavezená už před zadáním ne — v hlídání tehdy nebyla', () => {
    expect(odjelaPoZadani(o('A', '2026-10-27'), z, [odpocet('2026-10-27', '2026-10-26T23:05:00Z')])).toBe(false);
    expect(odjelaPoZadani(o('A', '2026-10-28', { delivered_at: '2026-10-27T08:00:00Z' }), z)).toBe(false);
    expect(odjelaPoZadani(o('A', '2026-10-27', { delivered_at: '2026-10-27T10:00:00Z' }), z, [odpocet('2026-10-27', '2026-10-27T09:00:00Z')])).toBe(true);
  });

  it('v den zadání: odepsaná až po zadání nebo bez odpočtu (položka bez piva) ano', () => {
    expect(odjelaPoZadani(o('A', '2026-10-27', { created_at: '2026-10-26T15:00:00Z' }), z, [odpocet('2026-10-27', '2026-10-27T12:00:00Z')])).toBe(true);
    expect(odjelaPoZadani(o('A', '2026-10-27', { created_at: '2026-10-26T15:00:00Z' }), z)).toBe(true);
  });

  it('bez data závozu den jako databáze: den v týdnu objednání (výchozí pátek), už prošlý o týden dál', () => {
    expect(odjelaPoZadani(o('A', null, { order_date: '2026-10-26' }), z)).toBe(true);          // pátek 30. 10.
    expect(odjelaPoZadani(o('A', null, { order_date: '2026-10-20' }), z)).toBe(false);         // pátek 23. 10.
    expect(odjelaPoZadani(o('A', null, { order_date: '2026-10-20', delivery_day: 'po' }), z)).toBe(false);  // po 19. 10. → 26. 10.
    expect(odjelaPoZadani(o('A', null, { order_date: '2026-10-21', delivery_day: 'ut' }), z)).toBe(true);   // út 20. 10. → 27. 10.
    expect(odjelaPoZadani(o('A', null), z)).toBe(false);
    expect(odjelaPoZadani(o('A', '2026-10-28'), { cas: 'neplatné', den: '2026-10-27' })).toBe(false);
  });
});

describe('úprava objednávky uvolní přesně to, co jí hlídání připsalo', () => {
  const z = { k20: { cas: '2026-10-27T08:43:05Z', den: '2026-10-27' }, k10: { cas: '2026-10-27T08:43:05Z', den: '2026-10-27' } };

  it('zavezené Maneo: jeho sudy se uvolní, řádky nesvítí „Nejsou sudy"', () => {
    const maneo = o('MANEO', '2026-10-29', { is_delivered: true, created_at: '2026-10-27T12:16:00Z', place_name: 'Maneo' });
    const polozky = [p('m1', 'MANEO', 'k10', 3), p('m2', 'MANEO', 'k10', 3), p('m3', 'MANEO', 'k20', 4)];
    const r = hlidejMaleSudy({ k20: 4, k10: 8 }, [maneo], polozky, undefined, '2026-11-01', { zadano: z, odepsane: new Set(['MANEO']) });
    const uz = (pkg: string) => sudyObjednavky(r.souhrn, r.poPolozce, 'MANEO', polozky, pkg);
    expect([uz('k20'), uz('k10')]).toEqual([4, 6]);
    expect(volneProObjednavku(r.souhrn, 'k20', uz('k20'))).toBe(4);
    expect(volneProObjednavku(r.souhrn, 'k10', uz('k10'))).toBe(8);
  });

  it('odjelo víc, než se naklikalo: uvolní se jen to, co by bez téhle objednávky zbylo', () => {
    const a = o('A', '2026-10-28', { is_delivered: true });
    const b = o('B', '2026-10-29', { is_delivered: true });
    const polozky = [p('a1', 'A', 'k20', 3), p('b1', 'B', 'k20', 3)];
    const r = hlidejMaleSudy({ k20: 4 }, [a, b], polozky, undefined, '2026-11-01', { zadano: z });
    expect(r.souhrn[0]).toMatchObject({ mame: 0, odvezeno: 6 });
    expect(volneProObjednavku(r.souhrn, 'k20', sudyObjednavky(r.souhrn, r.poPolozce, 'B', polozky, 'k20'))).toBe(1);
  });

  it('„započítat plné": otevřená i odjetá dostanou zpátky celé množství (i kusy kryté plnými)', () => {
    const x = o('X', '2026-10-30', { created_at: '2026-10-28T10:00:00Z' });
    const polX = [{ ...p('x1', 'X', 'k20', 6), beer_id: 'bA' }];
    const r = hlidejMaleSudy({ k20: 4 }, [x], polX, undefined, '2026-10-29', {
      zadano: z, zapocitatPlne: new Set(['k20']), skladem: new Map([['bA__k20', 2]]), plnePriZadani: new Map([['bA__k20', 2]]),
    });
    expect(r.souhrn[0]).toMatchObject({ mame: 4, objednano: 4, nad: 0, zapocitanoPlnych: 2 });
    expect(volneProObjednavku(r.souhrn, 'k20', sudyObjednavky(r.souhrn, r.poPolozce, 'X', polX, 'k20'))).toBe(6);

    const d = o('D', '2026-10-29', { is_delivered: true, created_at: '2026-10-27T12:00:00Z' });
    const polD = [{ ...p('d1', 'D', 'k20', 6), beer_id: 'bA' }];
    const po = hlidejMaleSudy({ k20: 4 }, [d], polD, undefined, '2026-11-01', {
      zadano: z, zapocitatPlne: new Set(['k20']), skladem: new Map([['bA__k20', 0]]), plnePriZadani: new Map([['bA__k20', 2]]),
      odepsane: new Set(['D']), odpocty: [{ order_id: 'D', order_item_id: 'd1', deduct_date: '2026-10-29', created_at: '2026-10-28T23:05:00Z' }],
    });
    expect(po.souhrn[0]).toMatchObject({ mame: 0, odvezeno: 4 });
    expect(po.souhrn[0].odvezenoZ).toEqual([{ order_id: 'D', nazev: null, den: '2026-10-29', kusu: 4, plnych: 2 }]);
    expect(volneProObjednavku(po.souhrn, 'k20', sudyObjednavky(po.souhrn, po.poPolozce, 'D', polD, 'k20'))).toBe(6);
  });

  it('objednávka odjetá ještě před zadáním počtu je „mimo počet" — úprava ji nehlídá', () => {
    const pred = o('PRED', '2026-10-26', { is_delivered: true, created_at: '2026-10-24T10:00:00Z' });
    const stara = o('STARA', '2026-10-23', { created_at: '2026-10-20T10:00:00Z' });   // po termínu, odepsaná dávno
    const po = o('PO', '2026-10-29', { is_delivered: true, created_at: '2026-10-27T12:00:00Z' });
    const polozky = [p('a', 'PRED', 'k10', 6), p('b', 'STARA', 'k10', 6), p('c', 'PO', 'k10', 2), p('d', 'PRED', 'k50', 1)];
    const r = hlidejMaleSudy({ k10: 8 }, [pred, stara, po], polozky, undefined, '2026-11-01', {
      zadano: z, odepsane: new Set(['PRED', 'STARA', 'PO']),
      odpocty: [
        { order_id: 'PRED', order_item_id: 'a', deduct_date: '2026-10-26', created_at: '2026-10-25T23:05:00Z' },
        { order_id: 'STARA', order_item_id: 'b', deduct_date: '2026-10-23', created_at: '2026-10-22T23:05:00Z' },
      ],
    });
    expect(r.souhrn[0]).toMatchObject({ mame: 6, odvezeno: 2 });
    expect([...(r.odjeteMimoPocet ?? [])].sort()).toEqual(['PRED', 'STARA']);
  });

  it('otevřená objednávka: její kusy v objednávkách; jiný obal nebo nehlídaný 0', () => {
    const x = o('X', '2026-10-30', { created_at: '2026-10-28T10:00:00Z' });
    const polozky = [p('x1', 'X', 'k10', 3), p('x2', 'X', 'k10', 2)];
    const r = hlidejMaleSudy({ k10: 8 }, [x], polozky, undefined, '2026-10-29', { zadano: z });
    expect(sudyObjednavky(r.souhrn, r.poPolozce, 'X', polozky, 'k10')).toBe(5);
    expect(volneProObjednavku(r.souhrn, 'k10', 5)).toBe(8);
    expect(sudyObjednavky(r.souhrn, r.poPolozce, 'X', polozky, 'k20')).toBe(0);
    expect(sudyObjednavky(r.souhrn, r.poPolozce, 'X', polozky, null)).toBe(0);
  });
});

describe('plné sudy v okamžiku zadání', () => {
  const pohyb = (date: string, qty: number, kind: 'kegovani' | 'zavoz', createdAt: string, package_id = 'k20') =>
    ({ date, beer_id: 'b10', package_id, qty, kind, createdAt });
  it('bez stáčení a odpočtů zapsaných v den zadání až po něm; jen hlídané obaly; vlastní sudy pryč', () => {
    const plne = plneKZadani(
      [
        pohyb('2026-10-26', 2, 'kegovani', '2026-10-26T10:00:00Z'),
        pohyb('2026-10-27', 1, 'kegovani', '2026-10-27T07:00:00Z'),
        pohyb('2026-10-27', 3, 'kegovani', '2026-10-27T12:00:00Z'),
        pohyb('2026-10-27', -1, 'zavoz', '2026-10-26T22:05:00Z'),
        pohyb('2026-10-28', 5, 'kegovani', '2026-10-28T08:00:00Z'),
        pohyb('2026-10-26', 9, 'kegovani', '2026-10-26T10:00:00Z', 'k50'),
      ],
      { k20: { cas: '2026-10-27T08:43:05Z', den: '2026-10-27' } },
    );
    expect(plne.get('b10__k20')).toBe(2);
    expect(plne.has('b10__k50')).toBe(false);
    const bezVlastnich = plneKZadani(
      [pohyb('2026-10-26', 2, 'kegovani', '2026-10-26T10:00:00Z')],
      { k20: { cas: '2026-10-27T08:43:05Z', den: '2026-10-27' } },
      [{ beer_id: 'b10', package_id: 'k20', quantity: 1, created_at: '2026-10-26T11:00:00Z' }, { beer_id: 'b10', package_id: 'k20', quantity: 1, created_at: '2026-10-27T12:00:00Z' }],
    );
    expect(bezVlastnich.get('b10__k20')).toBe(1);
  });
});

describe('čas zadání malých sudů a popis', () => {
  const den = (iso: string) => iso.slice(0, 10);
  it('jen počty z tohoto týdne a s časem zápisu', () => {
    expect(zadaniMalychSudu([
      { package_id: 'a', pocet: 2, updated_at: '2026-10-27T08:00:00Z' },
      { package_id: 'b', pocet: 2, updated_at: '2026-10-20T08:00:00Z' },
      { package_id: 'c', pocet: 2, updated_at: null },
    ], '2026-11-01', den)).toEqual({ a: { cas: '2026-10-27T08:00:00Z', den: '2026-10-27' } });
  });
  it('krátký den a popis bez odjetých', () => {
    expect(kratkyDen('2026-11-01')).toBe('ne 1. 11.');
    expect(kratkyDen(null)).toBe('');
    expect(popisOdvezenych({ package_id: 'a', mame: 3, objednano: 0, nad: 0, zadano: 3, odvezeno: 0 })).toBeNull();
    const mnoho = Array.from({ length: 6 }, (_, i) => ({ order_id: `o${i}`, nazev: `H${i}`, den: '2026-10-28', kusu: 1 }));
    expect(popisOdvezenych({ package_id: 'a', mame: 0, objednano: 0, nad: 0, zadano: 6, odvezeno: 6, odvezenoZ: mnoho }, '2026-10-27'))
      .toBe('Naklikáno 6 (út 27. 10.), od té doby odjelo 6: H0 1× (st 28. 10.), H1 1× (st 28. 10.), H2 1× (st 28. 10.), H3 1× (st 28. 10.) a další 2.');
  });
});
