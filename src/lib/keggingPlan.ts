// 🗓️ Plán stáčení po dnech — „co musím stočit na který den".
// Používá se pro sudy i pro lahve; liší se jen filtrem obalů (jeCilovyObal)
// a tím, jestli se předají řádky z `kegging`, nebo z `bottling`.
// ---------------------------------------------------------------------------
// Záměrně NEPOUŽÍVÁ měsíční skladový model (getStartingStockMap), na kterém
// stojí packageNeeds.ts. Ten model je odvozený z inventury + všech pohybů za
// měsíc a když se rozejde s realitou (v srpnu 2026 vyšlo devět druhů sudů do
// mínusu, protože chyběl převod zásoby z července), ořízne se výsledek na
// nulu — a od té chvíle se čerstvě stočený sud v „potřeba stočit" ztratí,
// protože nejdřív umazává neexistující dluh. Přesně to uživatel popsal jako
// „když zadám stáčení, neodepíše se to hned".
//
// Tenhle výpočet pracuje JEN s daty aktuálního týdne, kde je poptávka i
// nabídka jednoznačná:
//   • poptávka = položky objednávek s dovozem na daný den
//   • hotovo   = už zavezené objednávky (fyzicky ven = stáčet netřeba)
//                + stočené sudy tento týden, rozdělené mezi dny od nejbližšího
//   • chybí    = poptávka − hotovo
//
// Díky tomu se každý nový zápis do `kegging` projeví okamžitě a přesně o tolik
// sudů, kolik se zapsalo.
import { DAYS } from './shared';
import { weekRange } from '../components/WeeklyOrderSummaryCard';

export type PlanOrderRef = {
  order_id: string;
  place_name: string;
  quantity: number;
  delivered: boolean;
};

export type PlanItem = {
  key: string;
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  volume_l: number;
  /** Kolik sudů si tenhle den vyžádaly objednávky. */
  ordered: number;
  /** Kolik z toho je pokryto — vyšší z „doloženo daty" a „ručně odškrtnuto". */
  done: number;
  /** Kolik z toho je doloženo daty (nachystáno/zavezeno nebo stočeno tento týden). */
  autoDone: number;
  /** Kolik kusů si stáčeč ručně odškrtl. */
  checked: number;
  /** Kolik ještě chybí stočit. */
  missing: number;
  orders: PlanOrderRef[];
};

export type DayPlan = {
  /** 'po' … 'ne' */
  day: string;
  label: string;
  /** ISO datum toho dne v aktuálním týdnu. */
  date: string;
  items: PlanItem[];
  totalOrdered: number;
  totalDone: number;
  totalMissing: number;
  /** Litry, které ještě chybí stočit — pro odhad, kolik brát z tanku. */
  missingLiters: number;
};

export type KeggingPlanInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  orders: any[];
  orderItems: any[];
  /**
   * Řádky výroby pro daný druh obalu — pro sudy `kegging`, pro lahve
   * `bottling`. Výpočet je jinak stejný, viz jeCilovyObal níže.
   */
  keggingRows: any[];
  /**
   * Které obaly se plánují. Výchozí jsou sudy (kvůli stávajícím voláním),
   * pro lahve se předá `(kind) => kind !== 'keg'`.
   */
  jeCilovyObal?: (kind: string) => boolean;
  zavozDeductionRows?: any[];
  fasovaniRows?: any[];
  prodejnaRows?: any[];
  writeoffsRows?: any[];
  /**
   * Ruční odškrtnutí stáčeče (tabulka kegging_plan_checks) — pracovní pomůcka,
   * NE evidence stáčení. Skládá se s doloženým stavem přes MAX, ne součtem:
   * když si položku odškrtne a později ji poctivě zapíše do stáčení, nesmí se
   * počítat dvakrát.
   */
  checkRows?: { week_key: string; day: string; beer_id: string; package_id: string; qty: number }[];
  weekKey: string;
};

/** Den v týdnu ('po'…'ne') z ISO data — bez ohledu na časovou zónu. */
export function dayKeyFromISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7].v;
}

export function computeKeggingPlan(input: KeggingPlanInput): DayPlan[] {
  const {
    beers,
    packages,
    orders,
    orderItems,
    keggingRows,
    zavozDeductionRows = [],
    fasovaniRows = [],
    prodejnaRows = [],
    writeoffsRows = [],
    checkRows = [],
    weekKey,
  } = input;

  const checkedMap: Record<string, number> = {};
  checkRows.filter((r) => r.week_key === weekKey).forEach((r) => {
    checkedMap[`${r.day}__${r.beer_id}__${r.package_id}`] = Number(r.qty || 0);
  });

  const { start } = weekRange(weekKey);
  const dayDates = DAYS.map((_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const weekStartStr = dayDates[0];
  const weekEndStr = dayDates[6];
  const inWeek = (s: string | null | undefined) => !!s && s >= weekStartStr && s <= weekEndStr;

  const jeCilovy = input.jeCilovyObal ?? ((kind: string) => kind === 'keg');
  const kegPkgs = new Map(packages.filter((p) => jeCilovy(p.kind)).map((p) => [p.id, p]));
  const beerName = new Map(beers.map((b) => [b.id, b.name]));

  // ── Zásoba k rozdělení: co se tento týden stočilo, mínus co už fyzicky
  // odešlo (zavezené objednávky, fasování, prodejna, odpisy). Zbytek leží ve
  // chlaďáku a může pokrýt některý z dalších dnů.
  const pool: Record<string, number> = {};
  keggingRows.filter((r) => inWeek(r.entry_date)).forEach((r) => {
    if (!r.beer_id || !r.package_id || !kegPkgs.has(r.package_id)) return;
    const k = `${r.beer_id}__${r.package_id}`;
    pool[k] = (pool[k] || 0) + Number(r.quantity || 0);
  });
  const drain = (rows: any[], dateField: string) => {
    rows.filter((r) => inWeek(r[dateField])).forEach((r) => {
      if (!r.beer_id || !r.package_id || !kegPkgs.has(r.package_id)) return;
      const k = `${r.beer_id}__${r.package_id}`;
      pool[k] = (pool[k] || 0) - Number(r.quantity || 0);
    });
  };
  drain(zavozDeductionRows, 'deduct_date');
  drain(fasovaniRows, 'entry_date');
  drain(prodejnaRows, 'entry_date');
  drain(writeoffsRows, 'entry_date');
  Object.keys(pool).forEach((k) => { pool[k] = Math.max(0, pool[k]); });

  // ── Poptávka po dnech.
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const activeOrders = orders.filter((o) => {
    if (o.status === 'storno') return false;
    const target = o.delivery_date || o.order_date;
    return inWeek(target);
  });
  const orderDay = new Map<string, string>();
  activeOrders.forEach((o) => {
    // Přednost má explicitní den závozu (uživatel ho v Závozu ručně přehazuje),
    // jinak se odvodí z data dovozu.
    const target = o.delivery_date || o.order_date;
    const day = o.delivery_day && DAYS.some((d) => d.v === o.delivery_day) ? o.delivery_day : dayKeyFromISO(target);
    orderDay.set(o.id, day);
  });

  // ── Co je z objednávek už vykryté. Rozhoduje ODEČET ZE SKLADU u konkrétní
  // položky (zavoz_deductions.order_item_id), ne příznak `is_delivered` na
  // objednávce: v provozu se sudy nachystají a odečtou ze skladu klidně dva dny
  // dopředu, zatímco objednávka zůstane „nová", dokud řidič nedojede. Kdyby se
  // šlo podle `is_delivered`, těch nachystaných sudů (25. 8. 2026 jich bylo 68)
  // by plán žádal stočit znovu.
  const deductedByItem: Record<string, number> = {};
  zavozDeductionRows.forEach((r) => {
    if (!r.order_item_id) return;
    deductedByItem[r.order_item_id] = (deductedByItem[r.order_item_id] || 0) + Number(r.quantity || 0);
  });

  type Bucket = { ordered: number; covered: number; orders: PlanOrderRef[] };
  const byDay: Record<string, Record<string, Bucket>> = {};
  DAYS.forEach((d) => { byDay[d.v] = {}; });

  orderItems.forEach((it) => {
    if (!it.beer_id || !it.package_id || !kegPkgs.has(it.package_id)) return;
    const day = orderDay.get(it.order_id);
    if (!day) return;
    const ord = ordersById.get(it.order_id);
    const qty = Number(it.quantity || 0);
    if (qty <= 0) return;
    const k = `${it.beer_id}__${it.package_id}`;
    const bucket = (byDay[day][k] ||= { ordered: 0, covered: 0, orders: [] });
    const wholeOrderDone = !!ord?.is_delivered || ord?.status === 'vyrizeno' || ord?.status === 'vyrizeno_zavoz';
    const covered = wholeOrderDone ? qty : Math.min(qty, Number(deductedByItem[it.id] || 0));
    bucket.ordered += qty;
    bucket.covered += covered;
    bucket.orders.push({
      order_id: it.order_id,
      place_name: ord?.place_name || 'Neznámý odběratel',
      quantity: qty,
      delivered: covered >= qty,
    });
  });

  // ── Rozdělení zásoby mezi dny — od nejbližšího dne, protože ten se veze
  // dřív. Zavezené kusy stáčet netřeba, ty se odečtou rovnou.
  const plans: DayPlan[] = DAYS.map((d, i) => {
    const items: PlanItem[] = Object.entries(byDay[d.v]).map(([k, b]) => {
      const [beer_id, package_id] = k.split('__');
      const pkg = kegPkgs.get(package_id)!;
      const stillNeeded = Math.max(0, b.ordered - b.covered);
      const fromPool = Math.min(stillNeeded, pool[k] || 0);
      pool[k] = (pool[k] || 0) - fromPool;
      const autoDone = b.covered + fromPool;
      // Ruční odškrtnutí a doložený stav se skládají přes MAX. Součet by
      // položku započítal dvakrát ve chvíli, kdy si ji stáčeč odškrtne a pak
      // ji poctivě zapíše i do stáčení — a to je běžný postup, ne výjimka.
      const checked = Math.min(b.ordered, Number(checkedMap[`${d.v}__${beer_id}__${package_id}`] || 0));
      const done = Math.max(autoDone, checked);
      return {
        key: k,
        beer_id,
        beer_name: beerName.get(beer_id) || 'Neznámé pivo',
        package_id,
        package_label: pkg.label,
        volume_l: Number(pkg.volume_l || 0),
        ordered: b.ordered,
        done,
        autoDone,
        checked,
        missing: Math.max(0, b.ordered - done),
        orders: b.orders,
      };
    });
    items.sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
    return {
      day: d.v,
      label: d.label,
      date: dayDates[i],
      items,
      totalOrdered: items.reduce((s, x) => s + x.ordered, 0),
      totalDone: items.reduce((s, x) => s + x.done, 0),
      totalMissing: items.reduce((s, x) => s + x.missing, 0),
      missingLiters: items.reduce((s, x) => s + x.missing * x.volume_l, 0),
    };
  });

  return plans;
}

/**
 * Sloučí denní plány do jednoho „celý týden" — stejné položky, jen sečtené
 * přes všechny dny. Nahrazuje bývalou záložku „Potřeba stočit KEGy", která
 * týdenní součet počítala z měsíčního skladového modelu a kvůli jeho
 * schodkům ukazovala jiná čísla než denní rozpad.
 */
export function mergeWeekPlan(plans: DayPlan[], weekLabel: string): DayPlan {
  const merged = new Map<string, PlanItem>();
  plans.forEach((p) => {
    p.items.forEach((it) => {
      const prev = merged.get(it.key);
      if (!prev) {
        merged.set(it.key, { ...it, orders: [...it.orders] });
        return;
      }
      prev.ordered += it.ordered;
      prev.done += it.done;
      prev.autoDone += it.autoDone;
      prev.checked += it.checked;
      prev.missing += it.missing;
      prev.orders.push(...it.orders);
    });
  });
  const items = [...merged.values()].sort(
    (a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l
  );
  return {
    day: 'tyden',
    label: weekLabel,
    date: plans[0]?.date ?? '',
    items,
    totalOrdered: items.reduce((s, x) => s + x.ordered, 0),
    totalDone: items.reduce((s, x) => s + x.done, 0),
    totalMissing: items.reduce((s, x) => s + x.missing, 0),
    missingLiters: items.reduce((s, x) => s + x.missing * x.volume_l, 0),
  };
}
