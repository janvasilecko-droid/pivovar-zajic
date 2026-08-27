// 📊 Výpočty pro Statistiku — výstav podle období, piv, obalů a odběratelů.
// ---------------------------------------------------------------------------
// Výstav = kolik piva se skutečně stočilo, v litrech: množství × objem obalu.
// Bere se ze stáčení lahví (`bottling`) i sudů (`kegging`) — obojí je výroba,
// jen do jiného obalu. Objednávky se do výstavu nepočítají: objednané pivo
// nemusí být stočené a stočené nemusí být objednané.
export type VyrobniRadek = {
  entry_date: string | null;
  beer_id: string | null;
  package_id: string | null;
  quantity: number | null;
};

export type Obal = { id: string; label: string; kind: string; volume_l: number | string | null };
export type Pivo = { id: string; name: string };

export type Obdobi = 'tyden' | 'mesic' | 'rok' | 'vse';

/** Pondělí toho ISO týdne, do kterého datum spadá. */
export function pondeliTydne(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export function posunDnu(iso: string, dnu: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + dnu);
  return d.toISOString().slice(0, 10);
}

export function posunMesicu(mesic: string, o: number): string {
  const [r, m] = mesic.split('-').map(Number);
  const d = new Date(Date.UTC(r, m - 1 + o, 1));
  return d.toISOString().slice(0, 7);
}

/** Rozsah [od, do] pro zvolené období vztažené ke dni `dnes`. */
export function rozsahObdobi(obdobi: Obdobi, dnes: string): { od: string; do: string } {
  if (obdobi === 'tyden') return { od: pondeliTydne(dnes), do: posunDnu(pondeliTydne(dnes), 6) };
  if (obdobi === 'mesic') return { od: dnes.slice(0, 7) + '-01', do: dnes.slice(0, 7) + '-31' };
  if (obdobi === 'rok') return { od: dnes.slice(0, 4) + '-01-01', do: dnes.slice(0, 4) + '-12-31' };
  return { od: '0000-01-01', do: '9999-12-31' };
}

/** Předchozí srovnatelné období — proti němu se počítá růst/pokles. */
export function predchoziRozsah(obdobi: Obdobi, dnes: string): { od: string; do: string } | null {
  if (obdobi === 'tyden') {
    const po = posunDnu(pondeliTydne(dnes), -7);
    return { od: po, do: posunDnu(po, 6) };
  }
  if (obdobi === 'mesic') {
    const m = posunMesicu(dnes.slice(0, 7), -1);
    return { od: m + '-01', do: m + '-31' };
  }
  if (obdobi === 'rok') {
    const r = String(Number(dnes.slice(0, 4)) - 1);
    return { od: r + '-01-01', do: r + '-12-31' };
  }
  return null;
}

const objem = (o: Obal | undefined): number => Number(o?.volume_l ?? 0);

/** Litry jednoho výrobního řádku. */
export function litryRadku(r: VyrobniRadek, obaly: Map<string, Obal>): number {
  if (!r.package_id) return 0;
  return Number(r.quantity || 0) * objem(obaly.get(r.package_id));
}

/** Součet litrů v rozsahu dat (včetně obou krajů). */
export function litryVRozsahu(radky: VyrobniRadek[], obaly: Map<string, Obal>, od: string, doKdy: string): number {
  let soucet = 0;
  for (const r of radky) {
    if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy) continue;
    soucet += litryRadku(r, obaly);
  }
  return soucet;
}

/** Litry po měsících (klíč RRRR-MM). */
export function litryPoMesicich(radky: VyrobniRadek[], obaly: Map<string, Obal>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of radky) {
    if (!r.entry_date) continue;
    const m = r.entry_date.slice(0, 7);
    out.set(m, (out.get(m) ?? 0) + litryRadku(r, obaly));
  }
  return out;
}

/** Litry po týdnech (klíč = pondělí týdne). */
export function litryPoTydnech(radky: VyrobniRadek[], obaly: Map<string, Obal>): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of radky) {
    if (!r.entry_date) continue;
    const k = pondeliTydne(r.entry_date);
    out.set(k, (out.get(k) ?? 0) + litryRadku(r, obaly));
  }
  return out;
}

export type PodilRadek = { id: string; nazev: string; litry: number; kusy: number; podil: number };

/** Rozpad litrů podle piva v daném rozsahu, seřazený od největšího. */
export function podilPodlePiva(
  radky: VyrobniRadek[], obaly: Map<string, Obal>, piva: Pivo[], od: string, doKdy: string,
): PodilRadek[] {
  const litry = new Map<string, number>();
  const kusy = new Map<string, number>();
  for (const r of radky) {
    if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy || !r.beer_id) continue;
    litry.set(r.beer_id, (litry.get(r.beer_id) ?? 0) + litryRadku(r, obaly));
    kusy.set(r.beer_id, (kusy.get(r.beer_id) ?? 0) + Number(r.quantity || 0));
  }
  const celkem = [...litry.values()].reduce((s, v) => s + v, 0);
  return [...litry.entries()]
    .map(([id, l]) => ({
      id,
      nazev: piva.find((p) => p.id === id)?.name ?? 'Neznámé pivo',
      litry: l,
      kusy: kusy.get(id) ?? 0,
      podil: celkem > 0 ? l / celkem : 0,
    }))
    .sort((a, b) => b.litry - a.litry);
}

/** Rozpad litrů podle obalu — kolik jde do sudů a kolik do lahví. */
export function podilPodleObalu(
  radky: VyrobniRadek[], obaly: Map<string, Obal>, od: string, doKdy: string,
): PodilRadek[] {
  const litry = new Map<string, number>();
  const kusy = new Map<string, number>();
  for (const r of radky) {
    if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy || !r.package_id) continue;
    litry.set(r.package_id, (litry.get(r.package_id) ?? 0) + litryRadku(r, obaly));
    kusy.set(r.package_id, (kusy.get(r.package_id) ?? 0) + Number(r.quantity || 0));
  }
  const celkem = [...litry.values()].reduce((s, v) => s + v, 0);
  return [...litry.entries()]
    .map(([id, l]) => ({
      id,
      nazev: obaly.get(id)?.label ?? 'Neznámý obal',
      litry: l,
      kusy: kusy.get(id) ?? 0,
      podil: celkem > 0 ? l / celkem : 0,
    }))
    .sort((a, b) => b.litry - a.litry);
}

export type OdberatelRadek = { nazev: string; litry: number; kusy: number; objednavek: number };

/**
 * Odběratelé podle objednaného množství. Bere se DEN ZÁVOZU (delivery_date),
 * ne den zadání — objednávka přijatá v pondělí na pátek patří do pátku.
 */
export function podleOdberatelu(
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[],
  polozky: { order_id: string; package_id: string | null; quantity: number | null }[],
  obaly: Map<string, Obal>,
  od: string,
  doKdy: string,
): OdberatelRadek[] {
  const vRozsahu = new Map<string, string>();
  for (const o of orders) {
    if (o.status === 'storno') continue;
    const den = o.delivery_date || o.order_date;
    if (!den || den < od || den > doKdy) continue;
    vRozsahu.set(o.id, o.place_name || 'Neuvedený odběratel');
  }
  const podleJmena = new Map<string, OdberatelRadek>();
  const objednavkyJmena = new Map<string, Set<string>>();
  for (const p of polozky) {
    const jmeno = vRozsahu.get(p.order_id);
    if (!jmeno) continue;
    const zaznam = podleJmena.get(jmeno) ?? { nazev: jmeno, litry: 0, kusy: 0, objednavek: 0 };
    zaznam.litry += Number(p.quantity || 0) * objem(p.package_id ? obaly.get(p.package_id) : undefined);
    zaznam.kusy += Number(p.quantity || 0);
    podleJmena.set(jmeno, zaznam);
    const mnozina = objednavkyJmena.get(jmeno) ?? new Set<string>();
    mnozina.add(p.order_id);
    objednavkyJmena.set(jmeno, mnozina);
  }
  return [...podleJmena.values()]
    .map((z) => ({ ...z, objednavek: objednavkyJmena.get(z.nazev)?.size ?? 0 }))
    .sort((a, b) => b.litry - a.litry);
}

/** Změna proti předchozímu období v procentech; null když není s čím srovnat. */
export function zmenaProcent(ted: number, drive: number): number | null {
  if (drive <= 0) return null;
  return ((ted - drive) / drive) * 100;
}

export const hl = (litry: number): number => litry / 100;

export function formatHl(litry: number): string {
  const v = hl(litry);
  return v.toLocaleString('cs-CZ', { maximumFractionDigits: v >= 100 ? 0 : 1 });
}
