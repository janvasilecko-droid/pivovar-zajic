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

/** Poslední den měsíce, do kterého datum patří (YYYY-MM-DD). */
export function konecMesiceData(datum: string): string {
  const [r, m] = datum.split('-').map(Number);
  return new Date(Date.UTC(r, m, 0)).toISOString().slice(0, 10);
}

/**
 * Datum, ke kterému se chybějící stočení (přebytek z inventury) připíše:
 * poslední den měsíce. Do budoucnosti ne — zápis výroby nesmí spadnout za
 * dnešek, takže v běžícím měsíci je to dnešek.
 */
export function datumDoplnkuStaceni(doPocitani: string, dnes: string): string {
  const konec = konecMesiceData(doPocitani);
  return konec > dnes ? dnes : konec;
}

/** Z čeho se odečítalo — pro záznam, ať se na to dá později podívat. */
export type ZdrojOdecteni = { id: string; entry_date: string; pred: number; po: number };

export function zdrojeOdecteni(plan: PlanOdecteni, radky: RadekStoceni[]): ZdrojOdecteni[] {
  const podleId = new Map(radky.map((r) => [r.id, r]));
  const out: ZdrojOdecteni[] = [];
  for (const u of plan.upravit) {
    const r = podleId.get(u.id);
    if (r) out.push({ id: u.id, entry_date: r.entry_date, pred: Number(r.quantity), po: u.quantity });
  }
  for (const id of plan.smazat) {
    const r = podleId.get(id);
    if (r) out.push({ id, entry_date: r.entry_date, pred: Number(r.quantity), po: 0 });
  }
  return out.sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}
