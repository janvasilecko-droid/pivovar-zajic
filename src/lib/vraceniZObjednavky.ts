// 🔄 Vrácení sudů/lahví z objednávky zpátky na sklad.
// ---------------------------------------------------------------------------
// Z provozu: "Lužec poveze se 4×50 12°, týden bude uzavřený, ale příští
// týden vrátí 2×50 — to zadám jako vrácení, přičte se to na sklad a
// u původní objednávky přibude poznámka, kdy a kolik se vrátilo."
//
// PROČ NE úprava množství na original objednávce (order_items) přímo:
// ta by přepsala, co se doopravdy ten den zavezlo — a hlavně by RPC
// reconcile_zavoz_deduction_for_item opravil zavoz_deductions k PŮVODNÍMU
// datu závozu, tedy do týdne, který může být už uzavřený (viz
// TydenniInventuraPanel — "uzavření" je jen značka pro přehled, ale čísla
// uzavřeného týdne se přesto neměly tiše měnit zpětně).
//
// Vrácení proto jde jako DOROVNÁNÍ (inventory_adjustments, stejná tabulka
// jako u týdenní inventury) s DNEŠNÍM datem — přičte se do skladu v týdnu,
// ve kterém se sudy doopravdy vrátily, a na originální objednávce zůstane
// jen čitelná poznámka, ne přepsané číslo.
import { pondeliTydne, stitekTydne } from './tydenniInventura';

export type PolozkaVraceni = {
  beer_id: string;
  beer_name: string | null;
  package_id: string;
  package_label: string | null;
  pocet: number;
};

/** Jen položky se zadaným kladným počtem — prázdné/nulové řádky se vrácení netýkají. */
export function platneVraceni(polozky: PolozkaVraceni[]): PolozkaVraceni[] {
  return polozky.filter((p) => p.beer_id && p.package_id && p.pocet > 0);
}

/** Řádky pro `inventory_adjustments` — přičtou vrácené kusy zpátky do skladu k zadanému dni. */
export function zaznamyDorovnaniVraceni(polozky: PolozkaVraceni[], datum: string): Record<string, unknown>[] {
  return platneVraceni(polozky).map((p) => ({
    entry_date: datum,
    beer_id: p.beer_id,
    beer_name: p.beer_name,
    package_id: p.package_id,
    package_label: p.package_label,
    quantity: p.pocet,
    reason: `Vráceno z objednávky — ${p.pocet}× ${p.package_label ?? p.package_id}${p.beer_name ? ` ${p.beer_name}` : ''}`,
  }));
}

/** „Vráceno 2× 50l 12° Světlé — přičteno do skladu 18. 9. 2026, týdne 2026-09-14." */
export function poznamkaVraceni(polozky: PolozkaVraceni[], datum: string): string {
  const popis = platneVraceni(polozky)
    .map((p) => `${p.pocet}× ${p.package_label ?? p.package_id}${p.beer_name ? ` ${p.beer_name}` : ''}`)
    .join(', ');
  const [y, m, d] = datum.split('-').map(Number);
  const datumCesky = `${d}. ${m}. ${y}`;
  return `Vráceno ${popis} — přičteno do skladu ${datumCesky}, ${stitekTydne(pondeliTydne(datum))}.`;
}

/** Připojí novou poznámku na konec stávající — nikdy ji nepřepíše. */
export function pripojPoznamku(puvodni: string | null | undefined, novaRadka: string): string {
  const zaklad = (puvodni ?? '').trim();
  return zaklad ? `${zaklad}\n${novaRadka}` : novaRadka;
}
