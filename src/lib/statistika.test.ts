import { describe, it, expect } from 'vitest';
import {
  pondeliTydne, posunMesicu, rozsahObdobi, predchoziRozsah,
  litryVRozsahu, litryPoMesicich, litryPoTydnech,
  podilPodlePiva, podilPodleObalu, podleOdberatelu, zmenaProcent, formatHl,
  prumernaPotrebaKegu, denObdobi, popisRozsahu,
  obalyVCislech, pivaVCislech, litryPoObdobiAObalech, obalyVDatech,
  kdoPrestalObjednavat, rozpocetSudu, pondeliTydne as pondeli, odberatelPoMesicich,
  type Obal, type VyrobniRadek,
} from './statistika';

const OBALY = new Map<string, Obal>([
  ['keg30', { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 }],
  ['keg50', { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 }],
  ['lahev', { id: 'lahev', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 }],
]);
const PIVA = [{ id: 'b11', name: '11° Světlá' }, { id: 'b12', name: '12° Polotmavá' }];

const radky: VyrobniRadek[] = [
  { entry_date: '2026-08-03', beer_id: 'b11', package_id: 'keg30', quantity: 10 }, // 300 l, pondělí
  { entry_date: '2026-08-05', beer_id: 'b11', package_id: 'lahev', quantity: 200 }, // 100 l
  { entry_date: '2026-08-11', beer_id: 'b12', package_id: 'keg50', quantity: 4 },   // 200 l, další týden
  { entry_date: '2026-07-20', beer_id: 'b11', package_id: 'keg30', quantity: 5 },   // 150 l, minulý měsíc
];

describe('období', () => {
  it('pondělí týdne vychází i z neděle', () => {
    expect(pondeliTydne('2026-08-05')).toBe('2026-08-03'); // středa → pondělí
    expect(pondeliTydne('2026-08-09')).toBe('2026-08-03'); // neděle patří pořád do toho týdne
    expect(pondeliTydne('2026-08-10')).toBe('2026-08-10'); // pondělí je samo sebou
  });

  it('posun měsíců přetáčí rok', () => {
    expect(posunMesicu('2026-01', -1)).toBe('2025-12');
    expect(posunMesicu('2026-12', 1)).toBe('2027-01');
  });

  it('rozsah období a jeho předchůdce na sebe navazují', () => {
    expect(rozsahObdobi('tyden', '2026-08-05')).toEqual({ od: '2026-08-03', do: '2026-08-09' });
    expect(predchoziRozsah('tyden', '2026-08-05')).toEqual({ od: '2026-07-27', do: '2026-08-02' });
    expect(rozsahObdobi('rok', '2026-08-05')).toEqual({ od: '2026-01-01', do: '2026-12-31' });
    expect(predchoziRozsah('rok', '2026-08-05')).toEqual({ od: '2025-01-01', do: '2025-12-31' });
    // „Celkem" nemá s čím srovnávat.
    expect(predchoziRozsah('vse', '2026-08-05')).toBeNull();
  });
});

describe('výstav v litrech', () => {
  it('násobí množství objemem obalu, ne kusy', () => {
    // 10 sudů po 30 l = 300 l, ne 10.
    expect(litryVRozsahu(radky, OBALY, '2026-08-03', '2026-08-03')).toBe(300);
  });

  // Funkce sečte řádky, které dostane — CO je výstav, rozhoduje volající.
  // Do výstavu jdou jen sudy (lahvuje se z už stočených sudů, jinak by se
  // tentýž objem počítal dvakrát) — viz komentář v lib/statistika.ts.
  it('sečte všechny předané řádky v rozsahu', () => {
    expect(litryVRozsahu(radky, OBALY, '2026-08-01', '2026-08-31')).toBe(600);
  });

  it('krajní dny rozsahu se počítají', () => {
    expect(litryVRozsahu(radky, OBALY, '2026-08-03', '2026-08-05')).toBe(400);
    expect(litryVRozsahu(radky, OBALY, '2026-08-04', '2026-08-05')).toBe(100);
  });

  it('řádek bez data nebo bez obalu se přeskočí, ne spadne', () => {
    const rozbite: VyrobniRadek[] = [
      { entry_date: null, beer_id: 'b11', package_id: 'keg30', quantity: 10 },
      { entry_date: '2026-08-03', beer_id: 'b11', package_id: null, quantity: 10 },
      { entry_date: '2026-08-03', beer_id: 'b11', package_id: 'neznamy', quantity: 10 },
    ];
    expect(litryVRozsahu(rozbite, OBALY, '2026-01-01', '2026-12-31')).toBe(0);
  });

  it('seskupí po měsících i po týdnech', () => {
    expect(litryPoMesicich(radky, OBALY).get('2026-08')).toBe(600);
    expect(litryPoMesicich(radky, OBALY).get('2026-07')).toBe(150);
    expect(litryPoTydnech(radky, OBALY).get('2026-08-03')).toBe(400);
    expect(litryPoTydnech(radky, OBALY).get('2026-08-10')).toBe(200);
  });
});

describe('rozpady', () => {
  it('podíl piv je seřazený a sečte se na sto procent', () => {
    const p = podilPodlePiva(radky, OBALY, PIVA, '2026-08-01', '2026-08-31');
    expect(p.map((x) => x.nazev)).toEqual(['11° Světlá', '12° Polotmavá']);
    expect(p[0].litry).toBe(400);
    expect(p[0].kusy).toBe(210);
    expect(p[0].podil + p[1].podil).toBeCloseTo(1, 6);
  });

  it('podíl obalů rozliší sudy a lahve', () => {
    const o = podilPodleObalu(radky, OBALY, '2026-08-01', '2026-08-31');
    expect(o.find((x) => x.nazev === 'KEG 30 l')?.litry).toBe(300);
    expect(o.find((x) => x.nazev === 'Lahev 0,5 l')?.litry).toBe(100);
  });

  it('prázdné období vrátí prázdno, ne dělení nulou', () => {
    expect(podilPodlePiva(radky, OBALY, PIVA, '2026-01-01', '2026-01-31')).toEqual([]);
  });
});

describe('odběratelé', () => {
  const orders = [
    { id: 'o1', place_name: 'Hospoda U Lípy', delivery_date: '2026-08-07', order_date: '2026-08-03', status: 'nova' },
    { id: 'o2', place_name: 'Hospoda U Lípy', delivery_date: '2026-08-14', order_date: '2026-08-10', status: 'vyrizeno_zavoz' },
    { id: 'o3', place_name: 'Restaurace Zámek', delivery_date: '2026-08-07', order_date: '2026-08-03', status: 'nova' },
    { id: 'o4', place_name: 'Stornovaná', delivery_date: '2026-08-07', order_date: '2026-08-03', status: 'storno' },
  ];
  const polozky = [
    { order_id: 'o1', package_id: 'keg30', quantity: 2 },  // 60 l
    { order_id: 'o2', package_id: 'keg50', quantity: 1 },  // 50 l
    { order_id: 'o3', package_id: 'keg30', quantity: 1 },  // 30 l
    { order_id: 'o4', package_id: 'keg50', quantity: 10 }, // storno — nepočítá se
  ];

  it('řadí podle litrů a sčítá objednávky téhož odběratele', () => {
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-01', '2026-08-31');
    expect(v[0]).toMatchObject({ nazev: 'Hospoda U Lípy', litry: 110, kusy: 3, objednavek: 2 });
    expect(v[1].nazev).toBe('Restaurace Zámek');
  });

  // 📦 Souhrnné „3 ks" je pro nachystání závozu k ničemu — dvě třicítky
  // a jedna padesátka je jiná práce než tři třicítky. Proto se u každého
  // odběratele drží i to, DO ČEHO se mu vozí.
  it('rozepíše odběratele na konkrétní obaly, seřazené od největšího objemu', () => {
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-01', '2026-08-31');
    expect(v[0].obaly).toEqual([
      { id: 'keg30', nazev: 'KEG 30 l', kusy: 2, litry: 60 },
      { id: 'keg50', nazev: 'KEG 50 l', kusy: 1, litry: 50 },
    ]);
    // Součet rozpadu musí sedět na souhrn — jinak by dvě čísla na jedné
    // obrazovce tvrdila každé něco jiného.
    expect(v[0].obaly.reduce((s, o) => s + o.kusy, 0)).toBe(v[0].kusy);
    expect(v[0].obaly.reduce((s, o) => s + o.litry, 0)).toBe(v[0].litry);
  });

  it('stornované objednávky se nepočítají', () => {
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-01', '2026-08-31');
    expect(v.find((x) => x.nazev === 'Stornovaná')).toBeUndefined();
  });

  it('rozhoduje den závozu, ne den zadání', () => {
    // o2 je zadaná 10. 8., ale veze se 14. 8. — v týdnu od 10. 8. tedy je,
    // podle data zadání by ale spadla jinam.
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-10', '2026-08-16');
    expect(v).toEqual([{
      nazev: 'Hospoda U Lípy', litry: 50, kusy: 1, objednavek: 1,
      obaly: [{ id: 'keg50', nazev: 'KEG 50 l', kusy: 1, litry: 50 }],
    }]);
  });
});

describe('pomocné', () => {
  it('změna v procentech, bez dělení nulou', () => {
    expect(zmenaProcent(150, 100)).toBe(50);
    expect(zmenaProcent(50, 100)).toBe(-50);
    expect(zmenaProcent(100, 0)).toBeNull();
  });

  it('hektolitry se u velkých čísel zaokrouhlují, u malých ne', () => {
    expect(formatHl(1234)).toBe('12,3');
    // cs-CZ odděluje tisíce pevnou mezerou (U+00A0), ne obyčejnou.
    expect(formatHl(1234567).replace(/\s/g, ' ')).toBe('12 346');
  });
});

// 🛢️ Zadání 23. 9. 2026: „u prehledu pridej kolonku prumerne potreba kegu
// na tyden a mesic." Číslo je v KUSECH sudů — odpovídá na „kolik jich musím
// mít doma umytých", a na to se hektolitry odpovědět nedají.
describe('průměrná potřeba sudů', () => {
  const OKEN = 12;
  // 12 ukončených týdnů před týdnem, do kterého spadá 2026-08-27 (čtvrtek).
  // Pondělí toho týdne je 2026-08-24, okno tedy začíná 2026-06-01.
  const dnes = '2026-08-27';

  it('průměruje kusy sudů přes ukončené týdny i měsíce', () => {
    const r: VyrobniRadek[] = [
      { entry_date: '2026-08-17', beer_id: 'b11', package_id: 'keg30', quantity: 12 }, // minulý týden
      { entry_date: '2026-07-06', beer_id: 'b11', package_id: 'keg50', quantity: 12 }, // červenec
    ];
    const v = prumernaPotrebaKegu(r, OBALY, dnes, OKEN);
    expect(v.tyden).toBe(24 / OKEN); // oba řádky padnou do okna týdnů
    // Do okna MĚSÍCŮ patří jen červenec: řádek ze 17. 8. je v běžícím měsíci,
    // a ten se schválně nepočítá (viz test níž).
    expect(v.mesic).toBe(12 / OKEN);
    expect(v.tydnu).toBe(OKEN);
    expect(v.mesicu).toBe(OKEN);
  });

  it('běžící týden a měsíc se nepočítají — jinak by průměr v pondělí spadl', () => {
    const r: VyrobniRadek[] = [
      { entry_date: '2026-08-25', beer_id: 'b11', package_id: 'keg30', quantity: 99 }, // TENTO týden i měsíc
    ];
    const v = prumernaPotrebaKegu(r, OBALY, dnes, OKEN);
    expect(v.tyden).toBe(0);
    expect(v.mesic).toBe(0);
  });

  it('lahve se nepočítají — potřeba sudů je o sudech', () => {
    const r: VyrobniRadek[] = [
      { entry_date: '2026-07-06', beer_id: 'b11', package_id: 'lahev', quantity: 500 },
    ];
    expect(prumernaPotrebaKegu(r, OBALY, dnes, OKEN).mesic).toBe(0);
  });

  it('manko z inventury (záporný řádek) průměr snižuje, nezahazuje se', () => {
    const r: VyrobniRadek[] = [
      { entry_date: '2026-07-06', beer_id: 'b11', package_id: 'keg30', quantity: 24 },
      { entry_date: '2026-07-07', beer_id: 'b11', package_id: 'keg30', quantity: -12 },
    ];
    expect(prumernaPotrebaKegu(r, OBALY, dnes, OKEN).mesic).toBe(12 / OKEN);
  });

  it('bez dat vrátí nulu, ne dělení nulou', () => {
    const v = prumernaPotrebaKegu([], OBALY, dnes, OKEN);
    expect(v.tyden).toBe(0);
    expect(v.mesic).toBe(0);
  });
});

// ⬅️➡️ Zadání 23. 9. 2026: „uprav ten filtr tyden, tento tyden at to ukazuje,
// mesic aktualni, rok aktualni a at se daj vsechny tyto udaje sipkama
// jednoduse posouvat."
describe('posouvání období šipkami', () => {
  const dnes = '2026-09-23'; // středa, ISO týden 21.–27. 9.

  it('bez posunu ukazuje období, ve kterém jsme teď', () => {
    expect(rozsahObdobi('tyden', denObdobi('tyden', dnes, 0))).toEqual({ od: '2026-09-21', do: '2026-09-27' });
    expect(rozsahObdobi('mesic', denObdobi('mesic', dnes, 0)).od).toBe('2026-09-01');
    expect(rozsahObdobi('rok', denObdobi('rok', dnes, 0)).od).toBe('2026-01-01');
  });

  it('šipka zpět posune o jeden týden, měsíc i rok', () => {
    expect(rozsahObdobi('tyden', denObdobi('tyden', dnes, -1))).toEqual({ od: '2026-09-14', do: '2026-09-20' });
    expect(rozsahObdobi('mesic', denObdobi('mesic', dnes, -1)).od).toBe('2026-08-01');
    expect(rozsahObdobi('rok', denObdobi('rok', dnes, -1)).od).toBe('2025-01-01');
  });

  it('posun přetáčí přes hranici roku', () => {
    expect(rozsahObdobi('mesic', denObdobi('mesic', '2026-01-15', -1)).od).toBe('2025-12-01');
  });

  it('„za celou dobu" se posouvat nedá — nemá čím', () => {
    expect(denObdobi('vse', dnes, -5)).toBe(dnes);
  });

  it('popis říká lidsky, co je zrovna vidět', () => {
    expect(popisRozsahu('tyden', dnes)).toBe('21. 9. – 27. 9. 2026');
    expect(popisRozsahu('mesic', dnes)).toBe('září 2026');
    expect(popisRozsahu('rok', dnes)).toBe('2026');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Zadání 23. 9. 2026: „nestojim o data kolik celkem bylo stoceny lahvi
// a kegu najednou (udaj k nicemu, je potreba vedet konkretni obaly kolik
// za jaky obdobi)." Všechno níž je o tom, aby každé číslo šlo dohledat
// ke KONKRÉTNÍMU obalu.
// ───────────────────────────────────────────────────────────────────────────

describe('průměrná potřeba sudů — rozpad podle velikosti', () => {
  const OKEN = 4;
  // Čtyři ukončené týdny před týdnem od 2026-08-31.
  const r: VyrobniRadek[] = [
    { entry_date: '2026-08-04', beer_id: 'b11', package_id: 'keg50', quantity: 8 },
    { entry_date: '2026-08-11', beer_id: 'b11', package_id: 'keg50', quantity: 8 },
    { entry_date: '2026-08-18', beer_id: 'b11', package_id: 'keg30', quantity: 4 },
    { entry_date: '2026-08-25', beer_id: 'b11', package_id: 'keg30', quantity: 4 },
    // Lahve do potřeby sudů nepatří — sud to není.
    { entry_date: '2026-08-25', beer_id: 'b11', package_id: 'lahev', quantity: 500 },
  ];

  it('rozpad se sečte přesně na souhrnné číslo', () => {
    const v = prumernaPotrebaKegu(r, OBALY, '2026-08-31', OKEN);
    expect(v.tyden).toBe(24 / OKEN);
    expect(v.obaly.reduce((s, o) => s + o.tyden, 0)).toBeCloseTo(v.tyden, 10);
    expect(v.obaly.reduce((s, o) => s + o.mesic, 0)).toBeCloseTo(v.mesic, 10);
  });

  it('řadí od nejžádanější velikosti a pojmenuje ji', () => {
    const v = prumernaPotrebaKegu(r, OBALY, '2026-08-31', OKEN);
    expect(v.obaly.map((o) => o.nazev)).toEqual(['KEG 50 l', 'KEG 30 l']);
    expect(v.obaly[0].tyden).toBe(16 / OKEN);
    expect(v.obaly[1].tyden).toBe(8 / OKEN);
  });

  it('lahve se do rozpadu nedostanou', () => {
    const v = prumernaPotrebaKegu(r, OBALY, '2026-08-31', OKEN);
    expect(v.obaly.find((o) => o.id === 'lahev')).toBeUndefined();
  });

  it('obal, který v okně nic nemá, se nevypisuje', () => {
    // Okno jen na poslední dva týdny → padesátky už do něj nespadají.
    const v = prumernaPotrebaKegu(r, OBALY, '2026-08-31', 2);
    expect(v.obaly.map((o) => o.id)).toEqual(['keg30']);
  });
});

describe('obaly v číslech', () => {
  const ted = { od: '2026-08-01', do: '2026-08-31' };
  const drive = { od: '2026-07-01', do: '2026-07-31' };

  it('řádek je JEDEN obal, ne skupina „sudy/lahve"', () => {
    const v = obalyVCislech(radky, OBALY, ted.od, ted.do, drive);
    expect(v.map((o) => o.nazev).sort()).toEqual(['KEG 30 l', 'KEG 50 l', 'Lahev 0,5 l']);
  });

  it('změna se počítá proti témuž obalu v minulém období', () => {
    // keg30: srpen 300 l, červenec 150 l → +100 %.
    const v = obalyVCislech(radky, OBALY, ted.od, ted.do, drive);
    expect(v.find((o) => o.id === 'keg30')!.zmena).toBe(100);
  });

  it('obal, který minule nebyl, nemá změnu — ne „+nekonečno"', () => {
    const v = obalyVCislech(radky, OBALY, ted.od, ted.do, drive);
    expect(v.find((o) => o.id === 'keg50')!.zmena).toBeNull();
  });

  it('bez předchozího období (volba „Celkem") se změna nepočítá vůbec', () => {
    const v = obalyVCislech(radky, OBALY, ted.od, ted.do, null);
    expect(v.every((o) => o.zmena === null)).toBe(true);
  });

  it('piva v číslech počítají změnu stejně', () => {
    // b11: srpen 300 (keg30) + 100 (lahev) = 400 l, červenec 150 l.
    const v = pivaVCislech(radky, OBALY, PIVA, ted.od, ted.do, drive);
    expect(v.find((p) => p.id === 'b11')!.zmena).toBeCloseTo(((400 - 150) / 150) * 100, 10);
  });
});

describe('řady pro stohovaný graf', () => {
  it('po měsících drží litry odděleně za každý obal', () => {
    const v = litryPoObdobiAObalech(radky, OBALY, (d) => d.slice(0, 7));
    expect(v.get('2026-08')!.get('keg30')).toBe(300);
    expect(v.get('2026-08')!.get('lahev')).toBe(100);
    expect(v.get('2026-07')!.get('keg30')).toBe(150);
  });

  it('po týdnech se bucketuje stejně jako zbytek appky (pondělí)', () => {
    const v = litryPoObdobiAObalech(radky, OBALY, pondeli);
    expect(v.get('2026-08-03')!.get('keg30')).toBe(300);
    expect(v.get('2026-08-03')!.get('lahev')).toBe(100);
    expect(v.get('2026-08-10')!.get('keg50')).toBe(200);
  });

  it('součet řady přes obaly sedí na souhrn po měsících', () => {
    const rozpad = litryPoObdobiAObalech(radky, OBALY, (d) => d.slice(0, 7));
    const souhrn = litryPoMesicich(radky, OBALY);
    for (const [mesic, vnitrni] of rozpad) {
      expect([...vnitrni.values()].reduce((s, v) => s + v, 0)).toBe(souhrn.get(mesic));
    }
  });

  it('obaly v datech jsou seřazené od největšího objemu', () => {
    expect(obalyVDatech(radky, OBALY).map((o) => o.id)).toEqual(['keg30', 'keg50', 'lahev']);
  });
});

describe('kdo přestal objednávat', () => {
  const objednavky = [
    // Stálý odběratel — vozí se mu pořád.
    { id: 'a1', place_name: 'Stálý', delivery_date: '2026-08-20', order_date: '2026-08-18', status: 'nova' },
    { id: 'a2', place_name: 'Stálý', delivery_date: '2026-07-20', order_date: '2026-07-18', status: 'nova' },
    // Mlčí od března.
    { id: 'b1', place_name: 'Utichlá hospoda', delivery_date: '2026-03-02', order_date: '2026-03-01', status: 'nova' },
    { id: 'b2', place_name: 'Utichlá hospoda', delivery_date: '2026-02-02', order_date: '2026-02-01', status: 'nova' },
    // Jednorázový odběr — ten nic nepřestal, ten jednou přijel.
    { id: 'c1', place_name: 'Jednorázový', delivery_date: '2026-01-10', order_date: '2026-01-09', status: 'nova' },
    // Stornovaná se nepočítá.
    { id: 'd1', place_name: 'Utichlá hospoda', delivery_date: '2026-09-01', order_date: '2026-08-30', status: 'storno' },
  ];
  const polozky = [
    { order_id: 'a1', package_id: 'keg50', quantity: 2 },
    { order_id: 'a2', package_id: 'keg50', quantity: 2 },
    { order_id: 'b1', package_id: 'keg30', quantity: 5 },
    { order_id: 'b2', package_id: 'keg30', quantity: 5 },
    { order_id: 'c1', package_id: 'keg30', quantity: 1 },
    { order_id: 'd1', package_id: 'keg50', quantity: 99 },
  ];

  it('najde toho, kdo dřív bral a teď mlčí', () => {
    const v = kdoPrestalObjednavat(objednavky, polozky, OBALY, '2026-08-31');
    expect(v.map((x) => x.nazev)).toEqual(['Utichlá hospoda']);
    expect(v[0].posledni).toBe('2026-03-02');
    expect(v[0].dnu).toBe(182);
    expect(v[0].litry).toBe(300); // 10 × 30 l
    expect(v[0].objednavek).toBe(2);
  });

  it('jednorázový odběratel se nepočítá — nic nepřestal', () => {
    const v = kdoPrestalObjednavat(objednavky, polozky, OBALY, '2026-08-31');
    expect(v.find((x) => x.nazev === 'Jednorázový')).toBeUndefined();
  });

  it('stornovaná objednávka nesmí odběratele „oživit"', () => {
    // d1 je z 1. 9., ale je storno — kdyby se počítala, Utichlá hospoda by
    // ze seznamu vypadla (a ještě by měla o 99 sudů víc).
    const v = kdoPrestalObjednavat(objednavky, polozky, OBALY, '2026-08-31');
    expect(v[0].posledni).toBe('2026-03-02');
    expect(v[0].litry).toBe(300);
  });

  it('naplánovaný budoucí závoz taky není mlčení', () => {
    const budouci = [
      ...objednavky,
      { id: 'b3', place_name: 'Utichlá hospoda', delivery_date: '2026-09-15', order_date: '2026-08-30', status: 'nova' },
    ];
    // K dnešku 31. 8. je závoz na 15. 9. teprve před námi — poslední
    // SKUTEČNÝ závoz je pořád březnový.
    expect(kdoPrestalObjednavat(budouci, polozky, OBALY, '2026-08-31')[0].posledni).toBe('2026-03-02');
    // O dva týdny později už proběhl, a mlčení tím skončilo.
    expect(kdoPrestalObjednavat(budouci, polozky, OBALY, '2026-09-20')).toEqual([]);
  });

  it('práh se dá posunout', () => {
    // Stálý má poslední závoz 20. 8., tedy 11 dní zpátky.
    const v = kdoPrestalObjednavat(objednavky, polozky, OBALY, '2026-08-31', 10);
    expect(v.map((x) => x.nazev).sort()).toEqual(['Stálý', 'Utichlá hospoda']);
  });
});

describe('rozpočet sudů', () => {
  const staceni: VyrobniRadek[] = [
    { entry_date: '2026-08-10', beer_id: 'b11', package_id: 'keg50', quantity: 20 },
    { entry_date: '2026-08-11', beer_id: 'b11', package_id: 'keg30', quantity: 10 },
    // Lahve do rozpočtu SUDŮ nepatří.
    { entry_date: '2026-08-11', beer_id: 'b11', package_id: 'lahev', quantity: 500 },
    // Jiný měsíc — mimo období.
    { entry_date: '2026-07-11', beer_id: 'b11', package_id: 'keg50', quantity: 99 },
  ];
  const fasovani: VyrobniRadek[] = [
    { entry_date: '2026-08-12', beer_id: 'b11', package_id: 'keg50', quantity: 15 },
  ];
  const odpisy: VyrobniRadek[] = [
    { entry_date: '2026-08-13', beer_id: 'b11', package_id: 'keg50', quantity: 2 },
  ];
  const objednavky = [
    { id: 'o1', delivery_date: '2026-08-20', order_date: '2026-08-18', status: 'nova' },
    { id: 'o2', delivery_date: '2026-08-21', order_date: '2026-08-19', status: 'storno' },
  ];
  const polozky = [
    { order_id: 'o1', package_id: 'keg50', quantity: 7 },
    { order_id: 'o2', package_id: 'keg50', quantity: 99 },
  ];

  const vysledek = () => rozpocetSudu(staceni, fasovani, odpisy, objednavky, polozky, OBALY, '2026-08-01', '2026-08-31');

  it('rozdíl je stočeno − fasováno − odpisy', () => {
    const keg50 = vysledek().find((r) => r.id === 'keg50')!;
    expect(keg50).toMatchObject({ stoceno: 20, fasovano: 15, odpisy: 2, nerozpocteno: 3 });
  });

  // 🐛 Objednávka není pohyb skladu — objednané pivo nemusí být stočené
  // a stočené nemusí být objednané. Kdyby vstupovalo do rozdílu, ukazovala
  // by karta ztrátu, která se nikdy nestala.
  it('objednané kusy jsou kontext, do rozdílu nevstupují', () => {
    const keg50 = vysledek().find((r) => r.id === 'keg50')!;
    expect(keg50.objednano).toBe(7);
    expect(keg50.nerozpocteno).toBe(3);
  });

  it('stornovaná objednávka se do objednaných kusů nepočítá', () => {
    expect(vysledek().find((r) => r.id === 'keg50')!.objednano).toBe(7);
  });

  it('lahve v rozpočtu sudů nejsou', () => {
    expect(vysledek().find((r) => r.id === 'lahev')).toBeUndefined();
  });

  it('jiné období se nepřimíchá', () => {
    expect(vysledek().find((r) => r.id === 'keg50')!.stoceno).toBe(20);
  });

  it('řadí od nejvíc stáčeného sudu', () => {
    expect(vysledek().map((r) => r.id)).toEqual(['keg50', 'keg30']);
  });

  it('sud, který se jen fasoval a nestáčel, ze seznamu nevypadne', () => {
    const v = rozpocetSudu(
      [], [{ entry_date: '2026-08-12', beer_id: 'b11', package_id: 'keg30', quantity: 4 }], [],
      [], [], OBALY, '2026-08-01', '2026-08-31',
    );
    expect(v).toEqual([{
      id: 'keg30', nazev: 'KEG 30 l', stoceno: 0, fasovano: 4, odpisy: 0, objednano: 0, nerozpocteno: -4,
    }]);
  });
});

// Zrychlení Statistiky nesmí změnit ani jedno číslo: nové funkce se tu
// porovnávají s PŮVODNÍM postupem (přepsaným doslova z History.tsx) na
// náhodných datech, včetně storen, prázdných objednávek a položek bez
// objednávky.
describe('zrychlené součty Statistiky = původní výpočet', () => {
  function nahodna(seed: number) {
    let s = seed;
    const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    const objednavky = Array.from({ length: 300 }, (_, i) => ({
      id: `o${i}`,
      order_date: `2026-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
      status: r() < 0.15 ? 'storno' : 'nova',
    }));
    const piva = ['b1', 'b2', 'b3', null];
    const obaly = ['p1', 'p2', null];
    const polozky = Array.from({ length: 1200 }, () => ({
      order_id: `o${Math.floor(r() * 330)}`, // i objednávky, které neexistují
      beer_id: piva[Math.floor(r() * piva.length)],
      package_id: obaly[Math.floor(r() * obaly.length)],
      quantity: r() < 0.1 ? String(Math.floor(r() * 9)) : Math.floor(r() * 20) - 2,
    }));
    return { objednavky, polozky };
  }

  it('objednanoPoMesicich', async () => {
    const { objednanoPoMesicich } = await import('./statistika');
    for (const seed of [1, 7, 42, 2026]) {
      const { objednavky, polozky } = nahodna(seed);
      // Původní kód z History.tsx:
      const puvodni = new Map<string, number>();
      objednavky.filter((o) => o.status !== 'storno').forEach((o) => {
        const mk = o.order_date.slice(0, 7);
        polozky.filter((i) => i.order_id === o.id).forEach((i) => {
          puvodni.set(mk, (puvodni.get(mk) ?? 0) + Number(i.quantity));
        });
      });
      expect(objednanoPoMesicich(objednavky, polozky)).toEqual(puvodni);
    }
  });
});

describe('podilSudyLahve — KEG vs lahve', () => {
  it('lahve jsou část výstavu, ne navíc', async () => {
    const { podilSudyLahve } = await import('./statistika');
    // 1680 l stočeno do sudů, z toho 180 l přestočeno do lahví
    const r = podilSudyLahve(1680, 180);
    expect(r.sudyL).toBe(1500);
    expect(r.lahveL).toBe(180);
    expect(r.podilSudy + r.podilLahve).toBeCloseTo(1);
    expect(r.podilLahve).toBeCloseTo(180 / 1680);
    expect(r.zDrivejsich).toBe(false);
  });

  it('nic se nestočilo → nuly, žádné dělení nulou', async () => {
    const { podilSudyLahve } = await import('./statistika');
    expect(podilSudyLahve(0, 0)).toEqual({ sudyL: 0, lahveL: 0, podilSudy: 0, podilLahve: 0, zDrivejsich: false });
  });

  it('lahvovalo se víc, než se stočilo (ze sudů z dřívějška)', async () => {
    const { podilSudyLahve } = await import('./statistika');
    const r = podilSudyLahve(100, 300);
    expect(r.sudyL).toBe(0);
    expect(r.podilLahve).toBe(1);
    expect(r.zDrivejsich).toBe(true);
  });
});

describe('odberatelPoMesicich — jak odběratel objednával v čase', () => {
  const objednavky = [
    { id: 'a', place_name: 'U Lípy', delivery_date: '2026-08-28', order_date: '2026-08-20', status: 'nova' },
    { id: 'b', place_name: 'U Lípy', delivery_date: null, order_date: '2026-06-03', status: 'nova' },
    { id: 'c', place_name: 'U Lípy', delivery_date: '2026-08-02', order_date: '2026-07-30', status: 'storno' },
    { id: 'd', place_name: 'Jinde', delivery_date: '2026-08-10', order_date: '2026-08-01', status: 'nova' },
    { id: 'e', place_name: 'U Lípy', delivery_date: '2025-01-15', order_date: '2025-01-10', status: 'nova' },
  ];
  const polozky = [
    { order_id: 'a', package_id: 'keg30', quantity: 2 },
    { order_id: 'a', package_id: 'keg50', quantity: 1 },
    { order_id: 'b', package_id: 'keg30', quantity: 3 },
    { order_id: 'c', package_id: 'keg50', quantity: 9 },
    { order_id: 'd', package_id: 'keg50', quantity: 4 },
    { order_id: 'e', package_id: 'keg50', quantity: 7 },
  ];

  it('12 měsíců, den závozu, bez storna a cizích odběratelů', () => {
    const r = odberatelPoMesicich(objednavky, polozky, OBALY, 'U Lípy', '2026-09');
    expect(r).toHaveLength(12);
    expect(r[0].mesic).toBe('2025-10');
    expect(r[11].mesic).toBe('2026-09');
    const podle = Object.fromEntries(r.map((x) => [x.mesic, x]));
    expect(podle['2026-08']).toEqual({ mesic: '2026-08', litry: 110, kusy: 3 });
    expect(podle['2026-06']).toEqual({ mesic: '2026-06', litry: 90, kusy: 3 }); // bez data závozu → den zadání
    expect(podle['2026-07'].litry).toBe(0); // storno se nepočítá
    expect(r.reduce((s, x) => s + x.kusy, 0)).toBe(6); // leden 2025 je mimo okno
  });

  it('měsíc sedí s řádkem v žebříčku odběratelů', () => {
    const mesic = odberatelPoMesicich(objednavky, polozky, OBALY, 'U Lípy', '2026-08').at(-1)!;
    const zebricek = podleOdberatelu(objednavky, polozky, OBALY, '2026-08-01', '2026-08-31').find((o) => o.nazev === 'U Lípy')!;
    expect(mesic.litry).toBe(zebricek.litry);
    expect(mesic.kusy).toBe(zebricek.kusy);
  });
});

describe('staceniPivaPoObdobich — záložka Po pivech', () => {
  it('sudy a lahve jednoho piva po obalech v každém období', async () => {
    const { staceniPivaPoObdobich, obdobiPoPivech } = await import('./statistika');
    const obaly = new Map<string, Obal>([
      ...OBALY,
      ['keg50', { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 }],
    ]);
    const obdobi = obdobiPoPivech('2026-09-16'); // středa
    const sudy = [
      { entry_date: '2026-09-14', beer_id: 'b11', package_id: 'keg30', quantity: 4 }, // tento týden, měsíc, rok
      { entry_date: '2026-09-08', beer_id: 'b11', package_id: 'keg50', quantity: 2 }, // minulý týden
      { entry_date: '2026-08-20', beer_id: 'b11', package_id: 'keg30', quantity: 5 }, // minulý měsíc
      { entry_date: '2025-06-01', beer_id: 'b11', package_id: 'keg30', quantity: 7 }, // loni
      { entry_date: '2026-09-14', beer_id: 'b12', package_id: 'keg30', quantity: 99 }, // jiné pivo
    ];
    const lahve = [{ entry_date: '2026-09-15', beer_id: 'b11', package_id: 'lahev', quantity: 200 }];
    const r = staceniPivaPoObdobich(sudy, lahve, obaly, 'b11', obdobi);
    // [tento týden, minulý týden, tento měsíc, minulý měsíc, letos, loni]
    expect(r.sudy.kusy).toEqual([4, 2, 6, 5, 11, 7]);
    expect(r.sudy.litry).toEqual([120, 100, 220, 150, 370, 210]);
    expect(r.sudy.obaly.map((o) => o.id)).toEqual(['keg50', 'keg30']); // větší sud první
    expect(r.lahve.kusy).toEqual([200, 0, 200, 0, 200, 0]);
    expect(r.lahve.litry[0]).toBe(100);
  });

  it('oprava z inventury (manko) se odečte, ale stočeno nikdy nejde pod nulu', async () => {
    const { staceniPivaPoObdobich, obdobiPoPivech } = await import('./statistika');
    const obaly = new Map<string, Obal>([
      ...OBALY,
      ['keg50', { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 }],
    ]);
    const obdobi = obdobiPoPivech('2026-09-16');
    const sudy = [
      // Tento měsíc: u KEG 50 jen manko z inventury, žádné stáčení → 0, ne −1.
      { entry_date: '2026-09-10', beer_id: 'b11', package_id: 'keg50', quantity: -1 },
      // U KEG 30 stáčení 5 a manko −1 → 4.
      { entry_date: '2026-09-11', beer_id: 'b11', package_id: 'keg30', quantity: 5 },
      { entry_date: '2026-09-12', beer_id: 'b11', package_id: 'keg30', quantity: -1 },
      // Letos u KEG 50 stáčení 3 v červnu → letos 3 − 1 = 2.
      { entry_date: '2026-06-01', beer_id: 'b11', package_id: 'keg50', quantity: 3 },
    ];
    const r = staceniPivaPoObdobich(sudy, [], obaly, 'b11', obdobi);
    const keg50 = r.sudy.obaly.find((o) => o.id === 'keg50')!;
    const keg30 = r.sudy.obaly.find((o) => o.id === 'keg30')!;
    // [tento týden, minulý týden, tento měsíc, minulý měsíc, letos, loni]
    expect(keg50.kusy).toEqual([0, 0, 0, 0, 2, 0]);
    expect(keg50.litry[2]).toBe(0);
    expect(keg30.kusy[2]).toBe(4);
    expect(r.sudy.kusy[2]).toBe(4); // součet = obaly po ořezu, ne 5 − 1 − 1 = 3
    expect(r.sudy.litry[2]).toBe(120);
    expect(r.sudy.kusy[4]).toBe(6);
    expect(r.sudy.kusy.every((k) => k >= 0)).toBe(true);
  });
});
