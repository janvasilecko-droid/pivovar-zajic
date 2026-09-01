// 🔗 Skladový odpočet zavozu drží krok s objednávkou.
// ---------------------------------------------------------------------------
// Objednávka je pravda. Řádek v `zavoz_deductions` je jen její otisk k okamžiku,
// kdy se zavezlo — a otisk se sám neaktualizuje. Když se po zavozu opraví
// množství, pivo nebo obal, sklad zůstane odepsaný podle starých hodnot a
// rozdíl se objeví až v inventuře jako manko, které nemá původ ve výrobě.
//
// Přesně takhle vznikly tři rozjeté řádky (stav k 1. 9. 2026):
//   • Radek, 20. 8. — Summer Ale 30 l: objednávka 9, odpočet 15 (o 6 víc)
//   • Duck and Dog, 3. 7. — 11° Světlá 50 l: objednávka 8, odpočet 4
//   • Jona, 3. 7. — Osma 1 l: objednávka 30, odpočet 10
//
// Databáze na to má funkci `reconcile_zavoz_deduction_for_item` (migrace
// 20261201000000) a `replace_order_with_items` ji volá. Jenže rychlé úpravy
// přímo v detailu objednávky — přepsat kus, přehodit pivo, přehodit obal —
// jdou obyčejným UPDATE na `order_items` a RPC míjejí. Tenhle soubor spočítá,
// co se má té funkci poslat.

import { computeDeliveryDateISO } from './zavozDeduction';

/** Položka objednávky v rozsahu, který se propisuje do skladu. */
export type PolozkaObjednavky = {
  id: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number;
};

/** Změna, kterou člověk udělal v detailu objednávky. */
export type UpravaPolozky = Partial<Pick<PolozkaObjednavky, 'beer_id' | 'package_id' | 'quantity'>>;

/** Parametry pro RPC `reconcile_zavoz_deduction_for_item`. */
export type SrovnaniOdpoctu = {
  p_order_item_id: string;
  p_beer_id: string | null;
  p_package_id: string | null;
  p_quantity: number;
};

/**
 * Co poslat do RPC po ruční úpravě položky — nebo `null`, když volat netřeba.
 *
 * Vrací null ve třech případech:
 *  • nic se doopravdy nezměnilo (přepsání na stejnou hodnotu),
 *  • množství není kladné číslo (na to je mazání položky, ne odpočet nula),
 *  • položka nemá id (ještě neuložený řádek — odpočet k ní existovat nemůže).
 *
 * Posílají se VŽDY všechny tři hodnoty, i když se měnila jen jedna: funkce v
 * databázi přepisuje řádek celý a doplnit ji půlkou hodnot by odpočet rozhodila
 * ještě víc.
 */
export function srovnaniPoUprave(
  puvodni: PolozkaObjednavky,
  zmena: UpravaPolozky,
): SrovnaniOdpoctu | null {
  if (!puvodni.id) return null;

  const nova: PolozkaObjednavky = {
    id: puvodni.id,
    beer_id: zmena.beer_id !== undefined ? zmena.beer_id : puvodni.beer_id,
    package_id: zmena.package_id !== undefined ? zmena.package_id : puvodni.package_id,
    quantity: zmena.quantity !== undefined ? Number(zmena.quantity) : Number(puvodni.quantity),
  };

  if (!Number.isFinite(nova.quantity) || nova.quantity <= 0) return null;

  const beze_zmeny =
    nova.beer_id === puvodni.beer_id &&
    nova.package_id === puvodni.package_id &&
    nova.quantity === Number(puvodni.quantity);
  if (beze_zmeny) return null;

  return {
    p_order_item_id: nova.id,
    p_beer_id: nova.beer_id,
    p_package_id: nova.package_id,
    p_quantity: nova.quantity,
  };
}

/** Odpočet, který se rozešel se svou položkou objednávky. */
export type RozjetyOdpocet = {
  order_item_id: string;
  order_id: string;
  /** Co říká skladový odpočet (podle čeho je sklad odepsaný). */
  odpocet: { beer_id: string | null; package_id: string | null; quantity: number };
  /** Co říká objednávka (jak to má být). */
  objednavka: { beer_id: string | null; package_id: string | null; quantity: number };
  /** Rozdíl v kusech: kladné = odepsáno víc, než se objednalo. */
  rozdilKusu: number;
  /** Změnilo se i pivo nebo obal, ne jenom počet? */
  jinePivoNeboObal: boolean;
};

type OdpocetRadek = {
  order_item_id: string | null;
  order_id: string;
  beer_id: string | null;
  package_id: string | null;
  quantity: number | string;
};

/**
 * Najde odpočty, které nesedí s objednávkou.
 *
 * Tohle je hlídač, ne oprava: appka má sama poznat, že se sklad odepisuje
 * podle něčeho, co v objednávce dávno nestojí. Bez něj takové řádky nikdo
 * nenajde — vyplavou až v inventuře jako manko bez původu ve výrobě, o měsíce
 * později a bez stopy, odkud se vzalo.
 *
 * Odpočet bez `order_item_id` se přeskakuje: nemá se s čím porovnat.
 */
export function najdiRozjeteOdpocty(
  polozky: PolozkaObjednavky[],
  odpocty: OdpocetRadek[],
): RozjetyOdpocet[] {
  const podleId = new Map(polozky.map((p) => [p.id, p]));
  const nalezene: RozjetyOdpocet[] = [];

  for (const o of odpocty) {
    if (!o.order_item_id) continue;
    const polozka = podleId.get(o.order_item_id);
    if (!polozka) continue; // položka není v načteném rozsahu — netvrdit nic

    const odpocetKs = Number(o.quantity);
    const objednanoKs = Number(polozka.quantity);
    if (!Number.isFinite(odpocetKs) || !Number.isFinite(objednanoKs)) continue;

    const jinePivoNeboObal =
      (o.beer_id ?? null) !== (polozka.beer_id ?? null) ||
      (o.package_id ?? null) !== (polozka.package_id ?? null);
    if (odpocetKs === objednanoKs && !jinePivoNeboObal) continue;

    nalezene.push({
      order_item_id: o.order_item_id,
      order_id: o.order_id,
      odpocet: { beer_id: o.beer_id ?? null, package_id: o.package_id ?? null, quantity: odpocetKs },
      objednavka: { beer_id: polozka.beer_id ?? null, package_id: polozka.package_id ?? null, quantity: objednanoKs },
      rozdilKusu: odpocetKs - objednanoKs,
      jinePivoNeboObal,
    });
  }

  return nalezene;
}

/**
 * Odpočty, které patří stornované objednávce.
 *
 * Storno musí sklad uvolnit — zrušené sudy nikdo neodvezl. Databáze na to má
 * `set_order_status` (migrace 20261210000000), která odpočty v jedné transakci
 * smaže. Jenže hromadná změna stavu a storno z auditu měnily `orders.status`
 * přímo, takže odpočet zůstal a sklad byl trvale nižší o zrušené zboží —
 * v inventuře pak nevysvětlitelný přebytek.
 */
export function odpoctyStornovanych<T extends { order_id: string }>(
  stornovaneObjednavky: Iterable<string>,
  odpocty: T[],
): T[] {
  const storno = new Set(stornovaneObjednavky);
  return odpocty.filter((o) => storno.has(o.order_id));
}

/** Objednávka v rozsahu, který určuje DEN skladového odpočtu. */
export type ObjednavkaProOdpocet = {
  id: string;
  order_date: string;
  delivery_day: string | null;
  delivery_date: string | null;
};

/** Odpočet zapsaný k jinému dni, než se doopravdy vezlo. */
export type RozjeteDatum = {
  order_id: string;
  order_item_id: string;
  /** Den, ke kterému sklad ubyl. */
  deductDate: string;
  /** Den, kdy se podle objednávky vezlo. */
  denZavozu: string;
  /** O kolik dní je odpočet vedle (kladné = odepsáno později než se vezlo). */
  rozdilDnu: number;
  /** Spadne kvůli tomu výdej do jiného měsíce? Pak nesedí i inventura. */
  jinyMesic: boolean;
};

const denRozdil = (a: string, b: string) =>
  Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86400000);

/**
 * Najde odpočty zapsané k jinému dni, než na který objednávka vyšla.
 *
 * Vzniká to přesunutím objednávky na jiný týden POTÉ, co noční odpočet
 * proběhl — datum odpočtu zůstalo na původním dni. Uvnitř měsíce to
 * inventuru nerozhodí, ale týdenní pohled na sklad ukazuje výdej dřív (nebo
 * později), než se doopravdy vezlo. Když přesun překročí konec měsíce,
 * rozjede se i inventura.
 *
 * Den zavozu se počítá stejným vzorcem jako v databázi (ucinny_den_zavozu)
 * i na obrazovkách — computeDeliveryDateISO. Jiný vzorec by hlásil rozdíly,
 * které nejsou.
 */
export function najdiRozjetaData(
  objednavky: ObjednavkaProOdpocet[],
  odpocty: { order_id: string; order_item_id: string | null; deduct_date: string | null }[],
): RozjeteDatum[] {
  const podleId = new Map(objednavky.map((o) => [o.id, o]));
  const nalezene: RozjeteDatum[] = [];

  for (const d of odpocty) {
    if (!d.order_item_id || !d.deduct_date) continue;
    const o = podleId.get(d.order_id);
    if (!o) continue; // objednávka mimo načtený rozsah — netvrdit nic

    const denZavozu = computeDeliveryDateISO(o.order_date, o.delivery_day, o.delivery_date);
    const deductDate = d.deduct_date.slice(0, 10);
    if (!denZavozu || denZavozu === deductDate) continue;

    nalezene.push({
      order_id: d.order_id,
      order_item_id: d.order_item_id,
      deductDate,
      denZavozu,
      rozdilDnu: denRozdil(deductDate, denZavozu),
      jinyMesic: deductDate.slice(0, 7) !== denZavozu.slice(0, 7),
    });
  }

  return nalezene;
}
