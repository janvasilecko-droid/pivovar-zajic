// 📒 List „Inventura" pro měsíční export.
// ---------------------------------------------------------------------------
// Ostatní listy (Odběr personál, Stáčení…) mají jeden řádek na den + pivo —
// to se ale hodí na výdeje, ne na inventuru. Inventura ukazuje tři sloupce:
// pivo, obal a fyzický stav ke konci měsíce — ale za CELÝ měsíc, tedy každé
// pivo × obal, které v měsíci mělo pohyb nebo je pořád aktivní, ne jen ty,
// co měly uložený fyzický zápis.
//
// Dřív se do listu braly jen řádky uložené jako Fyzická/Schválená inventura
// (přímý výpis z tabulky `inventory`) — tj. jen položky, které měly nenulový
// fyzický zápis. Za měsíc, kde se spočítalo jen pár druhů, tak vyšlo pár
// řádků a vypadalo to, že měsíc chybí, i když sklad měl pohyb u desítek
// položek. Které řádky do listu patří se proto pozná ze stejné skladové
// knihy (stockLedger.ts), jakou počítá záložka „Fyzická inventura" v
// Inventuře — ukazuje se z ní ale jen výsledný fyzický stav, ne celý rozpad.
import { xlsx } from './xlsxLazy';
import { pismeno, styl } from './mesicniExport';
import { jeLimonada } from './limonady';
import type { StockLine } from './stockLedger';

export type BeerProInventuru = { id: string; name: string; is_active: boolean };
export type PackageProInventuru = { id: string; label: string; volume_l: number | string | null };

export type InventuraExportRadek = {
  beer_name: string;
  package_label: string;
  /** null = nezapočítáno (nebyla uložená fyzická/schválená inventura toho měsíce). */
  actualQty: number | null;
};

/**
 * Piva pro daný měsíc: aktivní vždycky, skrytá jen když v měsíci měla pohyb
 * NEBO fyzický zápis — jinak by tabulka byla plná dávno vyřazených piv (viz
 * InventoryScreen.tsx, monthBeers, stejná úvaha). Fyzický zápis se počítá
 * zvlášť od pohybu: čistě napočítaný stav bez jiného pohybu do skladové
 * knihy nevstupuje (viz stockLedger.ts, kind 'inventura' se v hlavní smyčce
 * přeskakuje), takže by bez týhle podmínky zmizel úplně.
 *
 * 🥤 Limonády (Grep, Citron, Kiwi, Višeň…) do inventury nepatří vůbec — viz
 * lib/limonady.ts.
 */
function pivaMesice(
  beers: BeerProInventuru[], packages: PackageProInventuru[],
  expectedLedger: Map<string, StockLine>, actualMap: Record<string, number>,
): BeerProInventuru[] {
  return beers.filter((b) => !jeLimonada(b.name) && (b.is_active || packages.some((p) => {
    const k = `${b.id}__${p.id}`;
    return expectedLedger.has(k) || k in actualMap;
  })));
}

/**
 * Poskládá řádky inventury za měsíc. `actualMap` je fyzicky napočítaný stav
 * (klíč `beer_id__package_id`) z uložené Fyzické/Schválené inventury toho
 * měsíce — chybějící klíč znamená „nepočítalo se", ne nulu.
 *
 * Do listu patří pivo × obal, které buď v měsíci mělo NĚJAKÝ pohyb (podle
 * `expectedLedger`), nebo bylo fyzicky napočítané — jinak by šlo o prázdný
 * řádek, který do exportu nepatří.
 */
export function sestavInventuruExportu(
  beers: BeerProInventuru[],
  packages: PackageProInventuru[],
  expectedLedger: Map<string, StockLine>,
  actualMap: Record<string, number>,
): InventuraExportRadek[] {
  const out: InventuraExportRadek[] = [];

  pivaMesice(beers, packages, expectedLedger, actualMap).forEach((b) => {
    packages.forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const melPohyb = expectedLedger.has(k);
      const actualQty = k in actualMap ? actualMap[k] : null;
      if (!melPohyb && actualQty === null) return;

      out.push({ beer_name: b.name, package_label: p.label, actualQty });
    });
  });

  return out;
}

const HLAVICKA = ['Pivo', 'Obal', 'Fyzický stav ke konci měsíce'];

/** TSV k vykopírování — stejný tvar jako `prehledDoTsv` u ostatních listů. */
export function inventuraDoTsv(radky: InventuraExportRadek[]): string {
  const telo = radky.map((r) => [r.beer_name, r.package_label, r.actualQty ?? ''].join('\t'));
  return [HLAVICKA.join('\t'), ...telo].join('\n');
}

/** Postaví worksheet listu Inventura — stejné styly jako ostatní listy sešitu. */
export function postavInventuruList(radky: InventuraExportRadek[]): any {
  const data: any[][] = [HLAVICKA, ...radky.map((r) => [r.beer_name, r.package_label, r.actualQty])];

  const ws = xlsx().utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 24 }];
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const rozsah = xlsx().utils.decode_range(ws['!ref']!);
  for (let R = rozsah.s.r; R <= rozsah.e.r; R++) {
    for (let C = rozsah.s.c; C <= rozsah.e.c; C++) {
      const adresa = pismeno(C) + (R + 1);
      const bunka = ws[adresa];
      if (!bunka) continue;
      if (R === 0) bunka.s = styl.hlavicka;
      else if (C === 2) bunka.s = styl.cislo;
    }
  }

  return ws;
}
