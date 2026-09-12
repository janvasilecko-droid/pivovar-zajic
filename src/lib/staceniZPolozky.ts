/**
 * Zaškrtnutí "Stočeno" u sudu na objednávce rovnou založí skutečný záznam
 * stáčení (viz migrace 20261231020000) — ať se stáčeč nemusí totéž psát
 * ještě jednou v „Začátek stáčení".
 *
 * Z provozu 12. 9. 2026: „když dám, že to mám, tak ho přidej do stáčení."
 *
 * ZATÍM JEN SUDY (KEG). U lahví appka nepozná, kolik sudů surového piva se
 * na ně spotřebovalo — to zadání vyžaduje vlastní krok ve „Začátek
 * stáčení" (obal + kolik sudů zdroje), který se z jednoho zaškrtnutí
 * nedá poctivě odvodit. Kapka Stočeno u lahvové položky se proto chová
 * dál jako dřív — jen odškrtnutí, bez založení záznamu.
 *
 * Tank se vybírá STEJNOU logikou jako výchozí volba v ručním zápisu
 * (lib/tankUZapisu.ts): největší aktivní tank se zahájeným stáčením
 * tohohle piva. Bez takového tanku se řádek uloží bez tanku a bez odečtu
 * objemu — přesně jako když totéž nastane v ručním zápisu.
 *
 * Tenhle modul jen ROZHODNE, co se má zapsat/smazat a kolik odečíst/vrátit
 * z tanku — samotné volání Supabase dělá zapisStaceniZPolozky /
 * zrusStaceniZPolozky, ať jde rozhodovací část otestovat bez databáze.
 */
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
 * Zapíše záznam stáčení za zaškrtnutou položku a odečte objem z tanku
 * (pokud se ho podařilo najít). Idempotentní vůči souběhu díky UNIQUE
 * indexu na order_item_id — druhé zaškrtnutí těsně po sobě založí jen
 * jeden řádek, druhý insert selže na konfliktu a nic dalšího neudělá.
 *
 * Vrací chybovou hlášku k zobrazení, nebo `null`, když se povedlo (i když
 * se nezapisovalo nic, protože položka není sud).
 */
export async function zapisStaceniZPolozky(
  polozka: PolozkaKeStaceni,
  packages: PackageKind[],
  cellarTanks: TankKOdectu[],
  dnesIso: string,
): Promise<string | null> {
  const zaznam = naplanujZaznamZeStoceni(polozka, packages, cellarTanks, dnesIso);
  if (!zaznam) return null;

  const { error } = await supabase.from('kegging').insert(zaznam);
  if (error) {
    // Konflikt na UNIQUE indexu = řádek už existuje (souběh dvou kliknutí,
    // nebo appka si to jen znovu ověřuje) — to není chyba k hlášení.
    if (error.code === '23505') return null;
    return `Stočeno se uložilo, ale záznam stáčení se nepodařilo založit: ${error.message}`;
  }

  if (zaznam.cellar_tank_id && zaznam.source_volume_l) {
    const { error: tankErr } = await supabase.rpc('adjust_tank_volume', {
      p_tank_id: zaznam.cellar_tank_id,
      p_delta_l: -zaznam.source_volume_l,
    });
    if (tankErr) {
      return `Záznam stáčení je uložený, ale objem tanku se nepodařilo snížit: ${tankErr.message}`;
    }
    const tank = cellarTanks.find((t) => t.id === zaznam.cellar_tank_id);
    if (tank && tank.status !== 'emptying') {
      await supabase.from('cellar_tanks').update({ status: 'emptying', updated_at: new Date().toISOString() }).eq('id', zaznam.cellar_tank_id);
    }
  }

  return null;
}

/**
 * Zruší zaškrtnutí — smaže záznam stáčení založený TOUHLE položkou (podle
 * order_item_id, ne podle piva/množství, ať se netrefí cizí řádek) a vrátí
 * objem do tanku, pokud se z něj odečítalo.
 *
 * Nedělá nic, pokud žádný takový záznam neexistuje (položka nebyla sud,
 * nebo se od zaškrtnutí stihla smazat ručně jinde — to je v pořádku, není
 * co rušit).
 */
export async function zrusStaceniZPolozky(orderItemId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('kegging')
    .select('id, cellar_tank_id, source_volume_l')
    .eq('order_item_id', orderItemId)
    .maybeSingle();
  if (error) return `Nepodařilo se ověřit záznam stáčení: ${error.message}`;
  if (!data) return null;

  const { error: delErr } = await supabase.from('kegging').delete().eq('id', data.id);
  if (delErr) return `Nepodařilo se zrušit záznam stáčení: ${delErr.message}`;

  if (data.cellar_tank_id && data.source_volume_l) {
    const { error: tankErr } = await supabase.rpc('adjust_tank_volume', {
      p_tank_id: data.cellar_tank_id,
      p_delta_l: Number(data.source_volume_l),
    });
    if (tankErr) {
      return `Záznam stáčení zrušen, ale objem tanku se nepodařilo vrátit: ${tankErr.message}`;
    }
  }
  return null;
}
