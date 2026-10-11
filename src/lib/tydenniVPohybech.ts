// 🧮 Týdenní inventura v Pohybech skladu — napočítaná čísla vedle evidence.
// ---------------------------------------------------------------------------
// 11. 10. 2026: „v pohybech chci vidět i hodnoty týdenní inventury, tu jsem
// ji v pátek zadával, chci to číslo vidět, jestli sedí s realitou."
//
// Ukazuje, co se napočítalo (a kdy), co appka v tu chvíli čekala (uložené
// při počítání) a jaký je stav skladu TEĎ — z toho je vidět, jestli se číslo
// od počítání změnilo a o kolik.
import { stockAsOf, stockKey, type Movement } from './stockLedger';

export type ZaznamTydenniInventury = {
  tyden_od: string;
  tyden_do: string;
  beer_id: string | null;
  package_id: string | null;
  ocekavano: number | string | null;
  napocitano: number | string | null;
  rozdil?: number | string | null;
  vyreseno?: string | null;
  updated_at?: string | null;
};

export type RadekTydenniInventury = {
  beer_id: string;
  package_id: string;
  tyden_od: string;
  /** Den počítání (podle času uložení), když se dá zjistit. */
  den: string;
  napocitano: number;
  /** Co appka čekala v okamžiku počítání. null = rozepsané, ještě neuložené. */
  ocekavano: number | null;
  /** napočítáno − čekáno při počítání (rozepsané: napočítáno − sklad teď). */
  rozdil: number;
  /** Zadané v týdenní inventuře, ale ještě neuložené („Uložit vše") — leží jen v tomhle zařízení. */
  rozepsano: boolean;
  /** Stav skladu teď (skladová kniha). */
  ted: number;
  /** Stav skladu k dni počítání (po jeho pohybech). */
  kDniPocitani: number;
  vyreseno: string | null;
};

export function radkyTydenniInventury(p: {
  zaznamy: ZaznamTydenniInventury[];
  pohyby: Movement[];
  od: string;
  doDne: string;
  beerId?: string;
  packageId?: string;
  dnes: string;
  denPodleCasu: (iso: string) => string;
  /** Rozepsané počty: pondělí týdne → (klíč pivo__obal → text z políčka). */
  koncepty?: Record<string, Record<string, string>>;
}): RadekTydenniInventury[] {
  const teď = stockAsOf(p.pohyby, p.dnes);
  const keDni = new Map<string, Map<string, { qty: number }>>();
  const stavKDni = (den: string, klic: string) => {
    let m = keDni.get(den);
    if (!m) { m = stockAsOf(p.pohyby, den) as unknown as Map<string, { qty: number }>; keDni.set(den, m); }
    return m.get(klic)?.qty ?? 0;
  };
  const out: RadekTydenniInventury[] = [];
  for (const z of p.zaznamy) {
    if (!z.beer_id || !z.package_id || z.napocitano == null) continue;
    if (z.tyden_do < p.od || z.tyden_od > p.doDne) continue;
    if (p.beerId && z.beer_id !== p.beerId) continue;
    if (p.packageId && z.package_id !== p.packageId) continue;
    const n = Number(z.napocitano);
    if (!Number.isFinite(n)) continue;
    const klic = stockKey(z.beer_id, z.package_id);
    const den = z.updated_at ? p.denPodleCasu(z.updated_at) : z.tyden_do;
    const ocekavano = Number(z.ocekavano ?? 0);
    out.push({
      beer_id: z.beer_id, package_id: z.package_id, tyden_od: z.tyden_od, den,
      napocitano: n, ocekavano, rozdil: n - ocekavano, rozepsano: false,
      ted: teď.get(klic)?.qty ?? 0,
      kDniPocitani: stavKDni(den > p.dnes ? p.dnes : den, klic),
      vyreseno: z.vyreseno ?? null,
    });
  }
  // Rozepsané (neuložené) počty — co v databázi pro týž týden a položku není.
  const ulozene = new Set(p.zaznamy.map((z) => `${z.tyden_od}|${z.beer_id}__${z.package_id}`));
  for (const [tydenOd, polozky] of Object.entries(p.koncepty ?? {})) {
    const tydenDo = new Date(tydenOd + 'T00:00:00Z');
    tydenDo.setUTCDate(tydenDo.getUTCDate() + 6);
    const doISO = tydenDo.toISOString().slice(0, 10);
    if (doISO < p.od || tydenOd > p.doDne) continue;
    for (const [klic, text] of Object.entries(polozky ?? {})) {
      const t = String(text ?? '').trim().replace(',', '.');
      if (t === '' || ulozene.has(`${tydenOd}|${klic}`)) continue;
      const n = Number(t);
      if (!Number.isFinite(n)) continue;
      const [beerId, pkgId] = klic.split('__');
      if (!beerId || !pkgId) continue;
      if (p.beerId && beerId !== p.beerId) continue;
      if (p.packageId && pkgId !== p.packageId) continue;
      const ted = teď.get(klic)?.qty ?? 0;
      out.push({
        beer_id: beerId, package_id: pkgId, tyden_od: tydenOd, den: p.dnes,
        napocitano: n, ocekavano: null, rozdil: n - ted, rozepsano: true,
        ted, kDniPocitani: ted, vyreseno: null,
      });
    }
  }
  return out.sort((a, b) => a.den.localeCompare(b.den));
}
