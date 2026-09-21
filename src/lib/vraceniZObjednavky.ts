// 🔄 Vrácení sudů/lahví z objednávky zpátky na sklad.
// ---------------------------------------------------------------------------
// Z provozu: "Lužec poveze se 4×50 12°, týden bude uzavřený, ale příští
// týden vrátí 2×50 — to zadám jako vrácení, přičte se to na sklad a
// u původní objednávky přibude poznámka, kdy a kolik se vrátilo."
//
// PROČ NE úprava množství na original objednávce (order_items) přímo:
// ta by přepsala, co se doopravdy ten den zavezlo — a hlavně by RPC
// reconcile_zavoz_deduction_for_item opravil zavoz_deductions k PŮVODNÍMU
// datu závozu, tedy do týdne, který může být už uzavřený (viz
// TydenniInventuraPanel — "uzavření" je jen značka pro přehled, ale čísla
// uzavřeného týdne se přesto neměly tiše měnit zpětně).
//
// Vrácení proto jde jako DOROVNÁNÍ (inventory_adjustments, stejná tabulka
// jako u týdenní inventury) s DNEŠNÍM datem — přičte se do skladu v týdnu,
// ve kterém se sudy doopravdy vrátily, a na originální objednávce zůstane
// jen čitelná poznámka, ne přepsané číslo.
import { pondeliTydne, stitekTydne } from './tydenniInventura';

export type PolozkaVraceni = {
  beer_id: string;
  beer_name: string | null;
  package_id: string;
  package_label: string | null;
  pocet: number;
};

/** Jen položky se zadaným kladným počtem — prázdné/nulové řádky se vrácení netýkají. */
export function platneVraceni(polozky: PolozkaVraceni[]): PolozkaVraceni[] {
  return polozky.filter((p) => p.beer_id && p.package_id && p.pocet > 0);
}

/**
 * Řádky pro `inventory_adjustments` — přičtou vrácené kusy zpátky do skladu
 * k zadanému dni.
 *
 * `odberatel` se jen připíše do důvodu, ať je ve Skladu i v záloze poznat,
 * od koho se pivo vrátilo. V záložce „Vrácení piva" se vrací i bez vybrané
 * objednávky (přivezli to jen tak, objednávka je stará nebo žádná není),
 * a bez jména by v dorovnáních zůstal nedohledatelný řádek.
 *
 * `orderId` — když se vrací přímo z konkrétní objednávky (viz tlačítko
 * „Vrátit pivo" u karty objednávky), propíše se, ať appka umí dopočítat
 * efektivní (vydané − vrácené) množství té objednávky zpátky (viz
 * `vracenoPodleObjednavky` níž). Bez vybrané objednávky zůstává `null` —
 * vrácení pak nejde spárovat s žádnou konkrétní objednávkou, jen se
 * promítne do skladu.
 */
export function zaznamyDorovnaniVraceni(
  polozky: PolozkaVraceni[],
  datum: string,
  odberatel?: string | null,
  orderId?: string | null,
): Record<string, unknown>[] {
  const kdo = (odberatel ?? '').trim();
  return platneVraceni(polozky).map((p) => ({
    entry_date: datum,
    beer_id: p.beer_id,
    beer_name: p.beer_name,
    package_id: p.package_id,
    package_label: p.package_label,
    quantity: p.pocet,
    order_id: orderId ?? null,
    reason: `Vráceno z objednávky — ${p.pocet}× ${p.package_label ?? p.package_id}${p.beer_name ? ` ${p.beer_name}` : ''}${kdo ? ` (${kdo})` : ''}`,
  }));
}

export type VraceniZaznam = { beer_id: string | null; package_id: string | null; quantity: number };

/**
 * Kolik se u KONKRÉTNÍ objednávky celkem vrátilo, po (pivo, obal).
 *
 * Klíč je `beer_id__package_id` — stejná granularita jako `stockKey` ve
 * skladové knize (chybějící sudy nevykryjí lahve, i když je v nich totéž
 * pivo). Vstup jsou řádky `inventory_adjustments` už vyfiltrované na
 * `order_id` rovné té objednávce.
 */
export function vracenoPodleObjednavky(zaznamy: VraceniZaznam[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const z of zaznamy) {
    if (!z.beer_id || !z.package_id) continue;
    const klic = `${z.beer_id}__${z.package_id}`;
    out.set(klic, (out.get(klic) ?? 0) + Number(z.quantity || 0));
  }
  return out;
}

/** „Vráceno 2× 50l 12° Světlé — přičteno do skladu 18. 9. 2026, týdne 2026-09-14." */
export function poznamkaVraceni(polozky: PolozkaVraceni[], datum: string): string {
  const popis = platneVraceni(polozky)
    .map((p) => `${p.pocet}× ${p.package_label ?? p.package_id}${p.beer_name ? ` ${p.beer_name}` : ''}`)
    .join(', ');
  return `Vráceno ${popis} — přičteno do skladu ${datumCesky(datum)}, ${stitekTydne(pondeliTydne(datum))}.`;
}

/** Připojí novou poznámku na konec stávající — nikdy ji nepřepíše. */
export function pripojPoznamku(puvodni: string | null | undefined, novaRadka: string): string {
  const zaklad = (puvodni ?? '').trim();
  return zaklad ? `${zaklad}\n${novaRadka}` : novaRadka;
}

// ---------------------------------------------------------------------------
// Podklady pro záložku „Vrácení piva" v Objednávkách
// ---------------------------------------------------------------------------

export type ObjednavkaProVraceni = {
  id: string;
  place_id: string | null;
  place_name: string | null;
  status: string;
  is_delivered: boolean;
  order_date: string;
  delivery_date: string | null;
};

/** Den, kdy pivo doopravdy odjelo — datum závozu, a když chybí, datum objednávky. */
export function datumZavozu(o: Pick<ObjednavkaProVraceni, 'order_date' | 'delivery_date'>): string {
  return o.delivery_date || o.order_date;
}

/**
 * Objednávky, ze kterých se dá vracet.
 *
 * Jen ZAVEZENÉ a s aspoň jednou položkou — z nezavezené se nemá co vrátit
 * a z prázdné není co vypsat. Storno se vynechává. Řadí se od nejnovější,
 * protože se skoro vždycky vrací z posledního závozu.
 *
 * `dnuZpet` drží seznam krátký: sudy se vracejí do pár týdnů, ne po roce.
 * Kdo potřebuje starší, otevře objednávku v seznamu a vrátí ji tam.
 */
export function objednavkyKVraceni<O extends ObjednavkaProVraceni>(
  objednavky: O[],
  polozky: Record<string, unknown[]>,
  opts: { dnes: string; dnuZpet?: number; placeId?: string | null; hledat?: string },
): O[] {
  const dnuZpet = opts.dnuZpet ?? 56;
  // Počítá se v UTC: `new Date('2026-09-18T00:00:00')` je PŮLNOC MÍSTNÍHO ČASU,
  // takže by se z toISOString() v Praze vrátil den předtím a mez by byla o den
  // posunutá. Data v databázi jsou prosté dny bez časové zóny.
  const mez = new Date(`${opts.dnes}T00:00:00Z`);
  mez.setUTCDate(mez.getUTCDate() - dnuZpet);
  const mezISO = mez.toISOString().slice(0, 10);
  const hledat = (opts.hledat ?? '').trim().toLowerCase();

  return objednavky
    .filter((o) => o.is_delivered && o.status !== 'storno')
    .filter((o) => (polozky[o.id] ?? []).length > 0)
    .filter((o) => datumZavozu(o) >= mezISO)
    .filter((o) => (opts.placeId ? o.place_id === opts.placeId : true))
    .filter((o) => (hledat ? (o.place_name ?? '').toLowerCase().includes(hledat) : true))
    .sort((a, b) => datumZavozu(b).localeCompare(datumZavozu(a)));
}

/** „18. 9. 2026" — datum v ISO na čitelné, bez závislosti na locale prohlížeče. */
export function datumCesky(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d}. ${m}. ${y}`;
}
