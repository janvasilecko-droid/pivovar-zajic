// Import „Zápis stáčení lahve" z excelu. Řádky napodobují skutečný soubor
// (viz komentář v importStaceniExcel.ts) — datum ve sloupci A, pivo v B,
// sudy C–G (50/30/20/15/10 l), lahve H–K (1,5/1,0/0,5/0,33 l), poznámka P.
import { describe, it, expect } from 'vitest';
import {
  naparsujRadkyStaceniLahvi, naparsujRadkyZMrizky, normalizujNazev, popisProblemu,
  pripravImportStaceniLahvi, najdiJizNaimportovaneOtisky,
  type ExcelRadekStaceni,
} from './importStaceniExcel';
import type { Obal, Pivo } from './statistika';

const PIVA: Pivo[] = [{ id: 'b12', name: '12° Světlý ležák' }, { id: 'b11', name: '11° sv.ležák' }];
const OBALY: Obal[] = [
  { id: 'keg50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'keg30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'l10', label: 'Lahev 1,0 l', kind: 'bottle', volume_l: 1.0 },
  { id: 'l05', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
];

// Sloupce A..P jako v souboru: [datum, pivo, 50,30,20,15,10, 1.5,1.0,0.5,0.33, spotř,stoč,výtr,výtr%, pozn]
function radek(datum: string | null, pivo: string | null, sudy: Record<number, unknown>, lahve: Record<number, unknown>, pozn: string | null = null) {
  const r: unknown[] = new Array(16).fill(null);
  if (datum) r[0] = new Date(datum + 'T00:00:00');
  r[1] = pivo;
  for (const [k, v] of Object.entries(sudy)) r[[50, 30, 20, 15, 10].indexOf(Number(k)) + 2] = v;
  for (const [k, v] of Object.entries(lahve)) r[[1.5, 1.0, 0.5, 0.33].indexOf(Number(k)) + 7] = v;
  r[15] = pozn;
  return r;
}

describe('naparsujRadkyStaceniLahvi', () => {
  it('přeskočí legendu/záhlaví (řádky 1–18) a čistě poznámkové/prázdné řádky', () => {
    const aoa: unknown[][] = [];
    aoa[0] = [null, 'Desítka']; // legenda
    aoa[17] = ['Datum', 'Druh piva']; // záhlaví
    aoa[18] = radek('2024-11-04', '12 Světlá', { 50: 1 }, { 1.0: 31 }); // řádek 19
    aoa[19] = [null, null, null, null, null, null, null, null, null, null, null, 0, 0, 0, 0, 'Bohouš odměna']; // jen poznámka
    const r = naparsujRadkyStaceniLahvi(aoa);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ cisloRadku: 19, datum: '2024-11-04', pivoRaw: '12 Světlá' });
  });

  it('kolega píše datum jen na první řádek dne — prázdná buňka se doplní z řádku nad sebou', () => {
    const aoa: unknown[][] = new Array(18).fill([]);
    aoa.push(radek('2024-11-11', '12 Světlá', { 50: 1 }, { 1.0: 10 })); // 19
    aoa.push(radek(null, '11° sv.ležák', { 30: 1 }, { 1.0: 7 })); // 20 — bez data
    aoa.push(radek('2024-11-13', 'Jantar', { 50: 3 }, { 1.0: 135 })); // 21 — nové datum
    const r = naparsujRadkyStaceniLahvi(aoa);
    expect(r.map((x) => x.datum)).toEqual(['2024-11-11', '2024-11-11', '2024-11-13']);
    expect(r[1].datumNejdePrecist).toBeNull();
  });

  it('nečitelný text v datu (typo) se nedoplní potichu — appka to nemá hádat', () => {
    const aoa: unknown[][] = new Array(18).fill([]);
    aoa.push(radek('2026-08-28', 'Jantar', { 50: 1 }, { 1.0: 26 })); // 19
    const spatny = radek(null, '12 Tmavá', { 15: 1 }, { 1.0: 28 });
    spatny[0] = '31.9'; // typo — v září 31. není
    aoa.push(spatny); // 20
    const r = naparsujRadkyStaceniLahvi(aoa);
    expect(r[1].datumNejdePrecist).toBe('31.9');
    expect(r[1].datum).toBe('2026-08-28'); // poslední platné datum, ale problém se přesto nahlásí
  });

  it('rozpozná víc sudů a víc lahví najednou, i neplatnou hodnotu', () => {
    const aoa: unknown[][] = new Array(18).fill([]);
    aoa.push(radek('2024-11-05', '12 Světlá', { 50: 2, 30: 1 }, { 1.0: 77, 0.5: 20 }));
    const r = naparsujRadkyStaceniLahvi(aoa);
    expect(r[0].sudy).toEqual([{ objemL: 50, hodnota: 2 }, { objemL: 30, hodnota: 1 }]);
    expect(r[0].lahve).toEqual([{ objemL: 1.0, hodnota: 77 }, { objemL: 0.5, hodnota: 20 }]);
  });

  it('nečíselná hodnota (typo tečkou) se označí jako neplatná, ne jako 0', () => {
    const aoa: unknown[][] = new Array(18).fill([]);
    aoa.push(radek('2026-08-30', '12 Tmavá', { 15: '.' }, { 1.0: 28 }));
    const r = naparsujRadkyStaceniLahvi(aoa);
    expect(r[0].sudy).toEqual([{ objemL: 15, hodnota: 'neplatne' }]);
  });
});

describe('pripravImportStaceniLahvi', () => {
  const zakladniRadek = (): ExcelRadekStaceni => ({
    cisloRadku: 19, datum: '2024-11-04', datumNejdePrecist: null, pivoRaw: '12° Světlý ležák',
    sudy: [{ objemL: 50, hodnota: 1 }], lahve: [{ objemL: 1.0, hodnota: 31 }], poznamka: null,
  });

  it('čistý řádek: připraví záznam k zápisu se správným otiskem v poznámce', () => {
    const r = pripravImportStaceniLahvi([zakladniRadek()], PIVA, {}, OBALY, new Set());
    expect(r.pripravene).toHaveLength(1);
    expect(r.problemy).toEqual([]);
    const z = r.pripravene[0];
    expect(z.zaznamy).toEqual([{
      entry_date: '2024-11-04', beer_id: 'b12', beer_name: '12° Světlý ležák',
      kegs_used: 1, kegs_used_package_id: 'keg50', source_volume_l: 50,
      package_id: 'l10', package_label: 'Lahev 1,0 l', quantity: 31,
      note: `#xls-lahve:${z.otisk}`,
    }]);
    expect(z.bezSudu).toBe(false);
  });

  it('víc velikostí sudů najednou → problém, nic se nezapíše', () => {
    const radek: ExcelRadekStaceni = { ...zakladniRadek(), sudy: [{ objemL: 50, hodnota: 1 }, { objemL: 30, hodnota: 1 }] };
    const r = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(r.pripravene).toEqual([]);
    expect(r.problemy).toHaveLength(1);
    expect(r.problemy[0].problemy).toEqual([{ druh: 'vic_sudu_najednou', pocetDruhu: 2 }]);
    expect(popisProblemu(r.problemy[0].problemy[0])).toMatch(/2 různé/);
  });

  it('chybí datum a pivo → dva problémy na jednom řádku, sud bez lahví se přidá taky', () => {
    const radek: ExcelRadekStaceni = { cisloRadku: 20, datum: null, datumNejdePrecist: null, pivoRaw: null, sudy: [{ objemL: 50, hodnota: 1 }], lahve: [], poznamka: null };
    const r = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(r.problemy[0].problemy.map((p) => p.druh).sort()).toEqual(['chybi_datum', 'chybi_pivo', 'sud_bez_lahvi']);
  });

  it('neznámé pivo se nedomýšlí, ale ruční mapování ho dopáruje', () => {
    const radek: ExcelRadekStaceni = { ...zakladniRadek(), pivoRaw: 'Dvanáctka' };
    const bezMapy = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(bezMapy.problemy[0].problemy).toEqual([{ druh: 'nezname_pivo', nazev: 'Dvanáctka' }]);
    expect(bezMapy.neznamaPiva).toEqual(['Dvanáctka']);

    const sMapou = pripravImportStaceniLahvi([radek], PIVA, { [normalizujNazev('Dvanáctka')]: 'b12' }, OBALY, new Set());
    expect(sMapou.pripravene).toHaveLength(1);
    expect(sMapou.pripravene[0].zaznamy[0].beer_id).toBe('b12');
  });

  it('nečitelné datum je problém, i když by šlo tiše použít předchozí (dopočtené)', () => {
    const radek: ExcelRadekStaceni = { ...zakladniRadek(), datum: '2026-08-28', datumNejdePrecist: '31.9' };
    const r = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(r.pripravene).toEqual([]);
    expect(r.problemy[0].problemy).toEqual([{ druh: 'datum_nejde_precist', text: '31.9' }]);
  });

  it('neznámý obal (appka ho nemá založený) → problém, ne tichý přeskok', () => {
    const radek: ExcelRadekStaceni = { ...zakladniRadek(), sudy: [{ objemL: 20, hodnota: 1 }] };
    const r = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(r.problemy[0].problemy).toEqual([{ druh: 'neznamy_obal', objemL: 20, typ: 'sud' }]);
  });

  it('řádek beze sudu (jen „zbytek z akce") jde k zápisu, ale je označený bezSudu', () => {
    const radek: ExcelRadekStaceni = { ...zakladniRadek(), sudy: [], poznamka: 'zbytek sudu z akce' };
    const r = pripravImportStaceniLahvi([radek], PIVA, {}, OBALY, new Set());
    expect(r.pripravene).toHaveLength(1);
    expect(r.pripravene[0].bezSudu).toBe(true);
    expect(r.pripravene[0].zaznamy[0]).toMatchObject({ kegs_used: null, kegs_used_package_id: null, source_volume_l: null });
  });

  it('poznámka je v otisku ignorovaná — pozdější oprava textu se nebere jako nový řádek', () => {
    const a = pripravImportStaceniLahvi([{ ...zakladniRadek(), poznamka: 'puvodni' }], PIVA, {}, OBALY, new Set());
    const b = pripravImportStaceniLahvi([{ ...zakladniRadek(), poznamka: 'opravena poznamka' }], PIVA, {}, OBALY, new Set());
    expect(a.pripravene[0].otisk).toBe(b.pripravene[0].otisk);
  });

  it('už naimportovaný otisk se přeskočí, ne znovu zapíše', () => {
    const prvni = pripravImportStaceniLahvi([zakladniRadek()], PIVA, {}, OBALY, new Set());
    const otisky = najdiJizNaimportovaneOtisky(prvni.pripravene[0].zaznamy.map((z) => z.note));
    const druhy = pripravImportStaceniLahvi([zakladniRadek()], PIVA, {}, OBALY, otisky);
    expect(druhy.pripravene).toEqual([]);
    expect(druhy.jizNaimportovane).toBe(1);
  });

  it('dva různé řádky se shodou okolností stejným obsahem dostanou různý otisk (nezaniknou jeden druhému)', () => {
    const r = pripravImportStaceniLahvi([zakladniRadek(), zakladniRadek()], PIVA, {}, OBALY, new Set());
    expect(r.pripravene).toHaveLength(2);
    expect(r.pripravene[0].otisk).not.toBe(r.pripravene[1].otisk);
  });
});

describe('najdiJizNaimportovaneOtisky', () => {
  it('vytáhne otisk ze značky v poznámce a ignoruje řádky appky bez značky', () => {
    const r = najdiJizNaimportovaneOtisky(['ruční zápis', '#xls-lahve:abc123', 'sud vrácen #xls-lahve:xyz z importu', null]);
    expect(r).toEqual(new Set(['abc123', 'xyz']));
  });
});

// Vložená mřížka: appka žádné dopočítané sloupce neukazuje, poznámka je
// hned za lahvemi (index 11, ne 15 jako v excelu) a nepředchází jí legenda —
// mřížka drží jen data. Hodnoty jsou vždycky text (buňka appky nebo
// vložený text ze schránky), včetně data v českém tvaru „4.11.2024".
describe('naparsujRadkyZMrizky', () => {
  // [datum, pivo, 50,30,20,15,10, 1.5,1.0,0.5,0.33, poznámka] — 12 sloupců
  const radek = (datum: string, pivo: string, sud50: string, l10: string, l05: string, pozn = '') =>
    [datum, pivo, sud50, '', '', '', '', '', l10, l05, '', pozn];

  it('český formát data (kolega ho tak píše ručně) i české desetinné čárky u počtu', () => {
    const r = naparsujRadkyZMrizky([radek('4.11.2024', '12 Světlá', '1', '31', '', '')]);
    expect(r).toEqual([{
      cisloRadku: 1, datum: '2024-11-04', datumNejdePrecist: null, pivoRaw: '12 Světlá',
      sudy: [{ objemL: 50, hodnota: 1 }], lahve: [{ objemL: 1, hodnota: 31 }], poznamka: null,
    }]);
  });

  it('mezery kolem teček v datu (jak to Sheets/Excel občas zformátuje) se tolerují', () => {
    const r = naparsujRadkyZMrizky([radek('4. 11. 2024', '12 Světlá', '1', '31', '')]);
    expect(r[0].datum).toBe('2024-11-04');
  });

  it('neexistující den v měsíci se nedomýšlí — jde do datumNejdePrecist', () => {
    const r = naparsujRadkyZMrizky([radek('31.9.2026', '12 Tmavá', '', '', '28')]);
    expect(r[0].datumNejdePrecist).toBe('31.9.2026');
  });

  it('datum se doplní z řádku nad sebou, i v mřížce (prázdná buňka)', () => {
    const r = naparsujRadkyZMrizky([
      radek('4.11.2024', '12 Světlá', '1', '31', ''),
      radek('', '11° sv.ležák', '', '', '12', 'druhý řádek stejného dne'),
    ]);
    expect(r[1].datum).toBe('2024-11-04');
    expect(r[1].poznamka).toBe('druhý řádek stejného dne');
  });

  it('prázdný řádek (nic nevyplněno) se přeskočí, číslování řádků na to nezapomene', () => {
    const r = naparsujRadkyZMrizky([
      radek('4.11.2024', '12 Světlá', '1', '31', ''),
      ['', '', '', '', '', '', '', '', '', '', '', ''],
      radek('5.11.2024', 'Jantar', '1', '37', '11'),
    ]);
    expect(r.map((x) => x.cisloRadku)).toEqual([1, 3]);
  });
});
