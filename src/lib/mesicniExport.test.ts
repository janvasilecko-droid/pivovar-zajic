import { describe, it, expect, beforeAll } from 'vitest';
import XLSX from 'xlsx-js-style';
import { nazevSouboru, poctyRadku, postavSesit, type ListExportu } from './mesicniExport';
import { nactiXlsx } from './xlsxLazy';
import type { ObalPrehled, VydejRadek } from './prehledVydeje';

const OBALY: ObalPrehled[] = [
  { id: 'k50', label: 'KEG 50 l', kind: 'keg', volume_l: 50 },
  { id: 'k30', label: 'KEG 30 l', kind: 'keg', volume_l: 30 },
  { id: 'l05', label: 'Lahev 0,5 l', kind: 'bottle', volume_l: 0.5 },
];

const personal: VydejRadek[] = [
  { entry_date: '2026-08-03', beer_name: '11° Světlá', package_id: 'k30', quantity: 2, who: 'Petr' },
  { entry_date: '2026-08-03', beer_name: '11° Světlá', package_id: 'l05', quantity: 20, who: 'Petr' },
];
const kegy: VydejRadek[] = [
  { entry_date: '2026-08-04', beer_name: '12° Světlá', package_id: 'k50', quantity: 12, tank: '6' },
];

const LISTY: ListExportu[] = [
  { nazev: 'Odběr personál', varianta: 'odberatel', radky: personal },
  { nazev: 'Fasování prodejna', varianta: 'odberatel', radky: [] },
  { nazev: 'Stáčení KEG', varianta: 'staceni_keg', radky: kegy },
];

const vstup = { listy: LISTY, obaly: OBALY, od: '2026-08-01', do: '2026-08-31' };

function bunka(ws: any, adresa: string) {
  return ws[adresa];
}

describe('měsíční export do jednoho sešitu', () => {
  // Knihovna na Excel se v aplikaci stahuje až při kliknutí na export
  // (628 kB, viz lib/xlsxLazy.ts) — `postavSesit` ji tedy najde načtenou
  // jen tehdy, když ji někdo načte. V testu to musíme udělat explicitně.
  // Kdyby se na to zapomnělo, `xlsx()` vyhodí výjimku hned; právě proto ji
  // vyhazuje, místo aby vracelo undefined a padalo někde uvnitř sešitu.
  beforeAll(async () => { await nactiXlsx(); });

  it('každý zápis má vlastní list', () => {
    const wb = postavSesit(vstup)!;
    expect(wb.SheetNames).toContain('Odběr personál');
    expect(wb.SheetNames).toContain('Stáčení KEG');
  });

  it('prázdné listy se do sešitu nedávají — jen by mátly', () => {
    const wb = postavSesit(vstup)!;
    expect(wb.SheetNames).not.toContain('Fasování prodejna');
  });

  it('bez jediného zápisu nevznikne prázdný sešit, ale null', () => {
    expect(postavSesit({ ...vstup, listy: [{ nazev: 'Nic', varianta: 'odberatel', radky: [] }] })).toBeNull();
  });

  it('hlavička má dva řádky: skupiny a objemy', () => {
    const ws = postavSesit(vstup)!.Sheets['Odběr personál'];
    // Skupiny nad objemy začínají ve čtvrtém sloupci (D), za Datum/Odběratel/Pivo.
    expect(bunka(ws, 'D1').v).toBe('Sudy');
    expect(bunka(ws, 'I1').v).toBe('Lahve');
    expect(bunka(ws, 'A2').v).toBe('Datum');
    expect(bunka(ws, 'B2').v).toBe('Odběratel');
    expect(bunka(ws, 'C2').v).toBe('Druh piva');
    expect(bunka(ws, 'D2').v).toBe('50 l');
    expect(bunka(ws, 'L2').v).toBe('0,33l');
  });

  it('data začínají na třetím řádku a slučují zápisy téhož piva', () => {
    const ws = postavSesit(vstup)!.Sheets['Odběr personál'];
    expect(bunka(ws, 'A3').v).toBe('3.8.2026');
    expect(bunka(ws, 'B3').v).toBe('Petr');
    expect(bunka(ws, 'E3').v).toBe(2);   // 30 l
    expect(bunka(ws, 'K3').v).toBe(20);  // 0,5 l
  });

  it('hektolitry jsou VZOREC, ne číslo — po opravě počtu se přepočítají samy', () => {
    const ws = postavSesit(vstup)!.Sheets['Odběr personál'];
    // M = sudy hl, N = lahve hl, O = celkem hl
    expect(bunka(ws, 'M3').f).toContain('SUMPRODUCT');
    expect(bunka(ws, 'M3').f).toContain('/100');
    expect(bunka(ws, 'N3').f).toContain('SUMPRODUCT');
    expect(bunka(ws, 'O3').f).toBe('M3+N3');
  });

  it('vzorec pro sudy počítá se správnými objemy', () => {
    const ws = postavSesit(vstup)!.Sheets['Odběr personál'];
    expect(bunka(ws, 'M3').f).toBe('SUMPRODUCT(D3:H3,{50,30,20,15,10})/100');
  });

  it('poslední řádek je součet vzorcem, ne natvrdo', () => {
    const ws = postavSesit(vstup)!.Sheets['Odběr personál'];
    expect(bunka(ws, 'A4').v).toBe('Celkem');
    expect(bunka(ws, 'E4').f).toBe('SUM(E3:E3)');
  });

  it('list KEG má Tank č. a nemá sloupce lahví', () => {
    const ws = postavSesit(vstup)!.Sheets['Stáčení KEG'];
    expect(bunka(ws, 'A2').v).toBe('Datum');
    expect(bunka(ws, 'B2').v).toBe('Druh piva');
    expect(bunka(ws, 'C2').v).toBe('50 l');
    expect(bunka(ws, 'G2').v).toBe('10 l');
    expect(bunka(ws, 'H2').v).toBe('Tank č.');
    expect(bunka(ws, 'H3').v).toBe('6');
    // Za tankem jdou rovnou hektolitry, žádné lahve.
    expect(bunka(ws, 'I1').v).toBe('sudy hl');
  });

  it('sešit jde skutečně zapsat — projde serializací do xlsx', () => {
    const wb = postavSesit(vstup)!;
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('náhled řekne, kolik čeho bude, včetně prázdných listů', () => {
    expect(poctyRadku(vstup)).toEqual([
      { nazev: 'Odběr personál', pocet: 1 },
      { nazev: 'Fasování prodejna', pocet: 0 },
      { nazev: 'Stáčení KEG', pocet: 1 },
    ]);
  });
});

describe('název souboru', () => {
  it('u celého měsíce nese měsíc', () => {
    expect(nazevSouboru('2026-08-01', '2026-08-31')).toBe('Zapisy_pivovar_2026-08.xlsx');
  });

  it('u vlastního období nese oba kraje, ať se soubory nepřepisují', () => {
    expect(nazevSouboru('2026-08-01', '2026-09-15')).toBe('Zapisy_pivovar_2026-08-01_az_2026-09-15.xlsx');
  });
});
