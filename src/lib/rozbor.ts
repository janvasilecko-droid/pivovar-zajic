// 🔎 Řádky obrazovky Rozbor — objednané I stočené položky týdne.
// ---------------------------------------------------------------------------
// Do 9. 10. 2026 Rozbor bral jen položky s objednávkou. Lahve se ale stáčí
// hlavně do zásoby (prodejna, fasování) bez objednávky — v Rozboru pak
// stočení lahví vůbec nebylo („nemám v rozboru započítané stáčení lahví").
// Teď je v něm každé pivo + obal, které se tento týden stočilo nebo
// objednalo, a u každého stočeno / objednáno / skladem.

export type PolozkaPlanuRozboru = {
  key: string;
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  ordered: number;
  missing: number;
  dluh?: number;
};

export type StoceniRozboru = { entry_date?: string | null; beer_id?: string | null; package_id?: string | null; quantity?: number | string | null };

export type RadekRozboru = {
  key: string;
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  /** Stočeno tento týden (sudy i lahve). */
  stoceno: number;
  objednano: number;
  stocit: number;
  dluh: number;
  /** Stav skladem teď (skladová kniha); null = neznámý. */
  skladem: number | null;
  lahve: boolean;
  /**
   * Napočítáno v týdenní inventuře (11. 10. 2026: „v rozboru chci vidět
   * i počet u týdenní inventury, když je zadáno"). null = nezadáno.
   */
  inventura: InventuraRozboru | null;
};

export type InventuraRozboru = {
  kusu: number;
  den: string;
  minulyTyden: boolean;
  /** Zadané v týdenní inventuře, ale ještě neuložené („Uložit vše") — leží jen v tomhle zařízení. */
  rozepsano?: boolean;
};

/**
 * Rozepsané počty z týdenní inventuře (koncept v zařízení, klíč → text z políčka)
 * doplní to, co v databázi ještě není. Uložené v databázi má přednost
 * (stejné pravidlo jako v panelu týdenní inventury).
 */
export function slucInventuruSKonceptem(
  uložené: Map<string, InventuraRozboru>,
  koncept: Record<string, string>,
  dnes: string,
): Map<string, InventuraRozboru> {
  const out = new Map(uložené);
  for (const [klic, text] of Object.entries(koncept ?? {})) {
    const t = String(text ?? '').trim().replace(',', '.');
    if (t === '' || out.has(klic)) continue;
    const n = Number(t);
    if (!Number.isFinite(n)) continue;
    out.set(klic, { kusu: n, den: dnes, minulyTyden: false, rozepsano: true });
  }
  return out;
}

export function radkyRozboru(p: {
  planSudy: PolozkaPlanuRozboru[];
  planLahve: PolozkaPlanuRozboru[];
  kegging: StoceniRozboru[];
  bottling: StoceniRozboru[];
  od: string;
  doDne: string;
  zasoba?: Map<string, number>;
  piva: { id: string; name: string }[];
  obaly: { id: string; label: string; kind?: string | null }[];
  /** Napočítané v týdenní inventuře, klíč `beer_id__package_id`. */
  inventura?: Map<string, InventuraRozboru>;
}): RadekRozboru[] {
  const radky = new Map<string, RadekRozboru>();
  const jmenoPiva = new Map(p.piva.map((b) => [b.id, b.name]));
  const jmenoObalu = new Map(p.obaly.map((o) => [o.id, o.label]));
  const radek = (beerId: string, pkgId: string, lahve: boolean) => {
    const key = `${beerId}__${pkgId}`;
    let r = radky.get(key);
    if (!r) {
      r = {
        key, beer_id: beerId, package_id: pkgId,
        beer_name: jmenoPiva.get(beerId) ?? 'Neznámé pivo',
        package_label: jmenoObalu.get(pkgId) ?? '',
        stoceno: 0, objednano: 0, stocit: 0, dluh: 0,
        skladem: p.zasoba ? (p.zasoba.get(key) ?? 0) : null,
        lahve,
        inventura: p.inventura?.get(key) ?? null,
      };
      radky.set(key, r);
    }
    return r;
  };
  for (const [plan, lahve] of [[p.planSudy, false], [p.planLahve, true]] as const) {
    for (const it of plan) {
      if (!(it.ordered > 0)) continue;
      const r = radek(it.beer_id, it.package_id, lahve);
      r.beer_name = it.beer_name || r.beer_name;
      r.package_label = it.package_label || r.package_label;
      r.objednano += it.ordered;
      r.stocit += it.missing;
      r.dluh += it.dluh ?? 0;
    }
  }
  for (const [zapisy, lahve] of [[p.kegging, false], [p.bottling, true]] as const) {
    for (const z of zapisy) {
      const d = String(z.entry_date ?? '').slice(0, 10);
      if (!z.beer_id || !z.package_id || d < p.od || d > p.doDne) continue;
      const n = Number(z.quantity || 0);
      if (!n) continue;
      radek(z.beer_id, z.package_id, lahve).stoceno += n;
    }
  }
  // Napočítané v týdenní inventuře se ukážou, i když se s nimi tento týden
  // nic nedělo — číslo je zadané, má být vidět.
  const obalPodleId = new Map(p.obaly.map((o) => [o.id, o]));
  p.inventura?.forEach((_, key) => {
    if (radky.has(key)) return;
    const [beerId, pkgId] = key.split('__');
    if (!jmenoPiva.has(beerId) || !obalPodleId.has(pkgId)) return;
    const o = obalPodleId.get(pkgId)!;
    const sud = o.kind === 'keg' || /keg|sud/i.test(o.label ?? '');
    radek(beerId, pkgId, !sud);
  });

  // Sudy napřed, pak lahve; uvnitř podle piva a obalu.
  return [...radky.values()].sort((a, b) =>
    Number(a.lahve) - Number(b.lahve)
    || a.beer_name.localeCompare(b.beer_name, 'cs')
    || a.package_label.localeCompare(b.package_label, 'cs', { numeric: true }));
}
