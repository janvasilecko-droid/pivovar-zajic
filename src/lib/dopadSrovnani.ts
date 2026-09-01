// 🔗 Co se stane, když srovnám celou inventuru — dřív, než na to kliknu.
// ---------------------------------------------------------------------------
// Srovnání lahví a srovnání sudů spolu souvisí a není to na první pohled vidět:
// přebytek lahví se zapíše jako stáčení, to spotřebuje sudy, sudy se odečtou ze
// skladu, a tím se přebytek na SUDOVÉM řádku o tolik zvětší. Kdo to nevěděl,
// srovnal sudy první, pak lahve, a divil se, že sudový řádek zase nesedí.
//
// Tenhle přehled to spočítá dopředu: kolik sudů se z lahví spotřebuje a kolik
// jich pak na sudovém řádku bude k zapsání.
//
// POŘADÍ: nejdřív lahve, pak sudy. Obráceně vyjde stejný součet, ale sudy se
// musí srovnávat dvakrát.

import { VYTEZNOST_LAHVOVANI, navrhSudu } from './bottlingYield';
import { jeSud } from './inventoryFix';

/** Řádek inventury, jak ho potřebuje výpočet (výřez z InventoryRow). */
export type RadekProDopad = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  package_kind?: string;
  package_volume?: number;
  diffQty: number;
};

export type LahvovyDopad = {
  package_label: string;
  kusy: number;
  litry: number;
  /** Sudy spotřebované TÍMHLE řádkem — zaokrouhleno nahoru zvlášť. */
  sudy: number;
};

export type SudovyDopad = {
  package_label: string;
  /** Kolik je k zapsání teď, před srovnáním lahví. */
  ted: number;
  /** Kolik jich bude k zapsání po srovnání lahví. */
  poLahvich: number;
};

export type DopadPiva = {
  beer_id: string;
  beer_name: string;
  lahve: LahvovyDopad[];
  litryCelkem: number;
  /**
   * Orientační počet sudů na VŠECHNY lahve dohromady.
   *
   * Počítá se ze součtu litrů, ne jako součet zaokrouhlených řádků: všechny
   * velikosti lahví se stáčejí z jedněch sudů, takže sečíst zaokrouhlené
   * řádky počet nadsazuje (z 1017 l vyjde 23 sudů, po řádcích 25).
   */
  sudyZLahvi: number;
  sudove: SudovyDopad[];
};

/**
 * Dopad srovnání po pivech.
 *
 * @param objemSuduL velikost sudu, ze kterého se počítá odečet (v dialogu se
 *   dá přepnout, výchozí je 50 l — přehled tedy ukazuje ten výchozí případ)
 */
export function dopadSrovnani(
  radky: RadekProDopad[],
  objemSuduL = 50,
  vytecnost = VYTEZNOST_LAHVOVANI,
): DopadPiva[] {
  const podlePiva = new Map<string, DopadPiva>();

  const dej = (r: RadekProDopad): DopadPiva => {
    let d = podlePiva.get(r.beer_id);
    if (!d) {
      d = { beer_id: r.beer_id, beer_name: r.beer_name, lahve: [], litryCelkem: 0, sudyZLahvi: 0, sudove: [] };
      podlePiva.set(r.beer_id, d);
    }
    return d;
  };

  // 1. kolo — lahve. Musí být první: jejich odečet mění sudové řádky.
  for (const r of radky) {
    if (r.diffQty <= 0) continue;
    if (jeSud(r.package_kind, r.package_label)) continue;
    const objem = Number(r.package_volume) || 0;
    if (objem <= 0) continue;
    const navrh = navrhSudu([{ volumeL: objem, qty: r.diffQty }], objemSuduL, vytecnost);
    if (!navrh) continue;
    const d = dej(r);
    d.lahve.push({ package_label: r.package_label, kusy: r.diffQty, litry: navrh.nalahvovanoL, sudy: navrh.sudy });
    d.litryCelkem = Math.round((d.litryCelkem + navrh.nalahvovanoL) * 10) / 10;
  }

  // Sudy až ze SOUČTU litrů — sčítat zaokrouhlené řádky by počet nadsadilo.
  for (const d of podlePiva.values()) {
    const navrh = navrhSudu([{ volumeL: 1, qty: d.litryCelkem }], objemSuduL, vytecnost);
    d.sudyZLahvi = navrh?.sudy ?? 0;
  }

  // 2. kolo — sudy. Odečet z lahví se přičte JEN k sudu té velikosti, ze které
  // se počítalo; na třicítky srovnání padesátek nesahá.
  for (const r of radky) {
    if (!jeSud(r.package_kind, r.package_label)) continue;
    // `dej` a ne `get`: pivo, které má rozdíl JEN na sudech (žádný lahvový
    // přebytek), by se jinak do přehledu vůbec nedostalo.
    const d = dej(r);
    const sedi = Number(r.package_volume) === objemSuduL;
    const pricist = sedi ? d.sudyZLahvi : 0;
    if (r.diffQty === 0 && pricist === 0) continue;
    d.sudove.push({ package_label: r.package_label, ted: r.diffQty, poLahvich: r.diffQty + pricist });
  }

  return [...podlePiva.values()]
    .filter((d) => d.lahve.length > 0 || d.sudove.length > 0)
    .sort((a, b) => b.sudyZLahvi - a.sudyZLahvi);
}
