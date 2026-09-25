import { describe, it, expect, beforeAll } from 'vitest';
import { sestavInventuruExportu, postavInventuruList, inventuraDoTsv, type BeerProInventuru, type PackageProInventuru } from './inventuraExport';
import { nactiXlsx } from './xlsxLazy';
import type { StockLine } from './stockLedger';

const BEERS: BeerProInventuru[] = [
  { id: 'b1', name: '11° Světlá', is_active: true },
  // Skryté pivo, ale v měsíci mělo pohyb — musí se přesto ukázat (viz
  // InventoryScreen.tsx, monthBeers — stejná úvaha zde).
  { id: 'b2', name: 'Summer Ale', is_active: false },
  // Skryté a bez pohybu — do exportu nepatří.
  { id: 'b3', name: 'Zapomenuté pivo', is_active: false },
];

const PACKAGES: PackageProInventuru[] = [
  { id: 'k50', label: 'KEG 50 l', volume_l: 50 },
  { id: 'l05', label: 'Lahev 0,5 l', volume_l: 0.5 },
];

function radek(partial: Partial<StockLine> & { beer_id: string; package_id: string }): StockLine {
  return {
    key: `${partial.beer_id}__${partial.package_id}`,
    qty: 0, baselineDate: null, baselineQty: 0, baselineNote: null, byKind: {},
    ...partial,
  };
}

describe('sestavInventuruExportu', () => {
  it('vrátí jen pivo, obal a fyzicky napočítaný stav', () => {
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({ beer_id: 'b1', package_id: 'k50', qty: 11 })],
    ]);
    const [r] = sestavInventuruExportu(BEERS, PACKAGES, ledger, { 'b1__k50': 9 });
    expect(r).toEqual({ beer_name: '11° Světlá', package_label: 'KEG 50 l', actualQty: 9 });
  });

  it('položka s pohybem, ale bez fyzického zápisu, má actualQty null (ne 0)', () => {
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({ beer_id: 'b1', package_id: 'k50', qty: 11 })],
    ]);
    const [r] = sestavInventuruExportu(BEERS, PACKAGES, ledger, {});
    expect(r.actualQty).toBeNull();
  });

  it('neaktivní pivo BEZ pohybu v měsíci se do exportu nedostane', () => {
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({ beer_id: 'b1', package_id: 'k50', qty: 5 })],
    ]);
    const radky = sestavInventuruExportu(BEERS, PACKAGES, ledger, {});
    expect(radky.some((r) => r.beer_name === 'Zapomenuté pivo')).toBe(false);
  });

  it('neaktivní pivo S pohybem v měsíci se ukáže — proto Summer Ale zpátky v srpnu', () => {
    const ledger = new Map<string, StockLine>([
      ['b2__k50', radek({ beer_id: 'b2', package_id: 'k50', qty: 4, byKind: { kegovani: 4 } })],
    ]);
    const radky = sestavInventuruExportu(BEERS, PACKAGES, ledger, {});
    expect(radky.some((r) => r.beer_name === 'Summer Ale')).toBe(true);
  });

  it('neaktivní pivo bez pohybu, ale s fyzickým zápisem, se přesto ukáže', () => {
    const radky = sestavInventuruExportu(BEERS, PACKAGES, new Map(), { 'b3__k50': 2 });
    expect(radky).toEqual([{ beer_name: 'Zapomenuté pivo', package_label: 'KEG 50 l', actualQty: 2 }]);
  });
});

describe('list Inventura v sešitu', () => {
  beforeAll(async () => { await nactiXlsx(); });

  it('hlavička a data sedí na svých buňkách — jen tři sloupce', () => {
    const ws = postavInventuruList([
      { beer_name: '11° Světlá', package_label: 'KEG 50 l', actualQty: 9 },
    ]);
    expect(ws['A1'].v).toBe('Pivo');
    expect(ws['B1'].v).toBe('Obal');
    expect(ws['C1'].v).toBe('Fyzický stav ke konci měsíce');
    expect(ws['A2'].v).toBe('11° Světlá');
    expect(ws['B2'].v).toBe('KEG 50 l');
    expect(ws['C2'].v).toBe(9);
    expect(ws['D1']).toBeUndefined();
  });

  it('TSV ke kopírování má stejná data jako list', () => {
    const tsv = inventuraDoTsv([
      { beer_name: '11° Světlá', package_label: 'KEG 50 l', actualQty: 9 },
    ]);
    expect(tsv).toBe('Pivo\tObal\tFyzický stav ke konci měsíce\n11° Světlá\tKEG 50 l\t9');
  });
});
