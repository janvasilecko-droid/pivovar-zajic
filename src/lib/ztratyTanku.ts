// 📉 Ztráty při stáčení v čase — po pivech a po tancích.
//
// Každý ukončený cyklus tanku si ukládá, kolik procent piva se ztratilo
// (cellar_tank_cycles.loss_pct). Na kartě tanku jsou vidět jen poslední tři
// cykly, takže se nedalo říct, jestli má některý tank nebo pivo ztráty
// soustavně vyšší, ani jestli se to lepší, nebo horší.
//
// Průměr je VÁŽENÝ objemem (součet ztracených litrů / součet počátečních
// litrů), ne průměr procent: malý zbytkový cyklus s 20 % by jinak přebil
// deset plných tanků s 2 %.

export type CyklusTanku = {
  tank_id: string | null;
  tank_label: string | null;
  beer_id: string | null;
  beer_name: string | null;
  initial_volume_l: number | string | null;
  loss_l: number | string | null;
  ended_at: string;
};

export type SkupinaZtrat = {
  klic: string;
  nazev: string;
  cyklu: number;
  ztrataL: number;
  /** Vážené procento ztrát za celé období. */
  ztrataPct: number;
  /** Vážené procento za posledních N cyklů (N = TREND_CYKLU). */
  poslednichPct: number | null;
  /** Vážené procento za cykly před nimi. */
  predtimPct: number | null;
};

export const TREND_CYKLU = 3;

function cislo(v: number | string | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function vazeneProcento(cykly: CyklusTanku[]): number | null {
  const pocatek = cykly.reduce((s, c) => s + cislo(c.initial_volume_l), 0);
  if (pocatek <= 0) return null;
  const ztrata = cykly.reduce((s, c) => s + cislo(c.loss_l), 0);
  return Math.round((ztrata / pocatek) * 1000) / 10;
}

export function ztratyPodle(cykly: CyklusTanku[], podle: 'pivo' | 'tank'): SkupinaZtrat[] {
  const skupiny = new Map<string, { nazev: string; cykly: CyklusTanku[] }>();
  for (const c of cykly) {
    if (cislo(c.initial_volume_l) <= 0) continue;
    const klic = podle === 'pivo' ? (c.beer_id || c.beer_name || '') : (c.tank_id || c.tank_label || '');
    if (!klic) continue;
    const nazev = (podle === 'pivo' ? c.beer_name : c.tank_label) || '—';
    const s = skupiny.get(klic) ?? { nazev, cykly: [] };
    s.cykly.push(c);
    skupiny.set(klic, s);
  }

  const out: SkupinaZtrat[] = [];
  skupiny.forEach(({ nazev, cykly: seznam }, klic) => {
    const serazene = [...seznam].sort((a, b) => b.ended_at.localeCompare(a.ended_at));
    const posledni = serazene.slice(0, TREND_CYKLU);
    const predtim = serazene.slice(TREND_CYKLU);
    out.push({
      klic,
      nazev,
      cyklu: seznam.length,
      ztrataL: Math.round(seznam.reduce((s, c) => s + cislo(c.loss_l), 0)),
      ztrataPct: vazeneProcento(seznam) ?? 0,
      poslednichPct: predtim.length ? vazeneProcento(posledni) : null,
      predtimPct: predtim.length ? vazeneProcento(predtim) : null,
    });
  });
  return out.sort((a, b) => b.ztrataPct - a.ztrataPct);
}
