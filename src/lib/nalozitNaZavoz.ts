// 🚚 Co naložit na nejbližší závoz — pro dlaždici Rozvoz na ploše.
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „udělej i dlaždici závoz na úvodní stránku a dej tam,
// co naložit na závoz na další den."
//
// Bere nejbližší den PO dnešku, na který je nějaká objednávka (ne storno) —
// v pátek tak ukáže pondělí, ne prázdnou sobotu. Kusy se sečtou po pivu
// a obalu přes všechny objednávky toho dne.

export type ObjednavkaNaZavoz = {
  delivery_date: string | null;
  status: string | null;
  place_name?: string | null;
  order_items?: { beer_name: string | null; package_label: string | null; quantity: number | null }[] | null;
};

export type NalozitNaZavoz = {
  /** Den závozu (YYYY-MM-DD). */
  datum: string;
  objednavek: number;
  mista: string[];
  /** Pivo × obal, seřazené od největšího počtu. */
  polozky: { pivo: string; obal: string; kusu: number }[];
  kusuCelkem: number;
};

export function coNalozitNaZavoz(objednavky: ObjednavkaNaZavoz[], dnesISO: string): NalozitNaZavoz | null {
  const platne = objednavky.filter((o) => o.status !== 'storno' && !!o.delivery_date && o.delivery_date > dnesISO);
  if (platne.length === 0) return null;
  const datum = platne.map((o) => o.delivery_date!).sort()[0];
  const toho = platne.filter((o) => o.delivery_date === datum);

  const soucty = new Map<string, { pivo: string; obal: string; kusu: number }>();
  for (const o of toho) {
    for (const i of o.order_items ?? []) {
      const kusu = Number(i.quantity) || 0;
      if (kusu <= 0) continue;
      const pivo = (i.beer_name ?? '').trim() || 'Pivo';
      const obal = (i.package_label ?? '').trim();
      const k = `${pivo}__${obal}`;
      const r = soucty.get(k) ?? { pivo, obal, kusu: 0 };
      r.kusu += kusu;
      soucty.set(k, r);
    }
  }
  const polozky = [...soucty.values()].sort((a, b) => b.kusu - a.kusu || a.pivo.localeCompare(b.pivo, 'cs'));
  const mista = [...new Set(toho.map((o) => String(o.place_name ?? '').trim()).filter((m) => m.length > 0))];
  return {
    datum,
    objednavek: toho.length,
    mista,
    polozky,
    kusuCelkem: polozky.reduce((s, p) => s + p.kusu, 0),
  };
}
