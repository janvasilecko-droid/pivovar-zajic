// 🕘 Co se dnes už uložilo — řádky pod zadáváním stáčení a fasování.
// ---------------------------------------------------------------------------
// Zadání z 29. 10. 2026: „stáčení z toho dne bude vidět pod zadáváním
// stáčení". Stáčí se průběžně přes den a každé uložení je samostatný zápis,
// takže bez seznamu není vidět, co už je zapsané a co ještě ne.
//
// Řádky jedné dávky se tu slučují: stáčení lahví je v databázi jeden řádek
// na druh lahve, ale pro člověka je to jedno stáčení („90× 1 l, 20× 0,5 l
// ze 3× sud 50 l").

export type DnesPolozka = {
  id: string;
  /** „9:40" v pražském čase, nebo prázdné, když zápis nemá čas. */
  cas: string;
  beerId: string;
  text: string;
};

type Obal = { id: string; label: string | null; volume_l: number | null };

type RadekZaznamu = {
  id: string;
  entry_date: string | null;
  created_at?: string | null;
  beer_id: string | null;
  package_id: string | null;
  quantity: number | null;
};

export type RadekLahve = RadekZaznamu & {
  kegs_used?: number | null;
  kegs_used_package_id?: string | null;
};

/** „1,5 l" z objemu obalu — štítky v katalogu bývají nejednotné. */
export function objemObalu(o: Obal | undefined): string {
  const v = Number(o?.volume_l);
  if (Number.isFinite(v) && v > 0) return `${String(Math.round(v * 100) / 100).replace('.', ',')} l`;
  return (o?.label ?? 'obal').trim() || 'obal';
}

export function casZapisu(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('cs-CZ', { hour: 'numeric', minute: '2-digit', timeZone: 'Europe/Prague' });
}

/** Jedna položka na zápis: „6× 30 l" (KEG) nebo „10× 1 l" (fasování, prodejna). */
export function dnesPodleObalu(rows: RadekZaznamu[], den: string, obaly: Obal[]): DnesPolozka[] {
  const obal = new Map(obaly.map((o) => [o.id, o]));
  return rows
    .filter((r) => r.entry_date === den && r.beer_id && r.package_id && Number(r.quantity) > 0)
    .map((r) => ({
      p: { id: r.id, cas: casZapisu(r.created_at), beerId: r.beer_id as string, text: `${Number(r.quantity)}× ${objemObalu(obal.get(r.package_id as string))}` },
      t: r.created_at ?? '',
    }))
    .sort((a, b) => b.t.localeCompare(a.t))
    .map((x) => x.p);
}

/** Stáčení lahví: řádky se stejným časem zápisu a pivem jsou jedna dávka. */
export function dnesLahve(rows: RadekLahve[], den: string, obaly: Obal[]): DnesPolozka[] {
  const obal = new Map(obaly.map((o) => [o.id, o]));
  const davky = new Map<string, { t: string; beerId: string; lahve: Map<string, number>; sudy: Map<string, number> }>();
  for (const r of rows) {
    if (r.entry_date !== den || !r.beer_id || !r.package_id || !(Number(r.quantity) > 0)) continue;
    const klic = `${r.created_at ?? r.id}|${r.beer_id}`;
    const d = davky.get(klic) ?? { t: r.created_at ?? '', beerId: r.beer_id, lahve: new Map(), sudy: new Map() };
    d.lahve.set(r.package_id, (d.lahve.get(r.package_id) ?? 0) + Number(r.quantity));
    if (r.kegs_used_package_id && Number(r.kegs_used) > 0 && !d.sudy.has(r.kegs_used_package_id)) {
      d.sudy.set(r.kegs_used_package_id, Number(r.kegs_used));
    }
    davky.set(klic, d);
  }
  return [...davky.entries()]
    .map(([klic, d]) => {
      const lahve = [...d.lahve].map(([id, q]) => `${q}× ${objemObalu(obal.get(id))}`).join(', ');
      const sudy = [...d.sudy].map(([id, q]) => `${q}× sud ${objemObalu(obal.get(id))}`).join(' + ');
      return { p: { id: klic, cas: casZapisu(d.t), beerId: d.beerId, text: sudy ? `${lahve} ze ${sudy}` : `${lahve} · bez sudů` }, t: d.t };
    })
    .sort((a, b) => b.t.localeCompare(a.t))
    .map((x) => x.p);
}
