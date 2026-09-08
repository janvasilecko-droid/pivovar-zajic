// 🛢️ Kolik už bylo pro dané pivo, obal a den uloženo.
//
// Stáčení KEG se dělá průběžně přes den — pár sudů teď, další za chvíli.
// Appka to ukládá jako samostatné zápisy (každé kliknutí na „Uložit" je
// nová řádka) a ve skladu se to sečte správně samo — jenže dokud to nebylo
// vidět na dlaždici, nedalo se poznat, jestli druhé uložení opravdu PŘIDÁVÁ
// k prvnímu, nebo jestli se něco ztratilo.

export type UlozenyZaznam = {
  entry_date: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

export function soucetUlozenehoDnes(
  radky: UlozenyZaznam[],
  datum: string,
  beerId: string,
  pkgId: string,
): number {
  return radky
    .filter((r) => r.entry_date === datum && r.beer_id === beerId && r.package_id === pkgId)
    .reduce((s, r) => s + Number(r.quantity || 0), 0);
}
