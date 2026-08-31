// Propojovací test: řádek, který vyrobí doplnění stočení z inventury, musí
// ve skladové knize skutečně ODEČÍST zdrojové sudy — ne je jen nést v poli.
// Kdyby se to rozešlo (jiný název sloupce, chybějící package_id), lahve by
// přibyly a sudy by ve skladu ležely dál.
import { describe, expect, it } from 'vitest';
import { stoceniZapis, type InventuraPolozka } from './inventoryFix';
import { buildMovements, stockAtStartOfDay } from './stockLedger';

const PACKAGES = [
  { id: 'pkg-lahev15', kind: 'bottle', volume_l: 1.5 },
  { id: 'pkg-keg50', kind: 'keg', volume_l: 50 },
  { id: 'pkg-keg30', kind: 'keg', volume_l: 30 },
];

const lahev: InventuraPolozka = {
  beer_id: 'b1', beer_name: '12° Světlá',
  package_id: 'pkg-lahev15', package_label: 'Lahev 1,5 l', package_kind: 'bottle',
  diffQty: 117,
};

/** Stav skladu druhý den po zápisu — tedy až se pohyby započítají. */
function stavPo(bottlingRows: any[], key: string): number {
  const movements = buildMovements({ bottlingRows, packages: PACKAGES });
  return stockAtStartOfDay(movements, '2026-09-01').get(key)?.qty ?? 0;
}

describe('doplněk stočení lahví ve skladové knize', () => {
  const zapis = stoceniZapis(
    lahev, '2026-08-31', '2026-08',
    { kegPkgId: 'pkg-keg50', kegQty: 4, kegVolumeL: 50 },
  );

  it('míří do tabulky stáčení lahví', () => {
    expect(zapis?.table).toBe('bottling');
  });

  it('přidá nastáčené lahve', () => {
    expect(stavPo([zapis!.row], 'b1__pkg-lahev15')).toBe(117);
  });

  it('a ZÁROVEŇ odečte zdrojové sudy ze skladu', () => {
    expect(stavPo([zapis!.row], 'b1__pkg-keg50')).toBe(-4);
  });

  it('odečte je z té velikosti sudu, která se vybrala', () => {
    const z30 = stoceniZapis(
      lahev, '2026-08-31', '2026-08',
      { kegPkgId: 'pkg-keg30', kegQty: 7, kegVolumeL: 30 },
    );
    expect(stavPo([z30!.row], 'b1__pkg-keg30')).toBe(-7);
    expect(stavPo([z30!.row], 'b1__pkg-keg50')).toBe(0);
  });

  it('při volbě „Neodečítat" se sudů nedotkne', () => {
    const bezSudu = stoceniZapis(lahev, '2026-08-31', '2026-08', null);
    expect(stavPo([bezSudu!.row], 'b1__pkg-lahev15')).toBe(117);
    expect(stavPo([bezSudu!.row], 'b1__pkg-keg50')).toBe(0);
  });

  it('dva doplňky téhož piva a data se navzájem nepřepočtou pryč', () => {
    // Skladová kniha slučuje sourozenecké řádky jednoho zápisu stáčení
    // (Lahve 1/2/3 sdílí jeden odečet sudů). Dva SAMOSTATNÉ doplňky ale
    // musí odečíst sudy oba — proto má každý vlastní poznámku.
    const a = stoceniZapis(
      { ...lahev, diffQty: 117 }, '2026-08-31', '2026-08',
      { kegPkgId: 'pkg-keg50', kegQty: 4, kegVolumeL: 50 },
    );
    const b = stoceniZapis(
      { ...lahev, package_id: 'pkg-lahev15', diffQty: 90 }, '2026-08-31', '2026-08',
      { kegPkgId: 'pkg-keg50', kegQty: 3, kegVolumeL: 50 },
    );
    expect(stavPo([a!.row, b!.row], 'b1__pkg-keg50')).toBe(-7);
  });

  it('ani když mají shodný počet kusů a shodný odečet sudů', () => {
    // Nejhorší případ pro slučování: stejné pivo, datum, počet kusů i sudů —
    // liší se jen obal. Poznámka ho proto nese, jinak by druhý řádek zmizel.
    const p05 = stoceniZapis(
      { ...lahev, package_id: 'pkg-lahev05', package_label: 'Lahev 0,5 l', diffQty: 100 },
      '2026-08-31', '2026-08', { kegPkgId: 'pkg-keg50', kegQty: 2, kegVolumeL: 50 },
    );
    const p10 = stoceniZapis(
      { ...lahev, package_id: 'pkg-lahev10', package_label: 'Lahev 1 l', diffQty: 100 },
      '2026-08-31', '2026-08', { kegPkgId: 'pkg-keg50', kegQty: 2, kegVolumeL: 50 },
    );
    expect(p05!.row.note).not.toBe(p10!.row.note);
    expect(stavPo([p05!.row, p10!.row], 'b1__pkg-keg50')).toBe(-4);
  });
});
