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

/** Jeden řádek výsledku: buď existující položka (index), nebo nová z přepisu. */
export type PolozkaVPoradi = { index: number; nova?: undefined } | { index?: undefined; nova: PolozkaUlozena };

/**
 * Položky seřazené tak, jak jdou řádky na fotce (12. 10. 2026: „položky
 * rovnou stejně, jak jdou popořadě — máš na konci limonády"). Každý řádek
 * přepisu si vezme první ještě nepoužitou položku se stejným pivem × obalem ×
 * kusy; řádek bez takové položky se doplní jako nová. Položky, které žádnému
 * řádku neodpovídají, zůstanou na konci v původním pořadí — nic se neztratí.
 * Řádek, ze kterého se nepozná ani pivo, ani obal, se nepřidává.
 */
export function poradiPodlePrepisu(
  prepis: string | null | undefined,
  polozky: PolozkaUlozena[],
  katalog: Katalog,
): PolozkaVPoradi[] {
  const klic = (b: string | null, p: string | null, q: number | null) => `${b ?? ""}|${p ?? ""}|${q ?? ""}`;
  const volne = new Map<string, number[]>();
  polozky.forEach((it, i) => {
    const k = klic(it.beer_id, it.pkg_id, it.qty);
    volne.set(k, [...(volne.get(k) ?? []), i]);
  });
  const pouzite = new Set<number>();
  const vysledek: PolozkaVPoradi[] = [];
  for (const { qty, radek } of radkyObjednavky(prepis)) {
    const degree = stupenZRadku(radek);
    const pseudo = { raw_line: radek, quantity: qty, degree, beer_name: null, package_label: null };
    const beerId = matchBeerId(pseudo, katalog.beers, katalog.aliasMap);
    const pkgId = matchPackageId(pseudo, katalog.packages, katalog.aliasMap);
    const kandidati = volne.get(klic(beerId, pkgId, qty));
    if (kandidati && kandidati.length) {
      const i = kandidati.shift()!;
      pouzite.add(i);
      vysledek.push({ index: i });
      continue;
    }
    if (!beerId && !pkgId) continue;
    const beer = beerId ? katalog.beers.find((b) => b.id === beerId) : null;
    const pkg = pkgId ? katalog.packages.find((p) => p.id === pkgId) : null;
    vysledek.push({
      nova: {
        beer_id: beerId, pkg_id: pkgId, qty, degree,
        beer_name: beer?.name ?? null, package_label: pkg?.label ?? null, raw_line: radek,
      },
    });
  }
  polozky.forEach((_, i) => { if (!pouzite.has(i)) vysledek.push({ index: i }); });
  return vysledek;
}

/** Jen položky pro řádky přepisu, které v `polozky` chybí (viz poradiPodlePrepisu). */
export function doplnChybejiciZPrepisu(
  prepis: string | null | undefined,
  polozky: PolozkaUlozena[],
  katalog: Katalog,
): PolozkaUlozena[] {
  return poradiPodlePrepisu(prepis, polozky, katalog).flatMap((r) => (r.nova ? [r.nova] : []));
}
