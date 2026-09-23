// 📊 Výpočty pro Statistiku — výstav podle období, piv, obalů a odběratelů.
// ---------------------------------------------------------------------------
// VÝSTAV = objem STOČENÝCH SUDŮ (`kegging`), v litrech: množství × objem obalu.
//
// Lahve se do výstavu NEPOČÍTAJÍ. V tomhle pivovaru se lahvuje z už stočených
// sudů — pivo v lahvi tedy do výstavu vstoupilo už ve chvíli, kdy šlo do sudu.
// Kdyby se přičítalo i lahvování, tentýž objem by se počítal dvakrát a výstav
// by vycházel nafouknutý. Skladově je to podchycené už dřív: řádek stáčení
// lahví nese `kegs_used` a skladová kniha z něj dělá pohyb 'sud_na_lahve',
// tedy odečet sudů (viz lib/stockLedger.ts).
//
// Lahvování se proto sleduje zvlášť jako „přestočeno do lahví" — je to údaj
// o tom, kam pivo z výstavu putovalo, ne další výroba.
//
// Objednávky se do výstavu nepočítají taky: objednané pivo nemusí být stočené
// a stočené nemusí být objednané.
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

/**
 * Den, od kterého se odvíjí období posunuté o `posun` období zpět/dopředu
 * (0 = to, ve kterém jsme teď; −1 = předchozí).
 *
 * Schválně se posouvá REFERENČNÍ DEN a rozsah se pak počítá stávajícím
 * `rozsahObdobi()` — tím pádem existuje jen jedna definice toho, kde týden
 * (měsíc, rok) začíná a končí, a posun ji nemůže rozejít.
 */
export function denObdobi(obdobi: Obdobi, dnes: string, posun: number): string {
  if (posun === 0) return dnes;
  if (obdobi === 'tyden') return posunDnu(pondeliTydne(dnes), 7 * posun);
  if (obdobi === 'mesic') return posunMesicu(dnes.slice(0, 7), posun) + '-01';
  if (obdobi === 'rok') return String(Number(dnes.slice(0, 4)) + posun) + '-01-01';
  return dnes; // „za celou dobu" se posouvat nedá
}

const MESICE_1_PAD = [
  'leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec',
];

/** Čitelný popis zobrazeného období — „23. 9. – 29. 9. 2026", „září 2026", „2026". */
export function popisRozsahu(obdobi: Obdobi, den: string): string {
  if (obdobi === 'rok') return den.slice(0, 4);
  if (obdobi === 'mesic') return `${MESICE_1_PAD[Number(den.slice(5, 7)) - 1]} ${den.slice(0, 4)}`;
  if (obdobi === 'tyden') {
    const od = pondeliTydne(den);
    const doKdy = posunDnu(od, 6);
    const denMesic = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}.`;
    return `${denMesic(od)} – ${denMesic(doKdy)} ${doKdy.slice(0, 4)}`;
  }
  return 'za celou dobu';
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

export type PotrebaKegu = {
  /** Průměrný počet sudů stočených za týden. */
  tyden: number;
  /** Průměrný počet sudů stočených za měsíc. */
  mesic: number;
  /** Z kolika ukončených týdnů se průměr počítal (0 = není z čeho). */
  tydnu: number;
  /** Z kolika ukončených měsíců se průměr počítal. */
  mesicu: number;
};

/**
 * 🛢️ Průměrná potřeba sudů — kolik KUSŮ sudů se průměrně stočí za týden
 * a za měsíc.
 *
 * Schválně v KUSECH, ne v hektolitrech: tohle číslo odpovídá na otázku
 * „kolik sudů musím mít doma umytých a připravených", a na tu se v
 * hektolitrech odpovědět nedá — padesátka i desítka je pořád jeden sud,
 * který někde musí stát.
 *
 * Počítá se z UKONČENÝCH období, běžící týden a měsíc se vynechávají:
 * v pondělí ráno je stočeno skoro nic, a kdyby se ten týden počítal,
 * průměr by spadl z důvodu, který s potřebou sudů nesouvisí.
 *
 * Záporné řádky (manko z inventury, viz lib/inventoryFix.ts) se počítají
 * jako všude jinde — snižují výsledek, protože se to pivo nestočilo.
 */
export function prumernaPotrebaKegu(
  radky: VyrobniRadek[],
  obaly: Map<string, Obal>,
  dnes: string,
  oken = 12,
): PotrebaKegu {
  const jeSud = (id: string | null) => !!id && obaly.get(id)?.kind === 'keg';

  // ── Týdny: `oken` ukončených týdnů před tím, do kterého spadá `dnes`.
  const tentoPondeli = pondeliTydne(dnes);
  const prvniPondeli = posunDnu(tentoPondeli, -7 * oken);
  let kusyTydny = 0;
  // ── Měsíce: `oken` ukončených měsíců před měsícem `dnes`.
  const tentoMesic = dnes.slice(0, 7);
  const prvniMesic = posunMesicu(tentoMesic, -oken);
  let kusyMesice = 0;

  for (const r of radky) {
    if (!r.entry_date || !jeSud(r.package_id)) continue;
    const ks = Number(r.quantity || 0);
    if (r.entry_date >= prvniPondeli && r.entry_date < tentoPondeli) kusyTydny += ks;
    const m = r.entry_date.slice(0, 7);
    if (m >= prvniMesic && m < tentoMesic) kusyMesice += ks;
  }

  return {
    tyden: kusyTydny / oken,
    mesic: kusyMesice / oken,
    tydnu: oken,
    mesicu: oken,
  };
}

export function formatHl(litry: number): string {
  const v = hl(litry);
  return v.toLocaleString('cs-CZ', { maximumFractionDigits: v >= 100 ? 0 : 1 });
}
