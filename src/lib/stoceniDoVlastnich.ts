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
import { jeVyrizena } from './stavyObjednavek';

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
 * není storno ani zavezená a položka ještě nemá svůj řádek stáčení (v databázi
 * smí mít jen jeden — unikátní index).
 *
 * ⚠️ Odpis ze skladu (zavoz_deductions) se NEKONTROLUJE. Od 13. 9. 2026 se
 * sklad odepisuje automaticky ráno v den závozu, bez ohledu na stáčení — a
 * stáčí se právě ten den. Z provozu 8. 10. 2026: DaD měl dnes závoz, jeho
 * položky už byly „odepsané", appka se proto při zápisu stáčení nezeptala
 * „Do jejich sudů?", zápis skončil jako sud pivovaru a „Zbývá stočit"
 * zůstalo na plných 10× 50 l a 8× 20 l. Co odjelo, pozná `is_delivered` /
 * stav objednávky.
 */
export function otevrenePolozkyVlastnich(p: {
  objednavky: ObjednavkaVlastnich[];
  polozky: PolozkaVlastnich[];
  obaly: (ObalSudu & { id: string })[];
  stoceni: { order_item_id?: string | null }[];
}): OtevrenaPolozkaVlastnich[] {
  const objednavka = new Map(p.objednavky.map((o) => [o.id, o]));
  const obal = new Map(p.obaly.map((o) => [o.id, o]));
  const propojene = new Set(p.stoceni.map((r) => r.order_item_id).filter(Boolean) as string[]);
  const vysledek: OtevrenaPolozkaVlastnich[] = [];
  for (const it of p.polozky) {
    const o = objednavka.get(it.order_id);
    if (!o || o.status === 'storno' || o.is_delivered || jeVyrizena(o.status)) continue;
    if (!it.beer_id || !it.package_id) continue;
    const kusu = Number(it.quantity ?? 0);
    if (!(kusu > 0)) continue;
    if (propojene.has(it.id)) continue;
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

export type ZapsaneStaceni = {
  id: string;
  beer_id?: string | null;
  package_id?: string | null;
  quantity?: number | string | null;
  entry_date?: string | null;
  order_item_id?: string | null;
};

export type NavrhPripojeni = {
  radekId: string;
  polozkaId: string;
  odberatel: string;
  beerId: string;
  pkgId: string;
  kusu: number;
};

/**
 * Už ZAPSANÉ stáčení (bez vazby na položku), které sedí na otevřenou položku
 * odběratele s vlastními sudy — pro případ, že se při zápisu nikdo nezeptal
 * „Do jejich sudů?" (8. 10. 2026: u položek odepsaných automatickým odpočtem
 * závozu se appka dřív neptala) nebo se odpovědělo „do našich".
 *
 * Návrh, ne automat: nic se nepřipojuje bez potvrzení (zadání 7. 10. 2026 —
 * stáčení se k odběrateli váže jen z vůli stáčeče). Celý řádek jde k jedné
 * položce, a jen když se do ní vejde (řádek většího počtu by se musel dělit —
 * ten se nenavrhuje, zapíše se znovu). Jedna položka dostane nejvýš jeden
 * řádek (unikátní index na kegging.order_item_id).
 */
export function navrhniPripojeniZapsaneho(p: {
  objednavky: ObjednavkaVlastnich[];
  polozky: PolozkaVlastnich[];
  obaly: (ObalSudu & { id: string })[];
  stoceni: ZapsaneStaceni[];
  /** Nejstarší datum zápisu, které se ještě bere v úvahu (pondělí týdne). */
  odData: string;
}): NavrhPripojeni[] {
  const otevrene = otevrenePolozkyVlastnich({
    objednavky: p.objednavky, polozky: p.polozky, obaly: p.obaly, stoceni: p.stoceni,
  });
  const jeSudObal = new Set(p.obaly.filter((o) => o.kind === 'keg').map((o) => o.id));
  const pouzite = new Set<string>();
  const vysledek: NavrhPripojeni[] = [];
  const volne = p.stoceni
    .filter((r) => !r.order_item_id && r.beer_id && r.package_id && jeSudObal.has(r.package_id)
      && (r.entry_date ?? '').slice(0, 10) >= p.odData)
    .sort((a, b) => (a.entry_date ?? '').localeCompare(b.entry_date ?? '') || a.id.localeCompare(b.id));
  for (const r of volne) {
    const kusu = Number(r.quantity ?? 0);
    if (!(kusu > 0)) continue;
    const polozka = otevrene.find((o) => !pouzite.has(o.polozkaId)
      && o.beerId === r.beer_id && o.pkgId === r.package_id && kusu <= o.kusu);
    if (!polozka) continue;
    pouzite.add(polozka.polozkaId);
    vysledek.push({
      radekId: r.id, polozkaId: polozka.polozkaId, odberatel: polozka.odberatel,
      beerId: polozka.beerId, pkgId: polozka.pkgId, kusu,
    });
  }
  return vysledek;
}
