// 🧾 Značka u záznamů stáčení, které appka kdysi zakládala sama.
// ---------------------------------------------------------------------------
// ⛔ ZRUŠENO 18. 9. 2026 — zaškrtnutí kapky „Stočeno" u objednávky už
// NEZAKLÁDÁ záznam ve stáčení KEG. Pravidlo od majitele: „appka nesmí
// přidávat stáčení, objednávky, nebo odepisovat bez jasného povelu."
// Odškrtnutí položky je poznámka k objednávce („tenhle sud je nachystaný"),
// ne hlášení výroby — stáčení se zapisuje v KEG → Začátek stáčení, a nikde
// jinde.
//
// Ptal se na to dvakrát: 12. 9. („10× 12sv 50 l jsem nezadával, co to je?")
// a 18. 9. („proč je zadané stáčení 14×30 Desítka"). Pokaždé to byl řádek,
// který appka založila sama.
//
// Co ze souboru zbylo a proč:
//   • POZNAMKA_AUTOMATICKY + jeZeZaskrtnuti — takové řádky v databázi pořád
//     LEŽÍ a je potřeba je poznat, aby šly najít a smazat (úklid v KEG),
//   • naplanujZaznamZeStoceni — čistá funkce s testy, zůstává jako popis
//     toho, co se dřív zapisovalo; při zaškrtnutí ji už nikdo nevolá.
import { tankRadku, type TankKOdectu } from './tankUZapisu';
import { supabase } from './supabase';

export type PolozkaKeStaceni = {
  id: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity: number;
};

export type PackageKind = { id: string; kind: 'keg' | 'bottle'; volume_l: number };

export type NovyZaznamStaceni = {
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity: number;
  order_item_id: string;
  cellar_tank_id: string | null;
  source_volume_l: number | null;
  note: string;
};

export const POZNAMKA_AUTOMATICKY = 'Založeno zaškrtnutím "Stočeno" u objednávky';

/**
 * Vznikl tenhle záznam stáčení sám, zaškrtnutím u objednávky?
 *
 * Z provozu 12. 9. 2026: „10× 12sv 50 l jsem nezadával, co to je?" Byl to
 * právě takový záznam — appka ho založila správně a na vyžádání, jenže
 * v seznamu vypadal úplně stejně jako ručně napsaný. Ve stáčení se tak
 * objevilo pivo, o kterém stáčeč nevěděl, že tam je.
 *
 * Poznámka je jediná stopa, kterou takový řádek nese, takže se pozná podle
 * ní. Porovnává se na ZAČÁTEK textu: kdyby někdo k poznámce něco připsal
 * (ručně nebo při úpravě), značka musí zůstat.
 */
export function jeZeZaskrtnuti(note: string | null | undefined): boolean {
  return (note ?? '').trimStart().startsWith(POZNAMKA_AUTOMATICKY);
}

/**
 * Co se má zapsat do `kegging`, když se položka označí za stočenou.
 * `null` = nezapisovat nic (není to sud, nemá množství, nebo obal
 * v katalogu chybí).
 */
export function naplanujZaznamZeStoceni(
  polozka: PolozkaKeStaceni,
  packages: PackageKind[],
  cellarTanks: TankKOdectu[],
  dnesIso: string,
): NovyZaznamStaceni | null {
  const qty = Number(polozka.quantity || 0);
  if (qty <= 0 || !polozka.package_id) return null;

  const pkg = packages.find((p) => p.id === polozka.package_id);
  if (!pkg || pkg.kind !== 'keg') return null;

  const tank = polozka.beer_id ? tankRadku(cellarTanks, polozka.beer_id, null) : undefined;
  const sourceL = tank ? qty * Number(pkg.volume_l || 0) : null;

  return {
    entry_date: dnesIso,
    beer_id: polozka.beer_id,
    beer_name: polozka.beer_name,
    package_id: polozka.package_id,
    package_label: polozka.package_label,
    quantity: qty,
    order_item_id: polozka.id,
    cellar_tank_id: tank?.id ?? null,
    source_volume_l: sourceL,
    note: POZNAMKA_AUTOMATICKY,
  };
}

/**
 * 🧹 Úklid po zrušené funkci: řádky, které appka do stáčení dopsala sama.
 *
 * V databázi zůstávají i poté, co se zakládání zrušilo — a majitel je
 * chtěl pryč: „vymaz všechny položky tento týden, které se takhle dopsaly."
 * Poznají se podle poznámky, kterou nesou (viz jeZeZaskrtnuti).
 */
export function dopsaneZaskrtnutim<R extends { note?: string | null }>(radky: R[]): R[] {
  return radky.filter((r) => jeZeZaskrtnuti(r.note));
}

/** Smaže dané záznamy stáčení podle id. Vrací chybovou hlášku, nebo `null`. */
export async function smazZaznamyStaceni(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const { error } = await supabase.from('kegging').delete().in('id', ids);
  return error ? error.message : null;
}
