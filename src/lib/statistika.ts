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

/** Kolik kusů a litrů konkrétního obalu — řádek rozpadu. */
export type ObalKusy = { id: string; nazev: string; kusy: number; litry: number };

export type OdberatelRadek = {
  nazev: string;
  litry: number;
  kusy: number;
  objednavek: number;
  /**
   * Rozpad na KONKRÉTNÍ obaly, seřazený od největšího objemu.
   *
   * Souhrnné „16 ks" je pro plánování stáčení k ničemu — šest padesátek
   * a deset PET lahví je úplně jiná práce než šestnáct třicítek. Proto se
   * u každého odběratele drží i to, do čeho se mu vozí.
   */
  obaly: ObalKusy[];
};

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
  const obalyJmena = new Map<string, Map<string, ObalKusy>>();
  for (const p of polozky) {
    const jmeno = vRozsahu.get(p.order_id);
    if (!jmeno) continue;
    const zaznam = podleJmena.get(jmeno) ?? { nazev: jmeno, litry: 0, kusy: 0, objednavek: 0, obaly: [] };
    const ks = Number(p.quantity || 0);
    const litry = ks * objem(p.package_id ? obaly.get(p.package_id) : undefined);
    zaznam.litry += litry;
    zaznam.kusy += ks;
    podleJmena.set(jmeno, zaznam);
    const mnozina = objednavkyJmena.get(jmeno) ?? new Set<string>();
    mnozina.add(p.order_id);
    objednavkyJmena.set(jmeno, mnozina);
    if (p.package_id) {
      const naObal = obalyJmena.get(jmeno) ?? new Map<string, ObalKusy>();
      const o = naObal.get(p.package_id)
        ?? { id: p.package_id, nazev: obaly.get(p.package_id)?.label ?? 'Neznámý obal', kusy: 0, litry: 0 };
      o.kusy += ks;
      o.litry += litry;
      naObal.set(p.package_id, o);
      obalyJmena.set(jmeno, naObal);
    }
  }
  return [...podleJmena.values()]
    .map((z) => ({
      ...z,
      objednavek: objednavkyJmena.get(z.nazev)?.size ?? 0,
      obaly: [...(obalyJmena.get(z.nazev)?.values() ?? [])].sort((a, b) => b.litry - a.litry),
    }))
    .sort((a, b) => b.litry - a.litry);
}

/** Změna proti předchozímu období v procentech; null když není s čím srovnat. */
export function zmenaProcent(ted: number, drive: number): number | null {
  if (drive <= 0) return null;
  return ((ted - drive) / drive) * 100;
}

export const hl = (litry: number): number => litry / 100;

/** Průměrná potřeba JEDNÉ velikosti sudu. */
export type PotrebaObalu = { id: string; nazev: string; tyden: number; mesic: number };

export type PotrebaKegu = {
  /** Průměrný počet sudů stočených za týden. */
  tyden: number;
  /** Průměrný počet sudů stočených za měsíc. */
  mesic: number;
  /** Z kolika ukončených týdnů se průměr počítal (0 = není z čeho). */
  tydnu: number;
  /** Z kolika ukončených měsíců se průměr počítal. */
  mesicu: number;
  /**
   * Rozpad na KONKRÉTNÍ velikosti sudů, seřazený od nejžádanější.
   *
   * Souhrnné „18 sudů týdně" se nedá použít: neřekne, jestli mít připravené
   * padesátky, nebo třicítky, a přitom právě tohle je ta otázka. Součet
   * řádků dává `tyden` / `mesic`.
   */
  obaly: PotrebaObalu[];
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

  // Tentýž průchod vede i rozpad na velikosti sudů — jedna smyčka, jedna
  // definice toho, co se do průměru počítá.
  const naObal = new Map<string, { tydny: number; mesice: number }>();

  for (const r of radky) {
    if (!r.entry_date || !jeSud(r.package_id)) continue;
    const ks = Number(r.quantity || 0);
    const zaznam = naObal.get(r.package_id!) ?? { tydny: 0, mesice: 0 };
    if (r.entry_date >= prvniPondeli && r.entry_date < tentoPondeli) {
      kusyTydny += ks;
      zaznam.tydny += ks;
    }
    const m = r.entry_date.slice(0, 7);
    if (m >= prvniMesic && m < tentoMesic) {
      kusyMesice += ks;
      zaznam.mesice += ks;
    }
    naObal.set(r.package_id!, zaznam);
  }

  return {
    tyden: kusyTydny / oken,
    mesic: kusyMesice / oken,
    tydnu: oken,
    mesicu: oken,
    obaly: [...naObal.entries()]
      .map(([id, v]) => ({
        id,
        nazev: obaly.get(id)?.label ?? 'Neznámý obal',
        tyden: v.tydny / oken,
        mesic: v.mesice / oken,
      }))
      // Obal, který v obou oknech vyšel na nulu, jen zabírá místo.
      .filter((o) => o.tyden !== 0 || o.mesic !== 0)
      .sort((a, b) => b.tyden - a.tyden || b.mesic - a.mesic),
  };
}

/** Řádek tabulky „v číslech" — podíl plus srovnání s minulým obdobím. */
export type CisloRadek = PodilRadek & { zmena: number | null };

/**
 * 📦 Obaly v číslech — kolik KUSŮ konkrétního obalu za zvolené období,
 * se srovnáním proti období předchozímu.
 *
 * Zadání 23. 9. 2026: „nestojim o data kolik celkem bylo stoceny lahvi
 * a kegu najednou (udaj k nicemu, je potreba vedet konkretni obaly kolik
 * za jaky obdobi)." Proto je řádek = jeden obal, ne „sudy" a „lahve".
 *
 * Sudy a lahve se ZÁMĚRNĚ počítají odděleně (volá se to dvakrát): sečíst
 * je do jednoho podílu by tentýž objem počítalo dvakrát, protože se lahvuje
 * z už stočených sudů.
 */
export function obalyVCislech(
  radky: VyrobniRadek[],
  obaly: Map<string, Obal>,
  od: string,
  doKdy: string,
  predchozi: { od: string; do: string } | null,
): CisloRadek[] {
  const ted = podilPodleObalu(radky, obaly, od, doKdy);
  const drive = predchozi ? podilPodleObalu(radky, obaly, predchozi.od, predchozi.do) : [];
  return ted.map((r) => ({
    ...r,
    zmena: predchozi ? zmenaProcent(r.litry, drive.find((d) => d.id === r.id)?.litry ?? 0) : null,
  }));
}

/**
 * Totéž pro piva. Dřív se předchozí období dopočítávalo přímo v tabulce,
 * uvnitř `.map()` — tedy celý průchod daty na KAŽDÝ řádek. Tohle je jeden
 * průchod navíc, ne jeden na pivo.
 */
export function pivaVCislech(
  radky: VyrobniRadek[],
  obaly: Map<string, Obal>,
  piva: Pivo[],
  od: string,
  doKdy: string,
  predchozi: { od: string; do: string } | null,
): CisloRadek[] {
  const ted = podilPodlePiva(radky, obaly, piva, od, doKdy);
  const drive = predchozi ? podilPodlePiva(radky, obaly, piva, predchozi.od, predchozi.do) : [];
  return ted.map((r) => ({
    ...r,
    zmena: predchozi ? zmenaProcent(r.litry, drive.find((d) => d.id === r.id)?.litry ?? 0) : null,
  }));
}

/**
 * 📈 Litry po obdobích A obalech — podklad pro stohovaný graf.
 *
 * Klíč vnější mapy určuje volající (`litryPoMesicich` používá `RRRR-MM`,
 * `litryPoTydnech` pondělí), aby bucketů nebyla druhá definice; vnitřní
 * mapa je `id obalu → litry`.
 */
export function litryPoObdobiAObalech(
  radky: VyrobniRadek[],
  obaly: Map<string, Obal>,
  klic: (datum: string) => string,
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const r of radky) {
    if (!r.entry_date || !r.package_id) continue;
    const k = klic(r.entry_date);
    const vnitrni = out.get(k) ?? new Map<string, number>();
    vnitrni.set(r.package_id, (vnitrni.get(r.package_id) ?? 0) + litryRadku(r, obaly));
    out.set(k, vnitrni);
  }
  return out;
}

/** Obaly, které se v datech vůbec vyskytují, seřazené od nejobjemnějšího. */
export function obalyVDatech(radky: VyrobniRadek[], obaly: Map<string, Obal>): { id: string; nazev: string }[] {
  return podilPodleObalu(radky, obaly, '0000-01-01', '9999-12-31').map((o) => ({ id: o.id, nazev: o.nazev }));
}

export type SpiciOdberatel = {
  nazev: string;
  /** Den posledního závozu. */
  posledni: string;
  /** Kolik dní od něj uplynulo. */
  dnu: number;
  /** Kolik hektolitrů u něj za celou dobu proteklo — čím víc, tím víc bolí. */
  litry: number;
  objednavek: number;
};

/** Kolik dní je mezi dvěma dny (kladné, když je `b` později). */
function rozdilDnu(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/**
 * 💤 Odběratelé, kteří dřív brali a teď už ne.
 *
 * Tohle je jediné číslo ve Statistice, které mluví o ztracených penězích —
 * všechno ostatní ukazuje, co se stalo, tohle ukazuje, co se přestalo dít.
 *
 * Jednorázový odběratel (jediná objednávka za celou dobu) se nepočítá:
 * ten nic nepřestal, ten jednou přijel. Bere se den závozu, jako všude
 * jinde ve Statistice.
 */
export function kdoPrestalObjednavat(
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[],
  polozky: { order_id: string; package_id: string | null; quantity: number | null }[],
  obaly: Map<string, Obal>,
  dnes: string,
  prahDnu = 60,
): SpiciOdberatel[] {
  const jmenoObjednavky = new Map<string, string>();
  const denObjednavky = new Map<string, string>();
  const posledni = new Map<string, string>();
  const pocet = new Map<string, number>();
  for (const o of orders) {
    if (o.status === 'storno') continue;
    const den = o.delivery_date || o.order_date;
    if (!den || den > dnes) continue; // naplánovaný budoucí závoz není mlčení
    const jmeno = o.place_name || 'Neuvedený odběratel';
    jmenoObjednavky.set(o.id, jmeno);
    denObjednavky.set(o.id, den);
    if (!posledni.has(jmeno) || den > posledni.get(jmeno)!) posledni.set(jmeno, den);
    pocet.set(jmeno, (pocet.get(jmeno) ?? 0) + 1);
  }

  const litry = new Map<string, number>();
  for (const p of polozky) {
    const jmeno = jmenoObjednavky.get(p.order_id);
    if (!jmeno) continue;
    litry.set(jmeno, (litry.get(jmeno) ?? 0) + Number(p.quantity || 0) * objem(p.package_id ? obaly.get(p.package_id) : undefined));
  }

  return [...posledni.entries()]
    .filter(([jmeno, den]) => (pocet.get(jmeno) ?? 0) > 1 && rozdilDnu(den, dnes) >= prahDnu)
    .map(([jmeno, den]) => ({
      nazev: jmeno,
      posledni: den,
      dnu: rozdilDnu(den, dnes),
      litry: litry.get(jmeno) ?? 0,
      objednavek: pocet.get(jmeno) ?? 0,
    }))
    .sort((a, b) => b.litry - a.litry);
}

export type RozpocetObalu = {
  id: string;
  nazev: string;
  /** Kolik kusů téhle velikosti se za období stočilo. */
  stoceno: number;
  fasovano: number;
  odpisy: number;
  /** Kolik kusů je na objednávkách se závozem v tomhle období. */
  objednano: number;
  /** Stočeno − fasováno − odpisy. Kladné číslo = nerozpočtené sudy. */
  nerozpocteno: number;
};

/**
 * 🛢️ Rozpočet sudů — co se stočilo proti tomu, co se vyfasovalo a odepsalo,
 * po KONKRÉTNÍCH velikostech.
 *
 * Vzorec `stočeno − fasováno − odpisy` je tentýž, jaký ukazovaly měsíční
 * přehledy jako „Ztráty KEG"; jediný rozdíl je, že se počítá za zvolené
 * období a s rozpadem na velikosti. Souhrn totiž neřekne, kde se sudy
 * ztrácejí — a ony se neztrácejí rovnoměrně.
 *
 * Objednané kusy jsou vedle jako kontext (podle dne závozu, jako všude ve
 * Statistice), do rozdílu ZÁMĚRNĚ nevstupují: objednávka není pohyb skladu.
 */
export function rozpocetSudu(
  staceni: VyrobniRadek[],
  fasovani: VyrobniRadek[],
  odpisy: VyrobniRadek[],
  orders: { id: string; delivery_date: string | null; order_date: string; status: string }[],
  polozky: { order_id: string; package_id: string | null; quantity: number | null }[],
  obaly: Map<string, Obal>,
  od: string,
  doKdy: string,
): RozpocetObalu[] {
  const jeSud = (id: string | null | undefined) => !!id && obaly.get(id)?.kind === 'keg';
  const secti = (radky: VyrobniRadek[]) => {
    const m = new Map<string, number>();
    for (const r of radky) {
      if (!r.entry_date || r.entry_date < od || r.entry_date > doKdy || !jeSud(r.package_id)) continue;
      m.set(r.package_id!, (m.get(r.package_id!) ?? 0) + Number(r.quantity || 0));
    }
    return m;
  };

  const stoceno = secti(staceni);
  const vyfasovano = secti(fasovani);
  const odepsano = secti(odpisy);

  const vRozsahu = new Set<string>();
  for (const o of orders) {
    if (o.status === 'storno') continue;
    const den = o.delivery_date || o.order_date;
    if (den && den >= od && den <= doKdy) vRozsahu.add(o.id);
  }
  const objednano = new Map<string, number>();
  for (const p of polozky) {
    if (!vRozsahu.has(p.order_id) || !jeSud(p.package_id)) continue;
    objednano.set(p.package_id!, (objednano.get(p.package_id!) ?? 0) + Number(p.quantity || 0));
  }

  const vsechny = new Set([...stoceno.keys(), ...vyfasovano.keys(), ...odepsano.keys(), ...objednano.keys()]);
  return [...vsechny]
    .map((id) => {
      const s = stoceno.get(id) ?? 0;
      const f = vyfasovano.get(id) ?? 0;
      const w = odepsano.get(id) ?? 0;
      return {
        id,
        nazev: obaly.get(id)?.label ?? 'Neznámý obal',
        stoceno: s,
        fasovano: f,
        odpisy: w,
        objednano: objednano.get(id) ?? 0,
        nerozpocteno: s - f - w,
      };
    })
    .sort((a, b) => b.stoceno - a.stoceno);
}

export function formatHl(litry: number): string {
  const v = hl(litry);
  return v.toLocaleString('cs-CZ', { maximumFractionDigits: v >= 100 ? 0 : 1 });
}

/**
 * Objednané kusy po měsících (podle data ZADÁNÍ objednávky), bez storna.
 *
 * Dřív se to v History.tsx počítalo tak, že se pro KAŽDOU objednávku znovu
 * procházely VŠECHNY položky — při tisícovce objednávek a pár tisících
 * položek miliony porovnání při každém otevření Statistiky. Tady se položky
 * jednou roztřídí podle objednávky; výsledek je stejný (test to porovnává
 * s původním postupem, i v pořadí sčítání).
 */
export function objednanoPoMesicich(
  objednavky: { id: string; order_date: string; status: string }[],
  polozky: { order_id: string; quantity: number | string | null }[],
): Map<string, number> {
  const podleObjednavky = new Map<string, (number | string | null)[]>();
  for (const p of polozky) {
    const seznam = podleObjednavky.get(p.order_id);
    if (seznam) seznam.push(p.quantity); else podleObjednavky.set(p.order_id, [p.quantity]);
  }
  const out = new Map<string, number>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const mk = o.order_date.slice(0, 7);
    for (const q of podleObjednavky.get(o.id) ?? []) {
      out.set(mk, (out.get(mk) ?? 0) + Number(q));
    }
  }
  return out;
}

/**
 * Pro každou dvojici pivo+obal první objednávka (v pořadí seznamu, bez storna),
 * která ji obsahuje — kam vede klepnutí na řádek v Podrobném hledání.
 *
 * Dřív se to hledalo při vykreslení KAŽDÉHO řádku znovu přes všechny
 * objednávky a jejich položky, a to dvakrát (karty pro telefon i tabulka
 * jsou v stránce obě, jen jedna je schovaná).
 */
export function prvniObjednavkaPodlePolozky(
  objednavky: { id: string; status: string }[],
  polozkyPodleObjednavky: Record<string, { beer_id: string | null; package_id: string | null }[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    for (const i of polozkyPodleObjednavky[o.id] ?? []) {
      const klic = `${i.beer_id}__${i.package_id}`;
      if (!out.has(klic)) out.set(klic, o.id);
    }
  }
  return out;
}

/**
 * Podíl KEG vs lahve za období.
 *
 * Lahvuje se z už stočených sudů, takže lahve jsou ČÁST výstavu, ne něco
 * navíc: v sudech zůstalo „výstav − přestočeno do lahví". Sečíst výstav
 * s lahvemi by tentýž objem počítalo dvakrát (viz komentář ve
 * StatistikaVystav.tsx). Když se v období lahvovalo víc, než se stočilo
 * (lahve ze sudů stočených dřív), sudy vyjdou na nulu a `zDrivejsich` to
 * řekne, ať to nevypadá jako chyba.
 */
export function podilSudyLahve(vystavL: number, doLahviL: number): {
  sudyL: number; lahveL: number; podilSudy: number; podilLahve: number; zDrivejsich: boolean;
} {
  const lahveL = Math.max(0, doLahviL);
  const sudyL = Math.max(0, vystavL - lahveL);
  const celkem = sudyL + lahveL;
  return {
    sudyL,
    lahveL,
    podilSudy: celkem > 0 ? sudyL / celkem : 0,
    podilLahve: celkem > 0 ? lahveL / celkem : 0,
    zDrivejsich: lahveL > vystavL,
  };
}

/**
 * Jak odběratel objednával v čase — hektolitry a kusy po měsících za
 * `mesicu` měsíců končících měsícem `konecMesic` (RRRR-MM). Stejná pravidla
 * jako podleOdberatelu: den závozu (jinak den zadání), bez storna, odběratel
 * podle jména — takže součet měsíce sedí s řádkem v žebříčku.
 */
export function odberatelPoMesicich(
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[],
  polozky: { order_id: string; package_id: string | null; quantity: number | null }[],
  obaly: Map<string, Obal>,
  nazev: string,
  konecMesic: string,
  mesicu = 12,
): { mesic: string; litry: number; kusy: number }[] {
  const mesice = Array.from({ length: mesicu }, (_, i) => posunMesicu(konecMesic, i - (mesicu - 1)));
  const out = new Map(mesice.map((m) => [m, { mesic: m, litry: 0, kusy: 0 }]));
  const mesicObjednavky = new Map<string, string>();
  for (const o of orders) {
    if (o.status === 'storno') continue;
    if ((o.place_name || 'Neuvedený odběratel') !== nazev) continue;
    const den = o.delivery_date || o.order_date;
    if (!den) continue;
    const m = den.slice(0, 7);
    if (out.has(m)) mesicObjednavky.set(o.id, m);
  }
  for (const p of polozky) {
    const m = mesicObjednavky.get(p.order_id);
    if (!m) continue;
    const z = out.get(m)!;
    const ks = Number(p.quantity || 0);
    z.kusy += ks;
    z.litry += ks * objem(p.package_id ? obaly.get(p.package_id) : undefined);
  }
  return mesice.map((m) => out.get(m)!);
}
