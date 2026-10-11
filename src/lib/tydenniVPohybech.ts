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
  /** Co appka čekala v okamžiku počítání. */
  ocekavano: number;
  /** napočítáno − čekáno při počítání. */
  rozdil: number;
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
      napocitano: n, ocekavano, rozdil: n - ocekavano,
      ted: teď.get(klic)?.qty ?? 0,
      kDniPocitani: stavKDni(den > p.dnes ? p.dnes : den, klic),
      vyreseno: z.vyreseno ?? null,
    });
  }
  return out.sort((a, b) => a.den.localeCompare(b.den));
}
