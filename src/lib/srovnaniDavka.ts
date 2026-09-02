// 🧺 Srovnání na jeden zátah — sběrná tabulka místo klikání řádek po řádku.
// ---------------------------------------------------------------------------
// Původní postup byl: u každého řádku zvlášť tlačítko, dialog, potvrzení. U
// devíti piv × pěti velikostí lahví to je padesát dialogů a v každém se znovu
// hádá, kolik sudů se načalo — přitom sudy se načínají pro celé stáčení, ne
// pro jednu velikost lahve.
//
// Tady se lahvové přebytky jednoho piva sečtou dohromady, ukáže se objem v
// litrech a ORIENTAČNÍ počet sudů. Kolik sudů se opravdu načalo zadá člověk a
// teprve tím se odečet ze skladu potvrdí.

import { navrhSudu, VYTEZNOST_LAHVOVANI } from './bottlingYield';
import { jeSud } from './inventoryFix';

/** Řádek inventury, jak ho potřebuje dávka (výřez z InventoryRow). */
export type RadekSrovnani = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  package_kind?: string;
  package_volume?: number;
  diffQty: number;
};

export type LahvovaPolozkaDavky = {
  package_id: string;
  package_label: string;
  kusy: number;
  litry: number;
};

/**
 * Kterým směrem se vyrovnává.
 *   'prebytek' — napočítalo se VÍC, než sklad čeká: stočilo se a nezapsalo,
 *                takže se stočení doplní (kladné řádky).
 *   'manko'    — napočítalo se MÍŇ: zapsalo se víc, než se stočilo, takže se
 *                zápis výroby o rozdíl sníží (záporné řádky).
 */
export type SmerSrovnani = 'prebytek' | 'manko';

/**
 * Co se má stát se sudy — určuje to člověk, ne dopočet.
 *
 * 'odecist'  — sudy už byly nastáčené dřív a teď se z nich stáčely lahve:
 *              ze skladu ubudou, do výroby se nic nepřidává.
 * 'nastocit' — sudy se kvůli těm lahvím TEPRVE nastáčely a hned se z nich
 *              stáčelo. Zapíše se výroba (Stáčení KEG) i spotřeba, takže
 *              stav skladu zůstane stejný, ale výroba je vidět. Z provozu:
 *              „musí se to vepsat do stáčení KEG, protože to jsou stočený
 *              sudy."
 * 'vratit'   — sudy se nenačaly, vracejí se do skladu (u manka lahví).
 */
export type SmerSudu = 'odecist' | 'nastocit' | 'vratit';

export type DavkaPiva = {
  beer_id: string;
  beer_name: string;
  smer: SmerSrovnani;
  /** Lahvové řádky k vyrovnání, od největšího objemu. Kusy jsou VŽDY KLADNÉ — směr nese `smer`. */
  lahve: LahvovaPolozkaDavky[];
  litryCelkem: number;
  /** Orientační počet 50l sudů ze SOUČTU litrů (ne součet zaokrouhlených řádků). */
  orientacneSudu: number;
};

/** Jedna skupina zdrojových sudů — kolik kusů které velikosti se načalo. */
export type ZdrojovaSkupina = { kegPkgId: string; kegQty: number; kegVolumeL: number };

/**
 * Sesbírá lahvové rozdíly po pivech a směrech.
 *
 * Bere OBA směry. Přebytek i manko se řeší v zápisu výroby — přebytek ho
 * doplní, manko sníží. (Dřív se braly jen přebytky a manko mířilo do plánu
 * dostáčení; ten model padl, protože nechával sklad nafouklý a rozdíl se
 * táhl do dalšího měsíce.)
 *
 * Jedno pivo může mít obě strany naráz — pak vzniknou dvě dávky, ať se
 * nemíchají litry, které jdou proti sobě.
 */
export function davkySrovnani(
  radky: RadekSrovnani[],
  objemSuduL = 50,
  vytecnost = VYTEZNOST_LAHVOVANI,
): DavkaPiva[] {
  const podlePiva = new Map<string, DavkaPiva>();

  for (const r of radky) {
    if (r.diffQty === 0) continue;
    if (jeSud(r.package_kind, r.package_label)) continue;
    const objem = Number(r.package_volume) || 0;
    if (objem <= 0) continue;

    const smer: SmerSrovnani = r.diffQty > 0 ? 'prebytek' : 'manko';
    const kusy = Math.abs(r.diffQty);
    const klic = `${r.beer_id}|${smer}`;
    let d = podlePiva.get(klic);
    if (!d) {
      d = { beer_id: r.beer_id, beer_name: r.beer_name, smer, lahve: [], litryCelkem: 0, orientacneSudu: 0 };
      podlePiva.set(klic, d);
    }
    d.lahve.push({
      package_id: r.package_id,
      package_label: r.package_label,
      kusy,
      litry: Math.round(objem * kusy * 10) / 10,
    });
  }

  for (const d of podlePiva.values()) {
    d.lahve.sort((a, b) => b.litry - a.litry);
    d.litryCelkem = Math.round(d.lahve.reduce((s, l) => s + l.litry, 0) * 10) / 10;
    // Ze součtu litrů, ne sečtením zaokrouhlených řádků — všechny velikosti
    // se stáčejí z jedněch sudů, takže po řádcích by počet vyšel vyšší.
    d.orientacneSudu = navrhSudu([{ volumeL: 1, qty: d.litryCelkem }], objemSuduL, vytecnost)?.sudy ?? 0;
  }

  return [...podlePiva.values()].sort((a, b) => b.litryCelkem - a.litryCelkem);
}

/**
 * Řádky do tabulky `bottling` pro celou dávku jednoho piva.
 *
 * Vznikne řádek pro každou kombinaci obal lahví × velikost sudu, u které
 * nějaké sudy vyšly, plus řádek bez sudů pro lahve, na které se nedostalo.
 * Bez zadaných sudů se zapíšou jen lahve a sklad sudů se nehne.
 *
 * ZNAMÉNKA jsou dvě a nastavují se nezávisle:
 *  • lahve podle `d.smer` — přebytek se přičte, manko odečte,
 *  • sudy podle `smerSudu` — 'odecist' je ubere ze skladu (stočilo se z nich),
 *    'vratit' je vrátí (nenačaly se, protože se ty lahve nestáčely).
 * Nesvazují se schválně: který směr sudů dává smysl, ví jenom člověk. Skladová
 * kniha záporné `kegs_used` čte jako vratku (viz resolveKegsUsed).
 */
export function zapisyDavky(
  d: DavkaPiva,
  entryDate: string,
  monthKey: string,
  sudy: ZdrojovaSkupina[],
  smerSudu: SmerSudu = 'odecist',
): Record<string, unknown>[] {
  const platne = sudy.filter((z) => z.kegQty > 0 && z.kegVolumeL > 0);
  const zaklad = { entry_date: entryDate, beer_id: d.beer_id, beer_name: d.beer_name };
  const manko = d.smer === 'manko';
  const znamenkoLahvi = manko ? -1 : 1;
  const znamenkoSudu = smerSudu === 'vratit' ? -1 : 1; // 'odecist' i 'nastocit' spotřebovávají
  const slovo = manko ? 'Odečteno' : 'Doplněno';
  const duvod = manko ? 'manko' : 'přebytek';

  if (platne.length === 0) {
    return d.lahve.map((l) => ({
      ...zaklad,
      package_id: l.package_id,
      package_label: l.package_label,
      quantity: znamenkoLahvi * l.kusy,
      kegs_used: null,
      kegs_used_package_id: null,
      source_volume_l: null,
      note: `${slovo} z inventury ${monthKey} — ${l.package_label} (${duvod} ${l.kusy} ks)`,
    }));
  }

  // Lahve se rozdělí mezi velikosti sudů poměrně podle litrů ze sudů, aby
  // každý řádek nesl kusy, které z toho sudu opravdu mohly vzniknout.
  const litryPodleSkupiny = platne.map((z) => z.kegQty * z.kegVolumeL);
  const litryZdroje = litryPodleSkupiny.reduce((s, l) => s + l, 0);

  const rady: Record<string, unknown>[] = [];
  for (const [si, skupina] of platne.entries()) {
    // 🛢️ POČET SUDŮ PATŘÍ CELÉ SKUPINĚ, NE JEDNOTLIVÉMU OBALU.
    //
    // Dřív se sudy rozpočítávaly mezi velikosti lahví podle litrů a
    // zaokrouhlovaly na celé kusy. U malých balení vedle velkých to skončilo
    // nulou: Summer Ale za srpen 2026 měl u 0,33 l a 0,5 l (po deseti kusech)
    // nula sudů, zatímco 717 kusů litrovek si vzalo 16 ze 17. V přehledu
    // stáčení pak u těch řádků nebyl žádný sud — vypadalo to, že se ty lahve
    // vzaly odnikud.
    //
    // Sudy se proto zapisují CELÝM číslem skupiny ke každému obalu, který
    // z ní něco dostal — přesně jak to dělá ruční zápis stáčení, kde se počet
    // načatých sudů zadá jednou pro celou dávku. Dvakrát se nespočítají:
    // skladová kniha je slučuje podle (datum, pivo, počet, obal sudu, čas
    // vzniku) a ty jsou u sourozeneckých řádků shodné (viz `dedupe`
    // v stockLedger.ts).
    const zdrojovyObjem = skupina.kegQty * skupina.kegVolumeL;
    for (const l of d.lahve) {
      const kusy = Math.round((l.kusy * litryPodleSkupiny[si]) / litryZdroje);
      if (kusy <= 0) continue;
      rady.push({
        ...zaklad,
        package_id: l.package_id,
        package_label: l.package_label,
        quantity: znamenkoLahvi * kusy,
        kegs_used: znamenkoSudu * skupina.kegQty,
        kegs_used_package_id: skupina.kegPkgId,
        source_volume_l: znamenkoSudu * zdrojovyObjem,
        // Poznámka je STEJNÁ pro celou skupinu, ne pro obal. Skladová kniha
        // slučuje sourozenecké řádky podle (datum, pivo, počet sudů, obal
        // sudu, čas vzniku — a když čas chybí, podle poznámky; viz `dedupe`
        // v stockLedger.ts). Sdílené číslo sudů se tak započítá jednou i tam,
        // kde se čas vzniku neukládá. Který obal lahví řádek nese, je vidět
        // ve sloupci package_label — do poznámky to patřit nemusí.
        note: `${slovo} z inventury ${monthKey} — z ${skupina.kegVolumeL}l sudů (dávka)`,
      });
    }
  }

  // Zaokrouhlování MNOŽSTVÍ LAHVÍ mezi skupinami mohlo pár kusů ubrat nebo
  // přidat — dorovná se na prvním řádku každého obalu, ať součet sedí na
  // napočítaný přebytek. Počtu sudů se to netýká, ten patří celé skupině.
  for (const l of d.lahve) {
    const moje = rady.filter((r) => r.package_id === l.package_id);
    if (moje.length === 0) continue;
    const soucet = moje.reduce((s, r) => s + Number(r.quantity), 0);
    moje[0].quantity = Number(moje[0].quantity) + (znamenkoLahvi * l.kusy - soucet);
  }

  return rady;
}
