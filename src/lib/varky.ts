// 🧪 Várky ve sklepě — výpočty bez obrazovky (components/VarkySklep.tsx).

export type Varka = {
  id: string;
  batch_number: string | null;
  beer_id: string | null;
  beer_name: string | null;
  tank_id: string | null;
  tank_label: string | null;
  volume_hl: number | null;
  og: number | null;
  fg: number | null;
  started_at: string | null;
  finished_at: string | null;
  note: string | null;
  kvasnice_generace: number | null;
  kvasnice_z_varky: string | null;
  created_at: string;
};

export type Mereni = {
  id: string;
  batch_id: string;
  measured_at: string;
  stupnovitost: number | null;
  teplota_c: number | null;
  poznamka: string | null;
  zapsal: string | null;
};

/**
 * Zdánlivé prokvašení v % ze stupňovitosti na začátku a na konci (°P).
 * Bez obou hodnot, nebo s nesmyslnými (konec nad začátkem), se nepočítá.
 */
export function prokvaseni(og: number | null | undefined, fg: number | null | undefined): number | null {
  if (og == null || fg == null) return null;
  const a = Number(og);
  const b = Number(fg);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b < 0 || b > a) return null;
  return Math.round(((a - b) / a) * 1000) / 10;
}

/**
 * Generace kvasnic pro novou várku nasazenou ze `zdroj`. Když zdroj svou
 * generaci nezná, bere se, že šlo o čerstvé kvasnice (1) — nová je tedy 2.
 */
export function dalsiGenerace(zdroj: Pick<Varka, 'kvasnice_generace'> | null | undefined): number {
  if (!zdroj) return 1;
  return (zdroj.kvasnice_generace ?? 1) + 1;
}

/** Aktuální stupňovitost: poslední měření, jinak počáteční. */
export function posledniStupnovitost(varka: Pick<Varka, 'og'>, mereni: Mereni[]): number | null {
  const s = [...mereni].filter((m) => m.stupnovitost != null).sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  return s.length ? Number(s[0].stupnovitost) : (varka.og ?? null);
}

export type BodGrafu = { x: number; y: number; hodnota: number; cas: string };

/**
 * Body čáry stupňovitosti v souřadnicích SVG (0..sirka, 0..vyska, y dolů).
 * Osa x je čas, ne pořadí — měření po hodině a po třech dnech nejsou stejně
 * daleko a graf by jinak lhal o rychlosti kvašení.
 */
export function bodyGrafu(mereni: Mereni[], sirka: number, vyska: number): BodGrafu[] {
  const s = mereni
    .filter((m) => m.stupnovitost != null && Number.isFinite(Date.parse(m.measured_at)))
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  if (s.length === 0) return [];
  const casy = s.map((m) => Date.parse(m.measured_at));
  const hodnoty = s.map((m) => Number(m.stupnovitost));
  const t0 = Math.min(...casy);
  const t1 = Math.max(...casy);
  const lo = Math.min(...hodnoty);
  const hi = Math.max(...hodnoty);
  return s.map((m, i) => ({
    x: t1 === t0 ? sirka / 2 : ((casy[i] - t0) / (t1 - t0)) * sirka,
    y: hi === lo ? vyska / 2 : vyska - ((hodnoty[i] - lo) / (hi - lo)) * vyska,
    hodnota: hodnoty[i],
    cas: m.measured_at,
  }));
}
