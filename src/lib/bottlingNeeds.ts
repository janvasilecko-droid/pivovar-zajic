// ⚙️ Výpočet potřeby stáčení — „co je potřeba stočit".
// ---------------------------------------------------------------------------
// Sdílená logika pro sekci „Zadávání stáčení lahví" v Nastavení (admin).
// Sestaví řádek pivo × obal s těmito sloupci (VŠE ZA AKTUÁLNÍ TÝDEN, od
// pondělí do teď — ne za celý měsíc):
//   • stock         – sklad TEĎ = sklad v pondělí ráno (počátek měsíce
//                     s převodem z předchozího měsíce + pohyby od 1. dne
//                     měsíce do pondělí) + stočeno/kegováno OD PONDĚLÍ −
//                     výdej (fasování/prodejna/odpisy/Akce-festivaly/zavezené
//                     objednávky) OD PONDĚLÍ
//   • ordered       – VŠECHNY objednávky v daném týdnu (i už zavezené, ať je
//                     vidět celková týdenní potřeba na středeční/čtvrteční/
//                     páteční zavoz, ne jen zbytek)
//   • fasovani      – odhad fasování pro ZBÝVAJÍCÍ dny týdne (průměr 30 dní)
//                     — dny od pondělí do teď už jsou ve „stock" jako
//                     skutečný výdej, tady jen odhad pro dny, co teprve přijdou
//   • planned       – naplánované stáčení v týdnu (jen 1. stáčení piva)
//   • afterBottling – sklad + naplánováno
//   • missing       – chybí stočit do konce týdne = max(0, JEŠTĚ NEZAVEZENÁ
//                     část objednávek + fasování − po stočení). Pozor: ne
//                     celé `ordered` — kusy, které už odjely, má `stock`
//                     odečtené sám a odečíst je podruhé nafukuje potřebu.
//   • afterOutgoing – konec týdne = po stočení − nezavezené objednávky − fasování
//
// Čerstvé stočení se tak projeví v „chybí stočit" OKAMŽITĚ (počítá se do
// „stock" hned po uložení), bez čekání na to, až se nějaká JINÁ objednávka
// označí jako zavezená.
import { AkceRow } from './inventoryHelper';
import { buildMovements, stockAsOf } from './stockLedger';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { odecteneKusyPolozek } from './tydenniZbytek';
import type { BottlingPlan } from './bottlingPlans';

export type NeedsRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  volume_l: number;
  ordered: number;
  /**
   * Kolik z objednávek týdne ještě NEODJELO (objednáno − co už je zavezené).
   * Proti tomuhle číslu se rozhoduje, kolik stočit — `ordered` samo o sobě
   * u rozvezené objednávky lže, protože zavezené kusy už ze skladu odešly.
   */
  zbyvaZavezt: number;
  stock: number;
  planned: number;
  fasovani: number;
  afterBottling: number;
  missing: number;
  afterOutgoing: number;
};

export type BottlingNeedsInput = {
  beers: { id: string; name: string }[];
  packages: { id: string; label: string; kind: string; volume_l: number }[];
  plans: BottlingPlan[];
  orders: any[];
  orderItems: any[];
  inventoryRows: any[];
  bottlingRows: any[];
  keggingRows: any[];
  fasovaniRows: any[];
  prodejnaRows: any[];
  writeoffsRows: any[];
  /** Automatický odpočet závozu (stejný zdroj jako Sklad/Inventura — viz zavoz_deductions). */
  zavozDeductionRows?: any[];
  /** Spotřeba na Akcích/festivalech (odvezeno − vráceno), stejný zdroj jako Sklad (Stock.tsx). */
  akceRows?: AkceRow[];
  /** Přefuk sudů — přelití mezi objemy. Bez něj se plán rozešel se Skladem. */
  prefukRows?: any[];
  /** Dorovnání inventury (manko/přebytek, ± ks). */
  adjustmentRows?: any[];
  weekKey: string;
  todayStr: string;
};
export function computeBottlingNeeds(input: BottlingNeedsInput): NeedsRow[] {
  const {
    beers,
    packages,
    plans,
    orders,
    orderItems,
    inventoryRows,
    bottlingRows,
    keggingRows,
    fasovaniRows,
    prodejnaRows,
    writeoffsRows,
    zavozDeductionRows = [],
    akceRows = [],
    prefukRows = [],
    adjustmentRows = [],
    weekKey,
    todayStr,
  } = input;

  const weekEndStr = weekRange(weekKey).end.toISOString().slice(0, 10);
  const isThisWeek = (dateStr: string | null | undefined) => !!dateStr && isoWeekKey(dateStr) === weekKey;

  // 📒 Sklad ke KONCI TÝDNE — ze skladové knihy (lib/stockLedger.ts), stejné
  // číslo jako Sklad, Inventura i plánovač stáčení.
  //
  // Dřív se tady sčítalo ručně: sklad v pondělí ráno + pohyby tohoto týdne.
  // Ten součet se s knihou rozcházel ve třech situacích:
  //   • v týdnu, do kterého padne 1. den měsíce — inventura (počáteční stav)
  //     je nový výchozí bod a ruční součet od pondělí ji do konce týdne
  //     ignoroval, zatímco Sklad i Inventura s ní počítaly hned,
  //   • přefuk a dorovnání inventury zadané tento týden se nezapočítaly vůbec,
  //   • sud spotřebovaný na stáčení lahví (kegs_used) taky ne.
  //
  // ⚠️ BEZ ORŘEZU NA NULU (oprava z 24. 9. 2026, „potřeby stáčení
  // neodečítají stočené piva"). Dřív tu stálo `Math.max(0, line.qty)`.
  // Když byl sklad v mínusu (Sklad ukazoval −1×30 12° Světlé), stočení ho
  // jen posunulo blíž k nule a „chybí stočit" se nepohnulo vůbec nebo jen
  // o část — ze sklad −8 a 5 stočených zůstala pořád nula. Plán sudů
  // (keggingPlan.ts) záporný sklad jako dluh počítá už od 15. 9.; tahle
  // obrazovka se s ním proto rozcházela. `stock` je teď stejné číslo jako
  // Sklad, i v mínusu.
  const stockMap: Record<string, number> = {};
  stockAsOf(
    buildMovements({
      inventoryRows, bottlingRows, keggingRows, fasovaniRows, prodejnaRows,
      writeoffsRows, zavozDeductionRows, akceRows, prefukRows, adjustmentRows, packages,
    }),
    weekEndStr,
  ).forEach((line, k) => { stockMap[k] = line.qty; });

  // Objednávky v daném týdnu (ks na pivo + obal) — VŠECHNY, i už zavezené
  // a vyřízené, jen storno ne.
  //
  // ⚠️ Vyřízené (`jeVyrizena()`) se dřív vynechávaly. S dopočtem po
  // položkách níž (`zbyvaZavezt`) to není potřeba — odjetá položka s
  // odpočtem přidá do „zbývá zavézt" nulu sama. A vynechání škodilo:
  // objednávka odkliknutá jako „Zavezeno" dřív, než přišel její den závozu,
  // z potřeby zmizela, a protože odpočet ze skladu ještě nebyl, její sudy
  // dál „ležely" ve skladu — chybí stočit vyšlo menší, než je pravda.
  const activeIds = new Set(
    orders
      .filter((o) => {
        if (o.status === 'storno') return false;
        const target = o.delivery_date || o.order_date;
        return isThisWeek(target);
      })
      .map((o) => o.id)
  );
  //
  // 🐛 Z provozu 22. 9. 2026: „potreby staceni: neodecitaji se stocene lahve
  // a sudy, furt mi to ukazuje vysoky cisla." Objednávka se běžně veze na
  // dvakrát a uzavře se (a z `ordered` vypadne) teprve tehdy, když má odpočet
  // KAŽDÁ položka — do té doby zůstávala v potřebě CELÁ, ačkoli část už
  // fyzicky odjela a skladová kniha ji ze `stock` dávno odečetla. Tytéž kusy
  // se tak odečetly dvakrát a „chybí stočit" přerůstalo skutečnost tím víc,
  // čím víc rozvezených objednávek v týdnu bylo.
  //
  // `ordered` (sloupec „objednáno") zůstává CELÁ týdenní potřeba — tak se to
  // čte a tak to má být. Dopočet níž ale musí jít proti tomu, co ještě
  // NEODJELO, jinak se zavezené kusy odečtou podruhé.
  const odecteno = odecteneKusyPolozek(zavozDeductionRows);
  const weekOrdered: Record<string, number> = {};
  const weekZbyvaZavezt: Record<string, number> = {};
  orderItems.filter((item) => item.package_id && activeIds.has(item.order_id)).forEach((item) => {
    if (!item.beer_id || !item.package_id) return;
    const k = `${item.beer_id}__${item.package_id}`;
    const qty = Number(item.quantity || 0);
    weekOrdered[k] = (weekOrdered[k] || 0) + qty;
    weekZbyvaZavezt[k] = (weekZbyvaZavezt[k] || 0) + Math.max(0, qty - (odecteno.get(item.id) ?? 0));
  });

  // Odhad fasování pro ZBÝVAJÍCÍ dny týdne (průměr za posledních 30 dní ×
  // dny PO dnešku do konce týdne) — dny od pondělí do dneška už jsou ve
  // „stock" jako skutečný výdej, tady jen odhad budoucna.
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 29);
  const from = cutoff.toISOString().slice(0, 10);
  const per: Record<string, number> = {};
  fasovaniRows
    .filter((r) => r.entry_date && r.beer_id && r.package_id && r.entry_date >= from && r.entry_date <= todayStr)
    .forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      per[k] = (per[k] || 0) + Number(r.quantity || 0);
    });
  const remainingDays = Math.max(
    0,
    Math.floor((weekRange(weekKey).end.getTime() - new Date(todayStr + 'T00:00:00Z').getTime()) / 86400000)
  );
  const fasovaniEstimate: Record<string, number> = {};
  Object.entries(per).forEach(([k, total]) => {
    fasovaniEstimate[k] = (total / 30) * remainingDays;
  });

  // Naplánované stáčení v daném týdnu (jen „planned" — hotové už je ve skladu).
  // Bere se JEN první stáčení piva v týdnu (nejbližší planned_date), další úkoly
  // téhož piva později v tomtéž týdnu se nepočítají.
  const firstDateByBeer = new Map<string, string>();
  plans
    .filter((p) => p.beer_id && p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
    .forEach((p) => {
      const cur = firstDateByBeer.get(p.beer_id!);
      if (!cur || p.planned_date < cur) firstDateByBeer.set(p.beer_id!, p.planned_date);
    });
  const plannedMap: Record<string, number> = {};
  plans
    .filter(
      (p) =>
        p.status === 'planned' &&
        p.beer_id &&
        isoWeekKey(p.planned_date) === weekKey &&
        firstDateByBeer.get(p.beer_id) === p.planned_date
    )
    .forEach((p) => {
      const add = (pkgId: string | null, qty: number) => {
        if (!pkgId || qty <= 0) return;
        const k = `${p.beer_id}__${pkgId}`;
        plannedMap[k] = (plannedMap[k] || 0) + qty;
      };
      add(p.pkg_id, p.qty);
      add(p.pkg2_id, p.qty2);
      add(p.pkg3_id, p.qty3);
      add(p.keg_pkg_id, p.keg_qty);
    });

  const list: NeedsRow[] = [];
  beers.forEach((b) => {
    packages.forEach((p) => {
      const k = `${b.id}__${p.id}`;
      const ordered = weekOrdered[k] || 0;
      // Co ještě NEODJELO — proti tomu se počítá „chybí stočit" a „konec
      // týdne". Zavezené kusy má `stock` odečtené sám (viz weekZbyvaZavezt).
      const zbyvaZavezt = weekZbyvaZavezt[k] || 0;
      const stock = stockMap[k] || 0;
      const planned = plannedMap[k] || 0;
      const fasovani = fasovaniEstimate[k] || 0;
      if (ordered === 0 && stock === 0 && planned === 0 && fasovani === 0) return;
      const afterBottling = stock + planned;
      list.push({
        beer_id: b.id,
        beer_name: b.name,
        package_id: p.id,
        package_label: p.label,
        volume_l: Number(p.volume_l || 0),
        ordered,
        zbyvaZavezt,
        stock,
        planned,
        fasovani,
        afterBottling,
        missing: Math.max(0, zbyvaZavezt + fasovani - afterBottling),
        afterOutgoing: afterBottling - zbyvaZavezt - fasovani,
      });
    });
  });
  // Dřív se řádky vracely v pořadí piv a obalů v číselníku — takže pivo,
  // kterému akutně chybí stočit, mohlo sedět úplně dole pod deseti řádky
  // v pořádku. Teď je nahoře to nejnaléhavější: nejdřív podle toho, kolik
  // chybí stočit, pak podle toho, jak moc je sklad na konci týdne v mínusu.
  list.sort((a, b) => b.missing - a.missing || a.afterOutgoing - b.afterOutgoing);
  return list;
}

export type SkupinaPodlePiva = { beerId: string; beerName: string; radky: NeedsRow[] };

/**
 * Seskupí řádky potřeby podle piva — pro seznam v kartičkách.
 *
 * Naměřeno 8. 9. 2026 na produkčních datech: 6 piv × až 4 velikosti lahví
 * dávalo 13 samostatných řádků, KEG sudy podobně 19. Pivo se ale stáčí
 * v jednom kole do víc velikostí najednou (formulář „Stočit" má místo na
 * 3 velikosti lahví + KEG), takže samostatný řádek na obal jen násobil
 * počet kartiček beze smyslu navíc — po seskupení šlo 13 řádků na 6 karet
 * a 19 na 8.
 *
 * `list` musí přijít už seřazený podle naléhavosti (viz computeBottlingNeeds
 * výše) — seskupení pořadí zachovává, takže nejhorší pivo zůstává nahoře.
 */
export function seskupPodlePiva(list: NeedsRow[]): SkupinaPodlePiva[] {
  const skupiny: SkupinaPodlePiva[] = [];
  for (const r of list) {
    let s = skupiny.find((x) => x.beerId === r.beer_id);
    if (!s) { s = { beerId: r.beer_id, beerName: r.beer_name, radky: [] }; skupiny.push(s); }
    s.radky.push(r);
  }
  return skupiny;
}
