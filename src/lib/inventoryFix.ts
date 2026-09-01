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
import type { RozdeleniSudu } from './tankRozdeleni';

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

/** Zdrojové sudy u doplňku LAHVÍ — dopočítané z objemu a ztráty, viz bottlingYield.ts. */
export type ZdrojoveSudy = { kegPkgId: string; kegQty: number; kegVolumeL: number };

/**
 * Zápis chybějícího stočení pro PŘEBYTEK. Množství = velikost přebytku.
 *
 * U SUDŮ se zdrojový tank nevyplňuje: u dodatečně dohledaného stáčení nikdo
 * neví, ze kterého tanku se stáčelo, a odhad by ubral objem tanku, který ve
 * skutečnosti nikdo nespotřeboval.
 *
 * U LAHVÍ se naopak zdrojové sudy vyplnit MAJÍ — bez nich by sudy zůstaly ve
 * skladu ležet, i když se z nich stáčelo. Kolik jich bylo se dá spočítat z
 * objemu lahví a ~10% ztráty; velikost sudu ale vybírá člověk, protože se
 * případ od případu liší. Když ji nezná, předá se `null` a odečet se vynechá.
 */
export function stoceniZapis(
  p: InventuraPolozka,
  entryDate: string,
  monthKey: string,
  zdroj: ZdrojoveSudy | null = null,
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
    // Obal patří do poznámky schválně: skladová kniha slučuje sourozenecké
    // řádky jednoho zápisu stáčení mimo jiné podle poznámky (viz `dedupe` v
    // stockLedger.ts). Dva samostatné doplňky téhož piva ke stejnému datu se
    // stejným počtem kusů by jinak mohly splynout v jeden a odečet sudů by se
    // u jednoho z nich ztratil.
    note: `Doplněno z inventury ${monthKey} — ${p.package_label} (přebytek ${p.diffQty} ks)`,
  };
  if (sud) {
    return { table: 'kegging', row: { ...spolecne, cellar_tank_id: null, source_volume_l: null } };
  }
  const maZdroj = !!zdroj && zdroj.kegQty > 0;
  return {
    table: 'bottling',
    row: {
      ...spolecne,
      kegs_used: maZdroj ? zdroj!.kegQty : null,
      kegs_used_package_id: maZdroj ? zdroj!.kegPkgId : null,
      // Litry se počítají z NAČATÝCH sudů, ne z dopočtu — přesně jako v
      // BottlingScreen.tsx (kegsUsed × objem sudu), ať sedí skladová kniha.
      source_volume_l: maZdroj ? zdroj!.kegQty * zdroj!.kegVolumeL : null,
    },
  };
}

/** Jedna skupina zdrojových sudů: kolik kusů které velikosti se načalo. */
export type ZdrojovaSkupina = { kegPkgId: string; kegQty: number; kegVolumeL: number };

/**
 * Doplněné stáčení LAHVÍ — jeden zápis na každou velikost zdrojového sudu.
 *
 * Jedno stáčení běžně načne padesátky i třicítky dohromady, ale řádek stáčení
 * unese jen jednu velikost (kegs_used + kegs_used_package_id). Rozdělí se tedy
 * na víc řádků a lahve se mezi ně rozpočítají PODLE LITRŮ ze sudů — kusy tak
 * odpovídají tomu, z čeho se opravdu stáčely.
 *
 * Zbytek po dělení padne na první řádek, aby součet kusů seděl na přebytek
 * přesně; zaokrouhlováním po řádcích by jinak pár lahví zmizelo nebo přibylo.
 */
export function lahvoveZapisy(
  p: InventuraPolozka,
  entryDate: string,
  monthKey: string,
  zdroje: ZdrojovaSkupina[],
): Record<string, unknown>[] {
  if (p.diffQty <= 0) return [];
  const zaklad = {
    entry_date: entryDate,
    beer_id: p.beer_id,
    beer_name: p.beer_name,
    package_id: p.package_id,
    package_label: p.package_label,
  };

  const platne = zdroje.filter((z) => z.kegQty > 0 && z.kegVolumeL > 0);
  if (platne.length === 0) {
    return [{
      ...zaklad,
      quantity: p.diffQty,
      kegs_used: null,
      kegs_used_package_id: null,
      source_volume_l: null,
      note: `Doplněno z inventury ${monthKey} — ${p.package_label} (přebytek ${p.diffQty} ks)`,
    }];
  }

  const litry = platne.map((z) => z.kegQty * z.kegVolumeL);
  const litryCelkem = litry.reduce((s, l) => s + l, 0);

  const kusy = litry.map((l) => Math.floor((p.diffQty * l) / litryCelkem));
  kusy[0] += p.diffQty - kusy.reduce((s, k) => s + k, 0);

  return platne.map((z, i) => ({
    ...zaklad,
    quantity: kusy[i],
    kegs_used: z.kegQty,
    kegs_used_package_id: z.kegPkgId,
    source_volume_l: litry[i],
    // Velikost sudu do poznámky: skladová kniha slučuje sourozenecké řádky
    // jednoho zápisu mimo jiné podle poznámky (viz `dedupe` v stockLedger.ts)
    // a odečet druhé velikosti by se jinak ztratil.
    note: `Doplněno z inventury ${monthKey} — ${p.package_label} z ${z.kegQty}×${z.kegVolumeL} l (přebytek ${p.diffQty} ks)`,
  }));
}

/**
 * Doplněné kegování rozpuštěné do tanků — jeden zápis na každý tank.
 *
 * Dřív se sudy zapisovaly s `cellar_tank_id: null`, aby se neubral objem
 * tanku, který ve skutečnosti nikdo nevypustil. Jenže pivo z tanků odteklo a
 * bez zápisu zůstaly tanky nafouklé — právě z toho jsou ty velké rozdíly ve
 * sklepě. Teď se objem bere z tanků se stejným pivem a když jeden dojde,
 * pokračuje se dalším (viz tankRozdeleni.ts).
 *
 * Co se do sklepa nevejde, se pořád zapíše BEZ tanku: kusy fyzicky existují,
 * takže do výroby patří, ale vymýšlet si k nim zápornou ležáckou zásobu by
 * bylo horší než přiznat, že zdroj není známý.
 */
export function kegovaniZapisy(
  p: InventuraPolozka,
  entryDate: string,
  monthKey: string,
  rozdeleni: RozdeleniSudu,
): Record<string, unknown>[] {
  if (p.diffQty <= 0) return [];
  const zaklad = {
    entry_date: entryDate,
    beer_id: p.beer_id,
    beer_name: p.beer_name,
    package_id: p.package_id,
    package_label: p.package_label,
  };
  const rady: Record<string, unknown>[] = rozdeleni.dily.map((d) => ({
    ...zaklad,
    quantity: d.sudy,
    cellar_tank_id: d.tankId,
    source_volume_l: d.litry,
    // Tank v poznámce: sourozenecké řádky jednoho doplňku by se jinak ve
    // skladové knize slily v jeden (viz `dedupe` v stockLedger.ts) a odečet
    // z druhého tanku by se ztratil.
    note: `Doplněno z inventury ${monthKey} — ${p.package_label} z ${d.label} (přebytek ${p.diffQty} ks)`,
  }));
  if (rozdeleni.nepokrytoSudu > 0) {
    rady.push({
      ...zaklad,
      quantity: rozdeleni.nepokrytoSudu,
      cellar_tank_id: null,
      source_volume_l: null,
      note: `Doplněno z inventury ${monthKey} — ${p.package_label} bez tanku (přebytek ${p.diffQty} ks)`,
    });
  }
  return rady;
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
