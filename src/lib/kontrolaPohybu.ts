// 🔎 Kontrola pohybů — hledá zápisy, které nejspíš do skladu nepatří.
// ---------------------------------------------------------------------------
// Z provozu 1. 10. 2026: „nesedí mi data v inventuře… vychází mi míň 50 12ky,
// 30 12ky, projdi to všechno pořádně" a „dostaň se k datům a projdi je".
// Do databáze se odjinud nedostane nikdo jiný než přihlášená appka — proto
// kontrola běží tady, nad stejnými daty jako Sklad, a ukáže, co je podezřelé.
//
// Nic se tu neopravuje — jen se ukazuje, kde hledat. Čisté funkce, testované.
import { stockKey, type Movement } from './stockLedger';

export type ObjednavkaProKontrolu = {
  id: string;
  place_name?: string | null;
  status?: string | null;
  delivery_date?: string | null;
  order_date?: string | null;
};
export type PolozkaProKontrolu = { order_id: string; beer_id?: string | null; package_id?: string | null; quantity?: number | string | null };
export type StaceniProKontrolu = {
  entry_date: string;
  beer_id?: string | null;
  quantity?: number | string | null;
  kegs_used?: number | string | null;
  kegs_used_package_id?: string | null;
  created_at?: string | null;
  note?: string | null;
};

export type Nalez = {
  datum: string;
  beer_id: string;
  package_id: string;
  /** chyba = sklad je skoro jistě špatně; pozor = podívej se, může být v pořádku. */
  vaha: 'chyba' | 'pozor';
  text: string;
  /** Kolik kusů to nejspíš dělá ve skladu (− = sklad ukazuje míň, než má). */
  dopad?: number;
};

export function najdiPodezrele(vstup: {
  pohyby: Movement[];
  objednavky: ObjednavkaProKontrolu[];
  polozky: PolozkaProKontrolu[];
  od: string;
  doDne: string;
  beerId?: string;
  packageId?: string;
}): Nalez[] {
  const { pohyby, objednavky, polozky, od, doDne, beerId, packageId } = vstup;
  const sedi = (b: string, p: string) => (!beerId || b === beerId) && (!packageId || p === packageId);
  const vObdobi = pohyby.filter((m) => m.date >= od && m.date <= doDne && sedi(m.beer_id, m.package_id));
  const objPodleId = new Map(objednavky.map((o) => [o.id, o]));
  const jmeno = (id?: string | null) => (id && objPodleId.get(id)?.place_name?.trim()) || 'objednávka';
  const out: Nalez[] = [];

  // A) Stejný zápis víckrát v jednom dni (stáčení ručně i z Excelu/fotky,
  //    dvakrát odeslaný formulář…). Závozy se řeší zvlášť níž.
  const skupiny = new Map<string, Movement[]>();
  for (const m of vObdobi) {
    if (m.kind === 'inventura' || m.kind === 'zavoz') continue;
    const k = `${m.date}|${m.kind}|${stockKey(m.beer_id, m.package_id)}|${m.qty}`;
    skupiny.set(k, [...(skupiny.get(k) ?? []), m]);
  }
  skupiny.forEach((list) => {
    if (list.length < 2) return;
    const m = list[0];
    const popis = m.kind === 'sud_na_lahve' ? 'sud spotřebovaný na lahve'
      : m.kind === 'staceni' || m.kind === 'kegovani' ? 'stáčení'
      : m.kind === 'dorovnani' ? 'dorovnání / vrácení' : m.kind;
    out.push({
      datum: m.date, beer_id: m.beer_id, package_id: m.package_id, vaha: 'pozor',
      text: `${popis} ${m.qty > 0 ? '+' : ''}${m.qty} je ten den zapsané ${list.length}× — není jeden zápis navíc?`,
      dopad: -(list.length - 1) * m.qty,
    });
  });

  // Součty po objednávce a pivu×obalu: odepsáno (závoz), objednáno, vráceno.
  const klicObj = (orderId: string, b: string, p: string) => `${orderId}|${stockKey(b, p)}`;
  const odepsano = new Map<string, { qty: number; datum: string; b: string; p: string; orderId: string }>();
  for (const m of pohyby) {
    if (m.kind !== 'zavoz' || !sedi(m.beer_id, m.package_id)) continue;
    const id = m.orderId ?? '';
    const k = klicObj(id, m.beer_id, m.package_id);
    const r = odepsano.get(k) ?? { qty: 0, datum: m.date, b: m.beer_id, p: m.package_id, orderId: id };
    r.qty += -m.qty;
    if (m.date > r.datum) r.datum = m.date;
    odepsano.set(k, r);
  }
  const objednano = new Map<string, number>();
  for (const it of polozky) {
    if (!it.beer_id || !it.package_id) continue;
    const k = klicObj(it.order_id, it.beer_id, it.package_id);
    objednano.set(k, (objednano.get(k) ?? 0) + Number(it.quantity || 0));
  }
  const vraceno = new Map<string, number>();
  for (const m of pohyby) {
    if (m.kind !== 'dorovnani' || !m.orderId) continue;
    const k = klicObj(m.orderId, m.beer_id, m.package_id);
    vraceno.set(k, (vraceno.get(k) ?? 0) + m.qty);
  }

  odepsano.forEach((r, k) => {
    // Jen odpočty, které spadají do kontrolovaného období.
    if (r.datum < od || r.datum > doDne) return;
    const o = objPodleId.get(r.orderId);
    const vrac = vraceno.get(k) ?? 0;
    if (!r.orderId || !o) {
      out.push({ datum: r.datum, beer_id: r.b, package_id: r.p, vaha: 'chyba',
        text: `odepsáno ${r.qty} ks na objednávku, která už neexistuje (smazaná) — kusy chybí ve skladu`, dopad: -r.qty });
      return;
    }
    if (o.status === 'storno' && vrac < r.qty) {
      out.push({ datum: r.datum, beer_id: r.b, package_id: r.p, vaha: 'chyba',
        text: `${jmeno(r.orderId)} je ZRUŠENÁ, ale odepsáno ${r.qty} ks${vrac ? ` a vráceno jen ${vrac}` : ' a nic se nevrátilo'}`, dopad: -(r.qty - vrac) });
      return;
    }
    const obj = objednano.get(k) ?? 0;
    if (r.qty > obj) {
      out.push({ datum: r.datum, beer_id: r.b, package_id: r.p, vaha: 'chyba',
        text: `${jmeno(r.orderId)}: odepsáno ${r.qty} ks, ale objednáno jen ${obj}`, dopad: -(r.qty - obj) });
    }
  });

  // Vráceno víc, než se z objednávky odepsalo (např. vrácení dvakrát).
  vraceno.forEach((v, k) => {
    const [orderId, klic] = k.split('|');
    const [b, p] = klic.split('__');
    if (!sedi(b, p) || v <= 0) return;
    const ode = odepsano.get(k)?.qty ?? 0;
    if (v <= ode) return;
    const m = pohyby.find((x) => x.kind === 'dorovnani' && x.orderId === orderId && x.beer_id === b && x.package_id === p);
    if (!m || m.date < od || m.date > doDne) return;
    out.push({ datum: m.date, beer_id: b, package_id: p, vaha: 'chyba',
      text: `${jmeno(orderId)}: vráceno ${v} ks, ale odepsáno jen ${ode}${ode === 0 ? ' (odpočet chybí — vrátilo se něco, co z ní neubylo)' : ''}`,
      dopad: v - ode });
  });

  // D) Stejná objednávka dvakrát: stejný odběratel, stejný den závozu,
  //    stejné položky — a obě se odepsaly.
  const otisk = new Map<string, string[]>();
  const polozkyObj = new Map<string, string[]>();
  for (const it of polozky) {
    if (!it.beer_id || !it.package_id) continue;
    polozkyObj.set(it.order_id, [...(polozkyObj.get(it.order_id) ?? []), `${it.beer_id}__${it.package_id}×${Number(it.quantity || 0)}`]);
  }
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const den = (o.delivery_date || o.order_date || '').slice(0, 10);
    if (!den || den < od || den > doDne) continue;
    const pol = (polozkyObj.get(o.id) ?? []).sort();
    if (pol.length === 0) continue;
    const k = `${(o.place_name ?? '').trim().toLowerCase()}|${den}|${pol.join(',')}`;
    otisk.set(k, [...(otisk.get(k) ?? []), o.id]);
  }
  otisk.forEach((ids, k) => {
    if (ids.length < 2) return;
    const den = k.split('|')[1];
    for (const it of polozky.filter((x) => x.order_id === ids[0] && x.beer_id && x.package_id && sedi(x.beer_id, x.package_id!))) {
      out.push({ datum: den, beer_id: it.beer_id!, package_id: it.package_id!, vaha: 'pozor',
        text: `${jmeno(ids[0])} má na ${den.slice(8, 10)}. ${den.slice(5, 7)}. ${ids.length} stejné objednávky (${Number(it.quantity || 0)} ks) — není jedna zadaná dvakrát?`,
        dopad: -(ids.length - 1) * Number(it.quantity || 0) });
    }
  });

  return out.sort((a, b) => (a.vaha === b.vaha ? a.datum.localeCompare(b.datum) : a.vaha === 'chyba' ? -1 : 1));
}

/**
 * Stočení lahví bez zapsaného zdrojového sudu — z provozu 1. 10. 2026: „lahve
 * se stáčí ze sudu, to znamená že vždy bude odebrán sud… když se ten sud
 * neodečte a přičtou se jen lahve, nesedí mi sudy."
 *
 * `stockLedger.ts` (resolveKegsUsed) takový řádek tiše přeskočí — bez
 * `kegs_used_package_id` nejde poznat, KTERÝ sud ubyl, takže se neodečte
 * vůbec. Tahle kontrola to dohledá v syrových řádcích `bottling` (Movement[]
 * už tu stopu nenese — řádek bez zdroje žádný pohyb nevytvoří).
 *
 * Jeden nález na dávku (stejné seskupení jako dedup v buildMovements), ne na
 * každý cílový obal zvlášť — jinak by 1 chybějící sud ohlásil třikrát, když
 * se z něj stáčelo do tří velikostí lahví najednou.
 */
export function najdiChybejiciZdrojSudu(
  bottlingRows: StaceniProKontrolu[],
  filtr: { od: string; doDne: string; beerId?: string },
): Nalez[] {
  const { od, doDne, beerId } = filtr;
  const videno = new Set<string>();
  const out: Nalez[] = [];
  for (const r of bottlingRows) {
    if (!r.beer_id || !(Number(r.quantity) > 0)) continue;
    const datum = String(r.entry_date).slice(0, 10);
    if (datum < od || datum > doDne) continue;
    if (beerId && r.beer_id !== beerId) continue;
    if (Number(r.kegs_used || 0) > 0 && r.kegs_used_package_id) continue; // zdroj je zapsaný
    const klic = r.created_at ? `${datum}|${r.beer_id}|${r.created_at}` : `${datum}|${r.beer_id}|${r.note || ''}`;
    if (videno.has(klic)) continue;
    videno.add(klic);
    out.push({
      datum, beer_id: r.beer_id, package_id: '', vaha: 'chyba',
      text: 'stočení lahví bez zapsaného zdrojového sudu — sklad sudů se u něj neodečetl (oprav přes tužku u řádku ve Stáčení lahví)',
    });
  }
  return out;
}
