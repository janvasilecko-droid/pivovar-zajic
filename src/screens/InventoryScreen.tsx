import { Fragment, useState, useEffect, useMemo, useRef } from 'react';


import { Beer, beerBg, beerInk, beerName, beerText, fetchAllRows, formatPackageLabel, Package, supabase, useRealtime } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { AlertCircle, AlertTriangle, Beer as BeerIcon, Calendar, Camera, ClipboardCheck, ClipboardList, Download, Check, Lock, MinusCircle, Package as PackageIcon, Plus, RefreshCw, RotateCcw, Save, Search } from 'lucide-react';
import { CountFromImage } from '../components/CountFromImage';
import { computeInventoryReconciliation } from '../lib/inventoryHelper';
import { akceProRozdil, datumDoplnku, doplnekVBudoucnu, jeSud, kegovaniZapisy, lahvoveZapisy, nabidnoutMinulyMesic, nazevMesice, odectiZeStoceni, vychoziMesicInventury, stoceniZapis } from '../lib/inventoryFix';
import { davkySrovnani, zapisyDavky, type DavkaPiva, type SmerSudu, type ZdrojovaSkupina } from '../lib/srovnaniDavka';
import { zapamatujPozici } from '../lib/drzPozici';
import { vyrovnaniZaMesic } from '../lib/vyrovnani';
import { lzeUlozitKoncept, slucInventuru } from '../lib/rozepsanaInventura';
import { normalizujCislo } from '../lib/cisloVstup';
import { popisRozdeleni, rozdelSudyDoTanku, zmenaOtevreni, type RozdeleniSudu, type TankProRozdeleni } from '../lib/tankRozdeleni';
import { saveBottlingPlan } from '../lib/bottlingPlans';
import { businessDateISO } from '../lib/businessDate';
import { buildMovements, expectedForMonth, stockAtStartOfDay, stockForMonth, type StockLine } from '../lib/stockLedger';
import { AUDIT_NADPISY, AUDIT_SLOUPCE, bunkaAuditu, maCoUkazat, porovnejPolozku, type AuditSloupec } from '../lib/auditSkladu';
import { chyba, oznam, potvrd, toastZpet, uspech } from '../lib/toast';
import { zavibruj } from '../lib/haptika';
import { IkonaSud } from '../components/ikony';

type InitialStockMap = Record<string, number>; // key: `${beer_id}__${package_id}`, val: qty

// Posun měsíce o delta (např. -1 = předchozí měsíc, +1 = následující)
function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}


type InventoryRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  package_kind?: string;
  package_volume?: number;
  price_czk: number;
  initialQty: number; // Počáteční stav k 1. dni v měsíci
  stacenoQty: number; // Nově stočeno tento měsíc
  odpisQty: number;   // Odpis (zápis v odpisech)
  vydejQty: number;   // Vytočeno (Fasování + Prodejna + Objednávky + Stáčení lahví + Akce - BEZ odpisů)

  expectedQty: number; // Vypočtená teoretická zásoba
  actualQty: number;   // Zadaná skutečná fyzická inventura
  diffQty: number;     // Odchylka (Skutečnost - Očekávání)
  diffCzk: number;     // Finanční odchylka v Kč

  dorovnatQty: number;   // Dorovnání (±) — přičte/odečte k očekávanému stavu (manko)
  reconciledQty: number; // Očekávaný stav PO dorovnání (expectedQty + dorovnatQty)
  diffAfterQty: number;  // Manko po dorovnání (Skutečnost − Dorovnaný stav)
  diffAfterCzk: number;  // Finanční rozdíl po dorovnání
};

function getPrevMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function computeInitialStockForMonth(
  monthKey: string,
  invRowsAll: any[],
  btRows: any[],
  kgRows: any[],
  faRows: any[],
  fpRows: any[],
  woRows: any[],
  zdRows: any[],
  akRows: any[],
  pfRows: any[] = [],
  adjRows: any[] = [],
  pkgList: { id: string; kind: string; volume_l: number }[] = []
): Record<string, number> {
  // 📒 Počáteční stav měsíce = stav skladu k RÁNU jeho prvního dne, ze
  // skladové knihy (lib/stockLedger.ts). Dřív to řešil getStartingStockMap,
  // který stav hledal i v localStorage (initial_stock_*, actual_inventory_*)
  // — počáteční stav pak mohl existovat jen v jednom prohlížeči a jiné
  // zařízení ukazovalo jiná čísla.
  const map: Record<string, number> = {};
  stockAtStartOfDay(
    buildMovements({
      inventoryRows: invRowsAll,
      bottlingRows: btRows,
      keggingRows: kgRows,
      fasovaniRows: faRows,
      prodejnaRows: fpRows,
      writeoffsRows: woRows,
      zavozDeductionRows: zdRows,
      akceRows: akRows,
      prefukRows: pfRows,
      adjustmentRows: adjRows,
      packages: pkgList,
    }),
    `${monthKey}-01`,
  ).forEach((line, k) => { map[k] = line.qty; });
  return map;
}

export default function InventoryScreen({ setPage, initialSubTab }: { setPage?: (p: any, sec?: string, sub?: string) => void; initialSubTab?: string } = {}) {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  // Záložka se drží v adrese stránky (setPage), takže může přijít i hodnota,
  // která už neexistuje — třeba zrušená záložka z minulé verze. Neznámou
  // proto srazíme na inventuru, jinak by se vykreslilo prázdno.
  const zalozka = (t: unknown): 'inventory' | 'initial_stock' | 'end_stock' | 'audit' =>
    t === 'initial_stock' || t === 'end_stock' || t === 'audit' ? t : 'inventory';

  const [activeTab, setActiveTab] = useState(() => zalozka(initialSubTab));

  useEffect(() => {
    setActiveTab(zalozka(initialSubTab));
  }, [initialSubTab]);

  function selectTab(t: 'inventory' | 'initial_stock' | 'end_stock' | 'audit') {
    if (setPage) setPage('inventory', undefined, t);
    else setActiveTab(t);
  }
  const loadCountRef = useRef(0);
  const loadedMonthRef = useRef<string | null>(null);
  const forceReloadRef = useRef(false);
  const excelFileRef = useRef<HTMLInputElement>(null);


  // Otevírá se na měsíci, který se uzavírá — prvních deset dní tedy na tom
  // předchozím (viz vychoziMesicInventury). Dřív to byl vždycky dnešní měsíc
  // a doplněné stáčení padalo do budoucnosti.
  const [currentMonth, setCurrentMonth] = useState<string>(() => vychoziMesicInventury(businessDateISO()));

  // Počáteční stavy zadané ručně sládkem na začátku měsíce (načítané z inventory tabulky)
  const [initialStock, setInitialStock] = useState<InitialStockMap>({});


  // Skutečně fyzicky spočítané stavy při inventuře
  const [actualStock, setActualStock] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`actual_inventory_${currentMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Dorovnání (±) — uchovává se BOKEM (mimo stáčení a odpočty), klíč: `${beer_id}__${package_id}`
  const [dorovnatMap, setDorovnatMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`inventory_adjustments_${currentMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [stacenoMap, setStacenoMap] = useState<Record<string, number>>({});
  const [vydejMap, setVydejMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [showPhotoCounter, setShowPhotoCounter] = useState(false);
  // Režim počítání — ve skladu se prochází s telefonem a všech 99 kombinací
  // pivo × obal je nepřehledných. Filtr zúží seznam na to, co se opravdu řeší.
  const [pocitaniFiltr, setPocitaniFiltr] = useState<'vse' | 'nespocitane' | 'pohyb' | 'nesedi'>('vse');
  // Lahve a sudy se ve skladu počítají zvlášť (jiné regály, jiný člověk), tak
  // ať se nemíchají v jednom dlouhém seznamu. Skládá se s filtrem výše.
  const [druhFiltr, setDruhFiltr] = useState<'vse' | 'lahve' | 'sudy'>('vse');
  /** Klíč řádku, u kterého právě běží zápis doplňku — blokuje dvojklik. */
  const [doplnujeSe, setDoplnujeSe] = useState<string | null>(null);
  /** Otevřený dialog doplnění stočení LAHVÍ (výběr zdrojových sudů). */

  // Data pro "Stav na konci měsíce" (bilanční konto sudů)
  const [objednavkyMap, setObjednavkyMap] = useState<Record<string, number>>({}); // Objednávky (kegy)
  const [stacenoLahveMap, setStacenoLahveMap] = useState<Record<string, number>>({}); // Stáčení lahví (kegy použité na lahve)
  const [fasovaniMap, setFasovaniMap] = useState<Record<string, number>>({}); // Fasování
  const [prodejnaMap, setProdejnaMap] = useState<Record<string, number>>({}); // Prodejna
  const [akceMap, setAkceMap] = useState<Record<string, number>>({}); // Akce (odvezené kegy)
  const [odpisyMap, setOdpisyMap] = useState<Record<string, number>>({}); // Odpisy (kegy)
  const [stacenoKegMap, setStacenoKegMap] = useState<Record<string, number>>({}); // Stáčení KEG
  // 📒 Očekávaný stav ze skladové knihy — jediný zdroj pravdy pro sklad.
  const [expectedLedger, setExpectedLedger] = useState<Map<string, StockLine>>(new Map());
  // 🔍 Druhá strana auditu: tentýž měsíc očima Skladu — počátek k prvnímu
  // dni dopočítaný z celé historie a k němu pohyby OD 1. DO POSLEDNÍHO.
  // Stejné okno jako u Inventury, aby se sloupce daly porovnat kus na kus;
  // rozdíl smí být jen v tom počátku (viz lib/auditSkladu.ts).
  const [skladLedger, setSkladLedger] = useState<Map<string, StockLine>>(new Map());
  // Inventurní strana auditu se od expectedLedger liší jedinou věcí: má
  // započítané dorovnání. Obrazovka ho přičítá sama ve sloupci „Po dorovnání",
  // takže ho v expectedLedger mít nesmí — v auditu by ale jeho chybění
  // vypadalo jako rozdíl proti Skladu, který ho počítá.
  const [auditInventura, setAuditInventura] = useState<Map<string, StockLine>>(new Map());
  // ⚖️ Kolik kusů se u které položky už srovnalo z inventury tohoto měsíce.
  // Po srovnání spadne rozdíl na nulu a tlačítko zmizí — jenže nula vypadá
  // stejně, ať se srovnávalo, nebo to sedělo od začátku. Tenhle sloupec ten
  // rozdíl ukáže (viz lib/vyrovnani.ts).
  const [vyrovnaniMap, setVyrovnaniMap] = useState<Map<string, number>>(new Map());
  /** Leží za tenhle měsíc v databázi uložená fyzická (nebo schválená) inventura? */
  const [inventuraUlozena, setInventuraUlozena] = useState(false);
  // 🛢️ Tanky pro odečet doplněného kegování.
  const [tanky, setTanky] = useState<TankProRozdeleni[]>([]);

  /**
   * @param tiche Nechá obrazovku vykreslenou a jen aktualizuje čísla.
   *
   * Po srovnání řádku se dřív vždycky rozsvítil spinner přes celou obrazovku,
   * stránka odskočila nahoru a hledalo se, kde člověk přestal. Při srovnávání
   * pěti obalů jednoho piva za sebou to bylo pětkrát. Data se přenačíst musí
   * (mění se očekávaný stav), ale rozbourat kvůli tomu celou obrazovku ne.
   */
  async function loadData(tiche = false) {
    const loadId = ++loadCountRef.current;
    if (!tiche) setLoading(true);

    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo }, { data: inv }, { data: adj }, { data: zd }, { data: ak }, { data: pf }, { data: tk }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      fetchAllRows('bottling', 'beer_id,package_id,quantity,entry_date,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      fetchAllRows('kegging', 'beer_id,package_id,quantity,entry_date,note'),
      fetchAllRows('fasovani', 'beer_id,package_id,quantity,entry_date'),
      fetchAllRows('fasovani_private', 'beer_id,package_id,quantity,entry_date'),
      fetchAllRows('writeoffs', 'beer_id,package_id,quantity,entry_date'),
      fetchAllRows('inventory', 'beer_id,package_id,quantity,entry_date,note'),
      fetchAllRows('inventory_adjustments', 'beer_id,package_id,quantity,entry_date,created_at'),
      // Odpočet objednávek — stejný zdroj (zavoz_deductions) jako obrazovka Sklad, aby se
      // čísla shodovala i po dodatečné změně data doručení objednávky (viz Stock.tsx).
      fetchAllRows('zavoz_deductions', 'deduct_date,beer_id,package_id,quantity'),
      fetchAllRows('akce', 'entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
      fetchAllRows('keg_prefuk', 'entry_date,beer_id,from_package_id,from_count,to_package_id,to_count'),
      // 🛢️ Tanky — doplněné kegování z inventury z nich odečítá objem, aby
      // sklep nezůstal nafouklý (viz tankRozdeleni.ts).
      supabase.from('cellar_tanks').select('id,label,current_beer_id,current_volume_l,status,started_at,kegging_active'),
    ]);

    if (loadId !== loadCountRef.current) return;

    setBeers((b as Beer[]) ?? []);
    setPackages((pk as Package[]) ?? []);
    setTanky((tk as TankProRozdeleni[]) ?? []);

    const invRowsAll = ((inv as any[]) ?? []);

    // 📒 Skladová kniha se postaví JEDNOU a obě strany auditu z ní berou.
    // Kdyby se stavěla dvakrát z jiných dat, karta Auditu by porovnávala
    // jablka s hruškami a rozdíl by nic neznamenal.
    const pohyby = buildMovements({
      inventoryRows: invRowsAll,
      bottlingRows: (bt as any[]) ?? [],
      keggingRows: (kg as any[]) ?? [],
      fasovaniRows: (fa as any[]) ?? [],
      prodejnaRows: (fp as any[]) ?? [],
      writeoffsRows: (wo as any[]) ?? [],
      zavozDeductionRows: (zd as any[]) ?? [],
      akceRows: (ak as any[]) ?? [],
      prefukRows: (pf as any[]) ?? [],
      adjustmentRows: (adj as any[]) ?? [],
      packages: (pk as Package[]) ?? [],
    });

    // 📒 Očekávaný (teoretický) stav ke konci měsíce ze skladové knihy —
    // stejná matematika jako Sklad, Dashboard a „co stočit na který den".
    setExpectedLedger(expectedForMonth(pohyby, currentMonth));
    setAuditInventura(expectedForMonth(pohyby, currentMonth, true));
    setVyrovnaniMap(vyrovnaniZaMesic(pohyby, currentMonth));
    // 🔍 Tatáž kniha očima Skladu — měsíční rozpad, ne od začátku evidence.
    setSkladLedger(stockForMonth(pohyby, currentMonth));

    // Přepnutí měsíce a přenačtení po zápisu se chovají JINAK: při přepnutí
    // se musí načíst všechno znovu, po zápisu se nesmí přepsat rozepsaná
    // čísla (viz lib/rozepsanaInventura.ts).
    const zmenaMesice = loadedMonthRef.current !== currentMonth;
    const shouldReloadState = zmenaMesice || forceReloadRef.current;

    // 1. POČÁTEČNÍ STAVY pro aktuální měsíc (currentMonth) s automatickou kontinuitou z předchozího měsíce
    const invAcc = computeInitialStockForMonth(
      currentMonth,
      invRowsAll,
      (bt as any[]) ?? [],
      (kg as any[]) ?? [],
      (fa as any[]) ?? [],
      (fp as any[]) ?? [],
      (wo as any[]) ?? [],
      (zd as any[]) ?? [],
      (ak as any[]) ?? [],
      (pf as any[]) ?? [],
      (adj as any[]) ?? [],
      (pk as any[]) ?? []
    );
    if (shouldReloadState) {
      setInitialStock(invAcc);
    }

    // 2. SKUTEČNÁ FYZICKÁ INVENTURA (pro sloupec Inventura)
    // 2a. Základ = localStorage actual_inventory_YYYY-MM (pokud něco je)
    let curActual: Record<string, string> = {};
    try {
      const savedActual = localStorage.getItem(`actual_inventory_${currentMonth}`);
      if (savedActual) curActual = JSON.parse(savedActual) ?? {};
    } catch {}
    // 2b. Pokud je v DB uložená fyzická/schválená inventura, má přednost a uloží i do localStorage.
    const actualRowsForCurMonth = invRowsAll.filter((r) => r.entry_date?.slice(0, 7) === currentMonth && (r.note?.includes('Fyzická') || r.note?.includes('Schválená')));
    setInventuraUlozena(actualRowsForCurMonth.length > 0);
    if (actualRowsForCurMonth.length > 0) {
      const dbActualMap: Record<string, string> = {};
      actualRowsForCurMonth.forEach((r) => {
        if (!r.beer_id || !r.package_id) return;
        const k = `${r.beer_id}__${r.package_id}`;
        dbActualMap[k] = String(r.quantity || 0);
      });
      curActual = dbActualMap;
      try { localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(dbActualMap)); } catch {}
    }
    if (shouldReloadState) {
      setActualStock((prev) => slucInventuru(curActual, prev, zmenaMesice));
    }

    // 3. DOROVNÁNÍ (±) — uchovává se BOKEM (mimo stáčení a odpočty)
    // 3a. Základ = localStorage inventory_adjustments_YYYY-MM
    let curAdj: Record<string, string> = {};
    try {
      const savedAdj = localStorage.getItem(`inventory_adjustments_${currentMonth}`);
      if (savedAdj) curAdj = JSON.parse(savedAdj) ?? {};
    } catch {}
    // 3b. Pokud je v DB uložené dorovnání, má přednost a uloží i do localStorage.
    const adjRowsForCurMonth = ((adj as any[]) ?? []).filter((r) => r.entry_date?.slice(0, 7) === currentMonth);
    if (adjRowsForCurMonth.length > 0) {
      const dbAdjMap: Record<string, string> = {};
      adjRowsForCurMonth.forEach((r) => {
        if (!r.beer_id || !r.package_id) return;
        const k = `${r.beer_id}__${r.package_id}`;
        const v = Number(r.quantity || 0);
        if (v !== 0) dbAdjMap[k] = String(v);
      });
      curAdj = dbAdjMap;
      try { localStorage.setItem(`inventory_adjustments_${currentMonth}`, JSON.stringify(dbAdjMap)); } catch {}
    }
    if (shouldReloadState) {
      setDorovnatMap((prev) => slucInventuru(curAdj, prev, zmenaMesice));
    }

    loadedMonthRef.current = currentMonth;
    forceReloadRef.current = false;

    // Pohyby v AKTUÁLNÍM MĚSÍCI (currentMonth)
    const filterMovement = (entry_date?: string) => {
      if (!entry_date) return false;
      return entry_date.slice(0, 7) === currentMonth;
    };

    // Příjem (Stáčení) — pro inventuru aktuálního měsíce (lahve + kegy dohromady)
    const stacenoAcc: Record<string, number> = {};
    [...((bt as any[]) ?? []), ...((kg as any[]) ?? [])].filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      stacenoAcc[k] = (stacenoAcc[k] || 0) + Number(r.quantity || 0);
    });
    setStacenoMap(stacenoAcc);

    // === Bilanční konto a pomocné výpočty ===
    const kegPkgIds = new Set((pk as Package[] ?? []).filter((p) => p.kind === 'keg').map((p) => p.id));

    const getKegsUsed = (r: any) => {
      const kegsUsed = Number(r.kegs_used || 0);
      if (kegsUsed <= 0) return null;
      if (r.kegs_used_package_id) return { kegPkgId: r.kegs_used_package_id, kegsUsed };
      const sourceL = Number(r.source_volume_l || 0);
      if (sourceL > 0) {
        const singleVol = sourceL / kegsUsed;
        const matched = (pk as Package[] ?? []).find((p) => p.kind === 'keg' && Number(p.volume_l) === singleVol);
        if (matched) return { kegPkgId: matched.id, kegsUsed };
      }
      const pkg = (pk as Package[] ?? []).find((p) => p.id === r.package_id);
      if (pkg && pkg.kind === 'keg') return { kegPkgId: pkg.id, kegsUsed };
      return null;
    };

    // Odpisy (samostatný odpis piva a obalů)
    const odpisAcc: Record<string, number> = {};
    ((wo as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      odpisAcc[k] = (odpisAcc[k] || 0) + Number(r.quantity || 0);
    });
    setOdpisyMap(odpisAcc);

    // Výdej (Fasování + Prodejna + Objednávky + Stáčení lahví + Akce - BEZ odpisů)
    const vydejAcc: Record<string, number> = {};
    const addVydej = (r: any) => {
      if (!r.beer_id || !r.package_id) return;
      const k = `${r.beer_id}__${r.package_id}`;
      vydejAcc[k] = (vydejAcc[k] || 0) + Number(r.quantity || 0);
    };
    // Fasování + Prodejna (BEZ odpisů wo)
    [...((fa as any[]) ?? []), ...((fp as any[]) ?? [])].filter((r) => filterMovement(r.entry_date)).forEach(addVydej);
    // Objednávky — odečtené závozy (zavoz_deductions), stejný zdroj jako obrazovka Sklad.
    // Datum odpočtu (deduct_date) je zafixované v okamžiku závozu, takže se nerozejde
    // s Objednávkami, i když se datum doručení objednávky dodatečně změní.
    ((zd as any[]) ?? []).filter((r) => filterMovement(r.deduct_date)).forEach((r) => addVydej({ beer_id: r.beer_id, package_id: r.package_id, quantity: r.quantity }));
    // Stáčení lahví (kegy použité na stáčení lahví) — deduplikace zdroje
    const seenKegSourceVydej = new Set<string>();
    ((bt as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      if (!r.beer_id) return;
      const res = getKegsUsed(r);
      if (res) {
        const key = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${r.created_at || r.note || ''}`;
        if (seenKegSourceVydej.has(key)) return;
        seenKegSourceVydej.add(key);
        const k = `${r.beer_id}__${res.kegPkgId}`;
        vydejAcc[k] = (vydejAcc[k] || 0) + res.kegsUsed;
      }
    });
    // Akce (kegy odvezené na akce)
    ((ak as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      (r.items ?? []).forEach((it: any) => {
        if (it.beer_id && it.package_id) {
          const k = `${it.beer_id}__${it.package_id}`;
          const netTaken = Math.max(0, Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0));
          vydejAcc[k] = (vydejAcc[k] || 0) + netTaken;
        }
      });
    });
    setVydejMap(vydejAcc);

    // Stáčení KEG (příjem sudů)
    const kegAcc: Record<string, number> = {};
    ((kg as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      kegAcc[k] = (kegAcc[k] || 0) + Number(r.quantity || 0);
    });
    setStacenoKegMap(kegAcc);

    // Stáčení lahví (kegy použité na stáčení lahví) — odečítají se ze skladu SUDŮ.
    const lahveAcc: Record<string, number> = {};
    const seenKegSource = new Set<string>();
    ((bt as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      if (!r.beer_id) return;
      const res = getKegsUsed(r);
      if (res) {
        const key = `${r.entry_date}|${r.beer_id}|${res.kegsUsed}|${res.kegPkgId}|${r.created_at || r.note || ''}`;
        if (seenKegSource.has(key)) return;
        seenKegSource.add(key);
        const k = `${r.beer_id}__${res.kegPkgId}`;
        lahveAcc[k] = (lahveAcc[k] || 0) + res.kegsUsed;
      }
    });
    setStacenoLahveMap(lahveAcc);

    // Fasování
    const fasAcc: Record<string, number> = {};
    ((fa as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      fasAcc[k] = (fasAcc[k] || 0) + Number(r.quantity || 0);
    });
    setFasovaniMap(fasAcc);

    // Prodejna
    const prodejAcc: Record<string, number> = {};
    ((fp as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      prodejAcc[k] = (prodejAcc[k] || 0) + Number(r.quantity || 0);
    });
    setProdejnaMap(prodejAcc);

    // Odpisy
    const odpisyAcc: Record<string, number> = {};
    ((wo as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      odpisyAcc[k] = (odpisyAcc[k] || 0) + Number(r.quantity || 0);
    });
    setOdpisyMap(odpisyAcc);

    // Objednávky — kegy odečtené závozem v tomto měsíci (zavoz_deductions, stejný zdroj jako Sklad)
    const objAcc: Record<string, number> = {};
    ((zd as any[]) ?? []).filter((r) => filterMovement(r.deduct_date) && kegPkgIds.has(r.package_id)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      objAcc[k] = (objAcc[k] || 0) + Number(r.quantity || 0);
    });
    setObjednavkyMap(objAcc);

    // Akce — kegy odvezené na akce v tomto měsíci
    const akceAcc: Record<string, number> = {};
    ((ak as any[]) ?? []).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
      (r.items ?? []).forEach((it: any) => {
        if (it.beer_id && it.package_id && kegPkgIds.has(it.package_id)) {
          const k = `${it.beer_id}__${it.package_id}`;
          const netTaken = Math.max(0, Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0));
          akceAcc[k] = (akceAcc[k] || 0) + netTaken;
        }
      });
    });
    try {
      const saved = localStorage.getItem('akce_records_v2');
      const akceRecords = saved ? JSON.parse(saved) : [];
      (akceRecords as any[]).filter((r) => filterMovement(r.entry_date)).forEach((r) => {
        (r.items ?? []).forEach((it: any) => {
          if (it.beer_id && it.package_id && kegPkgIds.has(it.package_id)) {
            const k = `${it.beer_id}__${it.package_id}`;
            if (!akceAcc[k]) {
              const netTaken = Math.max(0, Number(it.quantity_taken || 0) - Number(it.quantity_returned || 0));
              akceAcc[k] = netTaken;
            }
          }
        });
      });
    } catch {}
    setAkceMap(akceAcc);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  // 🔇 Realtime přenačítá TIŠE. Bez toho zavolá loadData() bez parametru,
  // rozsvítí se spinner přes celou obrazovku (`if (loading) return <Spinner/>`),
  // obsah se odmountuje — a s ním spadne odrolování na nulu. Z provozu:
  // „když kliknu odečíst, vrací mě to vždycky nahoru." Vlastní zápis stránku
  // srovná kotvou (lib/drzPozici.ts), jenže 400 ms po něm dorazí realtime
  // událost o tomtéž zápisu a celou práci zahodí.
  // 💾 Rozepsaná inventura a dorovnání se ukládají průběžně, ne až při
  // „Uložit". Inventura se dělá v chlaďáku na telefonu a ten uspí obrazovku
  // nebo appku vyhodí z paměti — bez tohohle by hodina počítání zmizela.
  // Ukládá se až po prvním načtení měsíce, jinak by prázdný stav při
  // otevírání přepsal uložený koncept dřív, než se stihne načíst.
  useEffect(() => {
    if (!lzeUlozitKoncept(loadedMonthRef.current, currentMonth)) return;
    try { localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(actualStock)); } catch {}
  }, [actualStock, currentMonth]);

  useEffect(() => {
    if (!lzeUlozitKoncept(loadedMonthRef.current, currentMonth)) return;
    try { localStorage.setItem(`inventory_adjustments_${currentMonth}`, JSON.stringify(dorovnatMap)); } catch {}
  }, [dorovnatMap, currentMonth]);

  useRealtime(['beers', 'packages', 'bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments', 'zavoz_deductions', 'akce', 'akce_items', 'keg_prefuk'], () => loadData(true));



  // Uložení počátečního stavu z rozjetého měsíce do databáze (inventory tabulka)
  async function handleSaveInitialStock() {
    const vratPozici = zapamatujPozici('[data-inv-kotva="pocatecni"]');
    setBusy(true);
    try {
      const entryDate = currentMonth + '-01';
      const snapshotRows = Object.entries(initialStock)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([key, qty]) => {
          const [beer_id, package_id] = key.split('__');
          const beer = beers.find((b) => b.id === beer_id);
          const pkg = packages.find((p) => p.id === package_id);
          return {
            beer_id,
            beer_name: beer?.name ?? null,
            package_id,
            package_label: pkg?.label ?? null,
            quantity: Number(qty),
          };
        });
      const { error } = await supabase.rpc('save_inventory_snapshot', {
        p_entry_date: entryDate,
        p_snapshot_type: 'initial',
        p_rows: snapshotRows,
      });
      if (error) throw new Error(error.message);

      // Uložíme i do localStorage, aby návaznost měsíců fungovala i bez databáze.
      try {
        const lsMap: Record<string, number> = {};
        Object.entries(initialStock).forEach(([key, qty]) => { if (Number(qty) > 0) lsMap[key] = Number(qty); });
        localStorage.setItem(`initial_stock_${currentMonth}`, JSON.stringify(lsMap));
      } catch {}
      uspech('Počáteční stavy skladu byly v pořádku uloženy!');
      forceReloadRef.current = true;
      await loadData(true);
      vratPozici();
    } catch (e) {
      console.error(e);
      chyba('Chyba při ukládání počátečních stavů!');
    }
    setBusy(false);
  }


  // Uložení fyzické inventury do Supabase i localStorage
  /** Byla tahle položka při inventuře skutečně spočítaná? (i „0" je výsledek) */
  /**
   * PRÁZDNÉ POLE JE NULA.
   *
   * Z provozu: „pokud v inventuře není nic, tak je to 0 — vyplňuju jen řádky,
   * kde nějaký počet na skladě je." Dřív se prázdné pole bralo jako „o téhle
   * položce nic nevím": řádek neměl tlačítko na srovnání, jen pokyn „← Zadej
   * inventuru", a při ukládání se vůbec nezapsal.
   *
   * Jenže tak to člověk nepoužívá. Projde chlaďák, vyplní, co našel, a zbytek
   * nechá prázdný právě proto, že tam nic není. Napočítaná nula je
   * plnohodnotný výsledek a pevný základ pro další měsíc — chybějící řádek
   * naopak nechá skladovou knihu sáhnout po starší inventuře a odečítat od ní
   * dál. Schválená inventura za červenec 2026 měla kvůli tomu jen 19 řádků
   * z 56 možných.
   *
   * Zůstává jediné omezení: ukládají se řádky, které dávají smysl — něco
   * na nich leželo, něco se hýbalo, nebo je člověk vyplnil. Kombinace
   * pivo × obal, která nikdy neexistovala, se nezapisuje.
   */
  function maSeUlozit(r: InventoryRow): boolean {
    const vyplneno = String(actualStock[`${r.beer_id}__${r.package_id}`] ?? '').trim() !== '';
    return vyplneno || r.initialQty !== 0 || r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0 || r.expectedQty !== 0;
  }

  /**
   * Řádky k uložení — jen to, co člověk skutečně vyplnil, ALE včetně nul.
   *
   * Dřív se ukládalo `filter(quantity > 0)`, takže napočítaná nula zmizela.
   * „Díval jsem se a není tam nic" se tím změnilo na „o téhle položce nic
   * nevím" — a to jsou dvě úplně jiné věci: uložená nula je pevný základ,
   * od kterého se počítá dál, kdežto chybějící řádek nechá skladovou knihu
   * sáhnout po starší inventuře a odečítat od ní všechny závozy dál.
   * Schválená inventura za červenec 2026 měla proto jen 19 řádků z 56
   * možných a k 26. 8. vycházelo 34 položek do mínusu.
   */
  function spocitaneRadky() {
    return rows
      .filter(maSeUlozit)
      .map((r) => ({
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        quantity: r.actualQty,
      }));
  }

  async function handleSaveActualStock() {
    // Ať po uložení zůstane tabulka přesně tam, kde je — jde se rovnou
    // zkontrolovat, jestli se dorovnání propsalo (viz lib/drzPozici.ts).
    const vratPozici = zapamatujPozici('[data-inv-kotva="bilance"]');
    setBusy(true);
    try {
      const entryDate = currentMonth + '-01';
      const snapshotRows = spocitaneRadky();
      const adjustmentRows = Object.entries(dorovnatMap)
        .map(([key, value]) => {
          const quantity = Number(value);
          if (!value || value === '' || !Number.isFinite(quantity) || quantity === 0) return null;
          const [beer_id, package_id] = key.split('__');
          const beer = beers.find((item) => item.id === beer_id);
          const pkg = packages.find((item) => item.id === package_id);
          return {
            beer_id,
            beer_name: beer?.name ?? null,
            package_id,
            package_label: pkg ? formatPackageLabel(pkg.label) : null,
            quantity,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      const { error } = await supabase.rpc('save_physical_inventory', {
        p_entry_date: entryDate,
        p_rows: snapshotRows,
        p_adjustments: adjustmentRows,
      });
      if (error) throw new Error(error.message);

      // Lokální kopii aktualizujeme až po úspěšném potvrzení celé DB transakce.
      localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(actualStock));
      localStorage.setItem(`inventory_adjustments_${currentMonth}`, JSON.stringify(dorovnatMap));

      uspech('Fyzická inventura i dorovnání byla v pořádku uložena do databáze!');
      forceReloadRef.current = true;
      await loadData(true);
      vratPozici();
    } catch (e) {
      console.error(e);
      chyba('Chyba při ukládání fyzické inventury!');
    }
    setBusy(false);
  }

  // Schválení inventury a převod fyzického stavu jako počáteční stav nového měsíce
  async function handleLockAndTransferNextMonth() {
    if (!(await potvrd(`Chceš schválit inventuru za ${currentMonth} a převést fyzické stavy jako počáteční stav do nového měsíce?`))) return;

    const [y, m] = currentMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextMonthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    const nextEntryDate = nextMonthKey + '-01';
    const curEntryDate = currentMonth + '-01';

    setBusy(true);
    try {
      // Do dalšího měsíce se převádí PŘESNĚ to, co se napočítalo — včetně nul.
      // Dřív se nuly zahodily a další měsíc pak u těch položek počítal od
      // starší inventury (nebo od ničeho) a odečítal od ní dál všechny závozy;
      // odtud pramenil deficit u 34 z 56 položek.
      const currentSnapshotRows = spocitaneRadky();
      const nextSnapshotRows = currentSnapshotRows;

      const { error } = await supabase.rpc('close_inventory_month', {
        p_current_date: curEntryDate,
        p_next_date: nextEntryDate,
        p_current_rows: currentSnapshotRows,
        p_next_rows: nextSnapshotRows,
      });
      if (error) throw new Error(error.message);

      // Uložíme do localStorage pro aktuální měsíc i pro následující měsíc
      try {
        const actualLs: Record<string, string> = {};
        const nextInitialLs: Record<string, number> = {};
        rows.forEach((r) => {
          const k = `${r.beer_id}__${r.package_id}`;
          const q = Number(r.actualQty) > 0 ? Number(r.actualQty) : 0;
          actualLs[k] = String(q);
          if (q > 0) nextInitialLs[k] = q;
        });
        localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(actualLs));
        localStorage.setItem(`initial_stock_${nextMonthKey}`, JSON.stringify(nextInitialLs));
      } catch {}

      oznam(`Inventura za ${currentMonth} byla schválena a stavy byly převedeny jako počáteční stav (Poč.) do měsíce ${nextMonthKey}.`);
      
      // Nastavíme příznaky pro vynucené načtení nových stavů z DB
      forceReloadRef.current = true;
      setCurrentMonth(nextMonthKey);
    } catch (e) {
      console.error(e);
      chyba('Chyba při převodu inventury do nového měsíce!');
    }
    setBusy(false);
  }


  // Výpočet tabulky inventury
  const rows: InventoryRow[] = useMemo(() => {
    const list: InventoryRow[] = [];

    beers.forEach((b) => {
      packages.forEach((p) => {
        const k = `${b.id}__${p.id}`;

        // 📒 Očekávaný stav ze skladové knihy (lib/stockLedger.ts) — stejné
        // číslo jako Sklad i „co stočit". Dřív si ho Inventura počítala sama
        // z vlastních map a rozcházela se: mimo jiné jí chyběl přefuk a každý
        // jednotlivý pohyb se ořezával na nulu, takže schodek zmizel a manko
        // vyšlo menší, než ve skutečnosti bylo.
        //
        // expectedForMonth záměrně NEZAPOČÍTÁVÁ inventury zapsané uvnitř
        // počítaného měsíce — ty jsou právě to, s čím se očekávaný stav
        // porovnává. Jinak by po uložení fyzické inventury vyšel rozdíl vždy
        // nula a manko by nešlo zjistit.
        const line = expectedLedger.get(k);
        const kinds = line?.byKind ?? {};
        const initialQty = line?.baselineQty ?? Number(initialStock[k] || 0);
        const stacenoQty = (kinds.kegovani ?? 0) + (kinds.staceni ?? 0) + (kinds.prefuk_do ?? 0);
        const odpisQty = -(kinds.odpis ?? 0);
        const vydejQty =
          -((kinds.fasovani ?? 0) + (kinds.prodejna ?? 0) + (kinds.zavoz ?? 0) +
            (kinds.akce ?? 0) + (kinds.sud_na_lahve ?? 0) + (kinds.prefuk_z ?? 0));

        // Může být ZÁPORNÝ — pak evidence nesedí a inventura je právě ta
        // příležitost to srovnat.
        const expectedQty = line?.qty ?? (initialQty + stacenoQty - odpisQty - vydejQty);

        // Pokud je zadaný fyzický stav v políčku, použijeme ho, jinak dědí hodnotu z počáteční zásoby
        const actualInputStr = actualStock[k];
        const actualQty = actualInputStr !== undefined && actualInputStr !== '' ? Number(actualInputStr) : 0;

        const priceCzk = p.volume_l > 20 ? 1500 : p.volume_l > 0.6 ? 250 : 45; // Orientační hodnota

        // Dorovnání (±) — přičte/odečte k očekávanému stavu, aby seděl s fyzickou realitou (manko).
        // Ukládá se BOKEM a NEpočítá se do stáčení ani odpočtů.
        const dorovnatQty = Number(dorovnatMap[k] || 0);
        const { diffQty, reconciledQty, diffAfterQty } = computeInventoryReconciliation(expectedQty, actualQty, dorovnatQty);
        const diffCzk = diffQty * priceCzk;
        const diffAfterCzk = diffAfterQty * priceCzk;

        // Zobrazit všechny aktivní položky (piva a obaly) v bilanční tabulce
        list.push({
          beer_id: b.id,
          beer_name: b.name,
          package_id: p.id,
          package_label: p.label,
          package_kind: p.kind,
          package_volume: p.volume_l,
          price_czk: priceCzk,
          initialQty,
          stacenoQty,
          odpisQty,
          vydejQty,
          expectedQty,
          actualQty,
          diffQty,
          diffCzk,
          dorovnatQty,
          reconciledQty,
          diffAfterQty,
          diffAfterCzk,
        });
      });
    });

    return list;
  }, [beers, packages, initialStock, actualStock, dorovnatMap, stacenoMap, odpisyMap, vydejMap, expectedLedger]);

  // Totals
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.initial += r.initialQty;
        acc.staceno += r.stacenoQty;
        acc.odpis += r.odpisQty;
        acc.vydej += r.vydejQty;
        acc.expected += r.expectedQty;
        acc.actual += r.actualQty;
        acc.diffQty += r.diffQty;
        acc.diffCzk += r.diffCzk;
        acc.dorovnat += r.dorovnatQty;
        acc.diffAfterQty += r.diffAfterQty;
        acc.diffAfterCzk += r.diffAfterCzk;
        acc.vyrovnano += vyrovnaniMap.get(`${r.beer_id}__${r.package_id}`) ?? 0;
        return acc;
      },
      { initial: 0, staceno: 0, odpis: 0, vydej: 0, expected: 0, actual: 0, diffQty: 0, diffCzk: 0, dorovnat: 0, diffAfterQty: 0, diffAfterCzk: 0, vyrovnano: 0 }
    );
  }, [rows, vyrovnaniMap]);

  // Kolik položek už je spočítaných — ukazatel postupu při inventuře.
  const postup = useMemo(() => {
    const relevantni = rows.filter((r) =>
      r.initialQty !== 0 || r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0
    );
    return {
      hotovo: relevantni.filter((r) => String(actualStock[`${r.beer_id}__${r.package_id}`] ?? '').trim() !== '').length,
      celkem: relevantni.length,
    };
  }, [rows, actualStock]);

  // Seznam podle zvoleného filtru. Platí pro mobilní karty i tabulku,
  // aby se obojí chovalo stejně.
  const zobrazeneRadky = useMemo(() => {
    let vybrane = rows;
    if (pocitaniFiltr === 'nespocitane') {
      vybrane = rows.filter((r) =>
        String(actualStock[`${r.beer_id}__${r.package_id}`] ?? '').trim() === '' &&
        (r.initialQty !== 0 || r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0)
      );
    } else if (pocitaniFiltr === 'pohyb') {
      vybrane = rows.filter((r) => r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0);
    } else if (pocitaniFiltr === 'nesedi') {
      vybrane = rows.filter((r) => r.expectedQty < 0);
    }
    if (druhFiltr === 'vse') return vybrane;
    const chceSudy = druhFiltr === 'sudy';
    return vybrane.filter((r) => jeSud(r.package_kind, r.package_label) === chceSudy);
  }, [rows, pocitaniFiltr, druhFiltr, actualStock]);

  /** Položky, které se letos hýbaly, ale při inventuře se nespočítaly. */
  // Počítání po kusech: „+" a „−" u inventurního pole. Při ručním počítání
  // v chlaďáku se klepe jednou za kus, přepisovat číslo na klávesnici by bylo
  // pomalejší a snadněji se u toho ztratí počet. Prázdné pole = nula, takže
  // první „+" zapíše 1. Pod nulu to nejde, kusy záporné nejsou.
  function posunInventuru(klic: string, o: number) {
    setActualStock((prev) => {
      const soucasne = Number(String(prev[klic] ?? '').replace(',', '.') || 0);
      const nova = Math.max(0, Math.round(soucasne + o));
      return { ...prev, [klic]: String(nova) };
    });
    zavibruj('odskrtnuto');
  }

  // 🧺 Dávkové srovnání lahví — sběrná tabulka na vlastní záložce.
  // Bere jen řádky, kde je napočítaný stav vyplněný: bez něj není rozdíl
  // rozdílem, jen nevyplněnou položkou.
  const davky = useMemo(
    () => davkySrovnani(rows),
    [rows, actualStock],
  );
  /** Zadané počty sudů, klíč `beerId__smer__kegPkgId`. */
  const [davkaSudy, setDavkaSudy] = useState<Record<string, string>>({});
  /** Co se sudy — přičíst do skladu, nebo odečíst. Klíč `beerId__smer`. */
  const [davkaSmerSudu, setDavkaSmerSudu] = useState<Record<string, SmerSudu>>({});
  const sudoveObaly = useMemo(
    () => packages
      .filter((p) => jeSud(p.kind, p.label))
      .sort((a, z) => Number(z.volume_l) - Number(a.volume_l)),
    [packages],
  );

  /**
   * Panel „lahve → sudy" pod posledním řádkem daného piva.
   *
   * Patří sem, a ne na vlastní stránku: člověk projde pivo, vidí rovnou pod
   * ním, kolik lahví a litrů z toho je, potvrdí sudy a hned vidí, jak se to
   * v inventuře propsalo. Ukáže se jen když je z čeho — u piva bez lahvového
   * přebytku by to jen zabíralo místo.
   */
  function panelDavky(beerId: string) {
    const proPivo = davky.filter((x) => x.beer_id === beerId);
    if (proPivo.length === 0) return null;
    // Volá se jako obyčejná funkce, NE jako <PanelVyrovnani/>. Komponenta
    // deklarovaná uvnitř obrazovky má při každém překreslení novou identitu,
    // takže ji React zahodí a postaví znovu — a políčko na počet sudů přitom
    // ztratí kurzor po každé napsané číslici. Vypadalo to, že panel nereaguje.
    return <>{proPivo.map((d) => vykresliVyrovnani(d))}</>;
  }

  /**
   * Panel „Vyrovnat" pod pivem — jeden na každý směr.
   *
   * Nahradil vyskakovací okno u každého řádku. Sudy se načínají pro celé
   * stáčení, ne pro jednu velikost lahve, takže se zadávají jednou pro celé
   * pivo — a člověk u toho rovnou vidí, kolik litrů to dělá.
   *
   * Směr sudů je VLASTNÍ přepínač, ne odvozenina ze směru lahví: u přebytku
   * se sudy obvykle odečtou (stočilo se z nich), u manka vrátí (nenačaly se),
   * ale výjimky existují a rozhodnout to může jen člověk.
   */
  function vykresliVyrovnani(d: DavkaPiva) {
    const manko = d.smer === 'manko';
    const klic = `${d.beer_id}__${d.smer}`;
    // Výchozí volba: u přebytku lahví se sudy nejčastěji teprve nastáčely
    // (proto ta lahvová výroba v knize chybí), u manka se naopak nenačaly.
    const smerSudu: SmerSudu = davkaSmerSudu[klic] ?? (manko ? 'vratit' : 'nastocit');
    const zadano = sudoveObaly
      .map((p) => ({
        kegPkgId: p.id,
        kegQty: Math.max(0, Math.floor(Number(davkaSudy[`${klic}__${p.id}`]) || 0)),
        kegVolumeL: Number(p.volume_l ?? 0),
      }))
      .filter((z) => z.kegQty > 0 && z.kegVolumeL > 0);
    const zadanoL = zadano.reduce((s, z) => s + z.kegQty * z.kegVolumeL, 0);
    const suduCelkem = zadano.reduce((s, z) => s + z.kegQty, 0);
    const kusuCelkem = d.lahve.reduce((s, l) => s + l.kusy, 0);
    const barva = manko
      ? { ram: 'border-rose-300 bg-rose-50/70', nadpis: 'text-rose-900', text: 'text-rose-900', tlacitko: 'bg-rose-600 hover:bg-rose-700', pole: 'border-rose-400 focus:border-rose-600' }
      : { ram: 'border-emerald-300 bg-emerald-50/70', nadpis: 'text-emerald-900', text: 'text-emerald-900', tlacitko: 'bg-emerald-600 hover:bg-emerald-700', pole: 'border-emerald-400 focus:border-emerald-600' };

    return (
      <div key={klic} className={`rounded border-2 p-3 space-y-2.5 ${barva.ram}`}>
        <div className={`text-[11px] font-black uppercase tracking-wider ${barva.nadpis}`}>
          {d.beer_name} — vyrovnat {manko ? 'MANKO (odečíst lahve)' : 'PŘEBYTEK (zapsat lahve)'}
        </div>

        <div className="text-xs font-bold text-neutral-800 space-y-0.5">
          {d.lahve.map((l) => (
            <div key={l.package_id} className="flex justify-between gap-2">
              <span>{formatPackageLabel(l.package_label)} × {manko ? '−' : '+'}{l.kusy} ks</span>
              <span className="font-mono tabular-nums">{l.litry.toLocaleString('cs-CZ')} l</span>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-t border-neutral-300 pt-1 font-black">
            <span>Celkem</span>
            <span className="font-mono tabular-nums">{d.litryCelkem.toLocaleString('cs-CZ')} l</span>
          </div>
        </div>

        <p className={`text-[11px] font-bold ${barva.text}`}>
          Orientačně + 10 % ztráta ≈ <strong>{d.orientacneSudu}×50 l</strong>. Kolik sudů se toho
          doopravdy týká víš jenom ty — zadej níž, nebo nech prázdné.
          <br />
          <span className="text-neutral-600">Volby nic nezapisují — zápis udělá až tlačítko úplně dole.</span>
        </p>

        {/* Směr sudů zvlášť — bez toho nešlo vrátit sudy u manka ani odečíst
            u výjimečného přebytku. Schválně jako PŘEPÍNAČ s kolečky, ne jako
            tlačítka: vypadala jako akce a čekalo se, že samy něco zapíšou.
            Zapisuje až velké tlačítko dole. */}
        <div className="rounded bg-white/70 border border-neutral-300 p-2">
          <div className="text-[11px] font-black uppercase text-neutral-600 mb-1">Co se sudy</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {([
              ['nastocit', 'Nastáčely se kvůli těmhle lahvím — zapiš je do Stáčení KEG a hned spotřebuj'],
              ['odecist', 'Byly nastáčené už dřív — jen je odečti ze skladu'],
              ['vratit', 'Nenačaly se — vrať je do skladu'],
            ] as [SmerSudu, string][]).map(([hodnota, popis]) => (
              <label key={hodnota} className="flex items-start gap-1.5 text-[11px] font-bold text-neutral-800 cursor-pointer w-full">
                <input
                  type="radio"
                  name={`smer-sudu-${klic}`}
                  checked={smerSudu === hodnota}
                  onChange={() => setDavkaSmerSudu((v) => ({ ...v, [klic]: hodnota }))}
                  className="w-4 h-4 accent-neutral-900 mt-0.5 shrink-0"
                />
                <span>{popis}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {sudoveObaly.map((p) => (
            <div key={p.id} className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={davkaSudy[`${klic}__${p.id}`] ?? ''}
                onChange={(e) => setDavkaSudy((v) => ({ ...v, [`${klic}__${p.id}`]: normalizujCislo(e.target.value, false) }))}
                className={`w-16 px-2 py-2 rounded border-2 bg-white text-center font-black text-base text-neutral-900 focus:outline-hidden ${barva.pole}`}
                aria-label={`${d.beer_name} — počet sudů ${p.volume_l} l`}
              />
              <span className={`font-black text-xs ${barva.text}`}>× {p.volume_l} l</span>
            </div>
          ))}
        </div>

        <div className={`text-[11px] font-black ${barva.text}`}>
          {zadanoL > 0
            ? (smerSudu === 'nastocit'
                ? `Zapíše se ${zadano.map((z) => `${z.kegQty}×${z.kegVolumeL}`).join(' + ')} = ${zadanoL.toLocaleString('cs-CZ')} l do Stáčení KEG a hned se spotřebuje — stav skladu sudů zůstane stejný`
                : `${smerSudu === 'vratit' ? 'Vrátí' : 'Odečte'} se ${zadano.map((z) => `${z.kegQty}×${z.kegVolumeL}`).join(' + ')} = ${zadanoL.toLocaleString('cs-CZ')} l`)
            : 'Prázdné = sudy se nehnou.'}
        </div>

        <button
          type="button"
          onClick={() => zapsatDavku(d, zadano, smerSudu)}
          disabled={doplnujeSe !== null}
          className={`w-full min-h-[44px] rounded text-white font-black text-xs transition disabled:opacity-50 ${barva.tlacitko}`}
        >
          {doplnujeSe === `davka__${klic}`
            ? 'Zapisuji…'
            : `${manko ? 'Odečíst' : 'Zapsat'} ${kusuCelkem} ks lahví`
              + (suduCelkem > 0
                ? ` a ${smerSudu === 'vratit' ? 'vrátit' : smerSudu === 'nastocit' ? 'nastáčet' : 'odečíst'} ${suduCelkem} sudů`
                : ' (sudy se nehnou)')}
        </button>
      </div>
    );
  }

  /**
   * Nepustí zápis výroby do budoucnosti.
   *
   * Doplněk se datuje na poslední den inventovaného měsíce. Když je obrazovka
   * omylem na běžícím měsíci, spadne zápis o týdny dopředu — v uzavíraném
   * měsíci pak není vidět a ve statistice se objeví výroba, která se ještě
   * nestala. Takhle zmizelo 17 sudů Summer Ale na 30. 9. 2026.
   */
  function odmitniBudoucnost(): boolean {
    if (!doplnekVBudoucnu(currentMonth, businessDateISO())) return false;
    chyba(
      `Počítáš inventuru za ${nazevMesice(currentMonth)}, který ještě neskončil. `
      + `Zápis by dostal datum ${datumDoplnku(currentMonth)} — to je v budoucnosti a `
      + 'v uzavíraném měsíci by ho nikdo neviděl. Přepni nahoře měsíc na ten, který uzavíráš.',
    );
    return true;
  }

  /** Zapíše celou dávku jednoho piva: lahve do stáčení, sudy dolů ze skladu. */
  /** Zapíše celé vyrovnání jednoho piva: lahve se znaménkem, sudy podle zvoleného směru. */
  async function zapsatDavku(d: DavkaPiva, zadano: ZdrojovaSkupina[], smerSudu: SmerSudu) {
    if (doplnujeSe) return;
    if (odmitniBudoucnost()) return;
    const manko = d.smer === 'manko';
    const klic = `${d.beer_id}__${d.smer}`;
    const suduCelkem = zadano.reduce((s, z) => s + z.kegQty, 0);
    const kusuCelkem = d.lahve.reduce((s, l) => s + l.kusy, 0);

    const rady = zapisyDavky(d, datumDoplnku(currentMonth), currentMonth, zadano, smerSudu);
    if (rady.length === 0) return;

    // Panel pod pivem po zápisu zmizí (už není co vyrovnávat) a všechno pod
    // ním vyskočí nahoru. Kotvou je první řádek toho piva — ten zůstává.
    const vratPozici = zapamatujPozici(`[data-inv-radek^="${d.beer_id}__"]`);

    let vlozene: { id: string }[] | null = null;
    let vlozeneKegy: { id: string }[] | null = null;
    let selhalo = false;
    await sZamkem(`davka__${klic}`, async () => {
      const { data, error } = await supabase.from('bottling').insert(rady).select('id');
      if (error) { selhalo = true; chyba(`Nepodařilo se ${manko ? 'odečíst' : 'zapsat'} stočení: ` + error.message); return; }
      vlozene = data;

      // „Nastáčet a hned spotřebovat": sudy se kvůli těm lahvím teprve
      // nastáčely, takže patří i do VÝROBY — jinak kniha tvrdí, že se
      // spotřebovalo víc sudů, než se kdy nastáčelo (Summer Ale 50 l: 15
      // nastáčených proti 19 spotřebovaným = −6). Objem jde z tanků stejně
      // jako u běžného kegování, ať sklep nezůstane nafouklý.
      if (smerSudu !== 'nastocit') return;
      const kegRady: Record<string, unknown>[] = [];
      const rozdeleniCelkem: RozdeleniSudu = { dily: [], nepokrytoSudu: 0 };
      for (const z of zadano) {
        const pkg = packages.find((x) => x.id === z.kegPkgId);
        if (!pkg) continue;
        const rozdeleni = rozdelSudyDoTanku(tanky, d.beer_id, z.kegQty, z.kegVolumeL);
        kegRady.push(...kegovaniZapisy(
          { beer_id: d.beer_id, beer_name: d.beer_name, package_id: pkg.id, package_label: pkg.label, package_kind: pkg.kind, diffQty: z.kegQty },
          datumDoplnku(currentMonth), currentMonth, rozdeleni,
        ));
        rozdeleniCelkem.dily.push(...rozdeleni.dily);
        rozdeleniCelkem.nepokrytoSudu += rozdeleni.nepokrytoSudu;
      }
      if (kegRady.length === 0) return;
      const { data: kegData, error: kegChyba } = await supabase.from('kegging').insert(kegRady).select('id');
      if (kegChyba) { chyba('Lahve se zapsaly, ale stáčení sudů ne: ' + kegChyba.message); return; }
      vlozeneKegy = kegData;
      const tankChyba = await odectiZTanku(rozdeleniCelkem, d.beer_id);
      if (tankChyba) chyba(tankChyba);
    });
    if (selhalo) return;

    // Zadané počty pro tenhle směr uklidit, ať se po znovunačtení nenabízí
    // znovu něco, co je už zapsané.
    setDavkaSudy((v) => {
      const dal = { ...v };
      for (const kk of Object.keys(dal)) if (kk.startsWith(`${klic}__`)) delete dal[kk];
      return dal;
    });
    const coSeSudy = smerSudu === 'vratit' ? 'vráceno' : smerSudu === 'nastocit' ? 'nastáčeno a spotřebováno' : 'odečteno';
    toastZpet(
      `${d.beer_name}: ${manko ? 'odečteno' : 'zapsáno'} ${kusuCelkem} ks lahví`
        + (suduCelkem > 0 ? ` a ${coSeSudy} ${suduCelkem} sudů.` : '.'),
      () => vratZpetDavku(vlozene, vlozeneKegy),
    );
    forceReloadRef.current = true;
    await loadData(true);
    vratPozici();
  }

  /**
   * Vezme zpátky doplněné kegování — smaže zapsané řádky a vrátí objem do
   * tanků, ze kterých se odečetl.
   *
   * Tohle je protějšek k tomu, že se před zápisem už neptáme. Vzorec je
   * z lib/toast.ts: udělat to hned a pár vteřin nechat vzít zpět je pro
   * stovku řádků inventury o dost méně klikání než dialog u každého —
   * a chybu to opraví stejně spolehlivě.
   */
  /**
   * Spustí zápis a VŽDY uvolní zámek tlačítek.
   *
   * doplnujeSe zakazuje všechna tlačítka na obrazovce. Kdyby mezi jeho
   * nastavením a uvolněním něco spadlo — výpadek sítě, chyba RPC na tanku —,
   * zůstal by viset a od té chvíle by „se nic nestalo" úplně všude, dokud by
   * člověk appku nezavřel. finally to vyloučí.
   */
  async function sZamkem(klic: string, prace: () => Promise<void>) {
    setDoplnujeSe(klic);
    try {
      await prace();
    } catch (e) {
      console.error(e);
      chyba('Zápis se nepovedl: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setDoplnujeSe(null);
    }
  }

  async function vratZpetKegovani(vlozene: { id: string }[] | null, rozdeleni: RozdeleniSudu | null) {
    const ids = (vlozene ?? []).map((x) => x.id);
    if (ids.length > 0) {
      const { error } = await supabase.from('kegging').delete().in('id', ids);
      if (error) { chyba('Nepodařilo se vzít zpět: ' + error.message); return; }
    }
    // Objem zpátky do tanků. Kladné delta = přidat, tedy opak odečtu.
    for (const d of rozdeleni?.dily ?? []) {
      await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: d.litry });
    }
    forceReloadRef.current = true;
    await loadData(true);
  }

  /**
   * Vezme zpátky doplněné stáčení lahví — smaže zapsané řádky. Sudy se
   * vracet nemusí: stáčení je nese jako kegs_used na svých řádcích, takže
   * se smazáním vrátí do skladu samy (viz stockLedger.resolveKegsUsed).
   */
  /**
   * Vezme zpátky celé vyrovnání dávky — lahve i případně zapsané stáčení
   * sudů. Objem do tanků se nevrací: u „nastáčet a hned spotřebovat" se
   * nedá poznat, ze kterého tanku se to vzalo zpětně, a vracet ho naslepo
   * by lhalo dvakrát.
   */
  async function vratZpetDavku(lahve: { id: string }[] | null, kegy: { id: string }[] | null) {
    const kegIds = (kegy ?? []).map((x) => x.id);
    if (kegIds.length > 0) {
      const { error } = await supabase.from('kegging').delete().in('id', kegIds);
      if (error) { chyba('Nepodařilo se vzít zpět stáčení sudů: ' + error.message); return; }
    }
    await vratZpetStaceni(lahve);
  }

  async function vratZpetStaceni(vlozene: { id: string }[] | null) {
    const ids = (vlozene ?? []).map((x) => x.id);
    if (ids.length > 0) {
      const { error } = await supabase.from('bottling').delete().in('id', ids);
      if (error) { chyba('Nepodařilo se vzít zpět: ' + error.message); return; }
    }
    forceReloadRef.current = true;
    await loadData(true);
  }

  /**
   * Odečte objem z tanků. Relativní RPC (stejná jako v Kegging.tsx), ne
   * absolutní hodnota — jinak by se dva odečty ve stejnou chvíli přepsaly.
   * Vrací text chyby, když se některý tank nepovedlo upravit.
   */
  async function odectiZTanku(rozdeleni: RozdeleniSudu, beerId: string): Promise<string | null> {
    const nepovedlo: string[] = [];
    for (const d of rozdeleni.dily) {
      const { error } = await supabase.rpc('adjust_tank_volume', { p_tank_id: d.tankId, p_delta_l: -d.litry });
      if (error) nepovedlo.push(`${d.label} (${error.message})`);
    }

    // 🛢️ Když tank odečtem došel, ukonči na něm stáčení a otevři další se
    // stejným pivem — jinak by zůstal otevřený prázdný tank a stáčeč by musel
    // ručně hledat, ze kterého pokračovat.
    const zmena = zmenaOtevreni(tanky, beerId, rozdeleni);
    const ted = new Date().toISOString();
    if (zmena.dojely.length > 0) {
      await supabase.from('cellar_tanks')
        .update({ kegging_active: false, kegging_ended_at: ted, updated_at: ted })
        .in('id', zmena.dojely.map((d) => d.tankId));
    }
    if (zmena.otevrit) {
      // Stáčecí zdroj smí být na jedno pivo jen jeden (viz startKegging v
      // Cellar.tsx), takže ostatní se stejným pivem se nejdřív zavřou.
      const ostatni = tanky
        .filter((t) => t.current_beer_id === beerId && t.id !== zmena.otevrit!.tankId)
        .map((t) => t.id);
      if (ostatni.length > 0) {
        await supabase.from('cellar_tanks')
          .update({ kegging_active: false, kegging_ended_at: ted, updated_at: ted })
          .in('id', ostatni);
      }
      await supabase.from('cellar_tanks')
        .update({ kegging_active: true, kegging_started_at: ted, kegging_ended_at: null, updated_at: ted })
        .eq('id', zmena.otevrit.tankId);
    }

    return nepovedlo.length > 0
      ? `Stáčení je zapsané, ale objem se nepodařilo odečíst z: ${nepovedlo.join(', ')}. Oprav objem ve Sklepě ručně.`
      : null;
  }

  /**
   * Srovná rozdíl tam, kam patří — místo dorovnání, které ho jen schová:
   *  • PŘEBYTEK → doplní chybějící zápis stočení (`bottling`/`kegging`).
   *    Rozdíl se pak srovná sám, protože očekávaný stav ho začne počítat.
   *  • MANKO → odečte rozdíl ze zápisu výroby (záporný řádek). Vyrobilo se
   *    míň, než se zapsalo, takže do evidence výroby nesmí přibýt ani kus.
   */
  async function srovnatRozdil(r: InventoryRow) {
    const k = `${r.beer_id}__${r.package_id}`;
    if (doplnujeSe) return;
    const akce = akceProRozdil(r.diffQty);
    if (akce === 'zadna') return;
    if (akce === 'zapsat_staceni' && odmitniBudoucnost()) return;

    const polozka = {
      beer_id: r.beer_id,
      beer_name: r.beer_name,
      package_id: r.package_id,
      package_label: r.package_label,
      package_kind: r.package_kind,
      diffQty: r.diffQty,
    };
    const popis = `${r.beer_name} · ${formatPackageLabel(r.package_label)}`;
    const dnes = businessDateISO();

    if (akce === 'zapsat_staceni') {
      // LAHVE: zapíšou se rovnou, bez ptaní a BEZ sudů. Kolik sudů se
      // načalo, se zadává v panelu pod pivem — tam je na to místo pro
      // všechny velikosti a dělá se to pro celé pivo najednou, ne řádek po
      // řádku. Dřív se tu otevíralo okno u každého řádku zvlášť.
      if (!jeSud(r.package_kind, r.package_label)) {
        const radyLahvi = lahvoveZapisy(polozka, datumDoplnku(currentMonth), currentMonth, []);
        if (radyLahvi.length === 0) return;
        const vratPoziciL = zapamatujPozici(`[data-inv-radek="${k}"]`);
        setDoplnujeSe(k);
        const { data: vlozeneL, error: chybaL } = await supabase.from('bottling').insert(radyLahvi).select('id');
        setDoplnujeSe(null);
        if (chybaL) { chyba('Nepodařilo se zapsat stočení: ' + chybaL.message); return; }
        toastZpet(
          `Zapsáno ${r.diffQty} ks do „Stáčení lahví" (sudy se neodečetly — zadej je v panelu pod pivem).`,
          () => vratZpetStaceni(vlozeneL),
        );
        forceReloadRef.current = true;
        await loadData(true);
        vratPoziciL();
        return;
      }
      // 🛢️ Sudy se berou z tanků se stejným pivem; když jeden dojde,
      // pokračuje se dalším. Bez toho zůstal sklep nafouklý o pivo, které
      // dávno odteklo — z toho jsou ty velké rozdíly na tancích.
      const objemSuduL = Number(packages.find((p) => p.id === r.package_id)?.volume_l ?? 0);
      const rozdeleni = rozdelSudyDoTanku(tanky, r.beer_id, r.diffQty, objemSuduL);
      const rady = kegovaniZapisy(polozka, datumDoplnku(currentMonth), currentMonth, rozdeleni);
      if (rady.length === 0) return;
      // Ať obrazovka po zápisu zůstane u toho řádku, u kterého se klikalo.
      const vratPozici = zapamatujPozici(`[data-inv-radek="${k}"]`);
      // Bez ptaní předem — inventura je stovka řádků a dvojklik u každého
      // zdržuje. Zápis jde rovnou a pár vteřin se dá vzít zpět. Datum do
      // budoucna hlídá odmitniBudoucnost() výš; to je tvrdý zákaz, ne otázka.
      let vlozene: { id: string }[] | null = null;
      let tankChyby: string | null = null;
      let selhalo = false;
      await sZamkem(k, async () => {
        const { data, error } = await supabase.from('kegging').insert(rady).select('id');
        if (error) { selhalo = true; chyba('Nepodařilo se zapsat stočení: ' + error.message); return; }
        vlozene = data;
        // Objem tanků až PO úspěšném zápisu — kdyby se zápis nepovedl, sklep
        // by jinak zůstal odečtený o pivo, které se nikam nezapsalo.
        tankChyby = await odectiZTanku(rozdeleni, r.beer_id);
      });
      if (selhalo) return;
      const otevreny = zmenaOtevreni(tanky, r.beer_id, rozdeleni).otevrit;
      toastZpet(
        rozdeleni.dily.length === 0
          ? `Zapsáno ${r.diffQty} ks do „Stáčení KEG" (bez tanku — ve sklepě není z čeho).`
          : `Zapsáno ${r.diffQty} ks do „Stáčení KEG", odečteno z ${rozdeleni.dily.map((d) => d.label).join(' + ')}`
            + (otevreny ? `. Stáčí se dál z ${otevreny.label}.` : '.'),
        () => vratZpetKegovani(vlozene, rozdeleni),
      );
      if (tankChyby) chyba(tankChyby);
      forceReloadRef.current = true;
      await loadData(true);
      vratPozici();
      return;
    }

    // MANKO — vyrobilo se o tolik MÍŇ, než se zapsalo. Oprava jde do zápisu
    // výroby (záporný řádek), ne do plánu na příště: plán by nechal sklad
    // nafouklý a rozdíl by se táhl do dalšího měsíce. Datum je datum
    // INVENTURY, ne dnešek — po opravě má sedět stav ke dni inventury a ten
    // se přenáší jako počáteční stav do dalšího měsíce.
    if (odmitniBudoucnost()) return;

    // LAHVE: odečtou se rovnou, bez ptaní a BEZ vracení sudů. Kolik sudů se
    // nenačalo, se zadává v panelu pod pivem.
    if (!jeSud(r.package_kind, r.package_label)) {
      const radyLahvi = odectiZeStoceni(polozka, datumDoplnku(currentMonth), currentMonth).map((x) => x.row);
      if (radyLahvi.length === 0) return;
      const vratPoziciL = zapamatujPozici(`[data-inv-radek="${k}"]`);
      setDoplnujeSe(k);
      const { data: vlozeneL, error: chybaL } = await supabase.from('bottling').insert(radyLahvi).select('id');
      setDoplnujeSe(null);
      if (chybaL) { chyba('Nepodařilo se odečíst ze stáčení: ' + chybaL.message); return; }
      toastZpet(
        `Odečteno ${Math.abs(r.diffQty)} ks ze „Stáčení lahví" (sudy se nevrátily — zadej je v panelu pod pivem).`,
        () => vratZpetStaceni(vlozeneL),
      );
      forceReloadRef.current = true;
      await loadData(true);
      vratPoziciL();
      return;
    }

    const rady = odectiZeStoceni(polozka, datumDoplnku(currentMonth), currentMonth);
    if (rady.length === 0) return;
    const chybi = Math.abs(r.diffQty);
    const vratPozici = zapamatujPozici(`[data-inv-radek="${k}"]`);
    let vlozene: { id: string }[] | null = null;
    let selhalo = false;
    await sZamkem(k, async () => {
      const { data, error } = await supabase.from('kegging').insert(rady.map((x) => x.row)).select('id');
      if (error) { selhalo = true; chyba('Nepodařilo se odečíst ze stáčení: ' + error.message); return; }
      vlozene = data;
    });
    if (selhalo) return;
    // Tank se nedotkne — u dodatečné opravy se neví, ze kterého se stáčelo.
    toastZpet(`Odečteno ${chybi} ks ze „Stáčení KEG".`, () => vratZpetKegovani(vlozene, null));
    forceReloadRef.current = true;
    await loadData(true);
    vratPozici();
  }


  /**
   * 🔍 Podklad karty Audit: pro každé pivo × obal dvojice řádků
   * (Inventura / Sklad) rozložená na sloupce.
   *
   * Položky, kde jsou obě strany na nule, se vyhazují — prázdné řádky by
   * kartu natáhly na stovky řádků a rozdíl by se v nich ztratil.
   */
  const auditPolozky = useMemo(() => {
    const out: { beer_id: string; beer_name: string; package_id: string; package_label: string;
                 porovnani: ReturnType<typeof porovnejPolozku> }[] = [];
    beers.forEach((b) => {
      packages.forEach((pkg) => {
        const k = `${b.id}__${pkg.id}`;
        const porovnani = porovnejPolozku(auditInventura.get(k), skladLedger.get(k));
        if (!maCoUkazat(porovnani)) return;
        out.push({ beer_id: b.id, beer_name: b.name, package_id: pkg.id, package_label: pkg.label, porovnani });
      });
    });
    return out;
  }, [beers, packages, auditInventura, skladLedger]);

  const auditChybiZaklad = useMemo(
    () => auditPolozky.filter((p) => p.porovnani.chybiZaklad),
    [auditPolozky],
  );
  const auditNesedi = useMemo(
    () => auditPolozky.filter((p) => p.porovnani.rozdilne.length > 0 || p.porovnani.soucetNesedi),
    [auditPolozky],
  );
  const [auditJenRozdily, setAuditJenRozdily] = useState(false);

  /**
   * Smaže VŠECHNA srovnání zapsaná z inventury tohoto měsíce.
   *
   * Srovnání je jednosměrná past: jakmile se zapíše, rozdíl spadne na nulu a
   * není co znovu vyrovnávat — takže špatně zadané srovnání nešlo opravit
   * jinak než zásahem do databáze. Poznávají se podle podpisu v poznámce
   * („Doplněno/Odečteno z inventury {měsíc}"), který nic jiného nemá, takže
   * se nesmaže nic z běžné výroby.
   *
   * Objem se do tanků nevrací: u dodatečné opravy se nedá poznat, ze kterého
   * se bralo, a vracet naslepo by lhalo podruhé.
   */
  async function smazatSrovnaniMesice() {
    const popis = `Smazat všechna srovnání zapsaná z inventury za ${nazevMesice(currentMonth)}?

`
      + 'Zůstane běžné stáčení, objednávky, fasování i počáteční stavy — smaže se jen to, '
      + 'co vzniklo tlačítky Vyrovnat. Tabulka se tím vrátí do stavu před srovnáváním '
      + 'a jde ho udělat znovu a správně.';
    if (!(await potvrd(popis, { titulek: 'Vrátit srovnání za měsíc', potvrdit: 'Ano, smazat' }))) return;

    // Jeden vzor místo dvou přes .or(): „Doplněno z inventury 2026-08 — …"
    // i „Odečteno z inventury 2026-08 — …" obsahují tentýž kus textu a nic
    // jiného v tabulkách ho nemá. Skládat .or() s mezerami v hodnotě je
    // zbytečně křehké.
    const podpis = `%z inventury ${currentMonth}%`;
    await sZamkem('smazat-srovnani', async () => {
      const [lahve, kegy] = await Promise.all([
        supabase.from('bottling').delete().like('note', podpis).select('id'),
        supabase.from('kegging').delete().like('note', podpis).select('id'),
      ]);
      if (lahve.error || kegy.error) {
        chyba('Nepodařilo se smazat: ' + (lahve.error?.message ?? kegy.error?.message));
        return;
      }
      const kolik = (lahve.data?.length ?? 0) + (kegy.data?.length ?? 0);
      uspech(kolik === 0
        ? `Za ${nazevMesice(currentMonth)} žádné srovnání nebylo.`
        : `Smazáno ${kolik} řádků srovnání za ${nazevMesice(currentMonth)}. Můžeš srovnávat znovu.`);
      forceReloadRef.current = true;
      await loadData(true);
    });
  }

  /** Kolik řádků má naťukanou inventuru, která zatím leží jen v prohlížeči. */
  const rozepsanychRadku = useMemo(
    () => Object.values(actualStock).filter((v) => String(v).trim() !== '').length,
    [actualStock],
  );

  /** Kolik řádků má vyplněné dorovnání — kvůli přehledu a hromadnému smazání. */
  const dorovnaneRadky = useMemo(
    () => Object.entries(dorovnatMap).filter(([, v]) => String(v).trim() !== '' && Number(v) !== 0).length,
    [dorovnatMap],
  );

  /**
   * Položky s pohybem, u kterých zůstalo pole INVENTURA prázdné.
   *
   * Není to zámek — prázdné pole se ukládá jako napočítaná nula a tlačítko
   * na srovnání je u nich stejně. Je to jen připomínka, ať se nula nezapíše
   * omylem u něčeho, co se ještě nestihlo spočítat.
   */
  const nespocitane = useMemo(
    () => rows.filter((r) =>
      String(actualStock[`${r.beer_id}__${r.package_id}`] ?? '').trim() === '' &&
      (r.initialQty !== 0 || r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0)
    ),
    [rows, actualStock]
  );

    // Import z Excelu / Google Tabulek
  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Limit velikosti — omylem vybraný obří soubor jinak zamrzne appku
    // uprostřed inventury.
    const MAX_MB = 10;
    if (file.size > MAX_MB * 1024 * 1024) {
      oznam(`Soubor je moc velký (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum je ${MAX_MB} MB — zkontrolujte, jestli jste vybrali správný soubor.`);
      e.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import('xlsx-js-style');
      const wb = XLSX.read(buffer, { type: 'array' });
      const targetSheetName = wb.SheetNames.find((s: string) => /červenec|cervenec|inventura|lahve|sklo|stáčení|keg/i.test(s)) || wb.SheetNames[0];
      const sheet = wb.Sheets[targetSheetName];
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let matchCount = 0;
      const importedActual: Record<string, string> = { ...actualStock };

      jsonRows.forEach((row) => {
        if (!Array.isArray(row) || row.length < 2) return;
        const rowText = row.join(' ').toLowerCase();

        const matchedBeer = beers.find((b) =>
          rowText.includes(b.name.toLowerCase()) ||
          (b.degree && rowText.includes(b.degree.toLowerCase()))
        );

        const matchedPkg = packages.find((p) =>
          rowText.includes(p.label.toLowerCase()) ||
          (p.volume_l === 50 && /50/i.test(rowText)) ||
          (p.volume_l === 30 && /30/i.test(rowText)) ||
          (p.volume_l === 0.5 && /0[.,]5|lahv|sklo/i.test(rowText)) ||
          (p.volume_l === 0.33 && /0[.,]33|tretink/i.test(rowText))
        );

        const numCells = row.map((c) => parseInt(String(c), 10)).filter((n) => !isNaN(n) && n >= 0);
        const countVal = numCells.length ? numCells[numCells.length - 1] : null;

        if (matchedBeer && matchedPkg && countVal !== null) {
          const key = `${matchedBeer.id}__${matchedPkg.id}`;
          importedActual[key] = String(countVal);
          matchCount++;
        }
      });

      if (matchCount > 0) {
        setActualStock(importedActual);
        localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(importedActual));
        oznam(`Úspěšně naimportováno ${matchCount} položek z Excelu/Google Tabulky pro měsíc ${currentMonth}!`);
      } else {
        oznam('V souboru nebyly nalezeny žádné odpovídající položky piva a obalu. Zkontrolujte strukturu tabulky.');
      }
    } catch (err: any) {
      chyba('Chyba při čtení Excel souboru: ' + (err?.message ?? String(err)));
    } finally {
      e.target.value = '';
      setBusy(false);
    }
  }

function exportInventoryExcel() {
    const filteredRows = rows.filter((r) => {
      const name = r.beer_name.toLowerCase();
      const isLimo = name.includes('grep') || name.includes('citron') || name.includes('citro') || name.includes('limo');
      return !isLimo;
    });

    const dataToExport = filteredRows.map((r) => {
      const druh = r.package_kind === 'keg' ? 'KEG' : 'Lahve';
      const obal = r.package_volume ? `${r.package_volume}l` : r.package_label;
      return {
        'Název piva': r.beer_name,
        'Druh': druh,
        'Obal': obal,
        'Fyzická inventura (ks)': r.actualQty,
        'Dorovnání (± ks)': r.dorovnatQty,
      };
    });

    exportHistoryDetailToExcel(
      dataToExport,
      ['Název piva', 'Druh', 'Obal', 'Fyzická inventura (ks)', 'Dorovnání (± ks)'],
      ['Název piva', 'Druh', 'Obal', 'Fyzická inventura (ks)', 'Dorovnání (± ks)'],
      `inventura_${currentMonth}.xlsx`
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          {/* Popisný nadpis obrazovky odstraněn — na telefonu zabíral
              půl displeje a neříkal nic, co by uživatel nevěděl. Ovládací
              prvky banneru zůstávají. */}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 px-2 py-1.5 rounded text-xs font-bold">
            <button
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-amber-500 hover:text-neutral-950 text-white font-black transition"
              title="Předchozí měsíc"
            >
              ‹
            </button>
            <div className="flex items-center gap-1.5 px-1">
              <Calendar size={15} className="text-amber-400" />
              <span>Měsíc:</span>
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => setCurrentMonth(e.target.value)}
                className="bg-transparent text-amber-950 font-mono font-black border-none focus:outline-none"
              />
            </div>
            <button
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, 1))}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-amber-500 hover:text-neutral-950 text-white font-black transition"
              title="Následující měsíc"
            >
              ›
            </button>
          </div>


          <button
            onClick={() => setShowPhotoCounter(true)}
            className="px-3.5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Camera size={16} /> Spočítat z fotek (Bedny & Lahve)
          </button>

          <input
            ref={excelFileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => excelFileRef.current?.click()}
            className="px-3.5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <span><Download className="ikona-text" /> Import Excel / Google Tabulky</span>
          </button>
          <button
            onClick={exportInventoryExcel}
            className="px-3.5 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Export Excel
          </button>

          <button
            onClick={handleLockAndTransferNextMonth}
            className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Lock size={16} /> Schválit & Převést do nového měsíce
          </button>
        </div>
      </div>

      {/* Tabs — přilepené nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('inventory')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'inventory'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <ClipboardCheck size={16} />
          <span>Fyzická inventura & Manko/Přebytek</span>
        </button>

        <button
          onClick={() => selectTab('initial_stock')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'initial_stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <RotateCcw size={16} />
          <span>Nastavit Počáteční stav zásoby (K 1. dni v měsíci)</span>
        </button>

        <button
          onClick={() => selectTab('end_stock')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'end_stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <ClipboardCheck size={16} />
          <span>Stav sudů na konci měsíce</span>
        </button>

        <button
          onClick={() => selectTab('audit')}
          className={`px-4 py-2.5 rounded font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'audit'
              ? 'bg-amber-500 text-neutral-950 shadow-md'
              : auditNesedi.length > 0
                ? 'bg-rose-50 text-rose-900 border border-rose-300 hover:bg-rose-100'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Search size={16} />
          <span>Audit — Inventura vs. Sklad</span>
          {auditNesedi.length > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[11px] font-black">
              {auditNesedi.length}
            </span>
          )}
        </button>
      </div>

      {/* 📅 Měsíc se vybírá JEN v banneru nahoře a upozorňuje se na něj JEN
          tady — platí pro všechny záložky stejně. Dřív měla „Stav sudů"
          vlastní druhý volič a upozornění viselo jen na první záložce, takže
          se měsíc na jedné záložce přepnul a na druhé o tom nikdo nevěděl.

          Obrazovka se otevírá na dnešním měsíci, ale první dny v měsíci se
          skoro vždycky dopočítává ten předchozí. Bez upozornění by srpnová
          inventura zadaná 3. 9. spadla do září — a doplněné stáčení s ní. */}
      {(() => {
        const minuly = nabidnoutMinulyMesic(currentMonth, businessDateISO());
        if (!minuly) return null;
        return (
          <div className="rounded border-2 border-sky-400 bg-sky-50 p-4 flex items-start gap-3">
            <Calendar size={20} className="text-sky-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="font-display font-black text-sky-900 text-sm">
                Počítáš inventuru za {nazevMesice(currentMonth)} — nechtěl jsi {nazevMesice(minuly)}?
              </div>
              <p className="text-[11px] font-bold text-sky-800 mt-1">
                {nazevMesice(currentMonth)} ještě neskončil. Inventura se obvykle dělá za měsíc,
                který právě skončil — a doplněné stáčení se připisuje k jeho poslednímu dni.
              </p>
              <button
                type="button"
                onClick={() => setCurrentMonth(minuly)}
                className="mt-2.5 px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white font-black text-xs transition"
              >
                Přepnout na {nazevMesice(minuly)}
              </button>
            </div>
          </div>
        );
      })()}




      {/* TAB 1: FYZICKÁ INVENTURA & ROZDÍLY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          {/* ⚠️ Nespočítané položky. Právě tohle stálo za deficitem u 34 z 56
              položek: schválená inventura za červenec 2026 měla jen 19 řádků,
              zbytek se nikdy nespočítal a skladová kniha u nich dál odečítala
              závozy od starého (nebo žádného) základu. Napočítat nulu je
              plnohodnotný výsledek a od 1.906 se ukládá. */}
          {/* 🧾 Dorovnání je zápis BOKEM — se skladem nehne. Když jich je na
              obrazovce hodně (třeba po klikání na ⟳ u jednotlivých řádků),
              tabulka je plná modrých hlášek a vypadá to, že se něco zapsalo,
              přitom se stav skladu nezměnil. Tenhle pruh to řekne narovinu a
              dá je smazat najednou. Ukládají se průběžně do prohlížeče, takže
              samy nezmizí ani po přenačtení. */}
          {/* ⚠️ Rozepsáno, ale NEULOŽENO. Napočítané stavy se od 2.173 drží
              v prohlížeči, aby se hodina počítání neztratila při uspání
              telefonu — jenže tím taky vypadají jako hotová věc. Do databáze
              se dostanou až tlačítkem „Uložit fyzické stavy" a bez něj je
              jiné zařízení neuvidí a měsíc se nedá uzavřít. Z provozu: „ta
              inventura je tam už zadaná, ty jsou uloženy" — a přitom za srpen
              2026 neležel v databázi ani jeden řádek. */}
          {rozepsanychRadku > 0 && !inventuraUlozena && (
            <div className="rounded border-2 border-rose-400 bg-rose-50 p-3.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-black text-rose-900 text-sm">
                  Rozepsáno {rozepsanychRadku} položek — ale ZATÍM NEULOŽENO
                </div>
                <p className="text-[11px] font-bold text-rose-800 mt-1 leading-relaxed">
                  Napočítané stavy zatím leží jen v tomhle prohlížeči. Drží se tam, aby se
                  neztratily, ale do databáze se dostanou <strong>až tlačítkem „Uložit fyzické
                  stavy"</strong> — do té doby je jiné zařízení neuvidí a měsíc nejde uzavřít.
                </p>
              </div>
              <div className="shrink-0 flex flex-wrap items-center gap-2">
                {/* Zahození rozepsaného. Napočítané stavy se drží v prohlížeči,
                    aby se neztratily — jenže když se inventura dělá znovu od
                    začátku, stará čísla překážejí a jinak než po jednom se
                    smazat nedala. */}
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await potvrd(
                      `Zahodit ${rozepsanychRadku} rozepsaných čísel a začít inventuru za ${nazevMesice(currentMonth)} znovu?

`
                      + 'Týká se jen toho, co je naťukané v prohlížeči — zapsané stáčení, objednávky ani fasování se nedotkne.',
                      { titulek: 'Zahodit rozepsanou inventuru', potvrdit: 'Ano, zahodit' },
                    ))) return;
                    setActualStock({});
                    setDorovnatMap({});
                    oznam('Rozepsaná inventura zahozena — můžeš začít znovu.');
                  }}
                  className="px-3 py-2 rounded bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-black text-xs transition"
                >
                  Zahodit rozepsané
                </button>
                <button
                  type="button"
                  onClick={handleSaveActualStock}
                  disabled={busy}
                  className="px-3 py-2 rounded bg-rose-600 hover:bg-rose-700 text-white font-black text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Save size={15} /> Uložit fyzické stavy
                </button>
              </div>
            </div>
          )}

          {dorovnaneRadky > 0 && (
            <div className="rounded border-2 border-sky-300 bg-sky-50 p-3.5 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display font-black text-sky-900 text-sm">
                  Ztráty jsou vyplněné u {dorovnaneRadky} položek
                </div>
                <p className="text-[11px] font-bold text-sky-800 mt-1 leading-relaxed">
                  Sloupec ZTRÁTY <strong>se stavem skladu nehne</strong> — je to poznámka na rozbité
                  a ztracené kusy a mění jen sloupec vedle. Když se zboží doopravdy stočilo nebo
                  nestočilo, patří to do <strong>Vyrovnat</strong> (panel pod pivem u lahví, tlačítko
                  v řádku u sudů) — jedině to sáhne na sklad a zvedne počet nastáčených.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDorovnatMap({})}
                className="shrink-0 px-3 py-2 rounded bg-sky-600 hover:bg-sky-700 text-white font-black text-xs transition"
              >
                Vymazat všechny ztráty
              </button>
            </div>
          )}

          {nespocitane.length > 0 && (
            <div className="rounded border-2 border-amber-400 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="font-display font-black text-amber-900 text-sm">
                    {nespocitane.length} {nespocitane.length === 1 ? 'položka nemá' : nespocitane.length < 5 ? 'položky nemají' : 'položek nemá'} vyplněnou inventuru
                  </div>
                  <p className="text-[11px] font-bold text-amber-800 mt-1">
                    Tyhle položky se tenhle měsíc hýbaly (stáčely nebo vydávaly) a pole INVENTURA u nich
                    zůstalo prázdné. <strong>Prázdné se bere jako nula a jako nula se i uloží</strong> —
                    takže když jich fyzicky nula je, není co dělat. Tenhle seznam je jen připomínka, ať
                    se nula nezapíše omylem u něčeho, co se ještě nestihlo spočítat.
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {nespocitane.slice(0, 24).map((r) => (
                      <span key={`${r.beer_id}__${r.package_id}`} className="px-2 py-1 rounded bg-white border border-amber-300 text-[11px] font-bold text-neutral-700">
                        {r.beer_name} <span className="text-neutral-500">{String(r.package_label).trim()}</span>
                      </span>
                    ))}
                    {nespocitane.length > 24 && (
                      <span className="px-2 py-1 text-[11px] font-bold text-amber-800">… a dalších {nespocitane.length - 24}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500">Počáteční stav</span>
              <div className="font-display font-black text-lg text-neutral-900">{totals.initial} ks</div>
              <span className="text-[11px] text-neutral-500">Převedeno z minulého měsíce</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-amber-700">Nově stočeno (+)</span>
              <div className="font-display font-black text-lg text-amber-600">+{totals.staceno} ks</div>
              <span className="text-[11px] text-neutral-500">Zapsáno ve Stáčení</span>
            </div>
            <div className="card p-3.5 bg-white border border-rose-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-rose-600">Odpisy (− odpis)</span>
              <div className="font-display font-black text-lg text-rose-700">-{totals.odpis} ks</div>
              <span className="text-[11px] text-neutral-500">Zapsáno v Odpisech</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-amber-800">Vytočeno/Výdej (−)</span>
              <div className="font-display font-black text-lg text-amber-800">-{totals.vydej} ks</div>
              <span className="text-[11px] text-neutral-500">Fasování + Prodejna + Objednávky</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500"><PackageIcon className="ikona-text" /> ZBYDE SKLADEM (Oček.)</span>
              <div className="font-display font-black text-xl">
                {totals.expected < 0 ? (
                  <span className="px-2 py-0.5 rounded bg-rose-600 text-white">{totals.expected} ks</span>
                ) : (
                  <span className="text-emerald-700">{totals.expected} ks</span>
                )}
              </div>
              <span className="text-[11px] text-neutral-500">Teoretický zůstatek</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded space-y-1">
              <span className="text-[11px] font-black uppercase text-neutral-500">Celkové Manko/Přebytek</span>
              <div className={`font-display font-black text-lg ${totals.diffQty < 0 ? 'text-rose-700' : totals.diffQty > 0 ? 'text-emerald-700' : 'text-neutral-900'}`}>
                {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty} ks ({totals.diffCzk.toLocaleString('cs-CZ')} Kč)
              </div>
              <span className="text-[11px] text-neutral-500">Fyzický vs Systémový stav</span>
              <span className="block pt-1 border-t border-neutral-200 text-[11px] font-bold text-neutral-600">
                Ztráty: {totals.dorovnat > 0 ? `+${totals.dorovnat}` : totals.dorovnat} ks ·
                <span className={totals.diffAfterQty === 0 ? 'text-emerald-700' : totals.diffAfterQty < 0 ? 'text-rose-700' : 'text-amber-700'}>
                  {' '}po ztrátách: {totals.diffAfterQty > 0 ? `+${totals.diffAfterQty}` : totals.diffAfterQty} ks ({totals.diffAfterCzk.toLocaleString('cs-CZ')} Kč)
                </span>
              </span>
              <span className="text-[11px] text-neutral-500">Ztráty se ukládají bokem a nepočítají se do stáčení ani odpočtů.</span>
            </div>
          </div>

          <div data-inv-kotva="bilance" className="card p-5 bg-white border border-neutral-200/90 rounded shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900">Bilanční tabulka piva & Obalů k datu</h3>
                <p className="text-xs text-neutral-500 font-bold">Do sloupce Inventura zadej ručně přesný spočítaný stav na konci měsíce (výchozí 0 ks). Když rozdíl vznikne, srovnej ho tlačítkem ve sloupci SROVNAT — <strong>přebytek</strong> se zapíše jako chybějící stočení, <strong>manko</strong> se ze stáčení odečte. Sloupec ZTRÁTY (±) je jen poznámka na rozbité a ztracené kusy — <strong>se stavem skladu nehne</strong> a stáčení nezaloží.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Vrácení srovnání. Srovnání je jednosměrné — po zápisu je
                    rozdíl nula a není co znovu vyrovnávat, takže špatně
                    zadané srovnání šlo dřív opravit jedině zásahem do
                    databáze. */}
                <button
                  onClick={smazatSrovnaniMesice}
                  disabled={doplnujeSe !== null || busy}
                  className="px-3 py-2.5 rounded bg-white border-2 border-rose-300 hover:bg-rose-50 text-rose-800 font-black text-xs transition disabled:opacity-50 flex items-center gap-1.5"
                  title="Smaže všechny zápisy, které v tomhle měsíci vznikly tlačítky Vyrovnat. Běžné stáčení, objednávky ani fasování se nedotkne."
                >
                  <RotateCcw size={15} /> Vrátit srovnání
                </button>
                <button
                  onClick={handleSaveActualStock}
                  disabled={busy}
                  className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
                >
                  <Save size={16} /> Uložit fyzické stavy
                </button>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="text-center py-10 text-xs font-bold text-neutral-500 space-y-2">
                <p>Pro měsíc {currentMonth} zatím nebyly zadané žádné počáteční stavy ani pohyby.</p>
                <button
                  onClick={() => selectTab('initial_stock')}
                  className="px-4 py-2 rounded bg-amber-500 text-neutral-950 font-black text-xs shadow-xs"
                >
                  + Zadat počáteční zásoby na skladě
                </button>
              </div>
            ) : (
              <>
              {/* 📱 Režim počítání — postup a zúžení seznamu. Ve skladu se chodí
                  s telefonem a projít 99 kombinací pivo × obal bez filtru nejde. */}
              <div className="rounded border border-neutral-200 bg-white p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-black uppercase tracking-wide text-neutral-500">Postup inventury</span>
                  <span className="font-mono font-black text-sm text-neutral-900 tabular-nums">
                    {postup.hotovo} / {postup.celkem}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${postup.celkem > 0 ? Math.round((postup.hotovo / postup.celkem) * 100) : 0}%` }}
                  />
                </div>
                {/* Druh obalu — lahve a sudy se počítají zvlášť, ať se v seznamu
                    nemíchají. Skládá se s filtrem postupu pod tím. */}
                <div className="flex flex-wrap gap-1.5 pb-2 border-b border-neutral-100">
                  {([
                    ['vse', 'Vše', rows.length],
                    ['lahve', 'Lahve', rows.filter((r) => !jeSud(r.package_kind, r.package_label)).length],
                    ['sudy', 'Sudy', rows.filter((r) => jeSud(r.package_kind, r.package_label)).length],
                  ] as const).map(([id, popis, pocet]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDruhFiltr(id)}
                      className={`px-3 py-2 rounded font-black text-xs transition min-h-[44px] flex items-center gap-1.5 ${
                        druhFiltr === id
                          ? 'bg-neutral-900 text-white shadow-xs'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {popis}
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${
                        druhFiltr === id ? 'bg-white/20' : 'bg-white'
                      }`}>{pocet}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ['vse', 'Vše', rows.length],
                    ['nespocitane', 'Chybí spočítat', nespocitane.length],
                    ['pohyb', 'Jen s pohybem', rows.filter((r) => r.stacenoQty !== 0 || r.vydejQty !== 0 || r.odpisQty !== 0).length],
                    ['nesedi', 'Nesedí', rows.filter((r) => r.expectedQty < 0).length],
                  ] as const).map(([id, popis, pocet]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPocitaniFiltr(id)}
                      className={`px-3 py-2 rounded font-black text-xs transition min-h-[44px] flex items-center gap-1.5 ${
                        pocitaniFiltr === id
                          ? 'bg-amber-500 text-neutral-950 shadow-xs'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                    >
                      {popis}
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${
                        pocitaniFiltr === id ? 'bg-neutral-950/15' : 'bg-white'
                      }`}>{pocet}</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* Mobilní karty — editace inventury a dorovnání bez vodorovného scrollování */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {zobrazeneRadky.map((r, i) => {
                  const k = `${r.beer_id}__${r.package_id}`;
                  const beer = beers.find((b) => b.id === r.beer_id);
                  // Panel se vykreslí pod POSLEDNÍM řádkem piva, ať se dopočet
                  // ukáže až po všech jeho obalech.
                  const posledniPiva = zobrazeneRadky[i + 1]?.beer_id !== r.beer_id;
                  return (
                    <Fragment key={k}>
                    <div data-inv-radek={k} className="plocha-z-dat plocha-z-dat-tlumena rounded border border-neutral-200 overflow-hidden" style={beer ? { backgroundColor: beerBg(beer), ['--ink-plochy' as any]: beerInk(beer) } : undefined}>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`font-black text-sm ${beer && beerText(beer) === 'text-white' ? 'text-white' : 'text-neutral-950'}`}>
                            {r.beer_name} <span className="font-bold opacity-80">· {formatPackageLabel(r.package_label)}</span>
                          </div>
                          <span className={`shrink-0 px-2 py-1 rounded text-xs font-black ${r.expectedQty < 0 ? 'bg-rose-600 text-white' : 'bg-emerald-300/80 text-emerald-950'}`}>
                            Oček. {r.expectedQty} ks
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[11px] font-black uppercase text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md inline-block mb-1">Inventura</span>
                            <div className="flex items-stretch gap-1">
                              <button
                                type="button"
                                onClick={() => posunInventuru(k, -1)}
                                className="shrink-0 w-11 min-h-[44px] grid place-items-center rounded-lg bg-amber-200/70 hover:bg-amber-300 text-amber-950 font-black text-xl transition active:scale-95"
                                title="O jeden kus míň"
                                aria-label="O jeden kus míň"
                              >−</button>
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                min="0"
                                inputMode="numeric"
                                className="input !py-2 text-center font-mono font-black text-base text-neutral-950 border-amber-400 bg-amber-100/80 w-full min-w-0 rounded shadow-inner focus:ring-2 focus:ring-amber-500"
                                value={actualStock[k] !== undefined ? actualStock[k] : ''}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setActualStock((prev) => ({ ...prev, [k]: e.target.value }))}
                              />
                              <button
                                type="button"
                                onClick={() => posunInventuru(k, 1)}
                                className="shrink-0 w-11 min-h-[44px] grid place-items-center rounded-lg bg-emerald-200/80 hover:bg-emerald-300 text-emerald-950 font-black text-xl transition active:scale-95"
                                title="O jeden kus víc"
                                aria-label="O jeden kus víc"
                              >+</button>
                            </div>
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-black uppercase text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded-md inline-block mb-1">Ztráty (±)</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                inputMode="numeric"
                                className="input !py-2 text-center font-mono font-black text-base text-neutral-950 border-sky-400 bg-sky-100/80 w-full rounded shadow-inner focus:ring-2 focus:ring-sky-500"
                                placeholder="±"
                                value={dorovnatMap[k] !== undefined ? dorovnatMap[k] : ''}
                                onChange={(e) => setDorovnatMap((prev) => ({ ...prev, [k]: e.target.value }))}
                              />
                            </div>
                          </label>
                          {/* Tohle tlačítko ⟳ vypadá jako „srovnej to" a sedí
                              hned u jediného pole, na které jde v řádku sáhnout.
                              Jenže dorovnání je jen zápis bokem — stáčení
                              nezaloží a sudy neodečte. Bez téhle věty to z
                              obrazovky nikdo nepozná. */}
                          {(dorovnatMap[k] ?? '') !== '' && Number(dorovnatMap[k]) !== 0 && (
                            <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-300 rounded px-2 py-1.5 mt-1.5">
                              Ztráty <strong>nezaloží stáčení ani neodečtou sudy</strong> — jsou na rozbité
                              a ztracené kusy. Když se to stočilo a jen se to nezapsalo, smaž tohle pole
                              a vyrovnej to v panelu pod pivem.
                            </p>
                          )}
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs font-bold">
                          <span className={r.diffQty < 0 ? 'text-rose-700' : r.diffQty > 0 ? 'text-emerald-700' : 'text-neutral-500'}>
                            Manko: {r.diffQty > 0 ? `+${r.diffQty}` : r.diffQty} ks ({r.diffCzk.toLocaleString('cs-CZ')} Kč)
                          </span>
                          {r.dorovnatQty !== 0 && (
                            <span className={r.diffAfterQty === 0 ? 'text-emerald-700' : r.diffAfterQty < 0 ? 'text-rose-700' : 'text-amber-700'}>
                              Po ztrátách: {r.diffAfterQty > 0 ? `+${r.diffAfterQty}` : r.diffAfterQty} ks
                            </span>
                          )}
                        </div>

                        {/* Že už se tahle položka srovnávala. Bez toho vypadá
                            srovnaná nula stejně jako nula, která seděla sama. */}
                        {vyrovnaniMap.has(k) && (
                          <div className="px-2 py-1.5 rounded bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1.5">
                            <Check className="ikona-text" />
                            <span>
                              Vyrovnáno {vyrovnaniMap.get(k)! > 0 ? '+' : ''}{vyrovnaniMap.get(k)} ks
                              {vyrovnaniMap.get(k)! > 0 ? ' — doplněno stočení' : ' — odečteno ze stáčení'}
                            </span>
                          </div>
                        )}

                        {/* Srovnat rozdíl tam, kam patří — na rozdíl od
                            dorovnání, které ho jen schová bokem. U LAHVÍ tu
                            tlačítko není: zapsalo by je bez sudů a panel pod
                            pivem, který se na sudy ptá, by tím zmizel. */}
                        {r.diffQty !== 0 && !jeSud(r.package_kind, r.package_label) && (
                          <div className="text-[11px] font-bold text-neutral-600 text-center py-1">
                            Lahve se vyrovnávají <strong>v panelu pod pivem</strong> — tam se zadávají i sudy.
                          </div>
                        )}
                        {r.diffQty !== 0 && jeSud(r.package_kind, r.package_label) && (
                          <button
                            type="button"
                            onClick={() => srovnatRozdil(r)}
                            disabled={doplnujeSe !== null}
                            className={`w-full min-h-[44px] rounded font-black text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                              r.diffQty > 0
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                : 'bg-rose-600 hover:bg-rose-700 text-white'
                            }`}
                            title={r.diffQty > 0
                              ? 'Napočítáno víc, než sklad čeká — doplnit chybějící zápis stočení'
                              : 'Napočítáno míň — odečíst rozdíl ze stáčení'}
                          >
                            {r.diffQty > 0 ? (
                              <><Plus size={15} /> Zapsat {r.diffQty} ks jako stočení</>
                            ) : (
                              <><MinusCircle size={15} /> Odečíst {Math.abs(r.diffQty)} ks ze stáčení</>
                            )}
                          </button>
                        )}

                        <div className="text-[11px] text-neutral-500 flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1 border-t border-black/10">
                          <span>Poč. {r.initialQty}</span>
                          <span>Stočeno +{r.stacenoQty}</span>
                          <span>Odpis −{r.odpisQty}</span>
                          <span>Výdej −{r.vydejQty}</span>
                        </div>
                      </div>
                    </div>
                    {posledniPiva && panelDavky(r.beer_id)}
                    </Fragment>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto scrollbar-thin">
                <table className="table text-xs w-full">
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-800 border-b border-neutral-200">
                      <th className="py-2.5 px-3 text-left">Pivo</th>
                      <th className="py-2.5 px-3 text-left">Obal</th>
                      <th className="py-2.5 px-2 text-right">Počáteční (Poč.)</th>
                      <th className="py-2.5 px-2 text-right text-amber-700">Stočeno (+)</th>
                      <th className="py-2.5 px-2 text-right text-rose-700">Odpis (−)</th>
                      <th className="py-2.5 px-2 text-right text-amber-800">Výdej (−)</th>
                      <th className="py-2.5 px-3 text-right bg-emerald-700 !text-white font-black rounded-t-lg">ZBYDE (Oček.)</th>
                      <th className="py-2.5 px-3 text-right bg-amber-500 text-neutral-950 font-black rounded-t-lg">INVENTURA</th>
                      <th className="py-2.5 px-3 text-right bg-sky-700 !text-white font-black rounded-t-lg" title="Ztráty a rozbité kusy (±). Poznámka bokem — NEZAKLÁDÁ stáčení, neodečítá sudy a se stavem skladu nehne. Na to je sloupec VYROVNAT.">ZTRÁTY (±)</th>
                      <th className="py-2.5 px-2 text-right font-black" title="Kolik kusů se u téhle položky už srovnalo z inventury tohoto měsíce. Prázdné = nesrovnávalo se.">VYROVNÁNO</th>
                      <th className="py-2.5 px-2 text-right font-black">MANKO</th>
                      <th className="py-2.5 px-2 text-right font-black" title="Manko po započtení ztrát (INVENTURA − očekávaný stav se ztrátami)">PO ZTRÁTÁCH</th>
                      <th className="py-2.5 px-3 text-right font-black">ROZDÍL (Kč)</th>
                      <th className="py-2.5 px-2 text-center font-black" title="Srovnat rozdíl tam, kam patří: přebytek = chybějící zápis stočení, manko = odečet ze stáčení.">SROVNAT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const k = `${r.beer_id}__${r.package_id}`;
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const isDark = beer && beerText(beer) === 'text-white';
                      const textColor = isDark ? 'text-white' : 'text-neutral-950';
                      // Panel pod POSLEDNÍM řádkem piva — až po všech jeho obalech.
                      const posledniPiva = rows[i + 1]?.beer_id !== r.beer_id;

                      return (
                        <Fragment key={k}>
                        {/* data-inv-radek = kotva, aby obrazovka po zápisu neodskočila (lib/drzPozici.ts) */}
                        <tr data-inv-radek={k} className="plocha-z-dat plocha-z-dat-tlumena hover:brightness-95 transition-colors border-b border-neutral-200/60" style={beer ? { backgroundColor: beerBg(beer), ['--ink-plochy' as any]: beerInk(beer) } : undefined}>
                          <td className={`font-black text-[11px] px-3 py-2 ${textColor}`}>{r.beer_name}</td>
                          <td className={`font-extrabold text-[11px] px-3 py-2 ${textColor}`}>{formatPackageLabel(r.package_label)}</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 ${textColor}`}>{r.initialQty} ks</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 text-amber-900 font-black`}>+{r.stacenoQty}</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 text-rose-800 font-black`}>{r.odpisQty > 0 ? `-${r.odpisQty}` : '-0'}</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 text-amber-900 font-black`}>-{r.vydejQty}</td>
                          <td className={`text-right border-x font-mono font-black text-xs px-3 py-2 ${
                            r.expectedQty < 0
                              ? (isDark ? 'bg-rose-950/80 border-rose-700 text-rose-200' : 'bg-rose-100/90 border-rose-300 text-rose-950')
                              : (isDark ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200' : 'bg-emerald-100/90 border-emerald-300 text-emerald-950')
                          }`}>
                            <span className={`inline-block px-2 py-0.5 rounded-md border font-black shadow-2xs ${
                              r.expectedQty < 0
                                ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                                : 'bg-emerald-300/80 text-emerald-950 border-emerald-500/60'
                            }`}>
                              {r.expectedQty} ks
                            </span>
                          </td>
                          <td className="text-right bg-amber-50/90 border-x border-amber-300 px-2 py-2">
                            {/* Počítá se po kusech i tady — u dlouhého seznamu je klepnutí
                                rychlejší a spolehlivější než přepisování čísla. */}
                            <div className="flex items-center justify-end gap-1">
                              <button type="button" onClick={() => posunInventuru(k, -1)} title="O jeden kus míň" aria-label="O jeden kus míň" className="shrink-0 w-9 h-9 grid place-items-center rounded-lg bg-amber-200/70 hover:bg-amber-300 text-amber-950 font-black transition active:scale-95 tap">−</button>
                              <input
                                type="number" inputMode="numeric" onWheel={(e) => e.currentTarget.blur()}
                                min="0"
                                className="input !py-1 text-center font-mono font-black text-xs text-neutral-950 border-amber-400 bg-amber-100/80 w-16 rounded shadow-inner focus:ring-2 focus:ring-amber-500"
                                value={actualStock[k] !== undefined ? actualStock[k] : ''}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => setActualStock((prev) => ({ ...prev, [k]: e.target.value }))}
                              />
                              <button type="button" onClick={() => posunInventuru(k, 1)} title="O jeden kus víc" aria-label="O jeden kus víc" className="shrink-0 w-9 h-9 grid place-items-center rounded-lg bg-emerald-200/80 hover:bg-emerald-300 text-emerald-950 font-black transition active:scale-95 tap">+</button>
                            </div>
                          </td>
                          <td className="text-right bg-sky-50/90 border-x border-sky-300 px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                                className="input !py-1 text-right font-mono font-black text-xs text-neutral-950 border-sky-400 bg-sky-100/80 w-20 ml-auto rounded shadow-inner focus:ring-2 focus:ring-sky-500"
                                placeholder="±"
                                value={dorovnatMap[k] !== undefined ? dorovnatMap[k] : ''}
                                onChange={(e) => setDorovnatMap((prev) => ({ ...prev, [k]: e.target.value }))}
                                title="Zadej, o kolik kusů se má očekávaný stav dorovnat (+ přidat, − ubrat), aby seděl s realitou. Ukládá se bokem a nepočítá se do stáčení ani odpočtů."
                              />
                            </div>
                            {r.dorovnatQty !== 0 && (
                              <div className="mt-0.5 text-[11px] font-black text-sky-800">
                                Očekáváno po ztrátách: {r.reconciledQty} ks
                              </div>
                            )}
                          </td>
                          <td className="text-right font-mono font-black text-[11px] px-2 py-2">
                            {vyrovnaniMap.has(k) ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white whitespace-nowrap">
                                <Check className="ikona-text" /> {vyrovnaniMap.get(k)! > 0 ? '+' : ''}{vyrovnaniMap.get(k)} ks
                              </span>
                            ) : (
                              <span className="text-neutral-400">—</span>
                            )}
                          </td>
                          <td className={`text-right font-mono font-black text-[11px] px-2 py-2 ${
                            r.diffQty < 0 ? (isDark ? 'text-rose-900' : 'text-rose-800') : r.diffQty > 0 ? (isDark ? 'text-emerald-900' : 'text-emerald-800') : textColor
                          }`}>
                            {r.diffQty > 0 ? `+${r.diffQty}` : r.diffQty} ks
                          </td>
                          <td className={`text-right font-mono font-black text-[11px] px-2 py-2 ${
                            r.diffAfterQty < 0 ? (isDark ? 'text-rose-900' : 'text-rose-800') : r.diffAfterQty > 0 ? (isDark ? 'text-emerald-900' : 'text-emerald-800') : textColor
                          }`}>
                            {r.diffAfterQty > 0 ? `+${r.diffAfterQty}` : r.diffAfterQty} ks
                            {r.diffAfterQty === 0 && r.dorovnatQty !== 0 && (
                              <span className="ml-1 text-[11px] font-black text-emerald-700"><Check className="ikona-text" /> sedí se ztrátami</span>
                            )}
                          </td>
                          <td className={`text-right font-black text-[11px] px-3 py-2 ${
                            r.diffCzk < 0 ? (isDark ? 'text-rose-900' : 'text-rose-800') : r.diffCzk > 0 ? (isDark ? 'text-emerald-900' : 'text-emerald-800') : textColor
                          }`}>
                            {r.diffCzk.toLocaleString('cs-CZ')} Kč
                          </td>
                          <td className="text-center px-2 py-2">
                            {/* U LAHVÍ se tady nesrovnává. Řádkové tlačítko
                                zapsalo lahve BEZ sudů, rozdíl tím spadl na
                                nulu, panel pod pivem zmizel — a sudy, ze
                                kterých se ty lahve stáčely, už nebylo kam
                                zadat. 1. 9. 2026 tak vzniklo 20 lahvových
                                zápisů bez jediného sudu. Lahve proto patří
                                výhradně do panelu, který se na sudy ptá. */}
                            {r.diffQty !== 0 && !jeSud(r.package_kind, r.package_label) && (
                              <span className="text-[11px] font-bold text-neutral-600 whitespace-nowrap">
                                ↓ v panelu pod pivem
                              </span>
                            )}
                            {r.diffQty !== 0 && jeSud(r.package_kind, r.package_label) && (
                              <button
                                type="button"
                                onClick={() => srovnatRozdil(r)}
                                disabled={doplnujeSe !== null}
                                className={`px-2 py-1.5 rounded font-black text-[11px] whitespace-nowrap transition disabled:opacity-50 ${
                                  r.diffQty > 0
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                                }`}
                                title={r.diffQty > 0
                                  ? `Napočítáno o ${r.diffQty} ks víc — doplnit chybějící zápis stočení`
                                  : `Napočítáno o ${Math.abs(r.diffQty)} ks míň — odečíst rozdíl ze stáčení`}
                              >
                                {r.diffQty > 0 ? `+ Zapsat ${r.diffQty} ks` : `− Odečíst ${Math.abs(r.diffQty)} ks`}
                              </button>
                            )}
                          </td>
                        </tr>
                        {posledniPiva && davky.some((x) => x.beer_id === r.beer_id) && (
                          <tr>
                            <td colSpan={14} className="px-3 py-2 bg-white">
                              {panelDavky(r.beer_id)}
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-200 text-neutral-950 font-black text-xs border-t-2 border-neutral-300">
                      <td colSpan={2} className="px-3 py-2.5 text-amber-400 font-display">CELKEM SOUHRN</td>
                      <td className="text-right px-2 py-2.5 text-neutral-950">{totals.initial} ks</td>
                      <td className="text-right px-2 py-2.5 text-amber-400">+{totals.staceno}</td>
                      <td className="text-right px-2 py-2.5 text-rose-900">-{totals.odpis}</td>
                      <td className="text-right px-2 py-2.5 text-amber-950">-{totals.vydej}</td>
                      <td className={`text-right px-3 py-2.5 font-mono text-sm border-x ${
                        totals.expected < 0
                          ? 'bg-rose-950/90 text-rose-300 border-rose-700 font-black'
                          : 'bg-emerald-950/80 text-emerald-300 border-emerald-700 font-black'
                      }`}>{totals.expected} ks</td>
                      <td className="text-right px-3 py-2.5 text-amber-300 font-mono text-sm bg-amber-950/80 border-x border-amber-700">{totals.actual} ks</td>
                      <td className={`text-right px-3 py-2.5 font-mono text-sm bg-sky-950/80 border-x border-sky-700 ${totals.dorovnat === 0 ? 'text-sky-300' : totals.dorovnat < 0 ? 'text-rose-300' : 'text-sky-200'}`}>
                        {totals.dorovnat > 0 ? `+${totals.dorovnat}` : totals.dorovnat} ks
                      </td>
                      <td className="text-right px-2 py-2.5 font-mono text-sm text-emerald-900">
                        {totals.vyrovnano === 0 ? '—' : `${totals.vyrovnano > 0 ? '+' : ''}${totals.vyrovnano} ks`}
                      </td>
                      <td className={`text-right px-2 py-2.5 font-mono text-sm ${totals.diffQty < 0 ? 'text-rose-900' : totals.diffQty > 0 ? 'text-emerald-900' : 'text-neutral-950'}`}>
                        {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty} ks
                      </td>
                      <td className={`text-right px-2 py-2.5 font-mono text-sm ${totals.diffAfterQty < 0 ? 'text-rose-900' : totals.diffAfterQty > 0 ? 'text-emerald-900' : 'text-neutral-950'}`}>
                        {totals.diffAfterQty > 0 ? `+${totals.diffAfterQty}` : totals.diffAfterQty} ks
                      </td>
                      <td className={`text-right px-3 py-2.5 ${totals.diffCzk < 0 ? 'text-rose-900' : totals.diffCzk > 0 ? 'text-emerald-900' : 'text-neutral-950'}`}>
                        {totals.diffCzk.toLocaleString('cs-CZ')} Kč
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: POČÁTEČNÍ STAVY SE ZADÁVÁNÍM RUČNĚ */}
      {activeTab === 'initial_stock' && (
        <div data-inv-kotva="pocatecni" className="card p-6 bg-white border border-neutral-200 rounded space-y-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 flex-wrap gap-2">
            <div>
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <RotateCcw className="text-amber-600" size={20} />
                <span>Počáteční zásoby piva ve skladu pro měsíc {currentMonth}</span>
              </h3>
              <p className="text-xs text-neutral-500 font-bold mt-0.5">
                Zde zadej zásoby z minulého měsíce / roztočení provozu. Tyto kusy se NEBUDOU počítat jako nové stáčení!
              </p>
            </div>
            <button
              onClick={handleSaveInitialStock}
              disabled={busy}
              className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
            >
              <Save size={16} /> Uložit počáteční zásoby
            </button>
          </div>

          <div className="space-y-6">
            {beers.map((b) => (
              <div key={b.id} className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-3">
                <h4 className="font-display font-black text-base text-neutral-900 border-b border-neutral-200 pb-2 flex items-center gap-2">
                  <span><BeerIcon className="ikona-text" /> {b.name}</span>
                  {b.degree && <span className="text-xs text-neutral-500 font-bold">({b.degree})</span>}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {packages.map((p) => {
                    const k = `${b.id}__${p.id}`;
                    return (
                      <div key={p.id} className="p-3 bg-white rounded border border-neutral-200 space-y-1">
                        <label className="block text-[11px] font-black uppercase text-neutral-600 truncate">
                          {formatPackageLabel(p.label)}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                            min="0"
                            className="input inventory-input !py-1.5 font-mono font-black text-sm text-neutral-900 bg-white"
                            placeholder="0 ks"
                            value={initialStock[k] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setInitialStock((prev) => ({ ...prev, [k]: val }));
                              setActualStock((prev) => ({ ...prev, [k]: String(val) }));
                            }}
                          />
                          <span className="text-xs font-bold text-neutral-500 shrink-0">ks</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: STAV SUDŮ NA KONCI MĚSÍCE (BILANČNÍ KONTO) */}
      {activeTab === 'end_stock' && (
        <EndStockTab
          beers={beers}
          packages={packages}
          currentMonth={currentMonth}
          initialStock={initialStock}
          stacenoKegMap={stacenoKegMap}
          stacenoLahveMap={stacenoLahveMap}
          fasovaniMap={fasovaniMap}
          prodejnaMap={prodejnaMap}
          akceMap={akceMap}
          odpisyMap={odpisyMap}
          objednavkyMap={objednavkyMap}
        />
      )}

      {/* === TAB: AUDIT — INVENTURA vs. SKLAD ===
          Dva řádky pod sebou u každého piva a obalu: nahoře čísla, ze kterých
          počítá Inventura, dole ta, ze kterých počítá Sklad. Musí být stejná;
          jediná povolená výjimka je uložená fyzická inventura, která posune
          POČÁTEČNÍ stav (viz lib/auditSkladu.ts). Rozdílné buňky svítí, takže
          je hned vidět, KTERÝ sloupec se rozešel — ne jen že výsledek nesedí. */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          <div className={`rounded border-2 p-3.5 ${auditNesedi.length === 0 ? 'border-emerald-300 bg-emerald-50/70' : 'border-rose-300 bg-rose-50/70'}`}>
            <div className={`font-display font-black text-sm ${auditNesedi.length === 0 ? 'text-emerald-950' : 'text-rose-950'}`}>
              {auditNesedi.length === 0
                ? `Inventura a Sklad sedí u všech ${auditPolozky.length} položek za ${nazevMesice(currentMonth)}.`
                : `${auditNesedi.length} z ${auditPolozky.length} položek se rozchází.`}
            </div>
            <p className="mt-1 text-[11px] font-black text-neutral-900">
              Kontroluje pohyby od {new Date(`${currentMonth}-01`).toLocaleDateString('cs-CZ')} do{' '}
              {new Date(datumDoplnku(currentMonth)).toLocaleDateString('cs-CZ')} — počátek je stav
              k ránu {new Date(`${currentMonth}-01`).toLocaleDateString('cs-CZ')}.
            </p>
            <p className="mt-1 text-[11px] font-bold text-neutral-700 leading-relaxed">
              Obě řady počítají <strong>stejné okno</strong> a stejným vzorcem: počátek k prvnímu dni
              + stáčení za měsíc − objednávky − fasování − prodejna − akce − odpisy − sudy na lahve.
              Liší se jedinou věcí — <strong>odkud berou počátek</strong>: Inventura ze zapsaného
              „Počátečního stavu" (chybí-li, je nula), Sklad si ho dopočítá z celé historie.
              Rozdíl proto smí být <strong>jen ve sloupci Počáteční</strong> (a v Konci, který z něj plyne).
              Rozdíl v kterémkoli sloupci pohybů je chyba.
            </p>
            {auditChybiZaklad.length > 0 && (
              <p className="mt-2 p-2.5 rounded bg-amber-100 border border-amber-300 text-[11px] font-bold text-amber-950 leading-relaxed">
                <strong>{auditChybiZaklad.length}</strong> {auditChybiZaklad.length === 1 ? 'položce' : 'položkám'} chybí
                za {nazevMesice(currentMonth)} řádek <strong>„Počáteční stav"</strong> — leží tu jen napočítaná
                inventura. Tu Inventura záměrně nezapočítává (je to to, s čím se porovnává), takže počítá
                od <strong>nuly</strong>; Sklad si napočítanou hodnotu bere jako základ. <strong>Sloupce pohybů
                sedí</strong> — obě strany počítají stejný měsíc — a rozdíl je jen v Počátečním stavu a v Konci.
                Není to chyba výpočtu, chybí údaj. Doplní se na záložce „Nastavit Počáteční stav zásoby".
              </p>
            )}
            {auditNesedi.length > 0 && (
              <button
                type="button"
                onClick={() => setAuditJenRozdily((v) => !v)}
                className="mt-2 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-black text-[11px] transition"
              >
                {auditJenRozdily ? 'Ukázat všechny položky' : `Ukázat jen rozdíly (${auditNesedi.length})`}
              </button>
            )}
          </div>

          {/* Vlastní rolovací box, ne jen vodorovný posuv. Sticky hlavička se
              drží nejbližšího rolovacího předka — v obyčejném overflow-x-auto
              divu (kterému prohlížeč dopočítá overflow-y: auto) by to byl
              právě on, jenže ten se svisle neroluje, takže by se hlavička
              nepřilepila vůbec. S vlastní výškou se lepí přesně tady.
              Barva pozadí musí být na <th>, ne na <tr> — pozadí řádku se pod
              přilepenou buňkou nevykreslí a text by prosvítal přes data. */}
          <div className="overflow-auto rounded border border-neutral-200 bg-white max-h-[70vh]">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr className="text-amber-300 text-[11px] font-black uppercase tracking-wider">
                  <th className="sticky top-0 z-10 bg-neutral-900 text-left px-3 py-2.5">Pivo · obal</th>
                  <th className="sticky top-0 z-10 bg-neutral-900 text-left px-3 py-2.5">Zdroj</th>
                  {AUDIT_SLOUPCE.map((sl) => (
                    <th key={sl} className={`sticky top-0 z-10 text-right px-2 py-2.5 whitespace-nowrap ${sl === 'konec' ? 'bg-neutral-800' : 'bg-neutral-900'}`}>
                      {AUDIT_NADPISY[sl]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(auditJenRozdily ? auditNesedi : auditPolozky).map((it) => {
                  const beer = beers.find((b) => b.id === it.beer_id);
                  const { porovnani } = it;
                  const nesedi = porovnani.rozdilne.length > 0 || porovnani.soucetNesedi;
                  const bunka = (sl: AuditSloupec, hodnota: number, radek: 'inventura' | 'sklad') => (
                    <td
                      key={sl}
                      className={`text-right font-mono font-black text-[11px] px-2 py-2 whitespace-nowrap ${
                        porovnani.rozdilne.includes(sl)
                          ? (radek === 'sklad' ? 'bg-rose-200 text-rose-950' : 'bg-amber-200 text-amber-950')
                          : sl === 'konec' ? 'bg-neutral-100 text-neutral-950' : 'text-neutral-800'
                      }`}
                    >
                      {bunkaAuditu(sl, hodnota)}
                    </td>
                  );
                  return (
                    <Fragment key={`${it.beer_id}__${it.package_id}`}>
                      <tr className={`plocha-z-dat plocha-z-dat-tlumena border-t-2 ${nesedi ? 'border-rose-300' : 'border-neutral-200'}`}
                          style={beer ? { backgroundColor: beerBg(beer), ['--ink-plochy' as any]: beerInk(beer) } : undefined}>
                        <td rowSpan={2} className="px-3 py-2 align-top font-black text-[11px] text-neutral-950 whitespace-nowrap">
                          {it.beer_name}
                          <span className="block font-bold opacity-80">{formatPackageLabel(it.package_label)}</span>
                          {nesedi && (
                            <span className="mt-1 block px-1.5 py-0.5 rounded bg-rose-600 text-white text-[11px] font-black w-fit">
                              {porovnani.soucetNesedi ? 'součet nesedí' : `rozdíl ${porovnani.rozdilKonec > 0 ? '+' : ''}${porovnani.rozdilKonec} ks`}
                            </span>
                          )}
                          {porovnani.chybiZaklad && (
                            <span className="mt-1 block px-1.5 py-0.5 rounded bg-amber-200 text-amber-950 text-[11px] font-black w-fit">
                              chybí počáteční stav
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-black text-[11px] text-amber-900 whitespace-nowrap">Inventura</td>
                        {AUDIT_SLOUPCE.map((sl) => bunka(sl, porovnani.inventura[sl], 'inventura'))}
                      </tr>
                      <tr className="border-b border-neutral-200 bg-white/60">
                        <td className="px-3 py-2 font-black text-[11px] text-sky-900 whitespace-nowrap">Sklad</td>
                        {AUDIT_SLOUPCE.map((sl) => bunka(sl, porovnani.sklad[sl], 'sklad'))}
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {auditPolozky.length === 0 && (
            <div className="p-4 text-center text-xs font-bold text-neutral-500">
              Za {nazevMesice(currentMonth)} není u žádného piva ani obalu zásoba ani pohyb.
            </div>
          )}
        </div>
      )}


      {showPhotoCounter && (
        <CountFromImage
          beers={beers}
          packages={packages}
          onClose={() => setShowPhotoCounter(false)}
          onSaved={() => {
            try {
              const saved = localStorage.getItem(`actual_inventory_${currentMonth}`);
              if (saved) setActualStock(JSON.parse(saved));
            } catch {}
            loadData();
            setShowPhotoCounter(false);
          }}
          table="inventory"
        />
      )}
    </div>
  );
}

// === TAB: STAV SUDŮ NA KONCI MĚSÍCE (BILANČNÍ KONTO) ===
type EndStockRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  volume_l: number;
  initialQty: number;      // Počáteční stav (k 1. dni)
  stacenoKegQty: number;   // Stáčení KEG (+)
  objednavkyQty: number;   // Objednávky (-)
  stacenoLahveQty: number; // Stáčení lahví (-)
  fasovaniQty: number;     // Fasování (-)
  prodejnaQty: number;     // Prodejna (-)
  akceQty: number;         // Akce (-)
  odpisyQty: number;       // Odpisy (-)
  endStockQty: number;     // Stav na konci měsíce (vypočtený)
};

function EndStockTab({
  beers,
  packages,
  currentMonth,
  initialStock,
  stacenoKegMap,
  stacenoLahveMap,
  fasovaniMap,
  prodejnaMap,
  akceMap,
  odpisyMap,
  objednavkyMap,
}: {
  beers: Beer[];
  packages: Package[];
  currentMonth: string;
  initialStock: InitialStockMap;
  stacenoKegMap: Record<string, number>;
  stacenoLahveMap: Record<string, number>;
  fasovaniMap: Record<string, number>;
  prodejnaMap: Record<string, number>;
  akceMap: Record<string, number>;
  odpisyMap: Record<string, number>;
  objednavkyMap: Record<string, number>;
}) {

  // Jen KEG obaly
  const kegPackages = packages.filter((p) => p.kind === 'keg');

  const rows: EndStockRow[] = useMemo(() => {
    const list: EndStockRow[] = [];
    beers.forEach((b) => {
      kegPackages.forEach((p) => {
        const k = `${b.id}__${p.id}`;
        const initialQty = Number(initialStock[k] || 0);
        const stacenoKegQty = Number(stacenoKegMap[k] || 0);
        const objednavkyQty = Number(objednavkyMap[k] || 0);
        const stacenoLahveQty = Number(stacenoLahveMap[k] || 0);
        const fasovaniQty = Number(fasovaniMap[k] || 0);
        const prodejnaQty = Number(prodejnaMap[k] || 0);
        const akceQty = Number(akceMap[k] || 0);
        const odpisyQty = Number(odpisyMap[k] || 0);

        // Stav na konci měsíce = Počáteční + Stáčení KEG − (Objednávky + Stáčení lahví + Fasování + Prodejna + Akce + Odpisy)
        const endStockQty = initialQty + stacenoKegQty - (objednavkyQty + stacenoLahveQty + fasovaniQty + prodejnaQty + akceQty + odpisyQty);

        if (initialQty !== 0 || stacenoKegQty !== 0 || objednavkyQty !== 0 || stacenoLahveQty !== 0 || fasovaniQty !== 0 || prodejnaQty !== 0 || akceQty !== 0 || odpisyQty !== 0) {
          list.push({
            beer_id: b.id,
            beer_name: b.name,
            package_id: p.id,
            package_label: p.label,
            volume_l: p.volume_l,
            initialQty,
            stacenoKegQty,
            objednavkyQty,
            stacenoLahveQty,
            fasovaniQty,
            prodejnaQty,
            akceQty,
            odpisyQty,
            endStockQty,
          });
        }
      });
    });
    return list;
  }, [beers, kegPackages, initialStock, stacenoKegMap, stacenoLahveMap, fasovaniMap, prodejnaMap, akceMap, odpisyMap, objednavkyMap]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.initial += r.initialQty;
        acc.stacenoKeg += r.stacenoKegQty;
        acc.objednavky += r.objednavkyQty;
        acc.stacenoLahve += r.stacenoLahveQty;
        acc.fasovani += r.fasovaniQty;
        acc.prodejna += r.prodejnaQty;
        acc.akce += r.akceQty;
        acc.odpisy += r.odpisyQty;
        acc.endStock += r.endStockQty;
        return acc;
      },
      { initial: 0, stacenoKeg: 0, objednavky: 0, stacenoLahve: 0, fasovani: 0, prodejna: 0, akce: 0, odpisy: 0, endStock: 0 }
    );
  }, [rows]);

  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Vysvětlení bilance */}
      <div className="p-4 rounded bg-sky-50 border border-sky-200 text-xs text-sky-950 font-medium space-y-1">
        {/* Měsíc se přepíná JEN v banneru nahoře — ten je vidět na všech
            záložkách. Druhý volič přímo tady vypadal jako samostatné
            nastavení, přitom měnil totéž. */}
        <p className="font-black text-sky-900"><IkonaSud className="ikona-text" /> Bilanční konto sudů za {monthLabel}</p>
        <p>
          <strong>Stav na konci měsíce</strong> = Počáteční stav + Stáčení KEG − (Objednávky + Stáčení lahví + Fasování + Prodejna + Akce + Odpisy)
        </p>
        <p className="text-sky-800">
          Pokud vyjde <strong className="text-rose-700">záporné číslo</strong>, znamená to, že bylo vydáno více sudů, než bylo stočeno a naskladněno — chybí sudy!
        </p>
      </div>


      {/* Souhrn */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Počáteční stav</span>
          <div className="font-display font-black text-xl text-neutral-900">{totals.initial} ks</div>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Stáčení KEG (+)</span>
          <div className="font-display font-black text-xl text-emerald-600">+{totals.stacenoKeg} ks</div>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Výdeje (−)</span>
          <div className="font-display font-black text-xl text-rose-600">−{totals.objednavky + totals.stacenoLahve + totals.fasovani + totals.prodejna + totals.akce + totals.odpisy} ks</div>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Stav na konci měsíce</span>
          <div className="font-display font-black text-xl">
            {totals.endStock < 0 ? (
              <span className="px-2 py-0.5 rounded bg-rose-600 text-white">{totals.endStock} ks</span>
            ) : (
              <span className="text-neutral-900">{totals.endStock} ks</span>
            )}
          </div>
          {totals.endStock < 0 && <span className="text-[11px] text-rose-700 font-bold"><AlertTriangle className="ikona-text" /> Chybí {Math.abs(totals.endStock)} sudů!</span>}
        </div>
      </div>

      {/* Tabulka */}
      <div className="card p-6 bg-white border border-neutral-200/90 rounded shadow-xs space-y-4">
        <div className="border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900">Přehled sudů podle piva a obalu</h3>
          <p className="text-xs text-neutral-500 font-bold">Bilance: Počáteční + Stáčení KEG = Objednávky + Stáčení lahví + Fasování + Prodejna + Akce + Odpisy + Stav na konci měsíce</p>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-10 text-xs font-bold text-neutral-500">
            <p>Pro měsíc {currentMonth} nejsou žádné pohyby sudů.</p>
          </div>
        ) : (
          <>
          {/* Mobilní karty — čitelné bez vodorovného scrollování napříč 11 sloupci */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {rows.map((r) => {
              const beer = beers.find((b) => b.id === r.beer_id);
              const isDark = beer && beerText(beer) === 'text-white';
              const textColor = isDark ? 'text-white' : 'text-neutral-950';
              const metrics: { label: string; value: string; cls: string }[] = [
                { label: 'Počátek', value: String(r.initialQty), cls: 'bg-white/70 text-neutral-900' },
                { label: 'Stáč. KEG', value: `+${r.stacenoKegQty}`, cls: 'bg-emerald-50 text-emerald-800' },
                { label: 'Objedn.', value: `−${r.objednavkyQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Stáč. lahví', value: `−${r.stacenoLahveQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Fasování', value: `−${r.fasovaniQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Prodejna', value: `−${r.prodejnaQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Akce', value: `−${r.akceQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Odpisy', value: `−${r.odpisyQty}`, cls: 'bg-white/70 text-rose-700' },
                { label: 'Konec', value: String(r.endStockQty), cls: r.endStockQty < 0 ? 'bg-rose-600 text-white' : 'bg-amber-500 text-neutral-950' },
              ];
              return (
                <div key={`${r.beer_id}__${r.package_id}`} className="plocha-z-dat plocha-z-dat-tlumena rounded border border-neutral-200 p-3 space-y-2" style={beer ? { backgroundColor: beerBg(beer), ['--ink-plochy' as any]: beerInk(beer) } : undefined}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-black text-sm ${textColor}`}>{r.beer_name}</span>
                    <span className={`font-bold text-xs ${textColor} opacity-80`}>{formatPackageLabel(r.package_label)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {metrics.map((m) => (
                      <div key={m.label} className={`rounded py-1.5 ${m.cls}`}>
                        <div className="text-[11px] font-black uppercase opacity-80">{m.label}</div>
                        <div className="text-xs font-black">{m.value} ks</div>
                      </div>
                    ))}
                  </div>
                  {r.endStockQty < 0 && <div className="text-[11px] text-rose-700 font-black"><AlertTriangle className="ikona-text" /> Chybí {Math.abs(r.endStockQty)} ks!</div>}
                </div>
              );
            })}
            <div className="rounded bg-neutral-200 p-3 space-y-2">
              <div className="font-black text-sm text-neutral-900"><PackageIcon className="ikona-text" /> CELKEM</div>
              <div className="grid grid-cols-3 gap-1.5 text-center text-[11px] font-bold text-neutral-800">
                <div>Počátek {totals.initial}</div>
                <div className="text-emerald-700">+{totals.stacenoKeg} KEG</div>
                <div className="text-rose-700">−{totals.objednavky} obj.</div>
                <div className="text-rose-700">−{totals.stacenoLahve} lah.</div>
                <div className="text-rose-700">−{totals.fasovani} fas.</div>
                <div className="text-rose-700">−{totals.prodejna} prod.</div>
                <div className="text-rose-700">−{totals.akce} akce</div>
                <div className="text-rose-700">−{totals.odpisy} odp.</div>
                <div className="font-black text-neutral-950">{totals.endStock} ks konec</div>
              </div>
            </div>
          </div>

          <div className="hidden md:block overflow-x-auto scrollbar-thin">
            <table className="table text-xs">
              <thead>
                <tr>
                  <th>Pivo</th>
                  <th>Obal</th>
                  <th className="text-right">Poč. stav</th>
                  <th className="text-right text-emerald-700">Stáčení KEG</th>
                  <th className="text-right text-rose-700">Objednávky</th>
                  <th className="text-right text-rose-700">Stáč. lahví</th>
                  <th className="text-right text-rose-700">Fasování</th>
                  <th className="text-right text-rose-700">Prodejna</th>
                  <th className="text-right text-rose-700">Akce</th>
                  <th className="text-right text-rose-700">Odpisy</th>
                  <th className="text-right bg-amber-50 border-x border-amber-200 text-amber-950 font-black">Stav konec měsíce</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const beer = beers.find((b) => b.id === r.beer_id);
                  const isDark = beer && beerText(beer) === 'text-white';
                  const textColor = isDark ? 'text-white' : 'text-neutral-950';

                  return (
                    <tr key={`${r.beer_id}__${r.package_id}`} className="plocha-z-dat plocha-z-dat-tlumena hover:brightness-95 transition-colors border-b border-neutral-200/60" style={beer ? { backgroundColor: beerBg(beer), ['--ink-plochy' as any]: beerInk(beer) } : undefined}>
                      <td className={`font-black text-[11px] ${textColor}`}>{r.beer_name}</td>
                      <td className={`font-extrabold text-[11px] ${textColor}`}>{formatPackageLabel(r.package_label)}</td>
                      <td className={`text-right font-black text-[11px] ${textColor}`}>{r.initialQty}</td>
                      <td className={`text-right font-black text-[11px] text-emerald-800 font-black`}>+{r.stacenoKegQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.objednavkyQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.stacenoLahveQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.fasovaniQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.prodejnaQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.akceQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-800 font-black`}>−{r.odpisyQty}</td>
                      <td className={`text-right font-mono font-black text-[11px] bg-amber-100/90 border-x border-amber-300 ${r.endStockQty < 0 ? 'text-rose-800' : 'text-neutral-950'}`}>
                        {r.endStockQty} ks
                        {r.endStockQty < 0 && <span className="block text-[11px] text-rose-700 font-black"><AlertTriangle className="ikona-text" /> chybí {Math.abs(r.endStockQty)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-200 text-neutral-950 font-black text-xs border-t-2 border-neutral-300">
                  <td colSpan={2} className="text-neutral-900">CELKEM</td>
                  <td className="text-right text-neutral-900">{totals.initial}</td>
                  <td className="text-right text-emerald-700">+{totals.stacenoKeg}</td>
                  <td className="text-right text-rose-700">−{totals.objednavky}</td>
                  <td className="text-right text-rose-700">−{totals.stacenoLahve}</td>
                  <td className="text-right text-rose-700">−{totals.fasovani}</td>
                  <td className="text-right text-rose-700">−{totals.prodejna}</td>
                  <td className="text-right text-rose-700">−{totals.akce}</td>
                  <td className="text-right text-rose-700">−{totals.odpisy}</td>
                  <td className={`text-right bg-amber-50 border-x border-amber-200 ${totals.endStock < 0 ? 'text-rose-700' : 'text-neutral-900'}`}>{totals.endStock} ks</td>
                </tr>
              </tfoot>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

