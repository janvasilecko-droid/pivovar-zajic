import { useState, useEffect, useMemo, useRef } from 'react';


import { supabase, Beer, Package, useRealtime, formatPackageLabel, beerBg, beerText, beerName } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { ClipboardCheck, Plus, Save, Download, Lock, RefreshCw, AlertCircle, CheckCircle2, RotateCcw, Calendar, Camera } from 'lucide-react';
import { CountFromImage } from '../components/CountFromImage';
import { getStartingStockMap, computeInventoryReconciliation } from '../lib/inventoryHelper';

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
  zdRows: any[]
): Record<string, number> {
  return getStartingStockMap(monthKey, invRowsAll, btRows, kgRows, faRows, fpRows, woRows, 0, zdRows);
}

export default function InventoryScreen() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inventory' | 'initial_stock' | 'end_stock'>('inventory');
  const loadCountRef = useRef(0);
  const loadedMonthRef = useRef<string | null>(null);
  const forceReloadRef = useRef(false);
  const excelFileRef = useRef<HTMLInputElement>(null);


  const [currentMonth, setCurrentMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

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
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showPhotoCounter, setShowPhotoCounter] = useState(false);

  // Data pro "Stav na konci měsíce" (bilanční konto sudů)
  const [objednavkyMap, setObjednavkyMap] = useState<Record<string, number>>({}); // Objednávky (kegy)
  const [stacenoLahveMap, setStacenoLahveMap] = useState<Record<string, number>>({}); // Stáčení lahví (kegy použité na lahve)
  const [fasovaniMap, setFasovaniMap] = useState<Record<string, number>>({}); // Fasování
  const [prodejnaMap, setProdejnaMap] = useState<Record<string, number>>({}); // Prodejna
  const [akceMap, setAkceMap] = useState<Record<string, number>>({}); // Akce (odvezené kegy)
  const [odpisyMap, setOdpisyMap] = useState<Record<string, number>>({}); // Odpisy (kegy)
  const [stacenoKegMap, setStacenoKegMap] = useState<Record<string, number>>({}); // Stáčení KEG

  async function loadData() {
    const loadId = ++loadCountRef.current;
    setLoading(true);

    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo }, { data: inv }, { data: adj }, { data: zd }, { data: ak }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('beer_id,package_id,quantity,entry_date,kegs_used,kegs_used_package_id,source_volume_l,note,created_at'),
      supabase.from('kegging').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('fasovani').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('fasovani_private').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('writeoffs').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('inventory').select('beer_id,package_id,quantity,entry_date,note'),
      supabase.from('inventory_adjustments').select('beer_id,package_id,quantity,entry_date,created_at'),
      // Odpočet objednávek — stejný zdroj (zavoz_deductions) jako obrazovka Sklad, aby se
      // čísla shodovala i po dodatečné změně data doručení objednávky (viz Stock.tsx).
      supabase.from('zavoz_deductions').select('deduct_date,beer_id,package_id,quantity'),
      supabase.from('akce').select('entry_date,items:akce_items(beer_id,package_id,quantity_taken,quantity_returned)'),
    ]);

    if (loadId !== loadCountRef.current) return;

    setBeers((b as Beer[]) ?? []);
    setPackages((pk as Package[]) ?? []);

    const invRowsAll = ((inv as any[]) ?? []);

    const shouldReloadState = loadedMonthRef.current !== currentMonth || forceReloadRef.current;

    // 1. POČÁTEČNÍ STAVY pro aktuální měsíc (currentMonth) s automatickou kontinuitou z předchozího měsíce
    const invAcc = computeInitialStockForMonth(
      currentMonth,
      invRowsAll,
      (bt as any[]) ?? [],
      (kg as any[]) ?? [],
      (fa as any[]) ?? [],
      (fp as any[]) ?? [],
      (wo as any[]) ?? [],
      (zd as any[]) ?? []
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
      setActualStock(curActual);
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
      setDorovnatMap(curAdj);
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

  useRealtime(['beers', 'packages', 'bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs', 'inventory', 'inventory_adjustments', 'zavoz_deductions'], loadData);



  // Uložení počátečního stavu z rozjetého měsíce do databáze (inventory tabulka)
  async function handleSaveInitialStock() {
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
      setSaveMsg('Počáteční stavy skladu byly v pořádku uloženy!');
      forceReloadRef.current = true;
      await loadData();
    } catch (e) {
      console.error(e);
      setSaveMsg('Chyba při ukládání počátečních stavů!');
    }
    setTimeout(() => setSaveMsg(null), 3000);
    setBusy(false);
  }


  // Uložení fyzické inventury do Supabase i localStorage
  async function handleSaveActualStock() {
    setBusy(true);
    try {
      const entryDate = currentMonth + '-01';
      const snapshotRows = rows.map((r) => ({
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        quantity: r.actualQty,
      })).filter((r) => r.quantity > 0);
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

      setSaveMsg('Fyzická inventura i dorovnání byla v pořádku uložena do databáze!');
      forceReloadRef.current = true;
      await loadData();
    } catch (e) {
      console.error(e);
      setSaveMsg('Chyba při ukládání fyzické inventury!');
    }
    setTimeout(() => setSaveMsg(null), 3000);
    setBusy(false);
  }

  // Schválení inventury a převod fyzického stavu jako počáteční stav nového měsíce
  async function handleLockAndTransferNextMonth() {
    if (!window.confirm(`Chceš schválit inventuru za ${currentMonth} a převést fyzické stavy jako počáteční stav do nového měsíce?`)) return;

    const [y, m] = currentMonth.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const nextMonthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;
    const nextEntryDate = nextMonthKey + '-01';
    const curEntryDate = currentMonth + '-01';

    setBusy(true);
    try {
      const currentSnapshotRows = rows.map((r) => ({
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        quantity: r.actualQty,
      })).filter((r) => r.quantity > 0);
      const nextSnapshotRows = rows.map((r) => ({
        beer_id: r.beer_id,
        beer_name: r.beer_name,
        package_id: r.package_id,
        package_label: r.package_label,
        quantity: r.actualQty,
      })).filter((r) => r.quantity > 0);

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

      alert(`Inventura za ${currentMonth} byla schválena a stavy byly převedeny jako počáteční stav (Poč.) do měsíce ${nextMonthKey}.`);
      
      // Nastavíme příznaky pro vynucené načtení nových stavů z DB
      forceReloadRef.current = true;
      setCurrentMonth(nextMonthKey);
    } catch (e) {
      console.error(e);
      alert('Chyba při převodu inventury do nového měsíce!');
    }
    setBusy(false);
  }


  // Výpočet tabulky inventury
  const rows: InventoryRow[] = useMemo(() => {
    const list: InventoryRow[] = [];

    beers.forEach((b) => {
      packages.forEach((p) => {
        const k = `${b.id}__${p.id}`;

        const initialQty = Number(initialStock[k] || 0);
        const stacenoQty = Number(stacenoMap[k] || 0);
        const odpisQty = Number(odpisyMap[k] || 0);
        const vydejQty = Number(vydejMap[k] || 0);

        const expectedQty = initialQty + stacenoQty - odpisQty - vydejQty;

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
  }, [beers, packages, initialStock, actualStock, dorovnatMap, stacenoMap, odpisyMap, vydejMap]);

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
        return acc;
      },
      { initial: 0, staceno: 0, odpis: 0, vydej: 0, expected: 0, actual: 0, diffQty: 0, diffCzk: 0, dorovnat: 0, diffAfterQty: 0, diffAfterCzk: 0 }
    );
  }, [rows]);

    // Import z Excelu / Google Tabulek
  async function handleExcelImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array' });
      const targetSheetName = wb.SheetNames.find((s) => /červenec|cervenec|inventura|lahve|sklo|stáčení|keg/i.test(s)) || wb.SheetNames[0];
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
        alert(`Úspěšně naimportováno ${matchCount} položek z Excelu/Google Tabulky pro měsíc ${currentMonth}!`);
      } else {
        alert('V souboru nebyly nalezeny žádné odpovídající položky piva a obalu. Zkontrolujte strukturu tabulky.');
      }
    } catch (err: any) {
      alert('Chyba při čtení Excel souboru: ' + (err?.message ?? String(err)));
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
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded-3xl border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <ClipboardCheck size={18} />
            <span>Měsíční uzávěrky & Skladové bilanční konto</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>📋 Poctivá skladová Inventura</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Zadej zásoby z minulého měsíce / počáteční stav a porovnej teoretický stav se skutečností ve skladu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-neutral-800 border border-neutral-700 px-2 py-1.5 rounded-2xl text-xs font-bold">
            <button
              onClick={() => setCurrentMonth(shiftMonth(currentMonth, -1))}
              className="px-2 py-1 rounded-lg bg-neutral-700 hover:bg-amber-500 hover:text-neutral-950 text-white font-black transition"
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
              className="px-2 py-1 rounded-lg bg-neutral-700 hover:bg-amber-500 hover:text-neutral-950 text-white font-black transition"
              title="Následující měsíc"
            >
              ›
            </button>
          </div>


          <button
            onClick={() => setShowPhotoCounter(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
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
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-amber-950 font-black text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <span>📥 Import Excel / Google Tabulky</span>
          </button>
          <button
            onClick={exportInventoryExcel}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Export Excel
          </button>

          <button
            onClick={handleLockAndTransferNextMonth}
            className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-amber-950 border border-neutral-700 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Lock size={16} /> Schválit & Převést do nového měsíce
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className="p-4 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-black flex items-center gap-2">
          <CheckCircle2 size={18} className="text-emerald-700" />
          <span>{saveMsg}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'inventory'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <ClipboardCheck size={16} />
          <span>📊 Fyzická inventura & Manko/Přebytek</span>
        </button>

        <button
          onClick={() => setActiveTab('initial_stock')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'initial_stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <RotateCcw size={16} />
          <span>🏁 Nastavit Počáteční stav zásoby (K 1. dni v měsíci)</span>
        </button>

        <button
          onClick={() => setActiveTab('end_stock')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'end_stock'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <ClipboardCheck size={16} />
          <span>🛢️ Stav sudů na konci měsíce</span>
        </button>
      </div>


      {/* TAB 1: FYZICKÁ INVENTURA & ROZDÍLY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="card p-3.5 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Počáteční stav</span>
              <div className="font-display font-black text-lg text-neutral-900">{totals.initial} ks</div>
              <span className="text-[10px] text-neutral-500">Převedeno z minulého měsíce</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-700">Nově stočeno (+)</span>
              <div className="font-display font-black text-lg text-amber-600">+{totals.staceno} ks</div>
              <span className="text-[10px] text-neutral-500">Zapsáno ve Stáčení</span>
            </div>
            <div className="card p-3.5 bg-white border border-rose-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-rose-600">Odpisy (− odpis)</span>
              <div className="font-display font-black text-lg text-rose-700">-{totals.odpis} ks</div>
              <span className="text-[10px] text-neutral-500">Zapsáno v Odpisech</span>
            </div>
            <div className="card p-3.5 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-800">Vytočeno/Výdej (−)</span>
              <div className="font-display font-black text-lg text-amber-800">-{totals.vydej} ks</div>
              <span className="text-[10px] text-neutral-500">Fasování + Prodejna + Objednávky</span>
            </div>
            <div className={`card p-3.5 rounded-2xl space-y-1 border shadow-md ${
              totals.expected < 0
                ? 'bg-rose-950 text-white border-rose-500/80 ring-2 ring-rose-500/30'
                : 'bg-emerald-950 text-white border-emerald-500/50'
            }`}>
              <span className={`text-[10px] font-black uppercase ${totals.expected < 0 ? 'text-rose-900' : 'text-emerald-900'}`}>📦 ZBYDE SKLADEM (Oček.)</span>
              <div className={`font-display font-black text-xl ${totals.expected < 0 ? 'text-rose-900' : 'text-emerald-900'}`}>{totals.expected} ks</div>
              <span className={`text-[10px] ${totals.expected < 0 ? 'text-rose-200' : 'text-emerald-200'}`}>Teoretický zůstatek</span>
            </div>
            <div className="card p-3.5 bg-neutral-900 text-white rounded-2xl space-y-1 border border-neutral-800 shadow-md">
              <span className="text-[10px] font-black uppercase text-amber-400">Celkové Manko/Přebytek</span>
              <div className={`font-display font-black text-lg ${totals.diffQty < 0 ? 'text-rose-900' : totals.diffQty > 0 ? 'text-emerald-900' : 'text-white'}`}>
                {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty} ks ({totals.diffCzk.toLocaleString('cs-CZ')} Kč)
              </div>
              <span className="text-[10px] text-neutral-400">Fyzický vs Systémový stav</span>
              <span className="block pt-1 border-t border-neutral-800 text-[10px] font-bold text-neutral-300">
                Dorovnáno: {totals.dorovnat > 0 ? `+${totals.dorovnat}` : totals.dorovnat} ks ·
                <span className={totals.diffAfterQty === 0 ? 'text-emerald-400' : totals.diffAfterQty < 0 ? 'text-rose-400' : 'text-amber-300'}>
                  {' '}po dorovnání: {totals.diffAfterQty > 0 ? `+${totals.diffAfterQty}` : totals.diffAfterQty} ks ({totals.diffAfterCzk.toLocaleString('cs-CZ')} Kč)
                </span>
              </span>
              <span className="text-[9px] text-neutral-500">Dorovnání se ukládá bokem a nepočítá se do stáčení ani odpočtů.</span>
            </div>
          </div>

          <div className="card p-5 bg-white border border-neutral-200/90 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900">Bilanční tabulka piva & Obalů k datu</h3>
                <p className="text-xs text-neutral-500 font-bold">Do sloupce Inventura zadej ručně přesný spočítaný stav na konci měsíce (výchozí 0 ks). Sloupec DOROVNAT (±) přičte/ubírá k očekávanému stavu, aby seděl s realitou — ukládá se bokem a nepočítá se do stáčení ani odpočtů.</p>
              </div>
              <button
                onClick={handleSaveActualStock}
                disabled={busy}
                className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
              >
                <Save size={16} /> Uložit fyzické stavy
              </button>
            </div>

            {rows.length === 0 ? (
              <div className="text-center py-10 text-xs font-bold text-neutral-500 space-y-2">
                <p>Pro měsíc {currentMonth} zatím nebyly zadané žádné počáteční stavy ani pohyby.</p>
                <button
                  onClick={() => setActiveTab('initial_stock')}
                  className="px-4 py-2 rounded-xl bg-amber-500 text-neutral-950 font-black text-xs shadow-xs"
                >
                  + Zadat počáteční zásoby na skladě
                </button>
              </div>
            ) : (
              <>
              {/* Mobilní karty — editace inventury a dorovnání bez vodorovného scrollování */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {rows.map((r) => {
                  const k = `${r.beer_id}__${r.package_id}`;
                  const beer = beers.find((b) => b.id === r.beer_id);
                  return (
                    <div key={k} className="rounded-2xl border border-neutral-200 overflow-hidden" style={beer ? { backgroundColor: beerBg(beer) } : undefined}>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`font-black text-sm ${beer && beerText(beer) === 'text-white' ? 'text-white' : 'text-neutral-950'}`}>
                            {r.beer_name} <span className="font-bold opacity-80">· {formatPackageLabel(r.package_label)}</span>
                          </div>
                          <span className={`shrink-0 px-2 py-1 rounded-lg text-xs font-black ${r.expectedQty < 0 ? 'bg-rose-600 text-white' : 'bg-emerald-300/80 text-emerald-950'}`}>
                            Oček. {r.expectedQty} ks
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[10px] font-black uppercase text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded-md inline-block mb-1">Inventura</span>
                            <input
                              type="number"
                              min="0"
                              inputMode="numeric"
                              className="input !py-2 text-center font-mono font-black text-base text-neutral-950 border-amber-400 bg-amber-100/80 w-full rounded-xl shadow-inner focus:ring-2 focus:ring-amber-500"
                              value={actualStock[k] !== undefined ? actualStock[k] : ''}
                              onChange={(e) => setActualStock((prev) => ({ ...prev, [k]: e.target.value }))}
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10px] font-black uppercase text-sky-800 bg-sky-50 px-1.5 py-0.5 rounded-md inline-block mb-1">Dorovnat (±)</span>
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                inputMode="numeric"
                                className="input !py-2 text-center font-mono font-black text-base text-neutral-950 border-sky-400 bg-sky-100/80 w-full rounded-xl shadow-inner focus:ring-2 focus:ring-sky-500"
                                placeholder="±"
                                value={dorovnatMap[k] !== undefined ? dorovnatMap[k] : ''}
                                onChange={(e) => setDorovnatMap((prev) => ({ ...prev, [k]: e.target.value }))}
                              />
                              <button
                                type="button"
                                onClick={() => setDorovnatMap((prev) => ({ ...prev, [k]: String(r.diffQty) }))}
                                className="shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-sky-200/70 hover:bg-sky-300 text-sky-950 font-black text-sm transition"
                                title={`Dorovnat dle manka (nastavit na ${r.diffQty} ks)`}
                              >
                                ⟳
                              </button>
                            </div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs font-bold">
                          <span className={r.diffQty < 0 ? 'text-rose-700' : r.diffQty > 0 ? 'text-emerald-700' : 'text-neutral-500'}>
                            Manko: {r.diffQty > 0 ? `+${r.diffQty}` : r.diffQty} ks ({r.diffCzk.toLocaleString('cs-CZ')} Kč)
                          </span>
                          {r.dorovnatQty !== 0 && (
                            <span className={r.diffAfterQty === 0 ? 'text-emerald-700' : r.diffAfterQty < 0 ? 'text-rose-700' : 'text-amber-700'}>
                              Po dorovnání: {r.diffAfterQty > 0 ? `+${r.diffAfterQty}` : r.diffAfterQty} ks{r.diffAfterQty === 0 ? ' ✓' : ''}
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-neutral-500 flex flex-wrap gap-x-2.5 gap-y-0.5 pt-1 border-t border-black/10">
                          <span>Poč. {r.initialQty}</span>
                          <span>Stočeno +{r.stacenoQty}</span>
                          <span>Odpis −{r.odpisQty}</span>
                          <span>Výdej −{r.vydejQty}</span>
                        </div>
                      </div>
                    </div>
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
                      <th className="py-2.5 px-3 text-right bg-emerald-600 text-white font-black rounded-t-lg">ZBYDE (Oček.)</th>
                      <th className="py-2.5 px-3 text-right bg-amber-500 text-neutral-950 font-black rounded-t-lg">INVENTURA</th>
                      <th className="py-2.5 px-3 text-right bg-sky-500 text-white font-black rounded-t-lg" title="Dorovnání (±) — přičti nebo uber k očekávanému stavu, aby seděl s fyzickou realitou. Ukládá se BOKEM a NEpočítá se do stáčení ani odpočtů.">DOROVNAT (±)</th>
                      <th className="py-2.5 px-2 text-right font-black">MANKO</th>
                      <th className="py-2.5 px-2 text-right font-black" title="Manko po započtení dorovnání (INVENTURA − Dorovnaný stav)">PO DOROVNÁNÍ</th>
                      <th className="py-2.5 px-3 text-right font-black">ROZDÍL (Kč)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = `${r.beer_id}__${r.package_id}`;
                      const beer = beers.find((b) => b.id === r.beer_id);
                      const isDark = beer && beerText(beer) === 'text-white';
                      const textColor = isDark ? 'text-white' : 'text-neutral-950';

                      return (
                        <tr key={k} className="hover:brightness-95 transition-colors border-b border-neutral-200/60" style={beer ? { backgroundColor: beerBg(beer) } : undefined}>
                          <td className={`font-black text-[11px] px-3 py-2 ${textColor}`}>{r.beer_name}</td>
                          <td className={`font-extrabold text-[11px] px-3 py-2 ${textColor}`}>{formatPackageLabel(r.package_label)}</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 ${textColor}`}>{r.initialQty} ks</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 text-amber-900 font-black`}>+{r.stacenoQty}</td>
                          <td className={`text-right font-black text-[11px] px-2 py-2 text-rose-850 font-black`}>{r.odpisQty > 0 ? `-${r.odpisQty}` : '-0'}</td>
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
                          <td className="text-right bg-amber-50/90 border-x border-amber-300 px-3 py-2">
                            <input
                              type="number"
                              min="0"
                              className="input !py-1 text-right font-mono font-black text-xs text-neutral-950 border-amber-400 bg-amber-100/80 w-24 ml-auto rounded-xl shadow-inner focus:ring-2 focus:ring-amber-500"
                              value={actualStock[k] !== undefined ? actualStock[k] : ''}
                              onChange={(e) => setActualStock((prev) => ({ ...prev, [k]: e.target.value }))}
                            />
                          </td>
                          <td className="text-right bg-sky-50/90 border-x border-sky-300 px-2 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                className="input !py-1 text-right font-mono font-black text-xs text-neutral-950 border-sky-400 bg-sky-100/80 w-20 ml-auto rounded-xl shadow-inner focus:ring-2 focus:ring-sky-500"
                                placeholder="±"
                                value={dorovnatMap[k] !== undefined ? dorovnatMap[k] : ''}
                                onChange={(e) => setDorovnatMap((prev) => ({ ...prev, [k]: e.target.value }))}
                                title="Zadej, o kolik kusů se má očekávaný stav dorovnat (+ přidat, − ubrat), aby seděl s realitou. Ukládá se bokem a nepočítá se do stáčení ani odpočtů."
                              />
                              <button
                                type="button"
                                onClick={() => setDorovnatMap((prev) => ({ ...prev, [k]: String(r.diffQty) }))}
                                className="shrink-0 p-1 rounded-lg bg-sky-200/70 hover:bg-sky-300 text-sky-950 font-black text-[10px] leading-none transition"
                                title={`Dorovnat dle manka (nastavit na ${r.diffQty} ks)`}
                              >
                                ⟳
                              </button>
                            </div>
                            {r.dorovnatQty !== 0 && (
                              <div className="mt-0.5 text-[9px] font-black text-sky-800">
                                Dorovnáno: {r.reconciledQty} ks
                              </div>
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
                              <span className="ml-1 text-[9px] font-black text-emerald-700">✓ dorovnáno</span>
                            )}
                          </td>
                          <td className={`text-right font-black text-[11px] px-3 py-2 ${
                            r.diffCzk < 0 ? (isDark ? 'text-rose-900' : 'text-rose-800') : r.diffCzk > 0 ? (isDark ? 'text-emerald-900' : 'text-emerald-800') : textColor
                          }`}>
                            {r.diffCzk.toLocaleString('cs-CZ')} Kč
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-neutral-200 text-slate-950 font-black text-xs border-t-2 border-neutral-300">
                      <td colSpan={2} className="px-3 py-2.5 text-amber-400 font-display">CELKEM SOUHRN</td>
                      <td className="text-right px-2 py-2.5 text-slate-950">{totals.initial} ks</td>
                      <td className="text-right px-2 py-2.5 text-amber-400">+{totals.staceno}</td>
                      <td className="text-right px-2 py-2.5 text-rose-900">-{totals.odpis}</td>
                      <td className="text-right px-2 py-2.5 text-amber-950">-{totals.vydej}</td>
                      <td className={`text-right px-3 py-2.5 font-mono text-sm border-x ${
                        totals.expected < 0
                          ? 'bg-rose-950/90 text-rose-900 border-rose-700 font-black'
                          : 'bg-emerald-950/80 text-emerald-900 border-emerald-700 font-black'
                      }`}>{totals.expected} ks</td>
                      <td className="text-right px-3 py-2.5 text-amber-950 font-mono text-sm bg-amber-950/80 border-x border-amber-700">{totals.actual} ks</td>
                      <td className={`text-right px-3 py-2.5 font-mono text-sm bg-sky-950/80 border-x border-sky-700 ${totals.dorovnat === 0 ? 'text-sky-300' : totals.dorovnat < 0 ? 'text-rose-300' : 'text-sky-200'}`}>
                        {totals.dorovnat > 0 ? `+${totals.dorovnat}` : totals.dorovnat} ks
                      </td>
                      <td className={`text-right px-2 py-2.5 font-mono text-sm ${totals.diffQty < 0 ? 'text-rose-900' : totals.diffQty > 0 ? 'text-emerald-900' : 'text-slate-950'}`}>
                        {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty} ks
                      </td>
                      <td className={`text-right px-2 py-2.5 font-mono text-sm ${totals.diffAfterQty < 0 ? 'text-rose-900' : totals.diffAfterQty > 0 ? 'text-emerald-900' : 'text-slate-950'}`}>
                        {totals.diffAfterQty > 0 ? `+${totals.diffAfterQty}` : totals.diffAfterQty} ks
                      </td>
                      <td className={`text-right px-3 py-2.5 ${totals.diffCzk < 0 ? 'text-rose-900' : totals.diffCzk > 0 ? 'text-emerald-900' : 'text-slate-950'}`}>
                        {totals.diffCzk.toLocaleString('cs-CZ')} Kč
                      </td>
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
        <div className="card p-6 bg-white border border-neutral-200 rounded-3xl space-y-5 shadow-xs">
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
              className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
            >
              <Save size={16} /> Uložit počáteční zásoby
            </button>
          </div>

          <div className="space-y-6">
            {beers.map((b) => (
              <div key={b.id} className="p-4 rounded-3xl bg-neutral-50 border border-neutral-200 space-y-3">
                <h4 className="font-display font-black text-base text-neutral-900 border-b border-neutral-200 pb-2 flex items-center gap-2">
                  <span>🍺 {b.name}</span>
                  {b.degree && <span className="text-xs text-neutral-500 font-bold">({b.degree})</span>}
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  {packages.map((p) => {
                    const k = `${b.id}__${p.id}`;
                    return (
                      <div key={p.id} className="p-3 bg-white rounded-2xl border border-neutral-200 space-y-1">
                        <label className="block text-[11px] font-black uppercase text-neutral-600 truncate">
                          {formatPackageLabel(p.label)}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            className="input inventory-input !py-1.5 font-mono font-black text-sm text-slate-900 bg-white"
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
          onMonthChange={setCurrentMonth}
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
  onMonthChange,
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
  onMonthChange: (m: string) => void;
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
      <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-xs text-sky-950 font-medium space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-black text-sky-900">🛢️ Bilanční konto sudů za {monthLabel}</p>
          <div className="flex items-center gap-1 bg-white border border-sky-300 px-2 py-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => onMonthChange(shiftMonth(currentMonth, -1))}
              className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-black transition"
              title="Předchozí měsíc"
            >
              ‹
            </button>
            <div className="flex items-center gap-1 px-1">
              <Calendar size={14} className="text-sky-700" />
              <input
                type="month"
                value={currentMonth}
                onChange={(e) => onMonthChange(e.target.value)}
                className="bg-transparent text-sky-900 font-mono font-black border-none focus:outline-none"
              />
            </div>
            <button
              onClick={() => onMonthChange(shiftMonth(currentMonth, 1))}
              className="px-2 py-0.5 rounded-lg bg-sky-100 hover:bg-sky-200 text-sky-900 font-black transition"
              title="Následující měsíc"
            >
              ›
            </button>
          </div>
        </div>
        <p>
          <strong>Stav na konci měsíce</strong> = Počáteční stav + Stáčení KEG − (Objednávky + Stáčení lahví + Fasování + Prodejna + Akce + Odpisy)
        </p>
        <p className="text-sky-800">
          Pokud vyjde <strong className="text-rose-700">záporné číslo</strong>, znamená to, že bylo vydáno více sudů, než bylo stočeno a naskladněno — chybí sudy!
        </p>
      </div>


      {/* Souhrn */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-500">Počáteční stav</span>
          <div className="font-display font-black text-xl text-neutral-900">{totals.initial} ks</div>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-500">Stáčení KEG (+)</span>
          <div className="font-display font-black text-xl text-emerald-600">+{totals.stacenoKeg} ks</div>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-500">Výdeje (−)</span>
          <div className="font-display font-black text-xl text-rose-600">−{totals.objednavky + totals.stacenoLahve + totals.fasovani + totals.prodejna + totals.akce + totals.odpisy} ks</div>
        </div>
        <div className={`card p-4 rounded-2xl space-y-1 ${totals.endStock < 0 ? 'bg-rose-600 text-white' : 'bg-neutral-900 text-white'}`}>
          <span className={`text-[10px] font-black uppercase ${totals.endStock < 0 ? 'text-rose-100' : 'text-amber-400'}`}>Stav na konci měsíce</span>
          <div className="font-display font-black text-xl">{totals.endStock} ks</div>
          {totals.endStock < 0 && <span className="text-[11px] text-rose-100 font-bold">⚠️ Chybí {Math.abs(totals.endStock)} sudů!</span>}
        </div>
      </div>

      {/* Tabulka */}
      <div className="card p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs space-y-4">
        <div className="border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900">Přehled sudů podle piva a obalu</h3>
          <p className="text-xs text-neutral-500 font-bold">Bilance: Počáteční + Stáčení KEG = Objednávky + Stáčení lahví + Fasování + Prodejna + Akce + Odpisy + Stav na konci měsíce</p>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-10 text-xs font-bold text-neutral-500">
            <p>Pro měsíc {currentMonth} nejsou žádné pohyby sudů.</p>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
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
                    <tr key={`${r.beer_id}__${r.package_id}`} className="hover:brightness-95 transition-colors border-b border-neutral-200/60" style={beer ? { backgroundColor: beerBg(beer) } : undefined}>
                      <td className={`font-black text-[11px] ${textColor}`}>{r.beer_name}</td>
                      <td className={`font-extrabold text-[11px] ${textColor}`}>{formatPackageLabel(r.package_label)}</td>
                      <td className={`text-right font-black text-[11px] ${textColor}`}>{r.initialQty}</td>
                      <td className={`text-right font-black text-[11px] text-emerald-850 font-black`}>+{r.stacenoKegQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.objednavkyQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.stacenoLahveQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.fasovaniQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.prodejnaQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.akceQty}</td>
                      <td className={`text-right font-black text-[11px] text-rose-850 font-black`}>−{r.odpisyQty}</td>
                      <td className={`text-right font-mono font-black text-[11px] bg-amber-100/90 border-x border-amber-300 ${r.endStockQty < 0 ? 'text-rose-800' : 'text-neutral-950'}`}>
                        {r.endStockQty} ks
                        {r.endStockQty < 0 && <span className="block text-[9px] text-rose-700 font-black">⚠️ chybí {Math.abs(r.endStockQty)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-200 text-slate-950 font-black text-xs border-t-2 border-neutral-300">
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
        )}
      </div>
    </div>
  );
}

