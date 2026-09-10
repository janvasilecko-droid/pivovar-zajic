// 📝 Zadávání stáčení lahví — admin sekce v Nastavení.
// ---------------------------------------------------------------------------
// Přehled potřeby stáčení pro zvolený týden:
//   • 🍾 lahve na skladě / 🛢️ sudy na skladě (měsíční model inventury)
//   • 🛒 objednávky týdne + 📦 odhad fasování
//   • ⚠️ „chybí stočit“  a  📅 „na konci týdne“
// Tlačítko „🍾 Stočit“ otevře menu, kde se nastaví datum, velikosti obalů
// (až 3) + počet KEG sudů a poznámka. Úkol se uloží do bottling_plans a
// automaticky se propíše do formuláře stáčení (Lahve) — stáčeč ho tam vidí
// jako „Úkoly ke stočení“ a jediným klikem „Naplnit“ doplní jen počty lahví.
import { useEffect, useMemo, useState } from 'react';
import { supabase, useRealtime, Beer, Package, beerBg, fetchAllRows } from '../lib/supabase';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';
import { computeBottlingNeeds, NeedsRow, seskupPodlePiva } from '../lib/bottlingNeeds';
import {
  BottlingPlan,
  BottlingPlanInput,
  saveBottlingPlan,
  updateBottlingPlan,
  deleteBottlingPlan,
  setPlanStatus,
  planLines,
} from '../lib/bottlingPlans';
import { Modal } from './ui';
import { BeerTileGrid } from './BeerTileGrid';
import { AlertTriangle, Calendar, Check, ChevronLeft, ChevronRight, ClipboardList, Lightbulb, MessageCircle, Minus, Package as PackageIcon, Pencil, Plus, ShoppingCart, Trash2, Undo2 } from 'lucide-react';
import { chyba, potvrd } from '../lib/toast';
import { IkonaLahev, IkonaSud } from '../components/ikony';
import { requestOrdersItemFilter } from '../lib/ordersFilter';

// Povolené velikosti lahví v dropdownu (shodné se zápisem stáčení)
const ALLOWED_BOTTLE_VOLUMES = [1.5, 1, 0.5, 0.33];
// Velikosti KEG sudů
const KEG_SIZES = [50, 30, 20, 15, 10];

const STATUS_CHIP: Record<string, string> = {
  planned: 'bg-amber-100 text-amber-900 border-amber-300',
  done: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  cancelled: 'bg-neutral-100 text-neutral-600 border-neutral-300',
};

const STATUS_TEXT: Record<string, string> = {
  planned: 'Naplánováno',
  done: 'Hotovo',
  cancelled: 'Zrušeno',
};

type StocitForm = {
  plannedDate: string;
  beerId: string;
  pkgId: string;
  qty: string;
  pkg2Id: string;
  qty2: string;
  pkg3Id: string;
  qty3: string;
  kegPkgId: string;
  kegQty: string;
  note: string;
};

function defaultForm(dateStr: string): StocitForm {
  return {
    plannedDate: dateStr,
    beerId: '',
    pkgId: '',
    qty: '',
    pkg2Id: '',
    qty2: '',
    pkg3Id: '',
    qty3: '',
    kegPkgId: '',
    kegQty: '',
    note: '',
  };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('cs-CZ');
}

type Props = {
  /** Otevře Objednávky vyfiltrované na pivo + obal — klik na „chybí X ks". */
  setPage?: (p: any, sec?: string, sub?: string) => void;
};

export function BottlingTasksSettings({ setPage }: Props = {}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [weekKey, setWeekKey] = useState(() => isoWeekKey(todayStr));
  const weekLabel = weekRange(weekKey).label;
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [plans, setPlans] = useState<BottlingPlan[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [inventoryRows, setInventoryRows] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [keggingRows, setKeggingRows] = useState<any[]>([]);
  const [fasovaniRows, setFasovaniRows] = useState<any[]>([]);
  const [prodejnaRows, setProdejnaRows] = useState<any[]>([]);
  const [writeoffsRows, setWriteoffsRows] = useState<any[]>([]);
  const [zavozDeductionRows, setZavozDeductionRows] = useState<any[]>([]);
  const [akceRows, setAkceRows] = useState<any[]>([]);
  // Přefuk a dorovnání inventury — bez nich plán lahví ukazoval jiná čísla než Sklad.
  const [prefukRows, setPrefukRows] = useState<any[]>([]);
  const [adjustmentRows, setAdjustmentRows] = useState<any[]>([]);

  async function load() {
    const [b, p, pl, ords, oi, inv, bt, kg, fa, fp, wo, zd, ak, pf, adj] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling_plans').select('*').order('planned_date'),
      fetchAllRows('orders', 'id,order_date,delivery_date,status,is_delivered'),
      fetchAllRows('order_items', 'id,order_id,beer_id,package_id,quantity'),
      fetchAllRows('inventory', 'entry_date,beer_id,package_id,quantity,note'),
      fetchAllRows('bottling', 'entry_date,beer_id,package_id,quantity,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('fasovani_private', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('writeoffs', 'entry_date,beer_id,package_id,quantity'),
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity,order_item_id'),
      fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      fetchAllRows('keg_prefuk', 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count'),
      fetchAllRows('inventory_adjustments', 'entry_date,beer_id,package_id,quantity'),
    ]);
    if (b.data) setBeers(b.data as Beer[]);
    if (p.data) setPackages(p.data as Package[]);
    if (pl.data) setPlans(pl.data);
    if (ords.data) setOrders(ords.data);
    if (oi.data) setOrderItems(oi.data);
    if (inv.data) setInventoryRows(inv.data);
    if (bt.data) setRows(bt.data);
    if (kg.data) setKeggingRows(kg.data);
    if (fa.data) setFasovaniRows(fa.data);
    if (fp.data) setProdejnaRows(fp.data);
    if (wo.data) setWriteoffsRows(wo.data);
    if (zd.data) setZavozDeductionRows(zd.data);
    if (ak.data) setAkceRows(ak.data);
    if (pf.data) setPrefukRows(pf.data);
    if (adj.data) setAdjustmentRows(adj.data);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(
    ['bottling', 'beers', 'packages', 'orders', 'order_items', 'inventory', 'fasovani', 'fasovani_private', 'writeoffs', 'kegging', 'bottling_plans', 'zavoz_deductions', 'akce', 'akce_items', 'keg_prefuk', 'inventory_adjustments'],
    () => load()
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<BottlingPlan | null>(null);
  const [form, setForm] = useState<StocitForm>(defaultForm(todayStr));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ---- Přehled potřeby (sklad vs. objednávky vs. fasování vs. plán) ----
  const needs = useMemo(
    () =>
      computeBottlingNeeds({
        beers,
        packages,
        plans,
        orders,
        orderItems,
        inventoryRows,
        bottlingRows: rows,
        keggingRows,
        fasovaniRows,
        prodejnaRows,
        writeoffsRows,
        zavozDeductionRows,
        akceRows,
        prefukRows,
        adjustmentRows,
        weekKey,
        todayStr,
      }),
    [beers, packages, plans, orders, orderItems, inventoryRows, rows, keggingRows, fasovaniRows, prodejnaRows, writeoffsRows, zavozDeductionRows, akceRows, prefukRows, adjustmentRows, weekKey, todayStr]
  );

  const isKegPkg = (pkgId: string) => packages.find((p) => p.id === pkgId)?.kind === 'keg';
  const bottleRows = useMemo(() => needs.filter((r) => !isKegPkg(r.package_id)), [needs, packages]);
  const kegRows = useMemo(() => needs.filter((r) => isKegPkg(r.package_id)), [needs, packages]);

  // 🍺 Dlaždice piv nad přehledem — uživatel: „obdobně připrav i úkoly ke
  // stočení, ať vidím dlaždici, na ní bude u každýho piva jaký konkrétní
  // obal kolikrát má být stočen, já to rozkliknu a můžu úkolovat stáčení
  // lahví podle toho a stáčení kegu". Na rozdíl od bottleRows/kegRows výš
  // (rozdělené podle druhu, pro dvě SAMOSTATNÉ tabulky) je tohle seskupení
  // přes VŠECHNY řádky najednou (lahve i KEG spolu) — jedna dlaždice na
  // pivo. Klik otevře stejné menu „Stočit" jako tlačítko v tabulce.
  const skupinyVse = useMemo(() => seskupPodlePiva(needs), [needs]);
  const tileBeers = useMemo(
    () => skupinyVse.map((s) => beers.find((b) => b.id === s.beerId)).filter((b): b is Beer => !!b),
    [skupinyVse, beers]
  );
  const needsMissingBadge = (beerId: string) => {
    const s = skupinyVse.find((x) => x.beerId === beerId);
    if (!s) return [];
    return s.radky
      .filter((r) => r.missing > 0)
      .map((r) => ({ label: r.package_label.trim(), missing: Math.round(r.missing) }))
      .sort((a, z) => z.missing - a.missing);
  };

  const sum = (list: NeedsRow[], f: (r: NeedsRow) => number) => list.reduce((a, r) => a + f(r), 0);

  const totals = {
    bottleStock: sum(bottleRows, (r) => r.stock),
    kegStock: sum(kegRows, (r) => r.stock),
    bottleOutgoing: sum(bottleRows, (r) => r.ordered + r.fasovani),
    bottleMissing: sum(bottleRows, (r) => r.missing),
    bottleEndWeek: sum(bottleRows, (r) => r.afterOutgoing),
  };

  const weekPlans = useMemo(
    () =>
      plans
        .filter((p) => p.status !== 'cancelled' && isoWeekKey(p.planned_date) === weekKey)
        .sort((a, b) => a.planned_date.localeCompare(b.planned_date)),
    [plans, weekKey]
  );

  const bottlePackages = useMemo(
    () =>
      packages
        .filter((p) => p.kind === 'bottle' && ALLOWED_BOTTLE_VOLUMES.some((v) => Math.abs(Number(p.volume_l) - v) < 0.01))
        .sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );
  const kegPackages = useMemo(
    () =>
      packages
        .filter((p) => p.kind === 'keg' && KEG_SIZES.includes(Number(p.volume_l)))
        .sort((a, b) => Number(b.volume_l) - Number(a.volume_l)),
    [packages]
  );

  // ---- Tlačítko „🍾 Stočit“ — otevře menu s velikostmi obalů + KEG ----
  function openStocit(row: NeedsRow) {
    openStocitGroup([row]);
  }

  /**
   * Otevře menu „Stočit" za celé pivo naráz, ne jen za jeden obal.
   *
   * Kartička v přehledu je teď seskupená po pivu (viz mobileCards) — jedno
   * pivo se přece stáčí v jednom kole a plní se do víc velikostí najednou,
   * takže nemá smysl nutit uživatele otevírat menu čtyřikrát. Formulář má
   * místo na 3 velikosti lahví, doplní se v pořadí, jak moc které chybí
   * (řádky sem chodí už seřazené — viz computeBottlingNeeds).
   *
   * Řádky mohou být lahvové i sudové NAMÍCHANÉ (dlaždice nahoře volá se
   * VŠÍM za pivo najednou, viz tileBeers) — proto se tady vždycky rozdělí
   * na lahvovou a sudovou část zvlášť, ne podle druhu prvního řádku. Dřív
   * (jen pro bottleRows/kegRows samostatně) by to nevadilo, ale se
   * smíšeným vstupem by první řádek (třeba lahev) umlčel sudovou potřebu
   * úplně — zmizela by z formuláře beze stopy.
   */
  function openStocitGroup(rows: NeedsRow[]) {
    if (rows.length === 0) return;
    setEditPlan(null);
    setErr(null);
    // 🎯 Návrh vyplní počet JEN u obalu, kterému opravdu něco chybí — dřív
    // padal zpátky na „objednáno", takže se předvyplnil i obal, co má sklad
    // v pořádku. Z provozu 9. 9. 2026: „když chybí 10× 1l, většinou se
    // stočí 1× 50 a zbytek se rozdělí mezi litrovky/sklo/1,5l podle
    // uvážení" — appka ten rozpad neumí uhodnout, tak ho nemá předstírat.
    // Řádky bez skutečného nedostatku se do formuláře vůbec nedostanou;
    // slot zůstane prázdný a stáčeč si obal případně doplní sám. Porovnává
    // se ZAOKROUHLENÁ hodnota — zlomkové „chybí 0,4" (z odhadu fasování)
    // by jinak prošlo filtrem (0,4 > 0), ale zobrazilo by se jako matoucí
    // „ks: 0" po zaokrouhlení dolů.
    const bottleRowsGroup = rows.filter((r) => !isKegPkg(r.package_id) && Math.round(r.missing) > 0);
    const kegRowsGroup = rows.filter((r) => isKegPkg(r.package_id) && Math.round(r.missing) > 0);
    const [r1, r2, r3] = bottleRowsGroup;
    const kegRow = kegRowsGroup[0];
    setForm({
      plannedDate: todayStr,
      beerId: rows[0].beer_id,
      kegPkgId: kegRow?.package_id ?? '',
      kegQty: kegRow ? String(Math.round(kegRow.missing)) : '',
      pkgId: r1?.package_id ?? '', qty: r1 ? String(Math.round(r1.missing)) : '',
      pkg2Id: r2?.package_id ?? '', qty2: r2 ? String(Math.round(r2.missing)) : '',
      pkg3Id: r3?.package_id ?? '', qty3: r3 ? String(Math.round(r3.missing)) : '',
      note: '',
    });
    setModalOpen(true);
  }

  function openEdit(plan: BottlingPlan) {
    setEditPlan(plan);
    setErr(null);
    setForm({
      plannedDate: plan.planned_date,
      beerId: plan.beer_id || '',
      kegPkgId: plan.keg_pkg_id || '',
      kegQty: plan.keg_qty > 0 ? String(plan.keg_qty) : '',
      pkgId: plan.pkg_id || '',
      qty: plan.qty > 0 ? String(plan.qty) : '',
      pkg2Id: plan.pkg2_id || '',
      qty2: plan.qty2 > 0 ? String(plan.qty2) : '',
      pkg3Id: plan.pkg3_id || '',
      qty3: plan.qty3 > 0 ? String(plan.qty3) : '',
      note: plan.note || '',
    });
    setModalOpen(true);
  }

  function setField<K extends keyof StocitForm>(field: K, value: StocitForm[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  // +/- vedle "ks" — uživatel: "těch ks dávej tam + a -, ať můžu i přidávat
  // sudy timhle". Stejný vzor jako btn-pocet jinde v appce.
  function bumpQty(field: 'qty' | 'qty2' | 'qty3' | 'kegQty', delta: number) {
    setForm((f) => {
      const next = Math.max(0, Number(f[field] || 0) + delta);
      return { ...f, [field]: next === 0 ? '' : String(next) };
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.beerId) {
      setErr('Vyberte pivo.');
      return;
    }
    if (!form.plannedDate) {
      setErr('Vyberte datum stáčení.');
      return;
    }
    if (!form.pkgId && !form.pkg2Id && !form.pkg3Id && !form.kegPkgId) {
      setErr('Zadejte aspoň jeden obal (velikost lahví nebo KEG sud).');
      return;
    }
    const input: BottlingPlanInput = {
      beer_id: form.beerId,
      keg_pkg_id: form.kegPkgId || null,
      keg_qty: Number(form.kegQty || 0),
      pkg_id: form.pkgId || null,
      qty: Number(form.qty || 0),
      pkg2_id: form.pkg2Id || null,
      qty2: Number(form.qty2 || 0),
      pkg3_id: form.pkg3Id || null,
      qty3: Number(form.qty3 || 0),
      planned_date: form.plannedDate,
      note: form.note || null,
    };
    if (!input.keg_pkg_id && !input.pkg_id && !input.pkg2_id && !input.pkg3_id) {
      setErr('Zadejte aspoň jeden obal s počtem kusů.');
      return;
    }
    setSaving(true);
    try {
      // 🍺🛢️ Lahve a KEG v JEDNOM úkolu se uloží jako DVA samostatné
      // záznamy, ne jeden se všemi poli najednou.
      //
      // "KEG sudy" v jednom společném zápisu (kegPkgId/kegQty) totiž
      // v BottlingScreen.tsx při „Naplnit" znamená „kolik sudů se
      // SPOTŘEBOVALO jako zdroj na tyhle lahve" (sloupec kegs_used —
      // stáčeč pak vidí předvyplněný zdrojový sud a počet, jako recept
      // na přelití). Kegging.tsx ale stejné pole čte jako „kolik sudů
      // se má NASTÁČET" (nová výroba). Dlaždice umí navrhnout obojí
      // najednou (chybí 2× KEG 50l NEZÁVISLE na chybějících 2× 1l lahvích)
      // — kdyby se to uložilo jako jeden úkol, stáčeč lahví by dostal
      // návrh „spotřebuj 100 l ze sudů na 2 litrové lahve", což nedává
      // smysl a je to jiná potřeba než nastáčet ty samé 2 sudy zvlášť.
      // Platí i při ÚPRAVĚ (uživatel: „ano" na otázku, jestli to dodělat)
      // — původní záznam se přepíše na lahvovou část, sudová se založí
      // jako nový. Naopak (sudy zůstávají, lahve se přidávají) dělá totéž,
      // jen v opačném pořadí, ať editovaný úkol vždycky zůstane tím
      // "hlavním" — nemá to praktický rozdíl, jde jen o to, aby žádná
      // z částí nezmizela.
      const maLahve = !!(input.pkg_id || input.pkg2_id || input.pkg3_id);
      const maKeg = !!input.keg_pkg_id;
      if (maLahve && maKeg) {
        const lahvovy: BottlingPlanInput = { ...input, keg_pkg_id: null, keg_qty: 0 };
        const kegovy: BottlingPlanInput = {
          ...input,
          pkg_id: null, qty: 0, pkg2_id: null, qty2: 0, pkg3_id: null, qty3: 0,
        };
        if (editPlan) {
          const { error: e1 } = await updateBottlingPlan(editPlan.id, lahvovy);
          if (e1) throw e1;
          const { error: e2 } = await saveBottlingPlan(kegovy);
          if (e2) throw e2;
        } else {
          const { error: e1 } = await saveBottlingPlan(lahvovy);
          if (e1) throw e1;
          const { error: e2 } = await saveBottlingPlan(kegovy);
          if (e2) throw e2;
        }
      } else if (editPlan) {
        const { error } = await updateBottlingPlan(editPlan.id, input);
        if (error) throw error;
      } else {
        const { error } = await saveBottlingPlan(input);
        if (error) throw error;
      }
      setModalOpen(false);
      setEditPlan(null);
      setFlash(true);
      setMsg('Úkol stáčení uložen — automaticky se propíše do formuláře stáčení (Lahve), kde ho stáčeč „Naplní“.');
      setTimeout(() => setFlash(false), 2500);
      load();
    } catch (e: any) {
      setErr(e?.message || 'Chyba při ukládání úkolu.');
    }
    setSaving(false);
  }

  async function handleStatus(plan: BottlingPlan, status: BottlingPlan['status']) {
    const { error } = await setPlanStatus(plan.id, status);
    if (error) chyba(error.message);
    else load();
  }

  async function handleDelete(plan: BottlingPlan) {
    if (!(await potvrd('Smazat tento úkol stáčení?'))) return;
    const { error } = await deleteBottlingPlan(plan.id);
    if (error) chyba(error.message);
    else load();
  }

  function renderTable(list: NeedsRow[], isKeg: boolean) {
    const t = list.reduce(
      (a, r) => {
        a.ordered += r.ordered;
        a.stock += r.stock;
        a.planned += r.planned;
        a.fasovani += r.fasovani;
        a.missing += r.missing;
        a.afterOutgoing += r.afterOutgoing;
        return a;
      },
      { ordered: 0, stock: 0, planned: 0, fasovani: 0, missing: 0, afterOutgoing: 0 }
    );
    if (list.length === 0) {
      return (
        <p className="text-xs text-neutral-500 py-1">
          {isKeg ? 'Žádné KEG sudy v tomto týdnu nejsou potřeba ani naplánované.' : 'Žádné lahve v tomto týdnu nejsou potřeba ani naplánované.'}
        </p>
      );
    }

    // ----- Mobilní kartičkové zobrazení (< md) -----
    //
    // Dřív jeden řádek = jedno pivo × jeden obal, takže u šesti piv se
    // čtyřmi velikostmi lahví bylo v seznamu 13–20 kartiček — reálně
    // naměřeno 8. 9. 2026 na produkčních datech. Pivo se přitom stáčí
    // v jednom kole do víc velikostí najednou (formulář „Stočit" na to má
    // místo), takže kartičky teď seskupujeme PO PIVU: jedna kartička, pod
    // ní řádek za každý obal. List je od computeBottlingNeeds seřazený
    // podle naléhavosti, takže i pořadí obalů uvnitř skupiny i pořadí
    // skupin zůstává „nejhorší nahoře" — jen se seskupí podle prvního
    // výskytu piva.
    const skupinyPodlePiva = seskupPodlePiva(list);

    const mobileCards = (
      <div className="md:hidden space-y-2.5">
        {skupinyPodlePiva.map((s) => {
          const beer = beers.find((b) => b.id === s.beerId);
          return (
            <div
              key={`m-${s.beerId}`}
              className={`rounded-xl border bg-white shadow-xs p-3.5 ${s.radky.some((r) => r.missing > 0) ? 'border-rose-300' : 'border-neutral-200'}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                <div className="min-w-0 flex-1 text-sm font-black text-neutral-950 truncate">{s.beerName}</div>
                <button
                  type="button"
                  onClick={() => openStocitGroup(s.radky)}
                  title={isKeg ? 'Stočit KEG sud' : 'Stočit — doplní se až 3 velikosti lahví najednou'}
                  className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-neutral-950 text-xs font-black transition shadow-sm shrink-0 min-h-[44px] tap"
                >
                  <IkonaLahev className="ikona-text" /> Stočit
                </button>
              </div>
              <div className="mt-2 space-y-1.5">
                {s.radky.map((r) => {
                  const hlavni = r.missing > 0
                    ? { text: `${r.package_label} — chybí ${fmt(r.missing)} ks`, barva: 'text-rose-800' }
                    : r.afterOutgoing > 0
                      ? { text: `${r.package_label} — sklad stačí, navíc ${fmt(r.afterOutgoing)} ks`, barva: 'text-emerald-800' }
                      : { text: `${r.package_label} — sklad vyjde přesně`, barva: 'text-neutral-700' };
                  const vedlejsi = [
                    r.ordered > 0 && `objednáno ${fmt(r.ordered)}`,
                    `sklad ${fmt(r.stock)}`,
                    r.fasovani > 0 && `fasování odhad ${fmt(r.fasovani)}`,
                    r.planned > 0 && `naplánováno ${fmt(r.planned)}`,
                  ].filter(Boolean).join(' · ');
                  return (
                    <div key={`m-${r.beer_id}-${r.package_id}`} className="border-t border-neutral-100 pt-1.5 first:border-t-0 first:pt-0">
                      {/* Klikací — otevře Objednávky vyfiltrované na tohle
                          pivo a obal, ať se dá ověřit, z čeho číslo „chybí"
                          vzniklo (počítá se s fasováním a skladem, ne jen
                          s objednávkami — proto sedí jen zřídka na první pohled). */}
                      <button
                        type="button"
                        onClick={() => { requestOrdersItemFilter({ beerId: r.beer_id, packageId: r.package_id }); setPage?.('orders'); }}
                        className={`text-sm font-black text-left hover:underline decoration-dotted underline-offset-2 ${hlavni.barva}`}
                      >
                        {hlavni.text}
                      </button>
                      <div className="text-xs font-semibold text-neutral-500">{vedlejsi}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {/* Mobilní souhrn — celý týden za všechna piva dohromady */}
        <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-3">
          <div className="text-xs font-black text-amber-950 uppercase tracking-wider mb-2">Celkem za týden</div>
          <div className={`text-base font-black ${t.missing > 0 ? 'text-rose-800' : 'text-emerald-800'}`}>
            {t.missing > 0 ? `Chybí stočit ${fmt(t.missing)} ks` : `Sklad stačí, navíc ${fmt(t.afterOutgoing)} ks`}
          </div>
          <div className="text-xs font-semibold text-amber-800 mt-0.5">
            objednáno {fmt(t.ordered)} · sklad {fmt(t.stock)} · fasování odhad {fmt(t.fasovani)} · naplánováno {fmt(t.planned)}
          </div>
        </div>
      </div>
    );

    // ----- Desktopová tabulka (>= md) -----
    const desktopTable = (
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-udaj uppercase tracking-wide text-neutral-500">
              <th scope="col" className="text-left font-black px-2 py-1.5">Pivo</th>
              <th scope="col" className="text-left font-black px-2 py-1.5">Obal</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><ShoppingCart className="ikona-text" /> Objednávky</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><PackageIcon className="ikona-text" /> Fasování</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><ClipboardList className="ikona-text" /> Naplánováno</th>
              <th scope="col" className="text-right font-black px-2 py-1.5">{isKeg ? 'Sudy na skladě' : 'Lahve na skladě'}</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><AlertTriangle className="ikona-text" /> Chybí stočit</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><Calendar className="ikona-text" /> Konec týdne</th>
              <th scope="col" className="text-right font-black px-2 py-1.5"><IkonaLahev className="ikona-text" /> Stočit</th>
            </tr>
          </thead>
            {/* Zebra pruh se řídí PIVEM, ne pořadím řádku — víc obalů téhož
                piva pod sebou tak vizuálně tvoří jednu skupinu, stejně jako
                seskupené kartičky na mobilu (viz mobileCards výš a
                lib/bottlingNeeds.ts → seskupPodlePiva). Tlačítko „Stočit"
                taky otevírá celé pivo najednou, ne jen tenhle jeden obal. */}
          <tbody>
            {list.map((r, i) => {
              const beer = beers.find((b) => b.id === r.beer_id);
              const skupinaIndex = skupinyPodlePiva.findIndex((s) => s.beerId === r.beer_id);
              return (
                <tr key={`${r.beer_id}-${r.package_id}`} className={`border-t ${skupinaIndex % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}`}>
                  <td className="px-2 py-1.5">
                    <span className="inline-flex items-center gap-1.5 font-bold text-neutral-900">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                      {r.beer_name}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-neutral-700 whitespace-nowrap">{r.package_label} {isKeg ? '' : `(${r.volume_l} L)`}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.ordered)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-neutral-800">{fmt(r.fasovani)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-amber-800">{fmt(r.planned)}</td>
                  <td className="px-2 py-1.5 text-right font-black text-emerald-800">{fmt(r.stock)}</td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.missing > 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-600 font-semibold'}`}>
                    <button
                      type="button"
                      onClick={() => { requestOrdersItemFilter({ beerId: r.beer_id, packageId: r.package_id }); setPage?.('orders'); }}
                      className="hover:underline decoration-dotted underline-offset-2"
                      title="Zobrazit objednávky s touhle položkou"
                    >
                      {r.missing > 0 ? `${fmt(r.missing)}` : '0'}
                    </button>
                  </td>
                  <td className={`px-2 py-1.5 text-right font-black ${r.afterOutgoing < 0 ? 'bg-rose-100 text-rose-800' : 'text-neutral-900'}`}>
                    {fmt(r.afterOutgoing)}
                  </td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openStocitGroup(list.filter((x) => x.beer_id === r.beer_id))}
                      title="Stočit — doplní všechny obaly tohoto piva najednou"
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 text-udaj font-black transition shadow-xs tap"
                    >
                      <IkonaLahev className="ikona-text" /> Stočit
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-neutral-300 bg-amber-50">
              <td colSpan={2} className="px-2 py-1.5 font-black text-amber-950">Celkem</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.ordered)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.fasovani)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.planned)}</td>
              <td className="px-2 py-1.5 text-right font-black text-amber-950">{fmt(t.stock)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${t.missing > 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(t.missing)}</td>
              <td className={`px-2 py-1.5 text-right font-black ${t.afterOutgoing < 0 ? 'text-rose-800' : 'text-amber-950'}`}>{fmt(t.afterOutgoing)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    );

    return (
      <>
        {mobileCards}
        {desktopTable}
      </>
    );
  }

  if (loading && beers.length === 0) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-3 text-sm font-bold text-neutral-600">
          <span className="w-5 h-5 border-2 border-neutral-200 border-t-primary-600 rounded-full animate-spin" />
          Načítám přehled stáčení…
        </div>
      </div>
    );
  }

  return (
    <div className={`card p-3.5 sm:p-6 border-2 border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-white rounded shadow-md transition-all duration-200 ${flash ? 'ring-4 ring-emerald-500/20' : ''}`}>
      {/* Hlavička */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h2 className="font-display font-bold text-base sm:text-lg flex items-center gap-2">
          <span className="text-xl"><IkonaLahev className="ikona-text" /></span>
          <span>Potřeby stáčení</span>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-udaj uppercase tracking-wider">ADMIN</span>
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setWeekKey(shiftWeek(weekKey, -1))}
            className="w-9 h-9 sm:w-8 sm:h-8 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-700 transition tap"
            title="Předchozí týden" aria-label="Předchozí týden"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-black text-neutral-800 bg-white border border-neutral-200 rounded px-2.5 sm:px-3 py-1.5 whitespace-nowrap">
            <Calendar className="ikona-text" /> {weekKey} <span className="hidden sm:inline">({weekLabel})</span>
          </span>
          <button
            type="button"
            onClick={() => setWeekKey(shiftWeek(weekKey, 1))}
            className="w-9 h-9 sm:w-8 sm:h-8 grid place-items-center rounded bg-neutral-100 hover:bg-neutral-200 active:bg-neutral-300 text-neutral-700 transition tap"
            title="Další týden" aria-label="Další týden"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <p className="hidden sm:block text-xs text-neutral-600 mt-1.5 leading-relaxed">
        Přehled potřeby stáčení pro vybraný týden. Tlačítkem <strong>„<IkonaLahev className="ikona-text" /> Stočit“</strong> otevřete menu, kde
        nastavíte velikosti obalů a počet KEG sudů — úkol se uloží a <strong>automaticky propíše do formuláře
        stáčení</strong> (Lahve → „Úkoly ke stočení“ → „Naplnit“).
      </p>

      {msg && <div className="mt-3 p-3 rounded bg-emerald-100 text-emerald-900 font-bold text-xs border border-emerald-300">{msg}</div>}

      {/* 🍺 Dlaždice piv — klepnutím rovnou otevřeš „Stočit" pro celé pivo
          (lahve i KEG najednou), s návrhem doplněným podle toho, co chybí. */}
      {tileBeers.length > 0 && (
        <div className="mt-3 sm:mt-4">
          <div className="text-xs font-black text-neutral-800 mb-2"><IkonaLahev className="ikona-text" /> Klepni na pivo — stočit</div>
          <BeerTileGrid
            beers={tileBeers}
            onSelect={(b) => {
              const s = skupinyVse.find((x) => x.beerId === b.id);
              if (s) openStocitGroup(s.radky);
            }}
            summaryFor={() => ({ filled: false, label: '' })}
            missingBadgeFor={(b) => needsMissingBadge(b.id)}
          />
        </div>
      )}

      {/* Souhrn */}
      <div className="mt-3 sm:mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <div className="p-3 rounded bg-white border border-emerald-200 shadow-xs">
          <div className="text-udaj font-black uppercase tracking-wider text-emerald-700"><IkonaLahev className="ikona-text" /> Lahve na skladě</div>
          <div className="text-xl font-display font-black text-emerald-900 mt-0.5">{fmt(totals.bottleStock)}</div>
        </div>
        <div className="p-3 rounded bg-white border border-neutral-200 shadow-xs">
          <div className="text-udaj font-black uppercase tracking-wider text-neutral-500"><IkonaSud className="ikona-text" /> Sudy na skladě</div>
          <div className="text-xl font-display font-black text-neutral-900 mt-0.5">{fmt(totals.kegStock)}</div>
        </div>
        <div className="p-3 rounded bg-white border border-sky-200 shadow-xs">
          <div className="text-udaj font-black uppercase tracking-wider text-sky-700"><ShoppingCart className="ikona-text" /> Objednávky + fasování</div>
          <div className="text-xl font-display font-black text-sky-900 mt-0.5">{fmt(totals.bottleOutgoing)}</div>
        </div>
        <div className="p-3 rounded bg-rose-50 border border-rose-200 shadow-xs">
          <div className="text-udaj font-black uppercase tracking-wider text-rose-700"><AlertTriangle className="ikona-text" /> Chybí stočit</div>
          <div className="text-xl font-display font-black text-rose-900 mt-0.5">{fmt(totals.bottleMissing)}</div>
        </div>
        <div className="p-3 rounded bg-amber-50 border border-amber-200 shadow-xs">
          <div className="text-udaj font-black uppercase tracking-wider text-amber-800"><Calendar className="ikona-text" /> Konec týdne</div>
          <div className={`text-xl font-display font-black mt-0.5 ${totals.bottleEndWeek < 0 ? 'text-rose-800' : 'text-amber-900'}`}>
            {fmt(totals.bottleEndWeek)}
          </div>
        </div>
      </div>

      {/* Naplánované úkoly v týdnu */}
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2"><ClipboardList className="ikona-text" /> Úkoly stáčení v tomto týdnu ({weekPlans.length})</div>
        {weekPlans.length === 0 && (
          <p className="text-xs text-neutral-500">Žádné úkoly. Pomocí „<IkonaLahev className="ikona-text" /> Stočit“ přidáte úkol pro konkrétní pivo a obal.</p>
        )}
        <div className="space-y-2">
          {weekPlans.map((plan) => {
            const beer = beers.find((b) => b.id === plan.beer_id);
            const lines = planLines(plan, packages);
            return (
              <div key={plan.id} className="rounded border border-neutral-200 bg-white p-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="w-2 h-8 rounded-full shrink-0" style={{ backgroundColor: beer ? beerBg(beer) : '#a8a29e' }} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-neutral-950">{beer?.name || '—'}</span>
                      <span className="text-udaj font-bold text-neutral-600 bg-neutral-100 rounded px-2 py-0.5 whitespace-nowrap"><Calendar className="ikona-text" /> {plan.planned_date}</span>
                      <span className={`text-udaj font-black px-2 py-0.5 rounded border ${STATUS_CHIP[plan.status] || ''}`}>{STATUS_TEXT[plan.status] || plan.status}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-1">
                      {lines.map((l, i) => (
                        <span key={i} className="text-udaj font-bold bg-neutral-50 border border-neutral-200 rounded px-1.5 py-0.5 text-neutral-700 whitespace-nowrap">
                          {l.label} × {l.qty}
                        </span>
                      ))}
                      {lines.length === 0 && <span className="text-udaj text-neutral-400 italic">bez obalů</span>}
                      {plan.note && <span className="text-udaj text-neutral-500"><MessageCircle className="ikona-text" /> {plan.note}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button type="button" onClick={() => openEdit(plan)} className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-udaj font-black transition tap">
                    <Pencil className="ikona-text" /> Upravit
                  </button>
                  {plan.status === 'planned' && (
                    <button type="button" onClick={() => handleStatus(plan, 'done')} className="px-2.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white text-udaj font-black transition tap">
                      <Check className="ikona-text" /> Hotovo
                    </button>
                  )}
                  {plan.status !== 'planned' && (
                    <button type="button" onClick={() => handleStatus(plan, 'planned')} className="px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-udaj font-black transition tap">
                      <Undo2 className="ikona-text" /> Zpět
                    </button>
                  )}
                  <button type="button" onClick={() => handleDelete(plan)} className="px-2.5 py-1.5 rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-udaj font-black transition tap">
                    <Trash2 className="ikona-text" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabulky potřeby */}
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2"><IkonaLahev className="ikona-text" /> Potřeba lahví (týden {weekLabel})</div>
        {renderTable(bottleRows, false)}
      </div>
      <div className="mt-4">
        <div className="text-xs font-black text-neutral-800 mb-2"><IkonaSud className="ikona-text" /> Potřeba KEG sudů (týden {weekLabel})</div>
        {renderTable(kegRows, true)}
        <p className="text-udaj text-neutral-400 mt-1.5">
          Sklad = měsíční model (inventura + stočeno − výdej). „Konec týdne“ = sklad + naplánováno − objednávky − odhad
          fasování (průměr za posledních 30 dní). „Chybí stočit“ = objednávky + fasování − sklad − naplánováno.
        </p>
      </div>



      {/* Menu „🍾 Stočit“ — velikosti obalů + KEG sudy */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editPlan ? 'Upravit úkol stáčení' : 'Stočit — nastavení obalů'}
        wide
      >
        <form onSubmit={handleSave} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Datum stáčení *</label>
              <input type="date" className="input w-full" value={form.plannedDate} onChange={(e) => setField('plannedDate', e.target.value)} />
            </div>
            <div>
              <label className="label">Pivo *</label>
              <select className="input w-full" value={form.beerId} onChange={(e) => setField('beerId', e.target.value)}>
                <option value="">— vyberte pivo —</option>
                {beers.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(
              [
                ['pkgId', 'qty', 'Lahve 1'],
                ['pkg2Id', 'qty2', 'Lahve 2'],
                ['pkg3Id', 'qty3', 'Lahve 3'],
              ] as const
            ).map(([pkgField, qtyField, label]) => (
              <div key={label} className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="label">{label}</label>
                  <select className="input" value={form[pkgField]} onChange={(e) => setField(pkgField, e.target.value)}>
                    <option value="">— obal —</option>
                    {bottlePackages.map((p) => (
                      <option key={p.id} value={p.id}>{p.label} ({p.volume_l} L)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">ks</label>
                  <div className="flex items-stretch gap-1">
                    <button type="button" onClick={() => bumpQty(qtyField, -1)} className="btn-pocet !min-h-[44px]" aria-label={`Ubrat ${label}`}><Minus size={16} /></button>
                    <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={0} className="input w-14 text-center px-1" value={form[qtyField]} onChange={(e) => setField(qtyField, e.target.value)} placeholder="0" />
                    <button type="button" onClick={() => bumpQty(qtyField, 1)} className="btn-pocet !min-h-[44px]" aria-label={`Přidat ${label}`}><Plus size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="label">KEG sudy</label>
              <select className="input" value={form.kegPkgId} onChange={(e) => setField('kegPkgId', e.target.value)}>
                <option value="">— KEG obal —</option>
                {kegPackages.map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.volume_l} L)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ks</label>
              <div className="flex items-stretch gap-1">
                <button type="button" onClick={() => bumpQty('kegQty', -1)} className="btn-pocet !min-h-[44px]" aria-label="Ubrat KEG sud"><Minus size={16} /></button>
                <input type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} min={0} className="input w-14 text-center px-1" value={form.kegQty} onChange={(e) => setField('kegQty', e.target.value)} placeholder="0" />
                <button type="button" onClick={() => bumpQty('kegQty', 1)} className="btn-pocet !min-h-[44px]" aria-label="Přidat KEG sud"><Plus size={16} /></button>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Poznámka pro stáčeče</label>
            <input className="input w-full text-xs" value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="nepovinná (např. kterou šarži stočit, kolik nechat v rezervě…)" />
          </div>

          {err && <p className="text-udaj font-black text-rose-700">{err}</p>}

          <p className="text-udaj text-neutral-500 bg-amber-50 border border-amber-200 rounded p-2.5 leading-relaxed">
            <Lightbulb className="ikona-text" /> Uložený úkol se automaticky objeví ve formuláři stáčení (Lahve → „<ClipboardList className="ikona-text" /> Úkoly ke stočení“).
            Stáčeč ho jediným klikem <strong>„Naplnit“</strong> vloží do zápisu — doplní se jen počty lahví,
            obaly a pivo už jsou přednastavené.
          </p>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-ghost !rounded text-sm font-black">Zrušit</button>
            <button type="submit" disabled={saving} className="btn-primary !rounded px-5 py-2.5 text-xs font-black shadow-md">
              {saving ? 'Ukládám…' : editPlan ? 'Uložit změny' : 'Uložit úkol'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
