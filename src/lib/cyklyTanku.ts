// 🛢️ Cykly tanků — co se z jednoho naplnění tanku doopravdy stočilo.
// ---------------------------------------------------------------------------
// Tabulka `cellar_tank_cycles` si o cyklu pamatuje jen `keg_count`, tedy KOLIK
// sudů — ne DO ČEHO. Přitom právě velikost sudu je to, co ztrátovost cyklu
// vysvětluje: stočit 75 hl do padesátek je jiná práce (a jiná ztráta) než
// totéž do desítek.
//
// Rozpad se proto dopočítává z řádků stáčení: každý řádek `kegging` nese
// `cellar_tank_id` a `created_at`, cyklus nese tank a okno [started_at,
// ended_at]. Řádek patří cyklu, do jehož okna spadá — cykly téhož tanku se
// nepřekrývají, takže je přiřazení jednoznačné.
//
// ZÁMĚRNĚ se nepočítá z `entry_date`: to je jen datum (bez času) a ke stáčení
// z tanku, který se naplnil i ukončil týž den, by se nedalo přiřadit.

export type CyklusOkno = {
  id: string;
  tank_id?: string | null;
  started_at: string | null;
  ended_at: string;
};

export type StaceniRadek = {
  cellar_tank_id?: string | null;
  package_id?: string | null;
  quantity?: number | null;
  created_at?: string | null;
};

/** Kolik kusů konkrétní velikosti sudu padlo v jednom cyklu. */
export type SudyVCyklu = { id: string; nazev: string; kusy: number };

/**
 * Rozpad sudů podle velikosti pro každý cyklus — klíč je `id` cyklu.
 *
 * Cyklus bez jediného dohledaného řádku v mapě prostě není; volající pak
 * ukáže samotné `keg_count` a nic si nevymýšlí.
 */
export function rozpadSuduVCyklech(
  cykly: CyklusOkno[],
  staceni: StaceniRadek[],
  obaly: Map<string, { label: string }>,
): Map<string, SudyVCyklu[]> {
  // Cykly po tancích, seřazené podle konce — hledá se první okno, které
  // řádek pojme.
  const poTancich = new Map<string, CyklusOkno[]>();
  for (const c of cykly) {
    if (!c.tank_id) continue;
    const seznam = poTancich.get(c.tank_id) ?? [];
    seznam.push(c);
    poTancich.set(c.tank_id, seznam);
  }
  for (const seznam of poTancich.values()) seznam.sort((a, b) => a.ended_at.localeCompare(b.ended_at));

  const out = new Map<string, Map<string, SudyVCyklu>>();
  for (const r of staceni) {
    if (!r.cellar_tank_id || !r.package_id || !r.created_at) continue;
    const seznam = poTancich.get(r.cellar_tank_id);
    if (!seznam) continue;
    const cyklus = seznam.find(
      (c) => r.created_at! <= c.ended_at && (!c.started_at || r.created_at! >= c.started_at),
    );
    if (!cyklus) continue;
    const naObal = out.get(cyklus.id) ?? new Map<string, SudyVCyklu>();
    const z = naObal.get(r.package_id)
      ?? { id: r.package_id, nazev: obaly.get(r.package_id)?.label ?? 'Neznámý obal', kusy: 0 };
    z.kusy += Number(r.quantity || 0);
    naObal.set(r.package_id, z);
    out.set(cyklus.id, naObal);
  }

  return new Map(
    [...out].map(([id, naObal]) => [
      id,
      [...naObal.values()].filter((o) => o.kusy !== 0).sort((a, b) => b.kusy - a.kusy),
    ]),
  );
}

/** Krátký zápis rozpadu do jednoho řádku — „8× KEG 50 l · 4× KEG 30 l". */
export function popisRozpaduSudu(rozpad: SudyVCyklu[] | undefined): string {
  if (!rozpad || rozpad.length === 0) return '';
  return rozpad.map((o) => `${o.kusy}× ${o.nazev}`).join(' · ');
}
