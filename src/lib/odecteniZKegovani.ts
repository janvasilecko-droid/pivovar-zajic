// ➖ Manko z inventury ve stáčení KEG — bez záporných řádků.
// ---------------------------------------------------------------------------
// Zadání 13. 10. 2026: „žádný minusový položky… jednoduchý vzorec: stav na
// začátku měsíce + stáčení keg − objednávky a fasování = inventura." Rozdíl
// z inventury se proto neukládá jako záporný zápis, ale odečte se přímo
// od stočených sudů téhož piva a obalu v témže měsíci: nejdřív ve stejný den,
// pak od nejbližšího dřívějšího, nakonec od pozdějšího. Součet za měsíc je
// stejný jako se záporným řádkem, jen v seznamu žádný minus není.
export type RadekStoceni = { id: string; entry_date: string; quantity: number | string };

export type PlanOdecteni = {
  /** Řádky, kterým se sníží počet (nový počet je kladný). */
  upravit: { id: string; quantity: number }[];
  /** Řádky, které se odečtem vyprázdnily. */
  smazat: string[];
  /** Kolik kusů se nepodařilo odečíst (stočeno bylo míň) — zbytek se zapíše záporně. */
  zbytek: number;
};

export function planOdecteniZKegovani(radky: RadekStoceni[], datum: string, kusy: number): PlanOdecteni {
  let zbyva = Math.max(0, Math.floor(kusy));
  const kladne = radky.filter((r) => Number(r.quantity) > 0);
  const stejny = kladne.filter((r) => r.entry_date === datum);
  const drivejsi = kladne.filter((r) => r.entry_date < datum).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const pozdejsi = kladne.filter((r) => r.entry_date > datum).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const upravit: PlanOdecteni['upravit'] = [];
  const smazat: string[] = [];
  for (const r of [...stejny, ...drivejsi, ...pozdejsi]) {
    if (zbyva <= 0) break;
    const mam = Number(r.quantity);
    const ubrat = Math.min(zbyva, mam);
    zbyva -= ubrat;
    if (mam - ubrat > 0) upravit.push({ id: r.id, quantity: mam - ubrat });
    else smazat.push(r.id);
  }
  return { upravit, smazat, zbytek: zbyva };
}
