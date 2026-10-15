import { describe, it, expect } from 'vitest';
import {
  OBJEMY_LAHVI,
  OBJEMY_SUDU,
  bilance,
  datumCesky,
  datumZTextu,
  najdiOkno,
  parsujOdpovedAi,
  prepisTabulky,
  promptTabulky,
  sestavRadky,
  type SurovyRadek,
} from './tabulka-staceni';
import { VISION_TABULKA_PUVODNI, VISION_TABULKA_ZVETSENA, visionStranka } from './tabulka-vision.fixture';

// Řádky 537–558 tak, jak je v tabulce opravdu napsané (přepsáno ručně ze snímku).
// Datum je jen u prvního řádku dne; pivo je u tří řádků prázdné.
const TABULKA: SurovyRadek[] = [
  { radek: 537, datum: null, pivo: '11° sv.ležák', sudy: { 50: 1 }, lahve: { 1: 47 } },
  { radek: 538, datum: null, pivo: '11° sv.ležák', sudy: {}, lahve: { 1.5: 7 } },
  { radek: 539, datum: null, pivo: null, sudy: { 50: 1 }, lahve: { 1.5: 30 } },
  { radek: 540, datum: '8.9.2026', pivo: '12 Světlá', sudy: { 50: 1 }, lahve: { 1.5: 31 } },
  { radek: 541, datum: null, pivo: 'Desítka', sudy: { 30: 1 }, lahve: { 1: 27 } },
  { radek: 542, datum: '15.9.2026', pivo: '12 Světlá', sudy: { 50: 2 }, lahve: { 0.5: 60, 0.33: 194 } },
  { radek: 543, datum: null, pivo: 'Desítka', sudy: { 50: 1 }, lahve: { 1: 37, 0.5: 10, 0.33: 10 } },
  { radek: 544, datum: null, pivo: '11° sv.ležák', sudy: { 50: 1 }, lahve: { 1.5: 12, 1: 10, 0.5: 28, 0.33: 12 } },
  { radek: 545, datum: null, pivo: '12 Tmavá', sudy: { 50: 1 }, lahve: { 0.5: 20, 0.33: 109 } },
  { radek: 546, datum: '22.9.2026', pivo: '12 Světlá', sudy: { 50: 1 }, lahve: { 1.5: 29 } },
  { radek: 547, datum: null, pivo: 'Desítka', sudy: { 50: 1 }, lahve: { 1.5: 10, 1: 31 } },
  { radek: 548, datum: '29.9.2026', pivo: '12 Světlá', sudy: { 50: 2 }, lahve: { 1.5: 20, 1: 58 } },
  { radek: 549, datum: null, pivo: '11° sv.ležák', sudy: { 30: 1 }, lahve: { 1: 27 } },
  { radek: 550, datum: null, pivo: null, sudy: { 50: 1 }, lahve: { 1.5: 10, 1: 31 } },
  { radek: 551, datum: null, pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1.5: 14, 1: 24 } },
  { radek: 552, datum: '6.10.2026', pivo: '12 Světlá', sudy: { 50: 3 }, lahve: { 1.5: 24, 1: 93, 0.5: 20 } },
  { radek: 553, datum: null, pivo: '11° sv.ležák', sudy: { 50: 1 }, lahve: { 1: 46 } },
  { radek: 554, datum: null, pivo: 'Desítka', sudy: { 50: 1, 20: 1 }, lahve: { 1.5: 16, 1: 38 } },
  { radek: 555, datum: '13.10.2026', pivo: '12 Světlá', sudy: { 50: 1 }, lahve: { 1.5: 11, 0.5: 20, 0.33: 60 } },
  { radek: 556, datum: null, pivo: '11° sv.ležák', sudy: { 30: 1 }, lahve: { 1: 27 } },
  { radek: 557, datum: null, pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1.5: 25, 0.5: 20 } },
  { radek: 558, datum: null, pivo: null, sudy: { 50: 2 }, lahve: { 1: 72, 0.5: 40 } },
];

const PIVA = [
  { id: 'des', name: '10° Desítka', degree: '10°' },
  { id: 's11', name: '11° Světlá', degree: '11°' },
  { id: 's12', name: '12° Světlá', degree: '12°' },
  { id: 't12', name: '12° Tmavá', degree: '12°' },
  { id: 'jan', name: 'Jantar', degree: null },
  { id: 'cit', name: 'Citron', degree: null },
];

const od = (cislo: number) => TABULKA.filter((r) => (r.radek ?? 0) >= cislo);

describe('datumZTextu', () => {
  it('české zápisy i ISO', () => {
    expect(datumZTextu('13.10.2026')).toBe('2026-10-13');
    expect(datumZTextu('8.9.2026')).toBe('2026-09-08');
    expect(datumZTextu(' 13. 10. 2026 ')).toBe('2026-10-13');
    expect(datumZTextu('13.10.26')).toBe('2026-10-13');
    expect(datumZTextu('13/10/2026')).toBe('2026-10-13');
    expect(datumZTextu('2026-10-13')).toBe('2026-10-13');
    expect(datumZTextu('2026-10-13T08:00:00')).toBe('2026-10-13');
  });

  it('neexistující den a nesmysly jsou null — nehádá se', () => {
    expect(datumZTextu('31.9.2026')).toBeNull();
    expect(datumZTextu('29.2.2026')).toBeNull();
    expect(datumZTextu('13.13.2026')).toBeNull();
    expect(datumZTextu('12 Světlá')).toBeNull();
    expect(datumZTextu('13.10.')).toBeNull();
    expect(datumZTextu('')).toBeNull();
    expect(datumZTextu(null)).toBeNull();
  });

  it('OCR: O místo nuly a l místo jedničky se opraví jen u něčeho, co vypadá jako datum', () => {
    expect(datumZTextu('13.1O.2O26')).toBe('2026-10-13');
    expect(datumZTextu('l3.10.2026')).toBe('2026-10-13');
    expect(datumZTextu('Otevřeno')).toBeNull();
  });

  it('datumCesky do hlášek', () => {
    expect(datumCesky('2026-10-13')).toBe('13. 10. 2026');
    expect(datumCesky('2026-09-08')).toBe('8. 9. 2026');
    expect(datumCesky(null)).toBe('');
  });
});

describe('přepis tabulky z Google Vision (snímek majitele, malé písmo)', () => {
  const p = prepisTabulky(VISION_TABULKA_PUVODNI);
  const radek = (cislo: number) => p.radky.find((r) => r.cislo === cislo)!;

  it('pozná čísla řádků excelu a že je fotka má', () => {
    expect(p.maRadkovaCisla).toBe(true);
    expect(p.sirka).toBe(699);
    expect(p.vyska).toBe(859);
    expect(radek(537)).toBeTruthy();
    expect(radek(558)).toBeTruthy();
    expect(radek(582)).toBeTruthy();
  });

  it('data jsou jen u prvních řádků dne', () => {
    const data = p.radky.filter((r) => r.datum).map((r) => [r.cislo, r.datum]);
    expect(data).toEqual([
      [540, '2026-09-08'], [542, '2026-09-15'], [546, '2026-09-22'], [548, '2026-09-29'], [552, '2026-10-06'], [555, '2026-10-13'],
    ]);
  });

  it('pivo a čísla z buněk řádku 555', () => {
    expect(radek(555).pivo).toBe('12 Světlá');
    expect(radek(555).cisla).toEqual([1, 11, 20, 60]);
    expect(radek(556).pivo).toBe('11° sv.ležák');
    expect(radek(557).pivo).toBe('Jantar');
    expect(radek(558).pivo).toBeNull();
    expect(radek(558).cisla).toEqual([2, 72, 40]);
  });

  it('prázdné řádky (jen číslo řádku) nemají zápis; „duchové" bez čísla řádku se zahodí', () => {
    expect(radek(559).maData).toBe(false);
    expect(radek(582).maData).toBe(false);
    expect(p.radky.filter((r) => r.cislo === null).every((r) => !r.maData)).toBe(true);
    expect(p.radky.filter((r) => r.maData).map((r) => r.cislo)).toEqual(Array.from({ length: 22 }, (_, i) => 537 + i));
  });

  it('prázdná odpověď = žádné řádky', () => {
    expect(prepisTabulky(null).radky).toEqual([]);
    expect(prepisTabulky({ responses: [{}] }).radky).toEqual([]);
  });
});

describe('odkud číst (najdiOkno)', () => {
  const p = prepisTabulky(VISION_TABULKA_PUVODNI);

  it('od 10. 10.: poslední den, 4 řádky (555–558), datum prvního řádku je 13. 10.', () => {
    const o = najdiOkno(p, '2026-10-10');
    expect(o.duvod).toBeNull();
    expect(o.radku).toBe(4);
    expect(o.datumOkna).toBe('2026-10-13');
    const r555 = p.radky.find((r) => r.cislo === 555)!;
    const r558 = p.radky.find((r) => r.cislo === 558)!;
    const r554 = p.radky.find((r) => r.cislo === 554)!;
    // Výřez začíná mezi řádky 554 a 555 a končí pod 558 (před 559, který je prázdný).
    expect(o.okno!.y0).toBeGreaterThan(r554.y);
    expect(o.okno!.y0).toBeLessThan(r555.y);
    expect(o.okno!.y1).toBeGreaterThan(r558.y);
    expect(o.okno!.y1).toBeLessThan(p.radky.find((r) => r.cislo === 559)!.y);
    expect(o.okno!.x0).toBe(0);
    expect(o.okno!.x1).toBe(1);
  });

  it('od 6. 10. jsou to dva dny a 7 řádků; od 7. 10. zase jen 13. 10. (prázdné políčko u data patří dni nad ním)', () => {
    expect(najdiOkno(p, '2026-10-06')).toMatchObject({ radku: 7, datumOkna: '2026-10-06' });
    expect(najdiOkno(p, '2026-10-07')).toMatchObject({ radku: 4, datumOkna: '2026-10-13' });
  });

  it('přesně v den, který tam je', () => {
    expect(najdiOkno(p, '2026-10-13')).toMatchObject({ radku: 4, datumOkna: '2026-10-13' });
  });

  it('po posledním datu není co číst — vrátí, jaká data na fotce jsou', () => {
    const o = najdiOkno(p, '2026-10-14');
    expect(o.okno).toBeNull();
    expect(o.duvod).toBe('nic-od-data');
    expect(o.data).toEqual(['2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13']);
  });

  it('bez data se bere celá tabulka od prvního řádku se zápisem', () => {
    const o = najdiOkno(p, null);
    expect(o.radku).toBe(22);
    expect(o.okno!.y0).toBe(0);
    expect(o.datumOkna).toBeNull(); // nad prvním datem na fotce je řádek bez data
  });

  it('fotka bez dat: neví, odkud číst', () => {
    const bezDat = prepisTabulky(visionStranka(
      // jen názvy piv a čísla, žádné datum
      [['1', 10, 10, 20, 10, 20, 20, 10, 20], ['Desítka', 100, 10, 160, 10, 160, 20, 100, 20], ['3', 300, 10, 310, 10, 310, 20, 300, 20]],
      700, 100,
    ));
    expect(najdiOkno(bezDat, '2026-10-10')).toMatchObject({ okno: null, duvod: 'bez-dat' });
  });

  it('natočená fotka: vodorovný výřez by řezal řádky, tak se neořezává', () => {
    const uhel = (6 * Math.PI) / 180;
    const natocena = VISION_TABULKA_PUVODNI.responses[0].fullTextAnnotation.pages[0];
    const kopie = JSON.parse(JSON.stringify(VISION_TABULKA_PUVODNI));
    for (const w of kopie.responses[0].fullTextAnnotation.pages[0].blocks[0].paragraphs[0].words) {
      for (const v of w.boundingBox.vertices) {
        const { x, y } = v;
        v.x = Math.round(x * Math.cos(uhel) - y * Math.sin(uhel));
        v.y = Math.round(x * Math.sin(uhel) + y * Math.cos(uhel));
      }
    }
    expect(natocena.width).toBe(699);
    const o = najdiOkno(prepisTabulky(kopie), '2026-10-10');
    expect(o.okno).toBeNull();
    expect(o.duvod).toBe('natocena');
    expect(o.data.length).toBeGreaterThan(0);
  });

  it('prázdný přepis', () => {
    expect(najdiOkno(prepisTabulky(null), '2026-10-10')).toMatchObject({ okno: null, duvod: 'prazdna' });
  });
});

describe('pokyn pro AI', () => {
  it('popisuje sloupce, pořadí sudů a lahví a že prázdná buňka dědí až v aplikaci', () => {
    const t = promptTabulky({ vyrez: true });
    expect(t).toContain('50 l, 30 l, 20 l, 15 l, 10 l');
    expect(t).toContain('PET 1,5 l, PET 1 l, lahev 0,5 l, lahev 0,33 l');
    expect(t).toContain('NEDOPLŇUJ');
    expect(t).toContain('VÝŘEZ ŘÁDKŮ');
    expect(t).not.toContain('ČTI JEN');
  });

  it('celá fotka s datem: čti jen řádky od toho data', () => {
    const t = promptTabulky({ vyrez: false, odData: '2026-10-10' });
    expect(t).toContain('ČTI JEN řádky od prvního řádku, který má v buňce Datum datum 2026-10-10');
  });

  it('objemy sloupců', () => {
    expect(OBJEMY_SUDU).toEqual([50, 30, 20, 15, 10]);
    expect(OBJEMY_LAHVI).toEqual([1.5, 1, 0.5, 0.33]);
  });
});

describe('odpověď AI', () => {
  it('čistý JSON, ohrádky, obálka i holé pole', () => {
    const radky = [{ radek: 555, datum: '13.10.2026', pivo: '12 Světlá', sudy: { 50: 1 }, lahve: { 1.5: 11 } }];
    expect(parsujOdpovedAi(JSON.stringify({ radky }))).toHaveLength(1);
    expect(parsujOdpovedAi('```json\n' + JSON.stringify({ radky }) + '\n```')).toHaveLength(1);
    expect(parsujOdpovedAi(JSON.stringify({ tabulka: { radky } }))).toHaveLength(1);
    expect(parsujOdpovedAi(JSON.stringify(radky))).toHaveLength(1);
    expect(parsujOdpovedAi('Tady to je: ' + JSON.stringify({ radky }) + ' hotovo')).toHaveLength(1);
  });

  it('„null" jako text a prázdný text jsou prázdná buňka', () => {
    const r = parsujOdpovedAi(JSON.stringify({ radky: [{ radek: '556', datum: 'null', pivo: '', sudy: {}, lahve: {} }] }))!;
    expect(r[0]).toMatchObject({ radek: 556, datum: null, pivo: null });
  });

  it('nesmysl je null', () => {
    expect(parsujOdpovedAi('nic')).toBeNull();
    expect(parsujOdpovedAi('{"a":1}')).toBeNull();
    expect(parsujOdpovedAi('{"radky":')).toBeNull();
  });
});

describe('poskládání řádků', () => {
  it('datum dědí z řádku nad tím, dokud se neobjeví další', () => {
    const v = sestavRadky({ radky: od(548), piva: PIVA });
    const dny = Object.fromEntries(v.radky.map((r) => [r.cislo, r.datum]));
    expect(dny).toMatchObject({
      548: '2026-09-29', 549: '2026-09-29', 550: '2026-09-29', 551: '2026-09-29',
      552: '2026-10-06', 553: '2026-10-06', 554: '2026-10-06',
      555: '2026-10-13', 556: '2026-10-13', 557: '2026-10-13', 558: '2026-10-13',
    });
    expect(v.radky.find((r) => r.cislo === 556)!.datumVBunce).toBeNull();
    expect(v.radky.find((r) => r.cislo === 555)!.datumVBunce).toBe('2026-10-13');
    expect(v.dny).toEqual([
      { datum: '2026-09-29', radku: 4 }, { datum: '2026-10-06', radku: 3 }, { datum: '2026-10-13', radku: 4 },
    ]);
  });

  it('od 10. 10. zůstanou jen čtyři řádky z 13. 10. — i když AI vrátila celou tabulku', () => {
    const v = sestavRadky({ radky: TABULKA, piva: PIVA, odData: '2026-10-10' });
    expect(v.radky.map((r) => r.cislo)).toEqual([555, 556, 557, 558]);
    expect(v.vynechano).toBe(15); // 540–554 mají datum před 10. 10.
    expect(v.bezData).toBe(3); // 537–539 jsou nad prvním datem na fotce — nevíme, jaký je to den
    expect(v.varovani.join(' ')).toMatch(/3 řádky bez data/);
    expect(v.varovani.join(' ')).toContain('10. 10. 2026');
  });

  it('bez „od data" se vrátí všechno; řádky nad prvním datem mají datum null', () => {
    const v = sestavRadky({ radky: TABULKA, piva: PIVA });
    expect(v.radky).toHaveLength(22);
    expect(v.vynechano).toBe(0);
    expect(v.radky[0].datum).toBeNull();
    expect(v.dny[0]).toEqual({ datum: null, radku: 3 });
    expect(v.dny.map((d) => d.datum)).toEqual([null, '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13']);
  });

  it('den, který na fotce začíná datem přesně „od data", se čte celý', () => {
    const v = sestavRadky({ radky: TABULKA, piva: PIVA, odData: '2026-10-06' });
    expect(v.radky.map((r) => r.cislo)).toEqual([552, 553, 554, 555, 556, 557, 558]);
  });

  it('buňky podle sloupců: sudy a lahve od největšího objemu', () => {
    const v = sestavRadky({ radky: od(554), piva: PIVA });
    expect(v.radky[0]).toMatchObject({
      cislo: 554, pivo: 'Desítka', pivoId: 'des',
      sudy: [{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }],
      lahve: [{ objemL: 1.5, ks: 16 }, { objemL: 1, ks: 38 }],
    });
    expect(v.radky[1]).toMatchObject({
      cislo: 555, pivoId: 's12', sudy: [{ objemL: 50, ks: 1 }],
      lahve: [{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }],
    });
  });

  it('pivo se páruje s katalogem; prázdná buňka pivo zůstane prázdná (nedědí se)', () => {
    const v = sestavRadky({ radky: od(555), piva: PIVA });
    expect(v.radky.map((r) => [r.pivo, r.pivoId])).toEqual([
      ['12 Světlá', 's12'], ['11° sv.ležák', 's11'], ['Jantar', 'jan'], [null, null],
    ]);
  });

  it('sloupec ve špatném bloku se přesune a ohlásí; neznámý objem a necelé číslo se zahodí', () => {
    const v = sestavRadky({
      radky: [{ radek: 1, datum: '1.10.2026', pivo: 'Desítka', sudy: { 50: 1, '1.5': 11, 7: 3, 30: 0.5 }, lahve: { 1: 'abc', '0,5': '20', '0.33': '' } }],
      piva: PIVA,
    });
    const r = v.radky[0];
    expect(r.sudy).toEqual([{ objemL: 50, ks: 1 }]);
    expect(r.lahve).toEqual([{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }]);
    const hlasky = r.varovani.join('\n');
    expect(hlasky).toContain('Sloupec 1.5 l patří mezi lahve');
    expect(hlasky).toContain('Sloupec 7 l neznám');
    expect(hlasky).toContain('Počet „0.5" ve sloupci 30 l není celé číslo');
    expect(hlasky).toContain('Počet „abc" ve sloupci 1 l není celé číslo');
  });

  it('řádek jen s datem (bez čísel) se nevrací, ale datum platí pro řádky pod ním', () => {
    const v = sestavRadky({
      radky: [
        { radek: 1, datum: '1.10.2026', pivo: 'Desítka', sudy: { 50: 1 }, lahve: { 1: 45 } },
        { radek: 2, datum: '5.10.2026', pivo: null, sudy: {}, lahve: {} },
        { radek: 3, datum: null, pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1: 44 } },
      ],
      piva: PIVA,
    });
    expect(v.radky.map((r) => [r.cislo, r.datum])).toEqual([[1, '2026-10-01'], [3, '2026-10-05']]);
  });

  it('první řádek bez data v přečteném výřezu dostane datum výřezu', () => {
    const v = sestavRadky({ radky: od(555).map((r, i) => (i === 0 ? { ...r, datum: null } : r)), piva: PIVA, datumOkna: '2026-10-13', odData: '2026-10-10' });
    expect(v.radky.map((r) => r.datum)).toEqual(['2026-10-13', '2026-10-13', '2026-10-13', '2026-10-13']);
  });

  it('datum, které nejde přečíst, se ohlásí a řádek zdědí předchozí den', () => {
    const v = sestavRadky({
      radky: [
        { radek: 1, datum: '1.10.2026', pivo: 'Desítka', sudy: { 50: 1 }, lahve: { 1: 45 } },
        { radek: 2, datum: '31.9.2026', pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1: 44 } },
      ],
      piva: PIVA,
    });
    expect(v.radky[1].datum).toBe('2026-10-01');
    expect(v.radky[1].varovani.join(' ')).toContain('Datum „31.9.2026" nejde přečíst');
  });

  it('datum dřívější než řádek nad tím: varování', () => {
    const v = sestavRadky({
      radky: [
        { radek: 1, datum: '8.10.2026', pivo: 'Desítka', sudy: { 50: 1 }, lahve: { 1: 45 } },
        { radek: 2, datum: '1.10.2026', pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1: 44 } },
      ],
      piva: PIVA,
    });
    expect(v.radky[1].varovani.join(' ')).toContain('dřívější než předchozí řádek (8. 10. 2026)');
  });

  it('řádky bez jediného čísla a bez data nikam nepatří', () => {
    const v = sestavRadky({ radky: [{ radek: 1, datum: null, pivo: 'Desítka', sudy: {}, lahve: {} }], piva: PIVA });
    expect(v.radky).toEqual([]);
    expect(v.dny).toEqual([]);
  });
});

describe('výtrata — litry v lahvích proti litrům sudu', () => {
  it('bilance', () => {
    expect(bilance([{ objemL: 50, ks: 1 }], [{ objemL: 1.5, ks: 11 }, { objemL: 0.5, ks: 20 }, { objemL: 0.33, ks: 60 }]))
      .toEqual({ zdrojL: 50, stoceneL: 46.3, vytrataProc: 7.4 });
    expect(bilance([{ objemL: 50, ks: 1 }, { objemL: 20, ks: 1 }], [{ objemL: 1.5, ks: 16 }, { objemL: 1, ks: 38 }]).vytrataProc).toBe(11.4);
  });

  it('bez sudu nebo bez lahví výtrata není', () => {
    expect(bilance([], [{ objemL: 1.5, ks: 7 }]).vytrataProc).toBeNull();
    expect(bilance([{ objemL: 50, ks: 1 }], []).vytrataProc).toBeNull();
  });

  it('všech 22 řádků tabulky má výtratu v běžném rozmezí — žádné varování', () => {
    const v = sestavRadky({ radky: TABULKA, piva: PIVA });
    expect(v.radky.flatMap((r) => r.varovani)).toEqual([]);
  });

  it('posunutý sloupec: 27 ks po 1,5 l z 30l sudu je víc, než v sudu bylo', () => {
    const v = sestavRadky({ radky: [{ radek: 556, datum: '13.10.2026', pivo: '11° sv.ležák', sudy: { 30: 1 }, lahve: { 1.5: 27 } }], piva: PIVA });
    expect(v.radky[0].varovani.join(' ')).toMatch(/Stočeno 40.5 l z 30 l ze sudů — víc, než v sudech bylo/);
  });

  it('skoro nic stočeno z celého sudu: výtrata je moc velká', () => {
    const v = sestavRadky({ radky: [{ radek: 1, datum: '13.10.2026', pivo: 'Jantar', sudy: { 50: 1 }, lahve: { 1: 12 } }], piva: PIVA });
    expect(v.radky[0].varovani.join(' ')).toMatch(/výtrata 76 % je moc velká/);
  });
});

describe('kontrola proti přepisu Vision (zvětšený výřez)', () => {
  const prepis = prepisTabulky(VISION_TABULKA_ZVETSENA);

  it('správně přečtené řádky 549–558: žádné varování', () => {
    const v = sestavRadky({ radky: od(549), piva: PIVA, prepis });
    expect(v.radky.flatMap((r) => r.varovani)).toEqual([]);
  });

  it('číslo, které přepis u řádku nevidí, se ohlásí i s tím, co vidí', () => {
    const radky = od(555).map((r) => (r.radek === 557 ? { ...r, lahve: { 1.5: 24, 0.5: 20 } } : r));
    const v = sestavRadky({ radky, piva: PIVA, prepis });
    const r557 = v.radky.find((r) => r.cislo === 557)!;
    expect(r557.varovani.join(' ')).toContain('Číslo 24 přepis fotky u tohohle řádku nevidí (vidí: 1, 25, 20)');
    expect(v.radky.filter((r) => r.cislo !== 557).flatMap((r) => r.varovani)).toEqual([]);
  });

  it('jednička, kterou OCR u malého písma často vynechá, se neohlašuje', () => {
    // v přepisu původního snímku chybí „1" v buňce 20 l na řádku 554
    const maly = prepisTabulky(VISION_TABULKA_PUVODNI);
    const v = sestavRadky({ radky: od(554).slice(0, 2), piva: PIVA, prepis: maly });
    expect(v.radky.find((r) => r.cislo === 554)!.varovani).toEqual([]);
  });

  it('datum, které AI u řádku nepřečetla, ale přepis ho vidí, se doplní — jinak by den zdědil špatné datum', () => {
    const radky = od(554).map((r) => (r.radek === 555 ? { ...r, datum: null } : r));
    const v = sestavRadky({ radky, piva: PIVA, prepis });
    // 554 je první řádek v seznamu a nemá nad sebou žádné datum; ostatní zdědí 13. 10. z řádku 555.
    expect(v.radky.map((r) => r.datum)).toEqual([null, '2026-10-13', '2026-10-13', '2026-10-13', '2026-10-13']);
    expect(v.radky.find((r) => r.cislo === 555)!.varovani.join(' ')).toContain('Datum 13. 10. 2026 doplněno z přepisu fotky');
  });

  it('datum, které nesedí s přepisem, se ohlásí', () => {
    const radky = od(555).map((r) => (r.radek === 555 ? { ...r, datum: '12.10.2026' } : r));
    const v = sestavRadky({ radky, piva: PIVA, prepis });
    expect(v.radky[0].varovani.join(' ')).toContain('Datum 12. 10. 2026 nesedí s přepisem fotky (13. 10. 2026)');
  });

  it('bez čísel řádků a s jiným počtem řádků než v přepisu se nekontroluje nic', () => {
    const radky = od(549).map((r) => ({ ...r, radek: null, lahve: { ...(r.lahve as object), 1: 99 } }));
    const v = sestavRadky({ radky, piva: PIVA, prepis });
    expect(v.radky.flatMap((r) => r.varovani.filter((x) => x.includes('přepis')))).toEqual([]);
  });
});
