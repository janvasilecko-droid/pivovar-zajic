// Pořadí položek objednávky v přehledu: PODLE PIV (pořadí piv v katalogu —
// 12° Světlá, 11° Světlá, 10° Desítka, 12° Tmavá, Jantar…) a uvnitř piva
// podle OBALŮ v pořadí katalogu (sudy 50, 30, 20, 15, 10, pak lahve 1,5l, 1l,
// 0,5l, 0,33l — od největšího po nejmenší).
//
// Majitel 12. 10. 2026: u objednávky Malešic šlo 30l, 30l, 50l, 0,5l, 0,5l,
// 1,5l (řazení podle TEXTU štítku). Pak „seřaď podle druhu a od největšího
// obalu" — a po spatření výsledku: „seřaď to podle piv a velikosti obalu,
// jako všude v aplikaci". „Všude v aplikaci" = pořadí piv a obalů z katalogu
// (sort_order), tak jak jdou dlaždice, plány i sklad.

type Obal = { id: string; kind?: string | null; volume_l?: number | null; label?: string | null; sort_order?: number | null };
type Pivo = { id: string; name?: string | null; sort_order?: number | null };
type Polozka = { id: string; beer_id?: string | null; package_id: string | null; package_label: string | null; beer_name: string | null };

/** Objem obalu v litrech: z katalogu, jinak z textu štítku („ 30l", „1,5l"). */
export function objemObalu(obal: Obal | undefined, labelPolozky: string | null): number {
  if (obal?.volume_l != null && Number.isFinite(Number(obal.volume_l))) return Number(obal.volume_l);
  const m = (obal?.label ?? labelPolozky ?? '').replace(',', '.').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

const KONEC = 1_000_000;

export function poradiPolozekObjednavky<T extends Polozka>(items: T[], packages: Obal[], beers: Pivo[] = []): T[] {
  const obaly = new Map(packages.map((p) => [p.id, p]));
  const piva = new Map(beers.map((b) => [b.id, b]));
  const poradiPiva = (i: T) => {
    const b = i.beer_id ? piva.get(i.beer_id) : undefined;
    return b?.sort_order ?? KONEC;
  };
  const poradiObalu = (i: T) => {
    const o = i.package_id ? obaly.get(i.package_id) : undefined;
    if (o?.sort_order != null) return o.sort_order;
    // Bez pořadí v katalogu: sudy před lahvemi, od největšího.
    const sud = o?.kind === 'keg' ? 0 : KONEC / 2;
    return sud + (1000 - objemObalu(o, i.package_label));
  };
  return [...items].sort((a, b) => {
    const pivo = poradiPiva(a) - poradiPiva(b);
    if (pivo !== 0) return pivo;
    // Piva mimo katalog (nebo bez piva) se mezi sebou seskupí podle jména.
    const jmeno = (a.beer_name ?? '').localeCompare(b.beer_name ?? '', 'cs');
    if (poradiPiva(a) === KONEC && jmeno !== 0) return jmeno;
    const obal = poradiObalu(a) - poradiObalu(b);
    if (obal !== 0) return obal;
    // Nakonec podle id — pořadí z databáze se po úpravě řádku mění, položky
    // by pak pod prstem poskakovaly.
    return a.id.localeCompare(b.id);
  });
}

/**
 * Řádky formuláře nové objednávky. Naklikají se v libovolném pořadí,
 * do souhrnu i do uložení jdou jako v katalogu: nejdřív druh piva,
 * v něm obal od největšího (30 l, pak 1,5 l, pak 1 l).
 */
export function poradiRadkuZadavani<T extends { beerId: string; pkgId: string }>(
  rows: T[],
  packages: Obal[],
  beers: Pivo[] = [],
): T[] {
  const sId = rows.map((r, i) => ({
    row: r,
    id: String(i).padStart(6, '0'),
    beer_id: r.beerId,
    package_id: r.pkgId,
    package_label: null as string | null,
    beer_name: null as string | null,
  }));
  return poradiPolozekObjednavky(sId, packages, beers).map((x) => x.row);
}

/** Řádky těsně před zápisem do order_items — stejné pořadí jako souhrn. */
export function seradVkladanePolozky<T extends {
  beer_id?: string | null;
  package_id?: string | null;
  beer_name?: string | null;
  package_label?: string | null;
}>(rows: T[], packages: Obal[], beers: Pivo[] = []): T[] {
  const sId = rows.map((r, i) => ({
    ...r,
    id: String(i).padStart(6, '0'),
    beer_id: r.beer_id ?? null,
    package_id: r.package_id ?? null,
    package_label: r.package_label ?? null,
    beer_name: r.beer_name ?? null,
  }));
  return poradiPolozekObjednavky(sId, packages, beers).map(({ id: _id, ...rest }) => rest as T);
}

/**
 * Najde řádek zadávané objednávky. Když je `radekId`, míří na tenhle řádek
 * i při duplicitním pivo+obal (text, hlas, zopakovat položky) — ne na první
 * `findIndex` se stejným beerId a pkgId.
 */
export function indexRadkuZadani<T extends { beerId: string; pkgId: string; id?: string }>(
  rows: T[],
  beerId: string,
  pkgId: string,
  radekId?: string,
): number {
  if (radekId) {
    const i = rows.findIndex((r) => r.id === radekId);
    if (i >= 0) return i;
  }
  return rows.findIndex((r) => r.beerId === beerId && r.pkgId === pkgId);
}

/** Nastaví počet na konkrétním řádku. Nula a méně řádek smaže. */
export function upravMnozstviRadku<T extends { beerId: string; pkgId: string; qty: string; id?: string }>(
  prev: T[],
  beerId: string,
  pkgId: string,
  qty: number,
  radekId?: string,
): T[] {
  const i = indexRadkuZadani(prev, beerId, pkgId, radekId);
  if (i < 0) return prev;
  if (qty <= 0) return prev.filter((_, idx) => idx !== i);
  return prev.map((r, idx) => (idx === i ? { ...r, qty: String(qty) } : r));
}
