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
  return secti(datum, platne.filter((o) => o.delivery_date === datum));
}

/** Klíč nakládky bez data závozu. */
export const BEZ_DATA = '';

/**
 * Nakládky po dnech — dnes (co ještě neodjelo), dalších 7 dní a „Neuvedeno"
 * (objednávky bez data závozu). Z provozu 6. 10. 2026: „přidej tam možnost
 * kliknout na dny, kdy jsou další nakládky, pokud není datum, tak dej bez
 * dne, takže třeba Po St Čt Neuvedeno, a já si můžu rozklikávat, co se veze
 * kdy." Dny jsou seřazené, „Neuvedeno" na konci; den bez objednávek se
 * nevypisuje.
 */
export function nakladkyPoDnech(
  objednavky: (ObjednavkaNaZavoz & { is_delivered?: boolean | null })[],
  dnesISO: string,
): NalozitNaZavoz[] {
  const platne = objednavky.filter((o) => o.status !== 'storno'
    && (o.delivery_date ? o.delivery_date > dnesISO || (o.delivery_date === dnesISO && !o.is_delivered) : !o.is_delivered));
  const dny = [...new Set(platne.map((o) => o.delivery_date ?? BEZ_DATA))]
    .sort((a, b) => (a === BEZ_DATA ? 1 : b === BEZ_DATA ? -1 : a.localeCompare(b)));
  return dny
    .map((d) => secti(d, platne.filter((o) => (o.delivery_date ?? BEZ_DATA) === d)))
    .filter((n) => n.kusuCelkem > 0);
}

/** Výchozí den v okně: nejbližší závoz PO dnešku, jinak cokoli, co je. */
export function vychoziNakladka(nakladky: NalozitNaZavoz[], dnesISO: string): string | null {
  return (nakladky.find((n) => n.datum !== BEZ_DATA && n.datum > dnesISO) ?? nakladky[0])?.datum ?? null;
}

function secti(datum: string, toho: ObjednavkaNaZavoz[]): NalozitNaZavoz {
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

// ── Tabulka na plochu ve stylu „Co stočit" ──────────────────────────────────
// Z provozu 29. 9. 2026: „tu nakládku udělej ve stejném stylu jako tu tabulku
// Co stočit" — řádek = pivo, sloupec = obal (nejdřív sudy, pak lahve, od
// největšího), v buňce kusy, dole součet.

export type SloupecNakladky = { obal: string; kratce: string; druh: 'sudy' | 'lahve'; objem: number };
export type RadekNakladky = { pivo: string; kusy: Map<string, number>; celkem: number };

function objemObalu(label: string): number {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*l\b/i);
  return m ? Number(m[1].replace(',', '.')) : 0;
}

export function tabulkaNakladky(polozky: NalozitNaZavoz['polozky']) {
  const sloupce = new Map<string, SloupecNakladky>();
  const radky = new Map<string, RadekNakladky>();
  for (const p of polozky) {
    if (!sloupce.has(p.obal)) {
      const m = p.obal.match(/\d+(?:[.,]\d+)?\s*l\b/i);
      sloupce.set(p.obal, {
        obal: p.obal,
        kratce: m ? m[0].replace(/\s+/g, '') : p.obal,
        druh: /keg|sud/i.test(p.obal) ? 'sudy' : 'lahve',
        objem: objemObalu(p.obal),
      });
    }
    const r = radky.get(p.pivo) ?? { pivo: p.pivo, kusy: new Map(), celkem: 0 };
    r.kusy.set(p.obal, (r.kusy.get(p.obal) ?? 0) + p.kusu);
    r.celkem += p.kusu;
    radky.set(p.pivo, r);
  }
  const serazeneSloupce = [...sloupce.values()].sort((a, z) =>
    (a.druh === z.druh ? 0 : a.druh === 'sudy' ? -1 : 1) || z.objem - a.objem);
  const serazeneRadky = [...radky.values()].sort((a, z) => z.celkem - a.celkem || a.pivo.localeCompare(z.pivo, 'cs'));
  const soucty = new Map(serazeneSloupce.map((s) => [s.obal, serazeneRadky.reduce((n, r) => n + (r.kusy.get(s.obal) ?? 0), 0)]));
  return { sloupce: serazeneSloupce, radky: serazeneRadky, soucty };
}
