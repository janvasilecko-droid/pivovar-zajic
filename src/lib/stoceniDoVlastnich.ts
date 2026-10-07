// 🛢️ Stáčení do VLASTNÍCH sudů odběratele (Duck and Dog, Michal Fojtovice,
// Martin u malých — lib/vlastniSudy.ts) zapsané v běžném zápisu stáčení.
// ---------------------------------------------------------------------------
// Zadání 7. 10. 2026: „To stáčení brát na sklad, ale nebrat ze skladu piva
// na tyhle objednávky. Jde mi o to, aby se počítaly do stáčení, inventury,
// ale nebraly se na ně piva ze skladu, a když bude na skladě déle, tak aby
// se nepočítaly pro normální objednávky."
//
// Plán stáčení (lib/keggingPlan.ts) to uměl, jen když řádek stáčení nesl
// vazbu na položku objednávky (kegging.order_item_id). Tu ale dával jen
// zrušený „Stočeno" u položky — z běžného zápisu žádný řádek vazbu neměl,
// takže naplněné sudy odběratele ležely ve skladu jako sudy pivovaru
// a kryly ostatní objednávky.
//
// Teď se při zápisu stáčení appka zeptá, když pivo a obal sedí na otevřenou
// objednávku takového odběratele, a řádek k ní připojí. Sudy se dál počítají
// do stáčení, skladu i inventury (je to normální řádek stáčení), ale plán
// je na ostatní objednávky nepoužije, dokud jejich objednávka neodjede.

import { doSuduOdberatele, type ObalSudu } from './vlastniSudy';

export type ObjednavkaVlastnich = {
  id: string;
  place_name?: string | null;
  status?: string | null;
  is_delivered?: boolean | null;
  delivery_date?: string | null;
  order_date?: string | null;
};
export type PolozkaVlastnich = {
  id: string;
  order_id: string;
  beer_id?: string | null;
  package_id?: string | null;
  quantity?: number | string | null;
};

export type OtevrenaPolozkaVlastnich = {
  polozkaId: string;
  beerId: string;
  pkgId: string;
  kusu: number;
  odberatel: string;
  datum: string;
};

/**
 * Položky odběratelů s vlastními sudy, na které se ještě stáčí: objednávka
 * není storno ani zavezená, položka ještě nemá svůj řádek stáčení (v databázi
 * smí mít jen jeden — unikátní index) a ještě se neodepsala ze skladu.
 */
export function otevrenePolozkyVlastnich(p: {
  objednavky: ObjednavkaVlastnich[];
  polozky: PolozkaVlastnich[];
  obaly: (ObalSudu & { id: string })[];
  stoceni: { order_item_id?: string | null }[];
  odepsanePolozky: Set<string>;
}): OtevrenaPolozkaVlastnich[] {
  const objednavka = new Map(p.objednavky.map((o) => [o.id, o]));
  const obal = new Map(p.obaly.map((o) => [o.id, o]));
  const propojene = new Set(p.stoceni.map((r) => r.order_item_id).filter(Boolean) as string[]);
  const vysledek: OtevrenaPolozkaVlastnich[] = [];
  for (const it of p.polozky) {
    const o = objednavka.get(it.order_id);
    if (!o || o.status === 'storno' || o.is_delivered) continue;
    if (!it.beer_id || !it.package_id) continue;
    const kusu = Number(it.quantity ?? 0);
    if (!(kusu > 0)) continue;
    if (propojene.has(it.id) || p.odepsanePolozky.has(it.id)) continue;
    if (!doSuduOdberatele(o.place_name, obal.get(it.package_id))) continue;
    vysledek.push({
      polozkaId: it.id,
      beerId: it.beer_id,
      pkgId: it.package_id,
      kusu,
      odberatel: o.place_name ?? '',
      datum: o.delivery_date || o.order_date || '',
    });
  }
  // Nejdřív ta, co jede nejdřív.
  return vysledek.sort((a, b) => a.datum.localeCompare(b.datum) || a.polozkaId.localeCompare(b.polozkaId));
}

export type PrirazeniVlastnich = { radek: number; polozkaId: string; odberatel: string; kusu: number };

/**
 * Které kusy ze zapisovaných řádků (pivo + obal + počet) můžou jít do sudů
 * odběratele. Řádek se může rozdělit: část do jejich sudů, zbytek do sudů
 * pivovaru. Jedna položka objednávky dostane nejvýš jeden řádek.
 */
export function priradDoVlastnich(
  radky: { beerId: string; pkgId: string; pocet: number }[],
  otevrene: OtevrenaPolozkaVlastnich[],
): PrirazeniVlastnich[] {
  const pouzite = new Set<string>();
  const vysledek: PrirazeniVlastnich[] = [];
  radky.forEach((r, radek) => {
    let zbyva = r.pocet;
    for (const p of otevrene) {
      if (zbyva <= 0) break;
      if (pouzite.has(p.polozkaId) || p.beerId !== r.beerId || p.pkgId !== r.pkgId) continue;
      const kusu = Math.min(zbyva, p.kusu);
      pouzite.add(p.polozkaId);
      vysledek.push({ radek, polozkaId: p.polozkaId, odberatel: p.odberatel, kusu });
      zbyva -= kusu;
    }
  });
  return vysledek;
}

/**
 * Rozdělí zapisované řádky podle přiřazení: z každého řádku vzniknou řádky
 * připojené k položkám odběratele a případně jeden zbytek bez vazby.
 */
export function rozdelRadkyNaVlastni<R extends { qty: string | number }>(
  radky: R[],
  prirazeni: PrirazeniVlastnich[],
): (R & { orderItemId: string | null })[] {
  const vysledek: (R & { orderItemId: string | null })[] = [];
  radky.forEach((r, i) => {
    const moje = prirazeni.filter((p) => p.radek === i);
    let zbyva = Number(r.qty);
    for (const p of moje) {
      vysledek.push({ ...r, qty: typeof r.qty === 'number' ? p.kusu : String(p.kusu), orderItemId: p.polozkaId });
      zbyva -= p.kusu;
    }
    if (zbyva > 0 || moje.length === 0) {
      vysledek.push({ ...r, qty: typeof r.qty === 'number' ? zbyva : String(zbyva), orderItemId: null });
    }
  });
  return vysledek;
}
