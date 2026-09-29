// 🧭 Zvyklosti odběratele — obvyklý den, závoz a množství z jeho historie.
// ---------------------------------------------------------------------------
// Z provozu 29. 9. 2026 (návrhy po dni zadávání, „jinak udělej vše"):
//  1) upozornit na neobvyklé množství (Maneo přečten 10× místo obvyklých 2×),
//  3) když zpráva den neuvede, předvyplnit obvyklý den (a 1. / 2. závoz).
//
// Čistý výpočet nad posledními objednávkami + tenké načtení z databáze.
import { fetchAllRows } from './supabase';

export type ObjednavkaHistorie = {
  id: string;
  delivery_day?: string | null;
  zavoz_cislo?: number | null;
  status?: string | null;
};
export type PolozkaHistorie = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number | string | null };

export type Zvyklosti = {
  /** Den, kterým bere aspoň polovinu (a aspoň 3) posledních objednávek. */
  obvyklyDen: string | null;
  /** 2, když většina posledních objednávek jela 2. závozem; jinak null. */
  obvyklyZavoz: 2 | null;
  /** Medián kusů po (pivo, obal) — jen s aspoň 3 objednávkami. */
  obvykleMnozstvi: Map<string, number>;
  objednavek: number;
};

const klic = (beerId: string | null, pkgId: string | null) => `${beerId ?? '?'}__${pkgId ?? '?'}`;

function median(cisla: number[]): number {
  const s = [...cisla].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function spoctiZvyklosti(objednavky: ObjednavkaHistorie[], polozky: PolozkaHistorie[]): Zvyklosti {
  const platne = objednavky.filter((o) => o.status !== 'storno');
  const dny = new Map<string, number>();
  for (const o of platne) if (o.delivery_day) dny.set(o.delivery_day, (dny.get(o.delivery_day) ?? 0) + 1);
  let obvyklyDen: string | null = null;
  const nejcastejsi = [...dny.entries()].sort((a, b) => b[1] - a[1])[0];
  if (nejcastejsi && nejcastejsi[1] >= 3 && nejcastejsi[1] * 2 >= platne.length) obvyklyDen = nejcastejsi[0];

  const druhy = platne.filter((o) => (o.zavoz_cislo ?? 1) === 2).length;
  const obvyklyZavoz: 2 | null = platne.length >= 3 && druhy * 2 > platne.length ? 2 : null;

  const ids = new Set(platne.map((o) => o.id));
  const poKlici = new Map<string, Map<string, number>>();
  for (const p of polozky) {
    if (!ids.has(p.order_id)) continue;
    const k = klic(p.beer_id, p.package_id);
    const m = poKlici.get(k) ?? new Map<string, number>();
    m.set(p.order_id, (m.get(p.order_id) ?? 0) + (Number(p.quantity) || 0));
    poKlici.set(k, m);
  }
  const obvykleMnozstvi = new Map<string, number>();
  for (const [k, m] of poKlici) if (m.size >= 3) obvykleMnozstvi.set(k, median([...m.values()]));

  return { obvyklyDen, obvyklyZavoz, obvykleMnozstvi, objednavek: platne.length };
}

/**
 * Obvyklé množství, když je zadané podezřele VYSOKÉ (aspoň dvojnásobek
 * a aspoň o 3 kusy víc než obvykle). Jinak null.
 */
export function neobvykleMnozstvi(z: Zvyklosti | null, beerId: string | null, pkgId: string | null, kusu: number): number | null {
  if (!z || !(kusu > 0)) return null;
  const obvykle = z.obvykleMnozstvi.get(klic(beerId, pkgId));
  if (obvykle == null) return null;
  return kusu >= obvykle * 2 && kusu >= obvykle + 3 ? obvykle : null;
}

/** Posledních 20 objednávek odběratele (podle id, jinak podle jména). */
export async function nactiZvyklosti(placeId: string | null, placeName: string | null): Promise<Zvyklosti | null> {
  if (!placeId && !placeName?.trim()) return null;
  let dotaz = fetchAllRows<ObjednavkaHistorie & { order_date: string }>('orders', '*');
  dotaz = placeId ? dotaz.eq('place_id', placeId) : dotaz.eq('place_name', placeName!.trim());
  const { data: vse, error } = await dotaz.order('order_date', { ascending: false });
  if (error || !vse) return null;
  const objednavky = (vse as (ObjednavkaHistorie & { order_date: string })[]).slice(0, 20);
  if (objednavky.length === 0) return null;
  const { data: polozky } = await fetchAllRows<PolozkaHistorie>('order_items', 'order_id,beer_id,package_id,quantity')
    .in('order_id', objednavky.map((o) => o.id));
  return spoctiZvyklosti(objednavky, (polozky ?? []) as PolozkaHistorie[]);
}
