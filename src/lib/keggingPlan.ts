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
import { jeSud } from './inventoryFix';
import { jeVyrizena } from './stavyObjednavek';
import { weekRange } from '../components/WeeklyOrderSummaryCard';

export type PlanOrderRef = {
  order_id: string;
  /** Řádek objednávky — podle něj se přesouvá část objednávky na jiný den. */
  order_item_id: string;
  place_name: string;
  quantity: number;
  delivered: boolean;
  /**
   * Den, který si vyžádala TAHLE položka (`order_items.delivery_day`).
   * `null` = řádek jede podle dne celé objednávky. Slouží jen k tomu, aby
   * šlo v plánu poznat a vrátit ručně přesunutý řádek.
   */
  vlastniDen: string | null;
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
  /** Kolik z toho je doloženo daty (nachystáno/zavezeno nebo kryto zásobou skladem). */
  autoDone: number;
  /**
   * Z čeho se `autoDone` skládá. Bez tohohle rozpadu je „chybí 2" tvrzení
   * bez důkazu: stáčeč vidí objednávky na šest kusů a appka mu řekne dvě,
   * a nemá jak zjistit, kde se ty čtyři vzaly. Z provozu 9. 9. 2026.
   */
  /** Už fyzicky nachystáno nebo zavezeno (odečet ze skladu na tu položku). */
  nachystano: number;
  /**
   * Pokryto ze zásoby, která na skladě LEŽÍ — ne nutně stočené tenhle
   * týden. Se `currentStockMap` je to skutečná zásoba skladem, takže sem
   * spadá i pivo stočené dávno nebo počáteční stav z inventury. Kdo to
   * zobrazuje, ať to tak i pojmenuje (viz KeggingDayPlan.tsx).
   */
  zChladaku: number;
  /** Kolik kusů si stáčeč ručně odškrtl. */
  checked: number;
  /** Kolik ještě chybí stočit. */
  missing: number;
  orders: PlanOrderRef[];
};

/**
 * Přihrádka pro objednávky, u kterých se NEVÍ, na který den se vezou.
 *
 * Z provozu 8. 9. 2026: „mám tam na úterý co stočit sudy, některý co se mají
 * stočit až ve středu." Objednávka bez uvedeného dne se totiž plánovala na
 * den, kdy se ZADALA (`order_date`) — a u WhatsApp objednávky je to den, kdy
 * ji někdo schválil. Kdo v úterý schválil objednávku na středu, u které AI
 * den dovozu nevytáhla, dostal její sudy na úterý.
 *
 * Domyslet si den z data zadání je horší než přiznat, že se neví: podle plánu
 * se stáčí, takže vymyšlený den znamená sudy stočené o den dřív než je třeba
 * — a jiné o den později. Zmizet ale nesmí (to by je nikdo nestočil), proto
 * vlastní přihrádka, kde jsou vidět a dá se jim den doplnit.
 */
export const BEZ_TERMINU = 'bez';

export type DayPlan = {
  /** 'po' … 'ne', `BEZ_TERMINU`, nebo 'tyden' u souhrnu. */
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
  /**
   * Který obal do tohohle plánu patří. Dostává `kind` I `label`, protože
   * `kind` sám o sobě nestačí: obal „KEG 30l" se zavedeným prázdným nebo
   * jiným druhem propadl filtrem „kind !== 'keg'" mezi LAHVE a stáčení lahví
   * pak hlásilo „chybí 6× 30l tmavá" (z provozu 18. 9. 2026). Stejné
   * rozhodování jako lib/inventoryFix.ts → jeSud.
   */
  jeCilovyObal?: (kind: string, label?: string | null) => boolean;
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
  /**
   * Skutečná zásoba skladem PRÁVĚ TEĎ (klíč `beer_id__package_id`, ze
   * skladové knihy — viz lib/tydenniZbytek.ts, zbytekKeKonciTydne).
   *
   * ⚠️ SMLOUVA: staví se BEZ `zavozDeductionRows`, tedy „počáteční stav
   * + stočené − výdeje (fasování/prodejna/odpisy/akce)", ale odvezené
   * objednávky se z ní NEODEČÍTAJÍ. Poptávka níž totiž počítá VŠECHNY
   * objednávky týdne včetně už zavezených, takže si zavezená objednávka
   * svůj díl z fondu vezme sama.
   *
   * Tohle se jednou rozešlo: testy posílaly zásobu s odpočtem závozu,
   * provoz bez něj, a výpočet si odpočet navíc přičítal zpátky — fond byl
   * o zavezené množství dvakrát bohatší a plán hlásil „vše stočeno“, i
   * když Sklad ukazoval mínus (22. 9. 2026). Kdo tenhle vstup mění, ať
   * drží tuhle jedinou smlouvu.
   *
   * Bez ní
   * plán vidí jako zásobu jen to, co bylo stočeno TENTO týden — z provozu
   * 15. 9. 2026: „mám na skladě 9× 30l, a appka mi stejně píše, že musím
   * stočit další" (a předtím totéž u Němců). Když je zadaná, NAHRAZUJE
   * (nesčítá se s) výpočet zásoby z `keggingRows`/drain níž — skladová
   * kniha už stočení tohoto týdne i výdeje sama zahrnuje, sčítání by je
   * počítalo dvakrát. Bez zadání se plán chová jako dřív (jen tento týden).
   */
  currentStockMap?: Map<string, number>;
};

/** Je to platná zkratka dne ('po'…'ne')? */
export function jeDenVTydnu(den: unknown): boolean {
  return typeof den === 'string' && DAYS.some((d) => d.v === den);
}

/** Den v týdnu ('po'…'ne') z ISO data — bez ohledu na časovou zónu. */
export function dayKeyFromISO(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return DAYS[(d.getUTCDay() + 6) % 7].v;
}

/**
 * Datum toho dne v týdnu, do kterého spadá `kotva`.
 *
 * Přehození dne závozu (Objednávky → přepínač dne) dosud zapisovalo JEN
 * `delivery_day` a `delivery_date` nechávalo být. Obě pole tak popisovala
 * stejnou věc a mohla si odporovat: plán stáčení se řídí dnem, ale filtr
 * týdne, Závoz a přehledy datem. Kdo objednávku přehodil ze středy na úterý,
 * měl ji v plánu na úterý a v datu pořád na středě.
 *
 * Vrací `null` pro neznámý den — volající pak `delivery_date` nemění.
 */
export function datumProDenVTydnu(den: string, kotva: string): string | null {
  const i = DAYS.findIndex((d) => d.v === den);
  if (i < 0) return null;
  const ref = new Date(kotva + 'T00:00:00Z');
  if (Number.isNaN(ref.getTime())) return null;
  const pondeli = new Date(ref);
  pondeli.setUTCDate(ref.getUTCDate() - ((ref.getUTCDay() + 6) % 7));
  pondeli.setUTCDate(pondeli.getUTCDate() + i);
  return pondeli.toISOString().slice(0, 10);
}

/**
 * Položky objednávek TOHOTO týdne — bez ohledu na stav zavezení a bez dělení
 * po dnech (na rozdíl od computeKeggingPlan). Pro zjednodušený týdenní
 * přehled — dřív, den po dni, se zavezené
 * objednávky vyjímaly ze zásoby a to bylo u souhrnné dlaždice matoucí
 * (z provozu 15. 9. 2026: „neodečítej zavezené kegy a objednávky").
 */
export function objednavkyVTydnu(
  orders: { id: string; status: string; delivery_date?: string | null; order_date?: string | null }[],
  orderItems: { order_id: string; beer_id: string | null; package_id: string | null; quantity: number }[],
  weekKey: string,
): { beer_id: string | null; package_id: string | null; quantity: number }[] {
  const { start } = weekRange(weekKey);
  const weekStartStr = start.toISOString().slice(0, 10);
  const weekEndDate = new Date(start);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6);
  const weekEndStr = weekEndDate.toISOString().slice(0, 10);
  const inWeek = (s: string | null | undefined) => !!s && s >= weekStartStr && s <= weekEndStr;

  const aktivniId = new Set(
    orders
      .filter((o) => o.status !== 'storno' && inWeek(o.delivery_date || o.order_date))
      .map((o) => o.id)
  );
  return orderItems.filter((it) => aktivniId.has(it.order_id));
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

  const jeCilovy = input.jeCilovyObal ?? ((kind: string, label?: string | null) => jeSud(kind, label));
  const kegPkgs = new Map(packages.filter((p) => jeCilovy(p.kind, p.label)).map((p) => [p.id, p]));
  const beerName = new Map(beers.map((b) => [b.id, b.name]));

  // ── Zásoba k rozdělení. Se skutečnou zásobou (currentStockMap, viz
  // komentář u typu výš) se bere PŘÍMO ta — skladová kniha už stočení
  // tohoto týdne i výdeje (fasování/prodejna/odpisy) sama zahrnuje. Bez ní
  // (starší volání) se dopočítá po staru: co se TENTO TÝDEN stočilo, mínus
  // co už tento týden fyzicky odešlo. Zbytek leží ve chlaďáku a může
  // pokrýt některý z dalších dnů.
  const pool: Record<string, number> = {};
  if (input.currentStockMap) {
    // Fond = skutečná zásoba (stejné číslo jako Sklad) + odpočty závozu
    // TOHOTO týdne zpátky.
    //
    // Proč zpátky: poptávka níž počítá VŠECHNY objednávky týdne, i ty, co
    // už odjely. Kdyby se jejich odpočet nevrátil, odečetl by se dvakrát —
    // jednou ve skladu, podruhé v poptávce (z provozu 16. 9. 2026:
    // „16 objednaných, 12 už zavezených, 11 skladem, a appka mi napsala,
    // že chybí stočit 5").
    //
    // Proč jen TENHLE týden: odpočty ze starších týdnů se vracet nesmí —
    // jejich objednávky v poptávce nejsou. Právě tím vznikla chyba z
    // 22. 9. 2026: volající zásobu stavěli bez odpočtů za CELOU historii,
    // takže fond obsahoval každý sud, který kdy odjel (100 stočených a
    // 100 rozvezených → Sklad 0, fond 100) a plán svítil „pokryto" i u
    // piva, které nikdo nestočil. Volající teď posílají skutečný sklad a
    // vrací se jen tenhle týden.
    //
    // ⚠️ Vrací se JEN pro klíč, který v currentStockMap SKUTEČNĚ existuje —
    // to je jediný důkaz, že se to pivo+obal opravdu stáčelo. Bez toho by
    // appka věřila kalendáři místo stočení (migrace 20261231010000).
    const vracenoZaZavozy: Record<string, number> = {};
    zavozDeductionRows.forEach((r: any) => {
      if (!r.beer_id || !r.package_id || !kegPkgs.has(r.package_id) || !inWeek(r.deduct_date)) return;
      const k = `${r.beer_id}__${r.package_id}`;
      if (!input.currentStockMap!.has(k)) return;
      vracenoZaZavozy[k] = (vracenoZaZavozy[k] || 0) + Number(r.quantity || 0);
    });
    input.currentStockMap.forEach((qty, k) => { pool[k] = qty + (vracenoZaZavozy[k] || 0); });
    // NEořezávat na nulu tady: záporná hodnota (i po vrácení závozů) je
    // skutečný dluh (vydalo se víc, než kdy bylo stočeno) a `sestavDen` níž
    // ho musí umět připočítat k tomu, co ještě chybí stočit — jinak by appka
    // takový dluh navždy tiše ignorovala, i když ho Sklad ukazuje poctivě
    // záporný (z provozu 15. 9. 2026: audit).
  } else {
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
    drain(fasovaniRows, 'entry_date');
    drain(prodejnaRows, 'entry_date');
    drain(writeoffsRows, 'entry_date');
  }
  // Odpočty závozu (zavozDeductionRows) zásobu NEubírají SAMY (mimo
  // currentStockMap, kde je skladová kniha zahrnuje): odpočet se zapisuje
  // podle kalendáře, když den závozu projde, a nic neříká o tom, jestli se
  // pivo stočilo. Zásobu ubírají jen objednávky, které člověk označil jako
  // zavezené — viz níž u poptávky (migrace 20261231080000, 13. 9. 2026).
  //
  // Volající pro tenhle výpočet postaví zásobu BEZ zavozDeductionRows (viz
  // `currentStockMap` v Kegging.tsx/BottlingScreen.tsx/CoStocitOkno.tsx) —
  // co si tenhle týden odpočet zavozu vzal, se proto výš (`vracenoZaZavozy`)
  // vrací zpátky do fondu, ať se to nepočítá jako chybějící ještě jednou
  // (z provozu 16. 9. 2026: „16 objednaných, 12 už zavezených, 11 skladem,
  // a appka mi napsala, že chybí stočit 5"). Bez ručního „Zavezeno" u
  // manuálně odbavené objednávky (mimo zavoz_deductions) fond dál ubírá
  // přímo v poptávce níž (z provozu 15. 9. 2026: „stočil jsem 21×30, appka
  // mi přesto píše, že 4 chybí").

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
    // jinak se odvodí z DATA DOVOZU.
    //
    // ⚠️ Nikdy ne z `order_date`. To je datum ZADÁNÍ, ne dovozu — u WhatsApp
    // objednávky den, kdy ji někdo schválil. Odvozovat z něj den stáčení
    // znamenalo, že objednávka bez uvedeného termínu spadla na dnešek.
    // Když termín není, jde do přihrádky `BEZ_TERMINU` (viz komentář u ní).
    if (jeDenVTydnu(o.delivery_day)) {
      orderDay.set(o.id, o.delivery_day);
      return;
    }
    orderDay.set(o.id, o.delivery_date ? dayKeyFromISO(o.delivery_date) : BEZ_TERMINU);
  });

  // ── Co je z objednávek už vykryté: JEN objednávka, kterou člověk označil
  // jako zavezenou. Odpočet ze skladu (zavoz_deductions) o stočení nic neříká —
  // zapisuje se podle kalendáře, a když se podle něj plán řídil, psal
  // „vše stočeno" jen proto, že den závozu prošel (z provozu 11.–12. 9. 2026).
  // Co se opravdu stočilo, pozná plán ze stáčení (zásoba v chlaďáku) a z ručního
  // odškrtnutí (kegging_plan_checks).

  type Bucket = { ordered: number; covered: number; orders: PlanOrderRef[] };
  const byDay: Record<string, Record<string, Bucket>> = {};
  DAYS.forEach((d) => { byDay[d.v] = {}; });
  byDay[BEZ_TERMINU] = {};

  orderItems.forEach((it) => {
    if (!it.beer_id || !it.package_id || !kegPkgs.has(it.package_id)) return;
    // Den objednávky rozhoduje o tom, jestli je řádek v tomhle týdnu vůbec
    // ve hře. Teprve pak se smí uplatnit vlastní den položky — jinak by
    // řádek přesunutý na středu vytáhl do plánu i objednávku z jiného týdne.
    const denObjednavky = orderDay.get(it.order_id);
    if (!denObjednavky) return;
    // Objednávka se běžně veze na dvakrát: „část od Radka se vezla o den
    // dřív". Položka si proto může nést vlastní den (viz migrace
    // 20261231070000) a pak se plánuje podle něj, ne podle celé objednávky.
    const vlastniDen = jeDenVTydnu(it.delivery_day) ? (it.delivery_day as string) : null;
    const day = vlastniDen ?? denObjednavky;
    const ord = ordersById.get(it.order_id);
    const qty = Number(it.quantity || 0);
    if (qty <= 0) return;
    const k = `${it.beer_id}__${it.package_id}`;
    const bucket = (byDay[day][k] ||= { ordered: 0, covered: 0, orders: [] });
    const wholeOrderDone = !!ord?.is_delivered || jeVyrizena(ord?.status);
    // Se skutečnou zásobou skladem (currentStockMap) se zavezená objednávka
    // NEBERE jako vykrytá tady — kryje ji fond výš (`vracenoZaZavozy`), který
    // ji do fondu vrátil. Dvojí odečet (jednou tady, podruhé z fondu) by
    // zásobu vynuloval — z provozu 16. 9. 2026: „pokud mám na skladě 11×30,
    // tak mi přece nemůže chybět 5×30“.
    const covered = wholeOrderDone && !input.currentStockMap ? qty : 0;
    // Zavezené sudy fyzicky odjely — nesmí pokrýt další den ze zásoby.
    // JEN bez `currentStockMap` — s ním už je odvoz odečtený ve skladové
    // knize a fond výš ho zase vrátil, takže odečítat ho tu podruhé by
    // zásobu ochudilo o kusy, které nikdy neopustily chladák.
    if (!input.currentStockMap && wholeOrderDone && inWeek(ord?.delivery_date || ord?.order_date)) {
      pool[k] = Math.max(0, (pool[k] || 0) - qty);
    }
    bucket.ordered += qty;
    bucket.covered += covered;
    bucket.orders.push({
      order_id: it.order_id,
      order_item_id: it.id,
      place_name: ord?.place_name || 'Neznámý odběratel',
      quantity: qty,
      delivered: covered >= qty,
      vlastniDen,
    });
  });

  // ── Rozdělení zásoby mezi dny — od nejbližšího dne, protože ten se veze
  // dřív. Zavezené kusy stáčet netřeba, ty se odečtou rovnou.
  const sestavDen = (dayKey: string, label: string, date: string): DayPlan => {
    const items: PlanItem[] = Object.entries(byDay[dayKey]).map(([k, b]) => {
      const [beer_id, package_id] = k.split('__');
      const pkg = kegPkgs.get(package_id)!;
      // Fond (pool[k]) může být ZÁPORNÝ — skutečný dluh z minula (vydalo se
      // víc, než kdy bylo stočeno). Ten dluh se řeší HNED, na prvním dni,
      // kde se na tenhle klíč sáhne: připočítá se k tomu, co chybí, a fond
      // se od něj očistí (na 0), ať ho žádný další den v týdnu nezpracoval
      // znovu. Kladná část fondu se pak čerpá jako dřív.
      const deficit = Math.max(0, -(pool[k] || 0));
      const poolKladny = Math.max(0, pool[k] || 0);
      const stillNeeded = Math.max(0, b.ordered - b.covered);
      const fromPool = Math.min(stillNeeded, poolKladny);
      pool[k] = poolKladny - fromPool;
      const autoDone = b.covered + fromPool;
      // Ruční odškrtnutí a doložený stav se skládají přes MAX. Součet by
      // položku započítal dvakrát ve chvíli, kdy si ji stáčeč odškrtne a pak
      // ji poctivě zapíše i do stáčení — a to je běžný postup, ne výjimka.
      const checked = Math.min(b.ordered, Number(checkedMap[`${dayKey}__${beer_id}__${package_id}`] || 0));
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
        nachystano: b.covered,
        zChladaku: fromPool,
        checked,
        missing: Math.max(0, b.ordered - done) + deficit,
        orders: b.orders,
      };
    });
    items.sort((a, z) => z.missing - a.missing || a.beer_name.localeCompare(z.beer_name, 'cs') || z.volume_l - a.volume_l);
    return {
      day: dayKey,
      label,
      date,
      items,
      totalOrdered: items.reduce((s, x) => s + x.ordered, 0),
      totalDone: items.reduce((s, x) => s + x.done, 0),
      totalMissing: items.reduce((s, x) => s + x.missing, 0),
      missingLiters: items.reduce((s, x) => s + x.missing * x.volume_l, 0),
    };
  };

  // Pořadí ROZHODUJE: `sestavDen` ubírá ze zásoby v chlaďáku (`pool`), takže
  // co se staví dřív, dostane stočené sudy dřív. Dny s termínem proto jdou
  // první — ty se opravdu vezou. Objednávky bez termínu berou až zbytek.
  const plans: DayPlan[] = DAYS.map((d, i) => sestavDen(d.v, d.label, dayDates[i]));
  plans.push(sestavDen(BEZ_TERMINU, 'Bez termínu', ''));

  return plans;
}

/** Kolik kusů jednoho obalu (30l, 50l…) zbývá stočit. */
export type RozpadObalu = {
  package_id: string;
  package_label: string;
  volume_l: number;
  /** Kolik si jich vyžádaly objednávky. */
  ordered: number;
  /** Kolik z toho ještě chybí stočit. */
  missing: number;
  /** Litry, které ty chybějící kusy představují. */
  missingLiters: number;
};

/**
 * Rozpad „zbývá stočit" podle VELIKOSTI SUDU, přes všechna piva.
 *
 * Z provozu: „musí tam být i přehled, kolik jednotlivých KEG sudů zbývá
 * stočit — kolik dohromady třicítek, padesátek atd." Seznam je totiž po
 * pivech, takže „kolik mám nachystat padesátek" se z něj dá zjistit jen
 * sečtením deseti řádků v hlavě. U linky se přitom chystají OBALY, ne piva:
 * prázdné sudy se tahají po velikostech.
 *
 * Řadí se od největšího sudu — tak se o nich v pivovaru mluví (padesátky,
 * třicítky, dvacítky) a tak se i staví na paletu.
 */
export function rozpadPoObalech(plan: DayPlan): RozpadObalu[] {
  const podle = new Map<string, RozpadObalu>();
  plan.items.forEach((it) => {
    const zaznam = podle.get(it.package_id) ?? {
      package_id: it.package_id,
      package_label: it.package_label,
      volume_l: it.volume_l,
      ordered: 0,
      missing: 0,
      missingLiters: 0,
    };
    zaznam.ordered += it.ordered;
    zaznam.missing += it.missing;
    zaznam.missingLiters += it.missing * it.volume_l;
    podle.set(it.package_id, zaznam);
  });
  return [...podle.values()].sort(
    (a, z) => z.volume_l - a.volume_l || a.package_label.localeCompare(z.package_label, 'cs')
  );
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
      prev.nachystano += it.nachystano;
      prev.zChladaku += it.zChladaku;
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
