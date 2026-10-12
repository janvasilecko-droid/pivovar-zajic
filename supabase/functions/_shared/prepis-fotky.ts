// 📷 Řádky přepisu fotky, které AI nevložila do položek.
// ---------------------------------------------------------------------------
// 12. 10. 2026: fotka objednávky (Radek, 22 řádků „Nx obal stupeň pivo"). AI
// přepis přečetla celý, ale do položek dala jen 13 řádků — zbytek (35× 1l,
// 10× 1l desítka, druhý Jantar a Winter, Limo-citron …) v objednávce chyběl
// a nikdo to nepoznal, protože u fotek se kontrola čtení nedělá.
//
// Přepis je to, co AI skutečně přečetla, takže je zdrojem pravdy o tom, kolik
// řádků objednávka má. Každý řádek „Nx …" se spáruje s katalogem stejnými
// pravidly jako položky (matchBeerId / matchPackageId) a porovná se jako
// MULTISET (pivo × obal × množství): co v položkách chybí, doplní se.
// Opakovaný řádek (stejný Jantar 10× 1l ve dvou částech fotky) se počítá
// podle počtu výskytů, takže se nesloučí.
import { matchBeerId, matchPackageId } from "./beer-match.ts";

type Katalog = {
  beers: { id: string; name: string; degree?: string | null; short_name?: string | null }[];
  packages: { id: string; label: string; volume_l?: number | null }[];
  aliasMap: { beer: Map<string, string>; package: Map<string, string> };
};

export type PolozkaUlozena = {
  beer_id: string | null;
  pkg_id: string | null;
  qty: number | null;
  degree: string | null;
  beer_name: string | null;
  package_label: string | null;
  raw_line: string | null;
};

/** Řádky přepisu ve tvaru „10x …" (počet, x, zbytek). */
export function radkyObjednavky(prepis: string | null | undefined): { qty: number; radek: string }[] {
  const vysledek: { qty: number; radek: string }[] = [];
  for (const r of String(prepis ?? "").split(/\r?\n/)) {
    const m = r.trim().match(/^(?:[A-Za-zÁ-ž]+\s+)?(\d{1,3})\s*[x×*]\s*(\S.*)$/i);
    if (!m) continue;
    const qty = Number(m[1]);
    if (!(qty > 0)) continue;
    vysledek.push({ qty, radek: r.trim() });
  }
  return vysledek;
}

function stupenZRadku(radek: string): string | null {
  const m = radek.match(/(?<![0-9.,])(\d{1,2})\s*°/);
  return m ? `${m[1]}°` : null;
}

/**
 * Položky pro řádky přepisu, které v `polozky` chybí. Řádek, ze kterého se
 * nepozná ani pivo, ani obal, se nepřidává (nejspíš to není položka).
 */
export function doplnChybejiciZPrepisu(
  prepis: string | null | undefined,
  polozky: PolozkaUlozena[],
  katalog: Katalog,
): PolozkaUlozena[] {
  const klic = (b: string | null, p: string | null, q: number | null) => `${b ?? ""}|${p ?? ""}|${q ?? ""}`;
  const mam = new Map<string, number>();
  for (const it of polozky) mam.set(klic(it.beer_id, it.pkg_id, it.qty), (mam.get(klic(it.beer_id, it.pkg_id, it.qty)) ?? 0) + 1);

  const doplnene: PolozkaUlozena[] = [];
  for (const { qty, radek } of radkyObjednavky(prepis)) {
    const degree = stupenZRadku(radek);
    const pseudo = { raw_line: radek, quantity: qty, degree, beer_name: null, package_label: null };
    const beerId = matchBeerId(pseudo, katalog.beers, katalog.aliasMap);
    const pkgId = matchPackageId(pseudo, katalog.packages, katalog.aliasMap);
    const k = klic(beerId, pkgId, qty);
    const zbyva = mam.get(k) ?? 0;
    if (zbyva > 0) { mam.set(k, zbyva - 1); continue; }
    if (!beerId && !pkgId) continue;
    const beer = beerId ? katalog.beers.find((b) => b.id === beerId) : null;
    const pkg = pkgId ? katalog.packages.find((p) => p.id === pkgId) : null;
    doplnene.push({
      beer_id: beerId, pkg_id: pkgId, qty, degree,
      beer_name: beer?.name ?? null, package_label: pkg?.label ?? null, raw_line: radek,
    });
  }
  return doplnene;
}
