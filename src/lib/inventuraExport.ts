// 📒 List „Inventura" pro měsíční export.
// ---------------------------------------------------------------------------
// Ostatní listy (Odběr personál, Stáčení…) mají jeden řádek na den + pivo —
// to se ale hodí na výdeje, ne na inventuru. Inventura má být za CELÝ měsíc
// najednou: pro každé pivo × obal počáteční stav, stočeno, odpis, výdej,
// očekávaný stav a fyzicky napočítané kusy — stejná čísla jako záložka
// „Fyzická inventura" v Inventuře (viz screens/InventoryScreen.tsx).
//
// Dřív se do listu braly jen řádky uložené jako Fyzická/Schválená inventura
// (přímý výpis z tabulky `inventory`) — tj. jen položky, které měly nenulový
// fyzický zápis. Za měsíc, kde se spočítalo jen pár druhů, tak vyšlo pár
// řádků a vypadalo to, že měsíc chybí, i když sklad měl pohyb u desítek
// položek. Tenhle modul proto počítá celou skladovou knihu (stockLedger.ts),
// stejně jako to dělá obrazovka Inventura.
import { xlsx } from './xlsxLazy';
import { pismeno, styl } from './mesicniExport';
import type { StockLine } from './stockLedger';

export type BeerProInventuru = { id: string; name: string; is_active: boolean };
export type PackageProInventuru = { id: string; label: string; volume_l: number | string | null };

export type InventuraExportRadek = {
  beer_name: string;
  package_label: string;
  initialQty: number;
  stacenoQty: number;
  odpisQty: number;
  vydejQty: number;
  expectedQty: number;
  /** null = nezapočítáno (nebyla uložená fyzická/schválená inventura). */
  actualQty: number | null;
  diffQty: number | null;
  diffCzk: number | null;
};

/** Orientační cena za kus podle objemu — stejný odhad jako v Inventuře. */
function cenaZaKus(volumeL: number): number {
  return volumeL > 20 ? 1500 : volumeL > 0.6 ? 250 : 45;
}

/**
 * Piva pro daný měsíc: aktivní vždycky, skrytá jen když v měsíci měla pohyb
 * — jinak by tabulka byla plná dávno vyřazených piv (viz InventoryScreen.tsx,
 * monthBeers, stejná úvaha).
 */
function pivaMesice(beers: BeerProInventuru[], packages: PackageProInventuru[], expectedLedger: Map<string, StockLine>): BeerProInventuru[] {
  return beers.filter((b) => b.is_active || packages.some((p) => expectedLedger.has(`${b.id}__${p.id}`)));
}

/**
 * Poskládá řádky inventury za měsíc. `actualMap` je fyzicky napočítaný stav
 * (klíč `beer_id__package_id`) z uložené Fyzické/Schválené inventury toho
 * měsíce — chybějící klíč znamená „nepočítalo se", ne nulu.
 */
export function sestavInventuruExportu(
  beers: BeerProInventuru[],
  packages: PackageProInventuru[],
  expectedLedger: Map<string, StockLine>,
  actualMap: Record<string, number>,
): InventuraExportRadek[] {
  const out: InventuraExportRadek[] = [];

  pivaMesice(beers, packages, expectedLedger).forEach((b) => {
    packages.forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const line = expectedLedger.get(k);
      const kinds = line?.byKind ?? {};
      const initialQty = line?.baselineQty ?? 0;
      const stacenoQty = (kinds.kegovani ?? 0) + (kinds.staceni ?? 0) + (kinds.prefuk_do ?? 0);
      const odpisQty = -(kinds.odpis ?? 0);
      const vydejQty =
        -((kinds.fasovani ?? 0) + (kinds.prodejna ?? 0) + (kinds.zavoz ?? 0) +
          (kinds.akce ?? 0) + (kinds.sud_na_lahve ?? 0) + (kinds.prefuk_z ?? 0));
      const expectedQty = line?.qty ?? (initialQty + stacenoQty - odpisQty - vydejQty);
      const actualQty = k in actualMap ? actualMap[k] : null;
      const diffQty = actualQty !== null ? actualQty - expectedQty : null;
      const diffCzk = diffQty !== null ? diffQty * cenaZaKus(Number(p.volume_l ?? 0)) : null;

      // Prázdný řádek (nic se nedělo a nic se ani nepočítalo) do exportu nepatří.
      if (initialQty === 0 && stacenoQty === 0 && odpisQty === 0 && vydejQty === 0 && expectedQty === 0 && actualQty === null) return;

      out.push({ beer_name: b.name, package_label: p.label, initialQty, stacenoQty, odpisQty, vydejQty, expectedQty, actualQty, diffQty, diffCzk });
    });
  });

  return out;
}

const HLAVICKA = ['Pivo', 'Obal', 'Počáteční', 'Stočeno (+)', 'Odpis (−)', 'Výdej (−)', 'Očekávaný', 'Fyzická inventura', 'Manko (ks)', 'Manko (Kč)'];

/** TSV k vykopírování — stejný tvar jako `prehledDoTsv` u ostatních listů. */
export function inventuraDoTsv(radky: InventuraExportRadek[]): string {
  const telo = radky.map((r) => [
    r.beer_name, r.package_label, r.initialQty, r.stacenoQty, r.odpisQty, r.vydejQty, r.expectedQty,
    r.actualQty ?? '', r.diffQty ?? '', r.diffCzk ?? '',
  ].join('\t'));
  return [HLAVICKA.join('\t'), ...telo].join('\n');
}

/** Postaví worksheet listu Inventura — stejné styly jako ostatní listy sešitu. */
export function postavInventuruList(radky: InventuraExportRadek[]): any {
  const data: any[][] = [HLAVICKA, ...radky.map((r) => [
    r.beer_name, r.package_label, r.initialQty, r.stacenoQty, r.odpisQty, r.vydejQty, r.expectedQty,
    r.actualQty, r.diffQty, r.diffCzk,
  ])];

  const ws = xlsx().utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 16 }, { wch: 11 }, { wch: 12 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const rozsah = xlsx().utils.decode_range(ws['!ref']!);
  for (let R = rozsah.s.r; R <= rozsah.e.r; R++) {
    for (let C = rozsah.s.c; C <= rozsah.e.c; C++) {
      const adresa = pismeno(C) + (R + 1);
      const bunka = ws[adresa];
      if (!bunka) continue;
      if (R === 0) bunka.s = styl.hlavicka;
      else if (C >= 2) bunka.s = styl.cislo;
    }
  }

  return ws;
}
