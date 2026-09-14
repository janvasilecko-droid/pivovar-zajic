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
  it('spočítá počáteční/stočeno/odpis/výdej/očekávaný z byKind', () => {
    // buildMovements ukládá odpis/výdej se ZÁPORNÝM znaménkem (je to úbytek),
    // sestavInventuruExportu ho pro zobrazení otáčí zpátky na kladný — stejně
    // jako to dělá InventoryScreen.tsx.
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({
        beer_id: 'b1', package_id: 'k50', baselineQty: 5, qty: 11,
        byKind: { kegovani: 10, odpis: -1, fasovani: -3 },
      })],
    ]);
    const [r] = sestavInventuruExportu(BEERS, PACKAGES, ledger, {});
    expect(r.beer_name).toBe('11° Světlá');
    expect(r.package_label).toBe('KEG 50 l');
    expect(r.initialQty).toBe(5);
    expect(r.stacenoQty).toBe(10);
    expect(r.odpisQty).toBe(1);
    expect(r.vydejQty).toBe(3);
    expect(r.expectedQty).toBe(11);
    expect(r.actualQty).toBeNull();
    expect(r.diffQty).toBeNull();
  });

  it('fyzický stav se napočítá do manka v Kč — sud nad 20 l je 1500 Kč orientačně', () => {
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({ beer_id: 'b1', package_id: 'k50', qty: 11 })],
    ]);
    const [r] = sestavInventuruExportu(BEERS, PACKAGES, ledger, { 'b1__k50': 9 });
    expect(r.actualQty).toBe(9);
    expect(r.diffQty).toBe(-2);
    expect(r.diffCzk).toBe(-3000);
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

  it('úplně prázdný řádek (nic se nedělo, nic se nezapsalo) se vynechá', () => {
    const ledger = new Map<string, StockLine>([
      ['b1__k50', radek({ beer_id: 'b1', package_id: 'k50', qty: 0 })],
    ]);
    const radky = sestavInventuruExportu(BEERS, PACKAGES, ledger, {});
    expect(radky).toHaveLength(0);
  });
});

describe('list Inventura v sešitu', () => {
  beforeAll(async () => { await nactiXlsx(); });

  it('hlavička a data sedí na svých buňkách', () => {
    const ws = postavInventuruList([
      { beer_name: '11° Světlá', package_label: 'KEG 50 l', initialQty: 5, stacenoQty: 10, odpisQty: 1, vydejQty: 3, expectedQty: 11, actualQty: 9, diffQty: -2, diffCzk: -3000 },
    ]);
    expect(ws['A1'].v).toBe('Pivo');
    expect(ws['H1'].v).toBe('Fyzická inventura');
    expect(ws['A2'].v).toBe('11° Světlá');
    expect(ws['G2'].v).toBe(11);
    expect(ws['H2'].v).toBe(9);
    expect(ws['I2'].v).toBe(-2);
    expect(ws['J2'].v).toBe(-3000);
  });

  it('TSV ke kopírování má stejná data jako list', () => {
    const tsv = inventuraDoTsv([
      { beer_name: '11° Světlá', package_label: 'KEG 50 l', initialQty: 5, stacenoQty: 10, odpisQty: 1, vydejQty: 3, expectedQty: 11, actualQty: 9, diffQty: -2, diffCzk: -3000 },
    ]);
    const [hlavicka, radek] = tsv.split('\n');
    expect(hlavicka.split('\t')).toContain('Fyzická inventura');
    expect(radek).toBe('11° Světlá\tKEG 50 l\t5\t10\t1\t3\t11\t9\t-2\t-3000');
  });
});
