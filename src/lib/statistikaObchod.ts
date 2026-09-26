// 💰📈 Statistika — tržby, meziroční srovnání piv, odpisy v čase a to, kdo
// by měl brzy objednat. Zadání 26. 9. 2026 („zbytek udělej" k návrhům
// 1, 2, 4 a 5).
//
// Pravidla jsou stejná jako ve zbytku Statistiky (lib/statistika.ts):
//  • objednávka patří ke DNI ZÁVOZU (bez něj ke dni zadání), storno se
//    nepočítá, odběratel se pozná podle jména;
//  • výstav = stočené SUDY (lahve se plní z nich, viz podilSudyLahve).
// Cena se bere k DATU OBJEDNÁVKY — stejně jako v detailu objednávky
// (OrderDetail → hodnotaObjednavky), ať se čísla na dvou místech neliší.
import { cenaKeDni, type CenaPolozky } from './hodnotaObjednavky';
import { litryRadku, posunDnu, posunMesicu, type Obal, type Pivo, type VyrobniRadek } from './statistika';

type Objednavka = { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string };
type Polozka = { order_id: string; beer_id: string | null; package_id: string | null; quantity: number | null };

const jmenoOdberatele = (o: Objednavka) => o.place_name || 'Neuvedený odběratel';
const denZavozu = (o: Objednavka) => o.delivery_date || o.order_date;

function rozdilDnu(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000);
}

/** Kolik je položka hodná podle ceníku k datu objednávky (null = cena chybí). */
function hodnotaPolozky(p: Polozka, cenik: CenaPolozky[], datum: string): number | null {
  if (!p.beer_id || !p.package_id) return null;
  const cena = cenaKeDni(cenik, p.beer_id, p.package_id, datum);
  if (!cena) return null;
  return cena.price_per_unit * Number(p.quantity || 0);
}

export type TrzbaMesice = { mesic: string; castka: number; bezCeny: number };

/**
 * Tržby podle ceníku po měsících (podle dne závozu) — `mesicu` měsíců
 * končících `konecMesic`. `bezCeny` = kolik položek nemá v ceníku platnou
 * cenu; do částky se nepočítají (a obrazovka to řekne).
 */
export function trzbyPoMesicich(
  objednavky: Objednavka[],
  polozky: Polozka[],
  cenik: CenaPolozky[],
  konecMesic: string,
  mesicu = 12,
): TrzbaMesice[] {
  const mesice = Array.from({ length: mesicu }, (_, i) => posunMesicu(konecMesic, i - (mesicu - 1)));
  const out = new Map(mesice.map((m) => [m, { mesic: m, castka: 0, bezCeny: 0 }]));
  const podleId = new Map<string, Objednavka>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    if (out.has(denZavozu(o).slice(0, 7))) podleId.set(o.id, o);
  }
  for (const p of polozky) {
    const o = podleId.get(p.order_id);
    if (!o) continue;
    const z = out.get(denZavozu(o).slice(0, 7))!;
    const h = hodnotaPolozky(p, cenik, o.order_date);
    if (h === null) z.bezCeny++; else z.castka += h;
  }
  return mesice.map((m) => out.get(m)!);
}

export type TrzbaOdberatele = { nazev: string; castka: number; objednavek: number; bezCeny: number };

/** Odběratelé podle tržeb v rozsahu dnů závozu [od, doKdy]. */
export function trzbyPodleOdberatelu(
  objednavky: Objednavka[],
  polozky: Polozka[],
  cenik: CenaPolozky[],
  od: string,
  doKdy: string,
): TrzbaOdberatele[] {
  const podleId = new Map<string, Objednavka>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const den = denZavozu(o);
    if (den < od || den > doKdy) continue;
    podleId.set(o.id, o);
  }
  const out = new Map<string, TrzbaOdberatele & { ids: Set<string> }>();
  for (const p of polozky) {
    const o = podleId.get(p.order_id);
    if (!o) continue;
    const jmeno = jmenoOdberatele(o);
    const z = out.get(jmeno) ?? { nazev: jmeno, castka: 0, objednavek: 0, bezCeny: 0, ids: new Set<string>() };
    const h = hodnotaPolozky(p, cenik, o.order_date);
    if (h === null) z.bezCeny++; else z.castka += h;
    z.ids.add(o.id);
    out.set(jmeno, z);
  }
  return [...out.values()]
    .map(({ ids, ...z }) => ({ ...z, objednavek: ids.size }))
    .sort((a, b) => b.castka - a.castka);
}

export type MezirocniPivo = { id: string; nazev: string; letos: number; loni: number; zmena: number | null };

/**
 * Výstav (sudy) po pivech: letos od 1. 1. do `dnes` proti STEJNÉMU úseku
 * loni (1. 1. až tentýž den). Celý loňský rok by letošek v září vždycky
 * „prohrál" — srovnávají se stejně dlouhá období.
 */
export function mezirocniPodlePiv(
  sudy: VyrobniRadek[],
  obaly: Map<string, Obal>,
  piva: Pivo[],
  dnes: string,
): MezirocniPivo[] {
  const rok = Number(dnes.slice(0, 4));
  const letosOd = `${rok}-01-01`;
  const loniOd = `${rok - 1}-01-01`;
  const loniDo = `${rok - 1}${dnes.slice(4)}`;
  const letos = new Map<string, number>();
  const loni = new Map<string, number>();
  for (const r of sudy) {
    if (!r.entry_date || !r.beer_id) continue;
    const l = litryRadku(r, obaly);
    if (r.entry_date >= letosOd && r.entry_date <= dnes) letos.set(r.beer_id, (letos.get(r.beer_id) ?? 0) + l);
    else if (r.entry_date >= loniOd && r.entry_date <= loniDo) loni.set(r.beer_id, (loni.get(r.beer_id) ?? 0) + l);
  }
  const ids = new Set([...letos.keys(), ...loni.keys()]);
  return [...ids]
    .map((id) => {
      const a = letos.get(id) ?? 0;
      const b = loni.get(id) ?? 0;
      return {
        id,
        nazev: piva.find((p) => p.id === id)?.name ?? 'Neznámé pivo',
        letos: a,
        loni: b,
        zmena: b > 0 ? ((a - b) / b) * 100 : null,
      };
    })
    .sort((x, y) => y.letos - x.letos || y.loni - x.loni);
}

export type OdpisyMesice = { mesic: string; kusy: number; litry: number; vystavL: number; podil: number | null };

/**
 * Odpisy po měsících (kusy a litry) a jejich podíl z výstavu (stočených
 * sudů) téhož měsíce — ať jde poznat, jestli ztráty rostou.
 */
export function odpisyPoMesicich(
  odpisy: VyrobniRadek[],
  sudy: VyrobniRadek[],
  obaly: Map<string, Obal>,
  konecMesic: string,
  mesicu = 12,
): OdpisyMesice[] {
  const mesice = Array.from({ length: mesicu }, (_, i) => posunMesicu(konecMesic, i - (mesicu - 1)));
  const out = new Map(mesice.map((m) => [m, { mesic: m, kusy: 0, litry: 0, vystavL: 0, podil: null as number | null }]));
  for (const r of odpisy) {
    const z = r.entry_date ? out.get(r.entry_date.slice(0, 7)) : undefined;
    if (!z) continue;
    z.kusy += Number(r.quantity || 0);
    z.litry += litryRadku(r, obaly);
  }
  for (const r of sudy) {
    const z = r.entry_date ? out.get(r.entry_date.slice(0, 7)) : undefined;
    if (z) z.vystavL += litryRadku(r, obaly);
  }
  return mesice.map((m) => {
    const z = out.get(m)!;
    return { ...z, podil: z.vystavL > 0 ? (z.litry / z.vystavL) * 100 : null };
  });
}

export type BrzyObjedna = {
  nazev: string;
  /** Typický odstup mezi závozy ve dnech (medián). */
  kazdychDni: number;
  posledni: string;
  /** Kdy by podle zvyku měl přijít další závoz. */
  ocekavane: string;
  /** Kladné = o kolik dní je po termínu; záporné = za kolik dní termín bude. */
  poTerminu: number;
  zavozu: number;
};

/**
 * Kdo by měl podle svého zvyku brzy objednat (nebo už měl).
 *
 * Pro odběratele s aspoň `minZavozu` závozy se spočítá MEDIÁN odstupu mezi
 * po sobě jdoucími dny závozu (průměr by jeden dlouhý výpadek rozhodil).
 * Kdo má už naplánovaný budoucí závoz, není na seznamu — objednal. Kdo mlčí
 * víc než `prahDnu`, taky ne: ten je v kartě „Kdo přestal objednávat".
 */
export function kdoBrzyObjedna(
  objednavky: Objednavka[],
  dnes: string,
  { minZavozu = 3, dopredu = 3, prahDnu = 60 }: { minZavozu?: number; dopredu?: number; prahDnu?: number } = {},
): BrzyObjedna[] {
  const dny = new Map<string, Set<string>>();
  const maBudouci = new Set<string>();
  for (const o of objednavky) {
    if (o.status === 'storno') continue;
    const den = denZavozu(o);
    if (!den) continue;
    const jmeno = jmenoOdberatele(o);
    if (den > dnes) { maBudouci.add(jmeno); continue; }
    const s = dny.get(jmeno) ?? new Set<string>();
    s.add(den);
    dny.set(jmeno, s);
  }
  const out: BrzyObjedna[] = [];
  dny.forEach((mnozina, nazev) => {
    if (maBudouci.has(nazev) || mnozina.size < minZavozu) return;
    const serazene = [...mnozina].sort();
    const odstupy = serazene.slice(1).map((d, i) => rozdilDnu(serazene[i], d)).sort((a, b) => a - b);
    const stred = Math.floor(odstupy.length / 2);
    const kazdychDni = odstupy.length % 2 ? odstupy[stred] : Math.round((odstupy[stred - 1] + odstupy[stred]) / 2);
    const posledni = serazene[serazene.length - 1];
    if (kazdychDni <= 0 || rozdilDnu(posledni, dnes) >= prahDnu) return;
    const ocekavane = posunDnu(posledni, kazdychDni);
    const poTerminu = rozdilDnu(ocekavane, dnes);
    if (poTerminu < -dopredu) return;
    out.push({ nazev, kazdychDni, posledni, ocekavane, poTerminu, zavozu: mnozina.size });
  });
  return out.sort((a, b) => b.poTerminu - a.poTerminu);
}
