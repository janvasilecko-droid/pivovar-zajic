// 🛢️ Statistika tanků — jaké pivo v tanku bylo, jak dlouho se tank stáčel,
// kolik se stáčí týdně a jaká byla výtrata. Jen počítání (vykreslení je
// v components/StatistikaTanku.tsx).
//
// Zdroje: uzavřené cykly (cellar_tank_cycles), tanky tak, jak jsou teď
// (cellar_tanks) a řádky stáčení KEG s litry odebranými z tanku
// (kegging.source_volume_l) pro týdenní součty.
import { pondeliTydne, posunDnu } from './statistika';

export type CyklusStat = {
  tank_id: string | null;
  tank_label: string | null;
  beer_name: string | null;
  initial_volume_l: number | string | null;
  kegged_volume_l: number | string | null;
  loss_l: number | string | null;
  started_at: string | null;
  ended_at: string;
  duration_hours: number | string | null;
};

export type TankNyni = {
  id: string;
  label: string;
  status?: string | null;
  current_beer_id?: string | null;
  current_beer_name?: string | null;
  current_volume_l?: number | string | null;
  initial_volume_l?: number | string | null;
  started_at?: string | null;
};

export type StaceniZTanku = { entry_date: string; cellar_tank_id?: string | null; source_volume_l?: number | string | null };

export type RadekCyklu = {
  pivo: string;
  od: string | null;
  do: string;
  dnu: number | null;
  pocatecniL: number;
  stoceneL: number;
  ztrataL: number;
  ztrataPct: number | null;
  litruTydne: number | null;
};

export type TydenTanku = { od: string; litry: number };

export type NyniTanku = {
  pivo: string;
  od: string | null;
  dnu: number | null;
  pocatecniL: number;
  zbyvaL: number;
  stoceneL: number;
  litruTydne: number | null;
};

export type StatTanku = {
  id: string;
  label: string;
  pivoId: string | null;
  nyni: NyniTanku | null;
  cykly: RadekCyklu[];
  prumerDnu: number | null;
  prumerLitruTydne: number | null;
  /** Vážená výtrata ze všech uzavřených cyklů (ztracené / počáteční litry). */
  ztrataPct: number | null;
  tydny: TydenTanku[];
};

const cislo = (v: number | string | null | undefined): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const zaokr1 = (n: number) => Math.round(n * 10) / 10;
const den = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);

function dniMezi(od: string, doKdy: string): number {
  const a = Date.parse(od.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(doKdy.slice(0, 10) + 'T00:00:00Z');
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** Litry za týden z celkových litrů a počtu dnů (aspoň 1 den, ať jednodenní cyklus nevyletí do nebe). */
function naTyden(litry: number, dnu: number | null): number | null {
  if (dnu == null || !(litry > 0)) return null;
  return Math.round((litry / Math.max(dnu, 1)) * 7);
}

export function radekCyklu(c: CyklusStat): RadekCyklu {
  const od = den(c.started_at);
  const hodiny = cislo(c.duration_hours);
  const dnu = hodiny > 0 ? zaokr1(hodiny / 24) : od ? dniMezi(od, c.ended_at) : null;
  const pocatecni = cislo(c.initial_volume_l);
  const ztrata = cislo(c.loss_l);
  const stocene = cislo(c.kegged_volume_l);
  return {
    pivo: c.beer_name || '—',
    od,
    do: den(c.ended_at) ?? c.ended_at,
    dnu,
    pocatecniL: Math.round(pocatecni),
    stoceneL: Math.round(stocene),
    ztrataL: Math.round(ztrata),
    ztrataPct: pocatecni > 0 ? zaokr1((ztrata / pocatecni) * 100) : null,
    litruTydne: naTyden(stocene, dnu),
  };
}

/**
 * Statistika po tancích. `tydnu` posledních týdnů (včetně rozpracovaného)
 * dostane každý tank ve `tydny`, nejstarší první.
 */
export function statistikaTanku(p: {
  cykly: CyklusStat[];
  tanky: TankNyni[];
  staceni: StaceniZTanku[];
  dnes: string;
  tydnu?: number;
}): StatTanku[] {
  const tydnu = p.tydnu ?? 8;
  const pondeliTed = pondeliTydne(p.dnes);
  const zacatek = posunDnu(pondeliTed, -7 * (tydnu - 1));
  const out: StatTanku[] = [];

  for (const t of p.tanky) {
    const radky = p.cykly
      .filter((c) => c.tank_id === t.id)
      .sort((a, b) => b.ended_at.localeCompare(a.ended_at))
      .map(radekCyklu);

    const vTydnech = new Map<string, number>();
    for (let i = 0; i < tydnu; i++) vTydnech.set(posunDnu(zacatek, 7 * i), 0);
    let odZacatkuCyklu = 0;
    const odCyklu = den(t.started_at);
    for (const s of p.staceni) {
      if (s.cellar_tank_id !== t.id) continue;
      const l = cislo(s.source_volume_l);
      if (!(l > 0)) continue;
      const w = pondeliTydne(s.entry_date);
      if (vTydnech.has(w)) vTydnech.set(w, (vTydnech.get(w) ?? 0) + l);
      if (odCyklu && s.entry_date >= odCyklu) odZacatkuCyklu += l;
    }

    const jeVProvozu = !!t.current_beer_name && cislo(t.current_volume_l) > 0;
    let nyni: NyniTanku | null = null;
    if (jeVProvozu) {
      const pocatecni = cislo(t.initial_volume_l);
      const zbyva = cislo(t.current_volume_l);
      // Stočeno v tomhle cyklu: součet litrů z řádků stáčení od začátku cyklu;
      // bez nich rozdíl počátečního a zbývajícího objemu.
      const stocene = odZacatkuCyklu > 0 ? odZacatkuCyklu : Math.max(0, pocatecni - zbyva);
      const dnu = odCyklu ? dniMezi(odCyklu, p.dnes) : null;
      nyni = {
        pivo: t.current_beer_name ?? '—',
        od: odCyklu,
        dnu,
        pocatecniL: Math.round(pocatecni),
        zbyvaL: Math.round(zbyva),
        stoceneL: Math.round(stocene),
        litruTydne: naTyden(stocene, dnu),
      };
    }

    const sDobou = radky.filter((r) => r.dnu != null);
    const sTydnem = radky.filter((r) => r.litruTydne != null);
    const pocatek = radky.reduce((s, r) => s + r.pocatecniL, 0);
    const ztrata = radky.reduce((s, r) => s + r.ztrataL, 0);
    out.push({
      id: t.id,
      label: t.label,
      pivoId: t.current_beer_id ?? null,
      nyni,
      cykly: radky,
      prumerDnu: sDobou.length ? zaokr1(sDobou.reduce((s, r) => s + (r.dnu ?? 0), 0) / sDobou.length) : null,
      prumerLitruTydne: sTydnem.length ? Math.round(sTydnem.reduce((s, r) => s + (r.litruTydne ?? 0), 0) / sTydnem.length) : null,
      ztrataPct: pocatek > 0 ? zaokr1((ztrata / pocatek) * 100) : null,
      tydny: [...vTydnech.entries()].map(([od, litry]) => ({ od, litry: Math.round(litry) })),
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'cs', { numeric: true }));
}
