import { useEffect, useMemo, useState } from 'react';
import { Beer, fetchAllRows, Package, supabase, useRealtime } from '../lib/supabase';
import { Kostra } from '../components/ui';

import { Banknote, Printer, Store, TrendingUp, Trophy, Truck, X } from 'lucide-react';
import StatistikaTrzby from '../components/StatistikaTrzby';
import StatistikaTrendy from '../components/StatistikaTrendy';
import type { CenaPolozky } from '../lib/hodnotaObjednavky';
import { TabBar, type TabBarItem } from '../components/TabBar';
import ZavozHistory from '../components/ZavozHistory';
import { IkonaSud } from '../components/ikony';
import StatistikaVystav from '../components/StatistikaVystav';
import type { Obdobi, VyrobniRadek } from '../lib/statistika';
import { kdoPrestalObjednavat, podilPodleObalu, rozsahObdobi, denObdobi, objednanoPoMesicich } from '../lib/statistika';
import { usePosledniNacteni } from '../lib/nacitani';
import { useChovaniDialogu } from '../lib/zavriNaZpet';
import { businessDateISO } from '../lib/businessDate';
import { nactiSdilenouTabulku } from '../lib/sdilenaData';

type MonthData = {
  month: string;
  brewed: number;
  bottled: number;
  kegged: number;
  brewed_hl: number;
  fasovani: number;
  writeoffs: number;
  ordered: number;
  akce_taken: number;
  akce_returned: number;
  akce_revenue: number;
  byBeer: Record<string, number>;
  byBeerHl: Record<string, number>;
  byPackage: Record<string, number>;
  // Rozpad KEG vs PET (lahve) podle druhů obalů
  kegHl: number;       // HL stočeno do KEG
  bottleHl: number;    // HL stočeno do lahví/PET
  byBeerKegHl: Record<string, number>;   // HL každého piva v KEG
  byBeerBottleHl: Record<string, number>; // HL každého piva v lahvích/PET
  byPackageKind: Record<string, { ks: number; hl: number }>; // podle druhu obalu (keg/bottle)
};

type FilterableEntry = { entry_date: string; beer_id: string | null; package_id: string | null; quantity: number };

function monthKey(d: string): string { return d.slice(0, 7); }
function monthLabel(m: string): string {
  const [y, mo] = m.split('-');
  return ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro'][Number(mo) - 1] + ' ' + y;
}
// businessDateISO(), NE new Date().toISOString() (vždycky UTC) — jinak kolem
// půlnoci "dnešní" rozsah (týden/měsíc/rok) počítal s jiným dnem než reálně
// v Praze je. Stejná chyba jako u weekKey v Kegging.tsx.
function todayISO(): string { return businessDateISO(); }
function startOfYearISO(iso: string): string { return iso.slice(0, 4) + '-01-01'; }

/** Popis období pro nadpis karty v žebříčcích — bere se z volby na Výstavu. */
const POPIS_OBDOBI_ZEBRICEK: Record<Obdobi, string> = {
  tyden: 'tento týden', mesic: 'tento měsíc', rok: 'letos', vse: 'za celou dobu',
};

// „Objednávky" (týdenní součet kusů podle piva a obalu) se zrušila 25. 9. 2026
// — ukazovala totéž co Objednávky → Celkem, která navíc umí měsíc i vše.
// Starý odkaz na ni skončí na Výstavu (zalozkaZAdresy níž).
// Stejně tak „Hledání" (vlastní součty podle zdroje, období, piva a obalu)
// — zrušeno 26. 9. 2026 na přání provozu, nikdo nevěděl, k čemu je.
// A „Cykly tanků" (ztrátovost a historie cyklů tanků) — týž den, taky na
// přání; ztráty při stáčení jsou dál ve Sklepě (ZtratyTankuPrehled).
type Zalozka = 'vystav' | 'trzby' | 'stats' | 'deliveries';
const ZALOZKY: Zalozka[] = ['vystav', 'trzby', 'stats', 'deliveries'];

const LISTA_ZALOZEK: (TabBarItem & { id: Zalozka })[] = [
  { id: 'vystav', label: 'Výstav', icon: TrendingUp, color: '#f59f00' },
  { id: 'trzby', label: 'Tržby', icon: Banknote, color: '#40c057' },
  { id: 'stats', label: 'Žebříčky', icon: Trophy, color: '#38d9a9' },
  { id: 'deliveries', label: 'Trasy', icon: Truck, color: '#7c5cff' },
];

/**
 * Záložka z adresy se musí ověřit, ne jen přetypovat.
 *
 * `selectTab` si název záložky ukládá do adresy, takže na ni existují
 * uložené odkazy — a dvě záložky („overview" a „production") se zrušily.
 * Bez tohohle by takový odkaz otevřel obrazovku, na které se nevykreslí
 * vůbec nic: `activeTab` by se rovnalo hodnotě, kterou žádný blok netestuje.
 */
function zalozkaZAdresy(sub: string | undefined): Zalozka {
  return ZALOZKY.includes(sub as Zalozka) ? (sub as Zalozka) : 'vystav';
}

export default function History({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [activeTab, setActiveTab] = useState<Zalozka>(() => zalozkaZAdresy(initialSubTab));

  useEffect(() => {
    setActiveTab(zalozkaZAdresy(initialSubTab));
  }, [initialSubTab]);

  function selectTab(t: Zalozka) {
    if (setPage) setPage('history', undefined, t);
    else setActiveTab(t);
  }
  // ---- Výstav (production) state ----

  const [data, setData] = useState<MonthData[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  // Nový přehled „Výstav" potřebuje řádky tak, jak jsou — z měsíčních součtů
  // se týden ani odběratel dopočítat nedá.
  const [vyrobaLahve, setVyrobaLahve] = useState<VyrobniRadek[]>([]);
  const [vyrobaSudy, setVyrobaSudy] = useState<VyrobniRadek[]>([]);
  const [fasovaniStat, setFasovaniStat] = useState<VyrobniRadek[]>([]);
  const [odpisyStat, setOdpisyStat] = useState<VyrobniRadek[]>([]);
  const [objednavkyStat, setObjednavkyStat] = useState<any[]>([]);
  const [polozkyStat, setPolozkyStat] = useState<any[]>([]);
  const [obdobiStat, setObdobiStat] = useState<Obdobi>('mesic');
  const [packages, setPackages] = useState<Package[]>([]);
  const [cenik, setCenik] = useState<CenaPolozky[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);

  // Modal pro tisk uzávěrky
  const [showPrintModal, setShowPrintModal] = useState(false);
  // Zpět zavře tiskový náhled místo odchodu z historie.
  useChovaniDialogu(showPrintModal, () => setShowPrintModal(false));

  // Zámek proti zápisu ze zastaralého načtení — viz lib/nacitani.ts.
  const zacniNacteni = usePosledniNacteni();
  async function load(tiche = false) {
    const smiZapsat = zacniNacteni();
    if (!tiche) setLoading(true);
    const [{ data: bt }, { data: kg }, { data: fa }, { data: wo }, { data: ak }, { data: oi }, { data: ord }, { data: b }, { data: pk }, { data: cen }] = await Promise.all([
      nactiSdilenouTabulku('bottling'),
      nactiSdilenouTabulku('kegging'),
      nactiSdilenouTabulku('fasovani'),
      nactiSdilenouTabulku('writeoffs'),
      fetchAllRows('akce', 'entry_date,revenue,items:akce_items(beer_id,quantity_taken,quantity_returned,quantity)'),
      nactiSdilenouTabulku('order_items'),
      nactiSdilenouTabulku('orders'),
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      // Ceník pro záložku Tržby — stejný výběr jako v Objednávkách.
      fetchAllRows('price_list', 'beer_id,package_id,price_per_unit,currency,valid_from,valid_to'),
    ]);
    // Mezitím mohlo začít novější načtení, nebo už obrazovka není vidět.
    if (!smiZapsat()) return;
    const beerList = (b as Beer[]) ?? [];
    setBeers(beerList);
    setVyrobaLahve((bt as VyrobniRadek[]) ?? []);
    setVyrobaSudy((kg as VyrobniRadek[]) ?? []);
    setFasovaniStat((fa as VyrobniRadek[]) ?? []);
    setOdpisyStat((wo as VyrobniRadek[]) ?? []);
    setObjednavkyStat((ord as any[]) ?? []);
    setPolozkyStat((oi as any[]) ?? []);
    setPackages((pk as Package[]) ?? []);
    setCenik((cen as CenaPolozky[]) ?? []);

    const agg = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity)));
      return m;
    };
    const aggByDim = (rows: FilterableEntry[], dim: 'beer_id' | 'package_id') => {
      const m = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const mk = monthKey(r.entry_date);
        const key = (r[dim] as string | null) ?? 'unknown';
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        inner.set(key, (inner.get(key) ?? 0) + Number(r.quantity));
      });
      return m;
    };
    const pkList = (pk as Package[]) ?? [];
    // Obal podle id z mapy, ne `pkList.find` pro každý řádek pohybu.
    const obalPodleId = new Map(pkList.map((p) => [p.id, p] as const));
    const aggLiters = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg) return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const btRows = (bt as FilterableEntry[]) ?? [];
    const kgRows = (kg as FilterableEntry[]) ?? [];
    const faRows = (fa as FilterableEntry[]) ?? [];
    const woRows = (wo as FilterableEntry[]) ?? [];
    const btM = agg(btRows);
    const kgM = agg(kgRows);
    const faM = agg(faRows);
    const woM = agg(woRows);
    const btLitersM = aggLiters(btRows);
    const kgLitersM = aggLiters(kgRows);
    const brewedByBeer = aggByDim([...btRows, ...kgRows], 'beer_id');
    const brewedByPackage = aggByDim([...btRows, ...kgRows], 'package_id');
    const akRows = (ak as { entry_date: string; revenue: number | null; items: { beer_id: string | null; quantity_taken: number; quantity_returned: number; quantity: number | null }[] }[]) ?? [];
    const brewedByBeerHl = new Map<string, Map<string, number>>();
    [...btRows, ...kgRows].forEach((r) => {
      const mk = monthKey(r.entry_date);
      const key = r.beer_id ?? 'unknown';
      const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
      if (!pkg) return;

      if (!brewedByBeerHl.has(mk)) {
        brewedByBeerHl.set(mk, new Map());
      }
      const innerMap = brewedByBeerHl.get(mk)!;
      innerMap.set(key, (innerMap.get(key) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
    });

    const akTaken = new Map<string, number>();
    const akRet = new Map<string, number>();
    const akRevenue = new Map<string, number>();
    akRows.forEach((r) => {
      const mk = monthKey(r.entry_date);
      akRevenue.set(mk, (akRevenue.get(mk) ?? 0) + Number(r.revenue ?? 0));
      (r.items ?? []).forEach((i) => {
        if (i.quantity != null) {
          const q = Number(i.quantity);
          if (q < 0) akTaken.set(mk, (akTaken.get(mk) ?? 0) + (-q));
          else if (q > 0) akRet.set(mk, (akRet.get(mk) ?? 0) + q);
        } else {
          akTaken.set(mk, (akTaken.get(mk) ?? 0) + Number(i.quantity_taken));
          akRet.set(mk, (akRet.get(mk) ?? 0) + Number(i.quantity_returned));
        }
      });
    });

    const ordRows = (ord as { id: string; order_date: string; delivery_date: string | null; status: string }[]) ?? [];
    const oiRows = (oi as { beer_id: string | null; package_id: string | null; quantity: number; order_id: string }[]) ?? [];
    // Dřív pro každou objednávku průchod VŠEMI položkami (viz lib/statistika).
    const ordM = objednanoPoMesicich(ordRows, oiRows);

    // Výpočet rozpadu KEG vs PET podle druhů obalů
    const calcKegHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg || pkg.kind !== 'keg') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcBottleHl = (rows: FilterableEntry[]) => {
      const m = new Map<string, number>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg || pkg.kind !== 'bottle') return;
        m.set(monthKey(r.entry_date), (m.get(monthKey(r.entry_date)) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcByBeerKindHl = (rows: FilterableEntry[], kind: 'keg' | 'bottle') => {
      const m = new Map<string, Map<string, number>>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg || pkg.kind !== kind) return;
        const mk = monthKey(r.entry_date);
        const key = r.beer_id ?? 'unknown';
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        inner.set(key, (inner.get(key) ?? 0) + Number(r.quantity) * Number(pkg.volume_l));
      });
      return m;
    };
    const calcByPackageKind = (rows: FilterableEntry[]) => {
      const m = new Map<string, Map<string, { ks: number; hl: number }>>();
      rows.forEach((r) => {
        const pkg = r.package_id ? obalPodleId.get(r.package_id) : undefined;
        if (!pkg) return;
        const mk = monthKey(r.entry_date);
        const kind = pkg.kind;
        if (!m.has(mk)) m.set(mk, new Map());
        const inner = m.get(mk)!;
        const prev = inner.get(kind) ?? { ks: 0, hl: 0 };
        inner.set(kind, { ks: prev.ks + Number(r.quantity), hl: prev.hl + Number(r.quantity) * Number(pkg.volume_l) });
      });
      return m;
    };

    const allBrewRows = [...btRows, ...kgRows];
    const kegHlM = calcKegHl(allBrewRows);
    const bottleHlM = calcBottleHl(allBrewRows);
    const byBeerKegHlM = calcByBeerKindHl(allBrewRows, 'keg');
    const byBeerBottleHlM = calcByBeerKindHl(allBrewRows, 'bottle');
    const byPackageKindM = calcByPackageKind(allBrewRows);

    const allMonths = new Set<string>([...btM.keys(), ...kgM.keys(), ...faM.keys(), ...woM.keys(), ...akTaken.keys(), ...ordM.keys()]);
    const result: MonthData[] = [...allMonths].sort().reverse().map((mk) => ({
      month: mk,
      brewed: (btM.get(mk) ?? 0) + (kgM.get(mk) ?? 0),
      bottled: btM.get(mk) ?? 0,
      kegged: kgM.get(mk) ?? 0,
      brewed_hl: ((btLitersM.get(mk) ?? 0) + (kgLitersM.get(mk) ?? 0)) / 100,
      fasovani: faM.get(mk) ?? 0,
      writeoffs: woM.get(mk) ?? 0,
      ordered: ordM.get(mk) ?? 0,
      akce_taken: akTaken.get(mk) ?? 0,
      akce_returned: akRet.get(mk) ?? 0,
      akce_revenue: akRevenue.get(mk) ?? 0,
      byBeer: Object.fromEntries((brewedByBeer.get(mk) ?? new Map()).entries()),
      byBeerHl: Object.fromEntries((brewedByBeerHl.get(mk) ?? new Map()).entries()),
      byPackage: Object.fromEntries((brewedByPackage.get(mk) ?? new Map()).entries()),
      kegHl: (kegHlM.get(mk) ?? 0) / 100,
      bottleHl: (bottleHlM.get(mk) ?? 0) / 100,
      byBeerKegHl: Object.fromEntries((byBeerKegHlM.get(mk) ?? new Map()).entries()),
      byBeerBottleHl: Object.fromEntries((byBeerBottleHlM.get(mk) ?? new Map()).entries()),
      byPackageKind: Object.fromEntries((byPackageKindM.get(mk) ?? new Map()).entries()),
    }));
    setData(result);
    if (result.length > 0) setSelectedMonths([result[0].month]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  // 🔇 Realtime přenačítá TIŠE. Bez toho zavolá loadData() bez parametru,
  // rozsvítí se spinner přes celou obrazovku (`if (loading) return <Kostra/>`),
  // obsah se odmountuje — a s ním spadne odrolování na nulu. Z provozu:
  // „když kliknu odečíst, vrací mě to vždycky nahoru." Vlastní zápis stránku
  // srovná kotvou (lib/drzPozici.ts), jenže 400 ms po něm dorazí realtime
  // událost o tomtéž zápisu a celou práci zahodí.
  useRealtime(['bottling', 'kegging', 'fasovani', 'writeoffs', 'orders', 'order_items', 'akce', 'akce_items', 'beers', 'packages', 'price_list'], () => load(true));

  function toggleMonth(m: string) {
    setSelectedMonths((s) => s.includes(m) ? s.filter((x) => x !== m) : [...s, m].sort().reverse());
  }

  const selected = data.filter((d) => selectedMonths.includes(d.month));


  const topStats = useMemo(() => {
    // Nejvíc stočené pivo+obal letos — ze stáčení (lahve + sudy). Dřív se
    // bralo z Hledání, které sčítalo i fasování a objednávky.
    const odRoku = startOfYearISO(todayISO());
    const souctyStaceni = new Map<string, { beer_name: string; package_label: string; totalQty: number }>();
    [...vyrobaLahve, ...vyrobaSudy].forEach((r) => {
      if (!r.entry_date || r.entry_date < odRoku) return;
      const klic = `${r.beer_id}__${r.package_id}`;
      const z = souctyStaceni.get(klic) ?? {
        beer_name: beers.find((b) => b.id === r.beer_id)?.name ?? 'Neznámé pivo',
        package_label: packages.find((p) => p.id === r.package_id)?.label ?? 'Neznámý obal',
        totalQty: 0,
      };
      z.totalQty += Number(r.quantity || 0);
      souctyStaceni.set(klic, z);
    });
    const topBeer = [...souctyStaceni.values()].sort((a, b) => b.totalQty - a.totalQty)[0] ?? null;
    return { topBeer };
  }, [vyrobaLahve, vyrobaSudy, beers, packages]);

  // 📦 Nejvíc stáčený OBAL za zvolené období — ne „nejvíc kusů dohromady".
  // Jde o to, do čeho se nejvíc stáčí, tedy čeho mít doma nejvíc.
  const nejcastejsiObal = useMemo(() => {
    const { od, do: doKdy } = rozsahObdobi(obdobiStat, denObdobi(obdobiStat, todayISO(), 0));
    const mapaObalu = new Map(packages.map((p) => [p.id, p as any]));
    return podilPodleObalu(vyrobaSudy, mapaObalu, od, doKdy)[0] ?? null;
  }, [vyrobaSudy, packages, obdobiStat]);

  // 💤 Kdo dřív bral a teď mlčí. Jediné číslo ve Statistice, které mluví
  // o ztracených penězích — všechno ostatní ukazuje, co se stalo.
  const utichliOdberatele = useMemo(
    () => kdoPrestalObjednavat(objednavkyStat, polozkyStat, new Map(packages.map((p) => [p.id, p as any])), todayISO()),
    [objednavkyStat, polozkyStat, packages],
  );

  // ---- Celkové KPI za aktuální rok ----
  const currentYear = new Date().getFullYear().toString();
  const yearData = useMemo(() => {
    const yearMonths = data.filter(d => d.month.startsWith(currentYear));
    return {
      totalBrewed: yearMonths.reduce((s, d) => s + d.brewed, 0),
      totalBottled: yearMonths.reduce((s, d) => s + d.bottled, 0),
      totalKegged: yearMonths.reduce((s, d) => s + d.kegged, 0),
      totalBrewedHl: yearMonths.reduce((s, d) => s + d.brewed_hl, 0),
      totalFasovani: yearMonths.reduce((s, d) => s + d.fasovani, 0),
      totalWriteoffs: yearMonths.reduce((s, d) => s + d.writeoffs, 0),
      totalOrdered: yearMonths.reduce((s, d) => s + d.ordered, 0),
      totalAkceRevenue: yearMonths.reduce((s, d) => s + d.akce_revenue, 0),
      totalAkceTaken: yearMonths.reduce((s, d) => s + d.akce_taken, 0),
      avgMonthlyBrewed: yearMonths.length > 0 ? Math.round(yearMonths.reduce((s, d) => s + d.brewed, 0) / yearMonths.length) : 0,
      monthCount: yearMonths.length,
    };
  }, [data, currentYear]);




  // Kostra místo kolečka: obsah se neodmountuje do prázdna, takže se
  // stránka po načtení neposkočí. Viz Kostra v components/ui.tsx.
  if (loading) return <Kostra radku={6} />;

  return (
    <div className="space-y-6 pb-12">
      {/* Stejná lišta záložek jako zbytek appky (components/TabBar.tsx) —
          dřív tu byla vlastní kopie s dlouhými popisky a nad ní osm barevných
          dlaždic za rok, které byly vidět na každé záložce. Ty jsou teď jako
          karta „Letos v kusech" na Výstavu, kam patří. */}
      <TabBar items={LISTA_ZALOZEK} activeId={activeTab} onSelect={(id) => selectTab(id as Zalozka)} />

      {/* ZÁLOŽKA 1: VÝSTAV
          Pohltila dřívější „Měsíční přehledy & Porovnání" a „Výstav (HL) &
          KEG/PET". Ty tři záložky ukazovaly z velké části totéž — tři různé
          rozpisy obalů, dva měsíční grafy, dvě sady dlaždic — jen každá
          trochu jinak, a na telefonu zabíral zalomený pruh osmi záložek
          třetinu displeje. Co tam bylo navíc (ztráty KEG), je teď karta
          „Rozpočet sudů"; vlastní rozsah dat zůstal v „Podrobném hledání". */}
      {activeTab === 'vystav' && (
        <div className="space-y-4">
        {/* 🖨️ Tisková uzávěrka pro sládka — počítá se z měsíčních součtů,
            takže patří k Výstavu, ne na každou záložku. */}
        <div className="flex justify-end">
          <button onClick={() => setShowPrintModal(true)} className="btn-ghost !rounded text-xs flex items-center gap-1.5">
            <Printer size={16} /> Měsíční uzávěrka (tisk)
          </button>
        </div>
        <StatistikaVystav
          bottlingRows={vyrobaLahve}
          keggingRows={vyrobaSudy}
          fasovaniRows={fasovaniStat}
          writeoffRows={odpisyStat}
          obaly={packages as any}
          piva={beers as any}
          orders={objednavkyStat}
          orderItems={polozkyStat}
          dnes={todayISO()}
          obdobi={obdobiStat}
          onObdobi={setObdobiStat}
        />

        {/* 📋 Letos v kusech. Dřív osm barevných dlaždic nad záložkami, na
            každé záložce — a první se jmenovala „Uvařeno", i když sčítá
            stočené kusy (lahve + sudy). Výstav výš počítá jen sudy
            v hektolitrech, takže se čísla liší; poznámka to říká rovnou. */}
        <section className="card p-3.5 sm:p-5">
          <h3 className="font-display font-black text-base text-neutral-900">Letos v kusech ({currentYear})</h3>
          <p className="text-udaj font-semibold text-neutral-500 mt-0.5 mb-3">
            Všechny obaly dohromady, v kusech. Výstav výš počítá jen sudy v hektolitrech — proto se čísla liší.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            {([
              ['Stočeno (lahve + sudy)', `${yearData.totalBrewed} ks`, `${yearData.totalBrewedHl.toFixed(1)} hl`],
              ['Do lahví', `${yearData.totalBottled} ks`, null],
              ['Do sudů', `${yearData.totalKegged} ks`, null],
              ['Ø stočeno za měsíc', `${yearData.avgMonthlyBrewed} ks`, `z ${yearData.monthCount} měsíců`],
              ['Objednáno', `${yearData.totalOrdered} ks`, null],
              ['Fasováno', `${yearData.totalFasovani} ks`, null],
              ['Odpisy', `${yearData.totalWriteoffs} ks`, null],
              ['Tržby z akcí', `${yearData.totalAkceRevenue.toLocaleString('cs-CZ')} Kč`, null],
            ] as const).map(([popis, hodnota, pod]) => (
              <div key={popis}>
                <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">{popis}</div>
                <div className="text-lg font-display font-black text-neutral-900 tabular-nums">{hodnota}</div>
                {pod && <div className="text-udaj font-bold text-neutral-500">{pod}</div>}
              </div>
            ))}
          </div>
        </section>
        </div>
      )}



      {/* TAB 4: TOP ŽEBRÍČKY & STATISTIKY */}
      {/* 💰 Tržby podle ceníku (components/StatistikaTrzby.tsx). */}
      {activeTab === 'trzby' && (
        <StatistikaTrzby orders={objednavkyStat} orderItems={polozkyStat} cenik={cenik} dnes={todayISO()} />
      )}

      {activeTab === 'stats' && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {topStats.topBeer && (
            <div className="card p-5 bg-white border-2 border-amber-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <Trophy size={16} className="text-amber-600" />
                <span>Nejvíc stočené pivo (letos)</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{topStats.topBeer.beer_name}</div>
              <div className="text-xs font-bold text-neutral-600">{topStats.topBeer.totalQty} ks · {topStats.topBeer.package_label}</div>
            </div>
          )}

          {/* 📦 Nejvíc stáčený obal — čeho mít doma nejvíc umytého.
              Schválně za období zvolené na záložce Výstav, ne „za celou
              dobu": co se stáčelo před třemi lety, dnešní přípravu neřídí. */}
          {nejcastejsiObal && (
            <div className="card p-5 bg-white border-2 border-amber-300 rounded space-y-2">
              <div className="text-xs font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                <IkonaSud size={16} className="text-amber-600" />
                <span>Nejvíc stáčený obal ({POPIS_OBDOBI_ZEBRICEK[obdobiStat]})</span>
              </div>
              <div className="font-display font-black text-xl text-neutral-900">{nejcastejsiObal.nazev}</div>
              <div className="text-xs font-bold text-neutral-600">
                {nejcastejsiObal.kusy} ks · {(nejcastejsiObal.litry / 100).toFixed(1)} hl · {(nejcastejsiObal.podil * 100).toFixed(0)} % výstavu
              </div>
            </div>
          )}

          {/* 💤 Kdo přestal objednávat. Tohle je jediná karta, která mluví
              o penězích, co přestaly chodit — zbytek Statistiky ukazuje, co
              se stalo, tahle ukazuje, co se přestalo dít. */}
          <div className="card p-5 bg-white border-2 border-neutral-300 rounded space-y-2 sm:col-span-2">
            <div className="text-xs font-black uppercase tracking-wider text-neutral-700 flex items-center gap-1.5">
              <Store size={16} className="text-neutral-500" />
              <span>Kdo přestal objednávat</span>
            </div>
            {utichliOdberatele.length === 0 ? (
              <p className="text-xs font-bold text-neutral-600">Nikdo — všichni stálí odběratelé brali za posledních 60 dní.</p>
            ) : (
              <>
                <p className="text-udaj font-semibold text-neutral-500">
                  Bez závozu 60 dní a víc; jednorázoví odběratelé se nepočítají. Řazeno podle toho, kolik u nich za celou dobu proteklo.
                </p>
                <div className="space-y-1">
                  {utichliOdberatele.slice(0, 8).map((o) => (
                    <div key={o.nazev} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-bold text-neutral-900 truncate">{o.nazev}</span>
                      <span className="text-xs font-bold text-neutral-600 shrink-0 tabular-nums">
                        {(o.litry / 100).toFixed(1)} hl · {o.objednavek}× · naposled {new Date(o.posledni).toLocaleDateString('cs-CZ')} ({o.dnu} dní)
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        {/* Kdo by měl brzy objednat, piva proti loňsku, odpisy v čase. */}
        <StatistikaTrendy
          sudy={vyrobaSudy}
          odpisy={odpisyStat}
          obaly={packages as any}
          piva={beers as any}
          orders={objednavkyStat}
          dnes={todayISO()}
        />
        </div>
      )}

      {/* TAB 6: HISTORIE A PŘEHLED TRAS (přesunuto z obrazovky Závoz) */}
      {activeTab === 'deliveries' && (
        <ZavozHistory />
      )}

      {/* 🖨️ MODAL PRO TISK MĚSÍČNÍ UZÁVĚRKY SLÁDKA */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="tisk-oblast bg-white rounded max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4">
              <div>
                <span className="text-udaj font-mono font-black uppercase tracking-widest text-amber-600">Formátovaný protokol sládka</span>
                <h2 className="font-display font-black text-2xl text-neutral-900">Měsíční výrobně-skladová uzávěrka</h2>
                <p className="text-xs text-neutral-500 font-bold">Kynšperský pivovar s.r.o. — Výroba piva Zajíc</p>
              </div>
              <button
                onClick={() => setShowPrintModal(false)}
                className="tisk-skryt w-9 h-9 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-black grid place-items-center tap"
                title="Zavřít" aria-label="Zavřít"
              >
                <X size={18} />
              </button>
            </div>

            {/* 🗓️ Výběr měsíců. Dřív visel na záložce „Měsíční přehledy",
                která se zrušila — patří ale stejně sem: měsíce se vybírají
                ve chvíli, kdy se uzávěrka tiskne, ne o dvě obrazovky dřív.
                `tisk-skryt` drží přepínač mimo papír. */}
            {data.length > 0 && (
              <div className="tisk-skryt space-y-1.5">
                <span className="block text-udaj uppercase font-black text-neutral-500">Měsíce v uzávěrce</span>
                <div className="flex flex-wrap gap-2">
                  {data.slice(0, 24).map((d) => (
                    <button
                      key={d.month}
                      onClick={() => toggleMonth(d.month)}
                      aria-pressed={selectedMonths.includes(d.month)}
                      className={`tap px-3.5 py-1.5 rounded text-xs font-black transition-all border ${
                        selectedMonths.includes(d.month)
                          ? 'bg-neutral-900 text-white border-neutral-900 shadow-md'
                          : 'bg-white text-neutral-700 border-neutral-200 hover:bg-amber-50'
                      }`}
                    >
                      {monthLabel(d.month)}
                    </button>
                  ))}
                </div>
                {selected.length === 0 && (
                  <p className="text-udaj font-bold text-rose-700">Vyber aspoň jeden měsíc — jinak je uzávěrka prázdná.</p>
                )}
              </div>
            )}

            <div className="space-y-4 text-xs text-neutral-800">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-50 p-4 rounded border border-neutral-200">
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Měsíc uzávěrky</span>
                  <strong className="text-sm font-black text-neutral-900">{selectedMonths.length > 0 ? monthLabel(selectedMonths[0]) : 'Aktuální'}</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Celkem stočeno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.brewed, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Celkem fasováno</span>
                  <strong className="text-sm font-black text-neutral-900">{selected.reduce((sum, d) => sum + d.fasovani, 0)} ks</strong>
                </div>
                <div>
                  <span className="block text-udaj uppercase font-black text-neutral-500">Datum tisku</span>
                  <strong className="text-sm font-black text-neutral-900">{new Date().toLocaleDateString('cs-CZ')}</strong>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-black text-sm text-neutral-900">Souhrn výroby a stáčení za měsíce:</h4>
                <table className="w-full border-collapse text-left border border-neutral-200">
                  <thead>
                    <tr className="bg-neutral-100 border-b border-neutral-200">
                      <th scope="col" className="p-2 font-black">Měsíc</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno celkem</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno Sudy</th>
                      <th scope="col" className="p-2 font-black text-right">Stočeno Lahve</th>
                      <th scope="col" className="p-2 font-black text-right">Fasováno</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((d) => (
                      <tr key={d.month} className="border-b border-neutral-100 font-semibold">
                        <td className="p-2">{monthLabel(d.month)}</td>
                        <td className="p-2 text-right font-bold">{d.brewed} ks</td>
                        <td className="p-2 text-right">{d.kegged} ks</td>
                        <td className="p-2 text-right">{d.bottled} ks</td>
                        <td className="p-2 text-right">{d.fasovani} ks</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="pt-8 border-t border-neutral-200 flex justify-between items-center text-xs font-bold text-neutral-600">
                <div>Podpis odpovědného sládka: ................................</div>
                <div>Schválil majitel: ................................</div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-100">
              <button
                onClick={() => setShowPrintModal(false)}
                className="tisk-skryt px-4 py-2.5 rounded bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold"
              >
                Zavřít
              </button>
              <button
                onClick={() => window.print()}
                className="tisk-skryt px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-2"
              >
                <Printer size={16} />
                <span>Vytisknout / Uložit do PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

