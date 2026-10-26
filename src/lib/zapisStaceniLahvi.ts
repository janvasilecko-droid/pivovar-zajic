// 🍾 Zápis stáčení lahví: řádek formuláře → záznamy do tabulky `bottling`.
// ---------------------------------------------------------------------------
// Řádek zadávání je „jedna dávka": pivo, až dva zdrojové sudy a až ČTYŘI druhy
// lahví (1,5 / 1 / 0,5 / 0,33 l — stejně jako sloupce excelové tabulky, ze
// které se čte fotka). Každý druh lahví je v databázi vlastní řádek a všechny
// řádky dávky nesou stejný zdroj ze sudů (kegs_used + velikost + litry).
//
// Dřív to bylo rozepsané přímo v BottlingScreen (tři sloty lahví). Tady je to
// čistá funkce, aby se dalo testovat — a protože ze čtení fotky přicházejí
// řádky, které formulář dřív neunesl: čtvrtý druh lahví a vlastní den řádku.
import { rozdelLahvePodleSudu, type LahveRadku } from './dalsiSud';

export type RadekStaceniLahvi = {
  beerId: string;
  pkgId: string; qty: string;
  pkg2Id: string; qty2: string;
  pkg3Id: string; qty3: string;
  pkg4Id?: string; qty4?: string;
  kegPkgId: string; kegQty: string;
  keg2PkgId?: string; keg2Qty?: string;
  /** Den zápisu, když není stejný jako datum formuláře (řádky z tabulky na fotce mají každý svůj). */
  datum?: string | null;
};

/** Sloty lahví po řadě — pole řádku s obalem a s počtem. */
export const SLOTY_LAHVI = [
  { pkg: 'pkgId', qty: 'qty' },
  { pkg: 'pkg2Id', qty: 'qty2' },
  { pkg: 'pkg3Id', qty: 'qty3' },
  { pkg: 'pkg4Id', qty: 'qty4' },
] as const;

type ObalZapisu = { id: string; label: string | null; volume_l: number | string };
type PivoZapisu = { id: string; name: string };

export type KontextZapisu = {
  /** Datum formuláře — platí pro řádky bez vlastního dne. */
  datum: string;
  poznamka: string;
  obaly: ObalZapisu[];
  piva: PivoZapisu[];
};

/** Záznam tak, jak se vkládá do tabulky `bottling`. */
export type ZaznamStaceniLahvi = {
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string;
  package_label: string | null;
  quantity: number;
  kegs_used: number | null;
  kegs_used_package_id: string | null;
  source_volume_l: number | null;
  note: string | null;
};

const slot = (r: RadekStaceniLahvi, s: (typeof SLOTY_LAHVI)[number]) => ({
  pkgId: (r[s.pkg] ?? '') as string,
  qty: (r[s.qty] ?? '') as string,
});

/** Je u řádku zadaný aspoň jeden nenulový počet lahví? (Obal se neřeší — chybějící obal zkontroluje volající.) */
export function maLahve(r: RadekStaceniLahvi): boolean {
  return SLOTY_LAHVI.some((s) => Number(slot(r, s).qty) > 0);
}

const maNejakyObal = (r: RadekStaceniLahvi) => SLOTY_LAHVI.some((s) => !!slot(r, s).pkgId) || !!r.kegPkgId;

/** Řádek, který se zapíše: má pivo, nějaký obal a nenulový počet lahví. */
export function jeVyplneny(r: RadekStaceniLahvi): boolean {
  return !!r.beerId && maNejakyObal(r) && maLahve(r);
}

/** Řádek, který by se zapsal, ale chybí mu pivo — bez něj se stočení nepromítne do skladu. */
export function chybiPivo(r: RadekStaceniLahvi): boolean {
  return !r.beerId && maNejakyObal(r) && maLahve(r);
}

/** Druhy lahví řádku, které mají obal i nenulový počet — v pořadí slotů. */
export function lahveRadku(r: RadekStaceniLahvi): LahveRadku[] {
  return SLOTY_LAHVI
    .map((s) => ({ pkgId: slot(r, s).pkgId, qty: Number(slot(r, s).qty) }))
    .filter((l) => l.pkgId && l.qty > 0);
}

/** Den, na který se řádek zapíše. */
export function datumRadku(r: RadekStaceniLahvi, vychozi: string): string {
  return r.datum || vychozi;
}

/**
 * Záznamy jedné dávky. Vrací `nelzeRozdelit`, když jsou dva sudy a lahví je
 * míň než sudů (lib/dalsiSud.ts) — to se nesmí zapsat napůl.
 *
 * Pravidla (beze změny proti dřívějšímu zápisu v BottlingScreen):
 *  - jeden sud (nebo žádný): všechny druhy lahví nesou celý zdroj ze sudů,
 *  - dva sudy různé velikosti: lahve se rozpočítají mezi sudy podle litrů,
 *  - není-li vybraná první lahev, počet prvního slotu se zapíše na obal sudu
 *    (zápis „do sudu" bez lahve).
 */
export function zaznamyZRadku(
  r: RadekStaceniLahvi,
  ctx: KontextZapisu,
): { zaznamy: ZaznamStaceniLahvi[] } | { nelzeRozdelit: true } {
  const obal = (id: string | null | undefined) => (id ? ctx.obaly.find((p) => p.id === id) : undefined);
  const pivo = ctx.piva.find((b) => b.id === r.beerId);
  const entry_date = datumRadku(r, ctx.datum);
  const note = ctx.poznamka || null;
  const zaznamy: ZaznamStaceniLahvi[] = [];

  // Dva sudy různé velikosti: řádek stáčení unese jen jednu, tak se lahve
  // rozpočítají mezi sudy podle litrů. Všechny řádky jdou v jednom insertu.
  const keg2 = r.keg2PkgId && Number(r.keg2Qty) > 0 ? obal(r.keg2PkgId) : undefined;
  const keg1 = r.kegPkgId ? obal(r.kegPkgId) : undefined;
  if (keg2 && keg1) {
    const casti = rozdelLahvePodleSudu(lahveRadku(r), [
      { kegPkgId: keg1.id, kegQty: Number(r.kegQty), kegVolumeL: Number(keg1.volume_l) },
      { kegPkgId: keg2.id, kegQty: Number(r.keg2Qty), kegVolumeL: Number(keg2.volume_l) },
    ]);
    if (!casti) return { nelzeRozdelit: true };
    for (const c of casti) {
      zaznamy.push({
        entry_date, beer_id: r.beerId || null, beer_name: pivo?.name ?? null,
        package_id: c.pkgId, package_label: obal(c.pkgId)?.label ?? null, quantity: c.qty,
        kegs_used: c.kegQty, kegs_used_package_id: c.kegPkgId, source_volume_l: c.sourceL,
        note,
      });
    }
    return { zaznamy };
  }

  const kegsUsed = Number(r.kegQty || 0);
  const kegPkg = r.kegPkgId ? obal(r.kegPkgId) : undefined;
  // Zdrojový objem = počet sudů × objem sudu (např. 6×50L = 300L).
  const sourceL = kegsUsed > 0 && kegPkg ? kegsUsed * Number(kegPkg.volume_l) : 0;
  const zaklad = {
    entry_date, beer_id: r.beerId || null, beer_name: pivo?.name ?? null,
    kegs_used: kegsUsed > 0 ? kegsUsed : null,
    kegs_used_package_id: kegsUsed > 0 && kegPkg ? kegPkg.id : null,
    source_volume_l: sourceL > 0 ? sourceL : null,
    note,
  };
  SLOTY_LAHVI.forEach((s, i) => {
    const { pkgId: vybranyObal, qty } = slot(r, s);
    // Lahve 1 (nebo obal sudu, pokud není vybraná lahev) — jen první slot.
    const pkgId = i === 0 ? (vybranyObal || r.kegPkgId) : vybranyObal;
    const pkg = obal(pkgId);
    const n = Number(qty);
    if (pkg && n > 0) zaznamy.push({ ...zaklad, package_id: pkgId, package_label: pkg.label ?? null, quantity: n });
  });
  return { zaznamy };
}

/**
 * Časy vzniku jednotlivých řádků jedné dávky zápisů — vzestupně, poslední je „teď".
 *
 * Skladová kniha pozná sourozence jedné dávky podle (den, pivo, počet a velikost
 * sudů, created_at) a sud odečte JEDNOU. Řádky vložené jedním příkazem dostanou
 * stejný created_at, takže dvě různá stáčení téhož piva v jeden den se shodným
 * počtem sudů (třeba dvakrát 1× 50 l) by splynula a druhý sud by se neodečetl.
 * Proto každý řádek z fotky dostane o vteřinu jiný čas.
 */
export function casyRadku(pocet: number, ted: number = Date.now()): string[] {
  return Array.from({ length: pocet }, (_, i) => new Date(ted - (pocet - 1 - i) * 1000).toISOString());
}

/** Řádek má nějaké množství (lahve nebo sudy) — prázdný slot dlaždice neotvírá. */
export function radekMaMnozstvi(r: RadekStaceniLahvi): boolean {
  return [r.qty, r.qty2, r.qty3, r.qty4 ?? '', r.kegQty, r.keg2Qty ?? ''].some((q) => Number(q) > 0);
}

/**
 * Který řádek dlaždice otevře.
 *
 * Klepnutí na řádek ze souhrnu (`vynuceny`) otevře právě ten, i když je z fotky.
 * Jinak ruční řádek s množstvím, a když žádný není, řádek z fotky — dlaždice
 * ho dřív přeskakovala (`datum`) a pivo z fotky nešlo opravit stejně jako ruční.
 * `-1` = nic k otevření, dlaždice začne prázdná.
 */
export function indexRadkuProDlazdici(radky: RadekStaceniLahvi[], beerId: string, vynuceny: number | null): number {
  if (vynuceny != null && radky[vynuceny]?.beerId === beerId) return vynuceny;
  const rucni = radky.findIndex((r) => r.beerId === beerId && !r.datum && radekMaMnozstvi(r));
  if (rucni >= 0) return rucni;
  const zFotky = radky.findIndex((r) => r.beerId === beerId && !!r.datum && radekMaMnozstvi(r));
  return zFotky;
}

/** 0,5 l a 1 l zůstanou dva součty. Jedno číslo „lahve“ by je slilo dohromady. */
export function souctyLahviPoObjemu(polozky: { objemL: number; ks: number }[]): { objemL: number; ks: number }[] {
  const m = new Map<number, number>();
  for (const p of polozky) {
    if (!(p.ks > 0)) continue;
    const k = Math.round(Number(p.objemL) * 100) / 100;
    m.set(k, (m.get(k) ?? 0) + p.ks);
  }
  return [...m.entries()].sort((a, b) => b[0] - a[0]).map(([objemL, ks]) => ({ objemL, ks }));
}

/** „1 l: 40 · 0,5 l: 12“ — prázdný seznam je prázdný text. */
export function popisekLahviPoObjemu(soucty: { objemL: number; ks: number }[]): string {
  return soucty.map((s) => `${String(s.objemL).replace('.', ',')} l: ${s.ks}`).join(' · ');
}

/** Prázdný řádek formuláře: bez piva a bez jakéhokoli množství. */
export function jePrazdnyRadek(r: RadekStaceniLahvi): boolean {
  return !r.beerId && ![r.qty, r.qty2, r.qty3, r.qty4 ?? '', r.kegQty, r.keg2Qty ?? ''].some((q) => !!q);
}

/**
 * Přidá nové řádky (z fotky) k těm, které už formulář má: nejdřív do prázdných
 * řádků, zbytek na konec. Nic rozepsaného se nepřepíše — dřív se řádky z fotky
 * psaly od prvního řádku a smazaly, co už člověk zadal.
 */
export function pridejRadky(stavajici: RadekStaceniLahvi[], nove: RadekStaceniLahvi[]): RadekStaceniLahvi[] {
  const ven = [...stavajici];
  let kurzor = 0;
  for (const r of nove) {
    while (kurzor < ven.length && !jePrazdnyRadek(ven[kurzor])) kurzor++;
    if (kurzor < ven.length) { ven[kurzor] = { ...r }; kurzor++; } else { ven.push({ ...r }); }
  }
  return ven;
}
