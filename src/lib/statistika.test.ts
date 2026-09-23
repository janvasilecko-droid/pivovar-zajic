import { describe, it, expect } from 'vitest';
import {
  pondeliTydne, posunMesicu, rozsahObdobi, predchoziRozsah,
  litryVRozsahu, litryPoMesicich, litryPoTydnech,
  podilPodlePiva, podilPodleObalu, podleOdberatelu, zmenaProcent, formatHl,
  prumernaPotrebaKegu, denObdobi, popisRozsahu,
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
    expect(v[0]).toEqual({ nazev: 'Hospoda U Lípy', litry: 110, kusy: 3, objednavek: 2 });
    expect(v[1].nazev).toBe('Restaurace Zámek');
  });

  it('stornované objednávky se nepočítají', () => {
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-01', '2026-08-31');
    expect(v.find((x) => x.nazev === 'Stornovaná')).toBeUndefined();
  });

  it('rozhoduje den závozu, ne den zadání', () => {
    // o2 je zadaná 10. 8., ale veze se 14. 8. — v týdnu od 10. 8. tedy je,
    // podle data zadání by ale spadla jinam.
    const v = podleOdberatelu(orders, polozky, OBALY, '2026-08-10', '2026-08-16');
    expect(v).toEqual([{ nazev: 'Hospoda U Lípy', litry: 50, kusy: 1, objednavek: 1 }]);
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
