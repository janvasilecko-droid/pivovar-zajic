/**
 * 🏠 Karta odběratele — co o něm appka ví, na jednom místě.
 *
 * Dnes se to skládá ze tří obrazovek: Objednávky (co bere), Závoz (kdy se
 * mu vozí) a Ceník. Když volá hospoda a chce „to co posledně", listuje se
 * v objednávkách zpátky a hádá se, co bylo to poslední.
 *
 * Modul je čistý výpočet nad řádky, které obrazovka už má. Nic nedotahuje
 * a nic nepočítá o skladu.
 */

export type ObjednavkaOdberatele = {
  id: string;
  /** Datum závozu, jinak datum objednávky. */
  datum: string;
  status?: string | null;
};

export type PolozkaOdberatele = {
  order_id: string;
  beer_id: string | null;
  beer_name?: string | null;
  package_id: string | null;
  package_label?: string | null;
  quantity: number | string | null;
};

export type OblibenaPolozka = {
  beer_id: string | null;
  package_id: string | null;
  popis: string;
  /** Kolik kusů celkem za sledované období. */
  kusu: number;
  /** V kolika objednávkách se objevila. */
  objednavek: number;
};

export type KartaOdberatele = {
  /** Kolik objednávek celkem (mimo storno). */
  objednavek: number;
  /** Datum poslední objednávky, nebo null. */
  posledni: string | null;
  /** Kolik dní od poslední objednávky. null = neznámo. */
  dnuOdPosledni: number | null;
  /**
   * Jak často bere — průměr dnů mezi objednávkami. null, když je jich
   * málo (z jedné objednávky se rytmus určit nedá).
   */
  prumerneKazdychDni: number | null;
  /** Co bere nejčastěji, od největšího množství. */
  oblibene: OblibenaPolozka[];
  /** Položky poslední objednávky — „to co posledně". */
  posledniObjednavka: OblibenaPolozka[];
};

function cislo(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function dnuMezi(odISO: string, doISO: string): number {
  const a = new Date(`${odISO}T00:00:00Z`).getTime();
  const b = new Date(`${doISO}T00:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / (1000 * 3600 * 24));
}

function popisPolozky(p: PolozkaOdberatele): string {
  const pivo = (p.beer_name ?? '').trim() || 'neurčené pivo';
  const obal = (p.package_label ?? '').trim();
  return obal ? `${pivo} · ${obal}` : pivo;
}

/** Sečte položky po kombinaci pivo+obal, od největšího množství. */
function sectiPolozky(polozky: PolozkaOdberatele[]): OblibenaPolozka[] {
  const podle = new Map<string, OblibenaPolozka & { objednavkyIds: Set<string> }>();
  for (const p of polozky) {
    const klic = `${p.beer_id ?? '-'}__${p.package_id ?? '-'}`;
    const z = podle.get(klic) ?? {
      beer_id: p.beer_id ?? null,
      package_id: p.package_id ?? null,
      popis: popisPolozky(p),
      kusu: 0,
      objednavek: 0,
      objednavkyIds: new Set<string>(),
    };
    z.kusu += cislo(p.quantity);
    z.objednavkyIds.add(p.order_id);
    podle.set(klic, z);
  }
  return [...podle.values()]
    .map(({ objednavkyIds, ...zbytek }) => ({ ...zbytek, objednavek: objednavkyIds.size }))
    .filter((z) => z.kusu > 0)
    .sort((a, b) => b.kusu - a.kusu);
}

/**
 * Postaví kartu odběratele.
 *
 * `dnesISO` se předává, ne bere z hodin — jinak by test byl závislý na dni,
 * kdy se pustí.
 */
export function kartaOdberatele(
  objednavky: ObjednavkaOdberatele[],
  polozky: PolozkaOdberatele[],
  dnesISO: string,
): KartaOdberatele {
  // Storno se nepočítá: zrušená objednávka neříká nic o tom, co odběratel
  // bere ani jak často.
  const platne = objednavky
    .filter((o) => o.status !== 'storno')
    .filter((o) => !!o.datum)
    .sort((a, b) => a.datum.localeCompare(b.datum));

  const idPlatnych = new Set(platne.map((o) => o.id));
  const polozkyPlatne = polozky.filter((p) => idPlatnych.has(p.order_id));

  const posledni = platne.length > 0 ? platne[platne.length - 1].datum : null;
  const posledniId = platne.length > 0 ? platne[platne.length - 1].id : null;

  // Rytmus: průměr rozestupů mezi objednávkami. Z jedné objednávky se
  // odvodit nedá, tak se neodvozuje.
  let prumerneKazdychDni: number | null = null;
  if (platne.length >= 2) {
    const rozestupy: number[] = [];
    for (let i = 1; i < platne.length; i += 1) {
      rozestupy.push(dnuMezi(platne[i - 1].datum, platne[i].datum));
    }
    const soucet = rozestupy.reduce((a, b) => a + b, 0);
    prumerneKazdychDni = Math.max(1, Math.round(soucet / rozestupy.length));
  }

  return {
    objednavek: platne.length,
    posledni,
    dnuOdPosledni: posledni ? Math.max(0, dnuMezi(posledni, dnesISO)) : null,
    prumerneKazdychDni,
    oblibene: sectiPolozky(polozkyPlatne).slice(0, 6),
    posledniObjednavka: posledniId
      ? sectiPolozky(polozkyPlatne.filter((p) => p.order_id === posledniId))
      : [],
  };
}
