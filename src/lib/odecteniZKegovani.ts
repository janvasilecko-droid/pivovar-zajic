// ➖ Manko z inventury ve stáčení — bez záporných řádků.
// ---------------------------------------------------------------------------
// Zadání 13. 10. 2026: „žádný minusový položky… jednoduchý vzorec: stav na
// začátku měsíce + stáčení keg − objednávky a fasování = inventura." Rozdíl
// z inventury se proto neukládá jako záporný zápis, ale odečte se přímo
// od stočených sudů téhož piva a obalu v témže měsíci: nejdřív ve stejný den,
// pak od nejbližšího dřívějšího, nakonec od pozdějšího. Součet za měsíc je
// stejný jako se záporným řádkem, jen v seznamu žádný minus není.
//
// 30. 10. 2026 totéž pro lahve a pro měsíční inventuru: „to co mam stoceno
// musi byt shodne i s excelem… zadne minusove polozky." Měsíční inventura
// i lahve dřív pořád zapisovaly záporný řádek; Excel ho schoval a odečetl
// jen v „Celkem", takže řádky v sešitu nesouhlasily se součtem ani s appkou.
import { stockKey, type Movement, type MovementKind } from './stockLedger';

export type RadekStoceni = {
  id: string;
  entry_date: string;
  quantity: number | string;
  /** Čas zápisu — podle něj se řádek najde mezi pohyby skladové knihy (viz zapocitaneRadky). */
  created_at?: string | null;
  /** Lahve: sudy celé dávky (viz drzetSudy). */
  kegs_used?: number | string | null;
};

export type MoznostiOdecteni<R extends RadekStoceni = RadekStoceni> = {
  /**
   * Jen tyhle řádky se smí snížit (viz zapocitaneRadky). Řádek, který už je
   * v napočítaném stavu (týdenní počítání po něm), by se snížil, ale
   * očekávaný stav by se nehnul — rozdíl by v inventuře zůstal a odečetlo
   * by se znovu.
   */
  povolene?: ReadonlySet<string>;
  /**
   * Řádek, který se nesmí smazat — zůstane aspoň s jedním kusem. U lahví
   * řádek, který jako jediný nese sudy dávky (kegs_used): smazáním by se sudy
   * ze skladové knihy ztratily a vrátily se do skladu, i když se z nich
   * stáčelo. Viz drziSudyDavky.
   */
  drzet?: (r: R) => boolean;
};

export type PlanOdecteni = {
  /** Řádky, kterým se sníží počet (nový počet je kladný). */
  upravit: { id: string; quantity: number }[];
  /** Řádky, které se odečtem vyprázdnily. */
  smazat: string[];
  /**
   * Kolik kusů se nepodařilo odečíst (stočeno bylo míň). Záporný řádek se
   * za ně NEZAPISUJE — není to chyba stáčení, ale ztráta: patří do Dorovnání.
   */
  zbytek: number;
};

export function planOdecteniZKegovani<R extends RadekStoceni>(
  radky: R[],
  datum: string,
  kusy: number,
  moznosti: MoznostiOdecteni<R> = {},
): PlanOdecteni {
  let zbyva = Math.max(0, Math.floor(kusy));
  const kladne = radky.filter((r) => Number(r.quantity) > 0 && (!moznosti.povolene || moznosti.povolene.has(r.id)));
  const stejny = kladne.filter((r) => r.entry_date === datum);
  const drivejsi = kladne.filter((r) => r.entry_date < datum).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const pozdejsi = kladne.filter((r) => r.entry_date > datum).sort((a, b) => a.entry_date.localeCompare(b.entry_date));
  const upravit: PlanOdecteni['upravit'] = [];
  const smazat: string[] = [];
  for (const r of [...stejny, ...drivejsi, ...pozdejsi]) {
    if (zbyva <= 0) break;
    const mam = Number(r.quantity);
    const minimum = moznosti.drzet?.(r) ? 1 : 0;
    const ubrat = Math.min(zbyva, mam - minimum);
    if (ubrat <= 0) continue;
    zbyva -= ubrat;
    if (mam - ubrat > 0) upravit.push({ id: r.id, quantity: mam - ubrat });
    else smazat.push(r.id);
  }
  return { upravit, smazat, zbytek: zbyva };
}

/**
 * Lahve: který řádek nese sudy dávky SÁM? Sudy patří celé dávce a skladová
 * kniha je započítá jednou za sourozence se stejným datem, počtem sudů,
 * obalem sudu a časem zápisu (viz stockLedger.ts, „Sudy spotřebované jako
 * zdroj"). Smazat jde jen řádek, jehož sudy nese ještě jiný řádek téže
 * dávky; bez času zápisu se sourozenci poznat nedají — pak se drží každý.
 *
 * @param vsechnyLahve Řádky lahví téhož piva (VŠECHNY obaly — sourozenci
 *   jsou jiné velikosti lahví než odečítaný obal).
 */
export function drziSudyDavky(vsechnyLahve: (RadekStoceni & { kegs_used_package_id?: string | null })[]): (r: RadekStoceni) => boolean {
  const klic = (r: RadekStoceni & { kegs_used_package_id?: string | null }) =>
    `${r.entry_date}|${Number(r.kegs_used)}|${r.kegs_used_package_id ?? ''}|${r.created_at}`;
  const pocet = new Map<string, number>();
  for (const r of vsechnyLahve) {
    if (!(Number(r.kegs_used) > 0) || !r.created_at || !(Number(r.quantity) > 0)) continue;
    pocet.set(klic(r), (pocet.get(klic(r)) ?? 0) + 1);
  }
  return (r) => Number(r.kegs_used) > 0 && (!r.created_at || (pocet.get(klic(r)) ?? 0) < 2);
}

/**
 * Které řádky stáčení se do očekávaného stavu OPRAVDU promítají.
 *
 * Inventura porovnává napočítané s očekávaným stavem a ten bere pohyby až od
 * posledního počítání (týdenní kontrola, Úprava skladu). Řádek zapsaný PŘED
 * ním už v napočítaném čísle je — kdyby se manko odečetlo z něj, stáčení by
 * se snížilo, ale rozdíl v inventuře by zůstal a dalším klepnutím by se
 * odečetlo znovu.
 *
 * Neopisuje pravidla skladové knihy (datum počítání, zápisy dopsané po
 * počítání, srovnání z inventury…), ale ZKUSÍ to: řádek se z pohybů vynechá
 * a když očekávaný stav klesne přesně o jeho počet, řádek se počítá.
 *
 * @param ocekavano Očekávaný stav položky z pohybů — stejný výpočet, jaký
 *   ukazuje obrazovka inventury (měsíční: Sklad ke konci měsíce bez vlastní
 *   inventury; týdenní: ocekavanyStavTydne).
 */
export function zapocitaneRadky(
  pohyby: Movement[],
  druh: Extract<MovementKind, 'kegovani' | 'staceni'>,
  beerId: string,
  packageId: string,
  radky: RadekStoceni[],
  ocekavano: (pohyby: Movement[]) => number,
): Set<string> {
  const klic = stockKey(beerId, packageId);
  const polozky = pohyby.filter((m) => stockKey(m.beer_id, m.package_id) === klic);
  const zaklad = ocekavano(polozky);
  const pouzite = new Set<number>();
  const out = new Set<string>();
  for (const r of radky) {
    const q = Number(r.quantity);
    if (!(q > 0)) continue;
    const i = polozky.findIndex((m, idx) => !pouzite.has(idx) && m.kind === druh
      && m.date === String(r.entry_date).slice(0, 10) && m.qty === q
      && (m.createdAt ?? null) === (r.created_at ?? null));
    if (i < 0) continue;
    pouzite.add(i);
    if (zaklad - ocekavano(polozky.filter((_, idx) => idx !== i)) === q) out.add(r.id);
  }
  return out;
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
