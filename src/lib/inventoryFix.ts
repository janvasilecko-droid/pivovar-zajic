// 🧮 Inventura → Stáčení: co udělat s rozdílem mezi napočítaným a očekávaným.
// ---------------------------------------------------------------------------
// PŘEBYTEK (napočítáno VÍC, než sklad čeká) skoro vždycky znamená, že se
// stočilo a nezapsalo. Patří to tedy do evidence výroby (`bottling` /
// `kegging`), ne do dorovnání: dorovnání (inventory_adjustments) je podle
// inventoryHelper.ts jen vyrovnávací zápis bokem, který se do stáčení ani
// odpočtů NEpočítá — schová rozdíl z inventury, ale výroba, spotřeba sudů a
// statistika se tím s realitou rozejdou natrvalo.
//
// MANKO (napočítáno MÍŇ) je opačný případ: kusy fyzicky chybí a je potřeba je
// dostáčet. Z toho se nedělá zápis výroby (nic se nevyrobilo!), ale úkol do
// plánu stáčení (`bottling_plans`, viz bottlingPlans.ts).
import type { BottlingPlanInput } from './bottlingPlans';

/** Co nabídnout u řádku inventury podle znaménka rozdílu. */
export type RozdilAkce = 'zapsat_staceni' | 'naplanovat' | 'zadna';

export function akceProRozdil(diffQty: number): RozdilAkce {
  if (diffQty > 0) return 'zapsat_staceni';
  if (diffQty < 0) return 'naplanovat';
  return 'zadna';
}

/** Sud, nebo lahev? Stejné rozhodování jako pkgBg v supabase.ts — `kind` je
 *  hlavní zdroj, popisek jen záloha pro starší obaly bez vyplněného druhu. */
export function jeSud(kind?: string | null, label?: string | null): boolean {
  if (kind === 'keg') return true;
  const l = (label ?? '').toLowerCase();
  return l.includes('keg') || l.includes('sud');
}

/** Řádek inventury, ze kterého se doplněk vytváří. */
export type InventuraPolozka = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  package_kind?: string;
  /** Skutečnost − očekávání. Kladné = přebytek, záporné = manko. */
  diffQty: number;
};

/**
 * Datum zápisu doplněného stáčení — vždy POSLEDNÍ DEN inventovaného měsíce.
 *
 * Inventura je uzávěrka měsíce, takže i doplněk patří k jejímu datu, ne ke
 * dni, kdy ho někdo doklikal. Díky tomu vypadá stejně, ať se inventura dodělá
 * poslední den v měsíci nebo až týden po něm, a přebytek se srovná přesně v
 * tom měsíci, ve kterém vznikl.
 */
export function datumDoplnku(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const MESICE = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
];

/** „2026-08" → „srpen 2026". Do potvrzení, ať je omyl v měsíci vidět na první pohled. */
export function nazevMesice(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${MESICE[m - 1] ?? monthKey} ${y}`;
}

/**
 * Dělá se inventura za měsíc, který ještě neskončil, přestože ten minulý je
 * čerstvě za námi? Obrazovka se otevírá na dnešním měsíci, ale první dny v
 * měsíci se skoro vždycky dopočítává ten předchozí — a kdyby si toho nikdo
 * nevšiml, doplněné stáčení by spadlo do špatného měsíce.
 */
export function nabidnoutMinulyMesic(vybranyMesic: string, dnesISO: string): string | null {
  const dnesMesic = dnesISO.slice(0, 7);
  if (vybranyMesic !== dnesMesic) return null;
  const den = Number(dnesISO.slice(8, 10));
  if (den > 10) return null;
  const [y, m] = dnesMesic.split('-').map(Number);
  const predchozi = new Date(Date.UTC(y, m - 2, 1));
  return `${predchozi.getUTCFullYear()}-${String(predchozi.getUTCMonth() + 1).padStart(2, '0')}`;
}

export type StoceniZapis = {
  /** Do které tabulky záznam patří — sudy do `kegging`, lahve do `bottling`. */
  table: 'kegging' | 'bottling';
  row: Record<string, unknown>;
};

/**
 * Zápis chybějícího stočení pro PŘEBYTEK. Množství = velikost přebytku.
 *
 * Zdroj se schválně nevyplňuje (u sudů `cellar_tank_id`, u lahví `kegs_used`):
 * u dodatečně dohledaného stáčení nikdo neví, ze kterého tanku nebo z kolika
 * sudů se to stočilo. Kdyby se to odhadlo, ubral by se objem tanku nebo sudy
 * ze skladu, které ve skutečnosti nikdo nespotřeboval — jeden srovnaný rozdíl
 * by tak vyrobil dva nové. Původ nese poznámka.
 */
export function stoceniZapis(
  p: InventuraPolozka,
  entryDate: string,
  monthKey: string,
): StoceniZapis | null {
  if (p.diffQty <= 0) return null;
  const sud = jeSud(p.package_kind, p.package_label);
  const spolecne = {
    entry_date: entryDate,
    beer_id: p.beer_id,
    beer_name: p.beer_name,
    package_id: p.package_id,
    package_label: p.package_label,
    quantity: p.diffQty,
    source_volume_l: null,
    note: `Doplněno z inventury ${monthKey} (přebytek ${p.diffQty} ks)`,
  };
  if (sud) {
    return { table: 'kegging', row: { ...spolecne, cellar_tank_id: null } };
  }
  return { table: 'bottling', row: { ...spolecne, kegs_used: null, kegs_used_package_id: null } };
}

/**
 * Úkol „dostáčet" pro MANKO. Chybějící kusy se zapíšou do plánu stáčení —
 * sudy do sudové části úkolu (keg_pkg_id/keg_qty), lahve do lahvové (pkg_id/qty),
 * ať se úkol ukáže tomu správnému stáčeči (viz maKegovouCast/maLahvovouCast).
 */
export function planDostaceni(
  p: InventuraPolozka,
  plannedDate: string,
  monthKey: string,
): BottlingPlanInput | null {
  if (p.diffQty >= 0) return null;
  const chybi = Math.abs(p.diffQty);
  const sud = jeSud(p.package_kind, p.package_label);
  return {
    beer_id: p.beer_id,
    keg_pkg_id: sud ? p.package_id : null,
    keg_qty: sud ? chybi : 0,
    pkg_id: sud ? null : p.package_id,
    qty: sud ? 0 : chybi,
    pkg2_id: null,
    qty2: 0,
    pkg3_id: null,
    qty3: 0,
    planned_date: plannedDate,
    note: `Chybí z inventury ${monthKey} (manko ${p.diffQty} ks)`,
  };
}
