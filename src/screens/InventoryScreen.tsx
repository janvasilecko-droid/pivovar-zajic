import { useState, useEffect, useMemo } from 'react';
import { supabase, Beer, Package, useRealtime, formatPackageLabel, beerBg, beerText } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { ClipboardCheck, Plus, Save, Download, Lock, RefreshCw, AlertCircle, CheckCircle2, RotateCcw, Calendar, Camera } from 'lucide-react';
import { CountFromImage } from '../components/CountFromImage';

type InitialStockMap = Record<string, number>; // key: `${beer_id}__${package_id}`, val: qty

type InventoryRow = {
  beer_id: string;
  beer_name: string;
  package_id: string;
  package_label: string;
  price_czk: number;
  initialQty: number; // Počáteční stav k 1. dni v měsíci
  stacenoQty: number; // Nově stočeno tento měsíc
  vydejQty: number;   // Vytočeno (Fasování + Odpis + Prodejna)
  expectedQty: number; // Vypočtená teoretická zásoba
  actualQty: number;   // Zadaná skutečná fyzická inventura
  diffQty: number;     // Odchylka (Skutečnost - Očekávání)
  diffCzk: number;     // Finanční odchylka v Kč
};

export default function InventoryScreen() {
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inventory' | 'initial_stock' | 'history'>('inventory');

  const [currentMonth, setCurrentMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  // Počáteční stavy zadané ručně sládkem na začátku měsíce
  const [initialStock, setInitialStock] = useState<InitialStockMap>(() => {
    try {
      const saved = localStorage.getItem(`initial_stock_${currentMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Skutečně fyzicky spočítané stavy při inventuře
  const [actualStock, setActualStock] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(`actual_inventory_${currentMonth}`);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const [stacenoMap, setStacenoMap] = useState<Record<string, number>>({});
  const [vydejMap, setVydejMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [showPhotoCounter, setShowPhotoCounter] = useState(false);

  async function loadData() {
    setLoading(true);

    const [{ data: b }, { data: pk }, { data: bt }, { data: kg }, { data: fa }, { data: fp }, { data: wo }] = await Promise.all([
      supabase.from('beers').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('packages').select('*').order('sort_order'),
      supabase.from('bottling').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('kegging').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('fasovani').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('fasovani_private').select('beer_id,package_id,quantity,entry_date'),
      supabase.from('writeoffs').select('beer_id,package_id,quantity,entry_date'),
    ]);

    setBeers((b as Beer[]) ?? []);
    setPackages((pk as Package[]) ?? []);

    // Filtrovat pouze pro aktuálně vybraný měsíc (např. 2026-07)
    const filterMonth = (entry_date: string) => entry_date && entry_date.startsWith(currentMonth);

    // Příjem (Stáčení)
    const stacenoAcc: Record<string, number> = {};
    [...((bt as any[]) ?? []), ...((kg as any[]) ?? [])].filter((r) => filterMonth(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      stacenoAcc[k] = (stacenoAcc[k] || 0) + Number(r.quantity || 0);
    });
    setStacenoMap(stacenoAcc);

    // Výdej (Fasování + Prodejna + Odpisy)
    const vydejAcc: Record<string, number> = {};
    [...((fa as any[]) ?? []), ...((fp as any[]) ?? []), ...((wo as any[]) ?? [])].filter((r) => filterMonth(r.entry_date)).forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      vydejAcc[k] = (vydejAcc[k] || 0) + Number(r.quantity || 0);
    });
    setVydejMap(vydejAcc);

    setLoading(false);
  }

  useEffect(() => {
    loadData();
  }, [currentMonth]);

  useRealtime(['beers', 'packages', 'bottling', 'kegging', 'fasovani', 'fasovani_private', 'writeoffs'], loadData);

  // Uložení počátečního stavu z rozjetého měsíce
  function handleSaveInitialStock() {
    setBusy(true);
    localStorage.setItem(`initial_stock_${currentMonth}`, JSON.stringify(initialStock));
    setSaveMsg('Počáteční stavy skladu byly v pořádku uloženy!');
    setTimeout(() => setSaveMsg(null), 3000);
    setBusy(false);
  }

  // Uložení fyzické inventury
  function handleSaveActualStock() {
    setBusy(true);
    localStorage.setItem(`actual_inventory_${currentMonth}`, JSON.stringify(actualStock));
    setSaveMsg('Fyzická inventura byla uložena!');
    setTimeout(() => setSaveMsg(null), 3000);
    setBusy(false);
  }

  // Převod fyzického stavu jako počáteční stav nového měsíce
  function handleLockAndTransferNextMonth() {
    if (!window.confirm(`Chceš schválit inventuru za ${currentMonth} a převést fyzické stavy jako počáteční stav do nového měsíce?`)) return;

    const [y, m] = currentMonth.split('-');
    const nextDate = new Date(Number(y), Number(m), 1);
    const nextMonthKey = nextDate.toISOString().slice(0, 7);

    // Převedeme skutečné fyzické ks jako počáteční stavy nového měsíce
    const nextInitial: InitialStockMap = {};
    rows.forEach((r) => {
      const k = `${r.beer_id}__${r.package_id}`;
      nextInitial[k] = r.actualQty;
    });

    localStorage.setItem(`initial_stock_${nextMonthKey}`, JSON.stringify(nextInitial));
    alert(`Inventura ${currentMonth} byla úspěšně uzamčena! Počáteční stavy pro ${nextMonthKey} byly nastaveny.`);
    setCurrentMonth(nextMonthKey);
  }

  // Výpočet tabulky inventury
  const rows: InventoryRow[] = useMemo(() => {
    const list: InventoryRow[] = [];

    beers.forEach((b) => {
      packages.forEach((p) => {
        const k = `${b.id}__${p.id}`;

        const initialQty = Number(initialStock[k] || 0);
        const stacenoQty = Number(stacenoMap[k] || 0);
        const vydejQty = Number(vydejMap[k] || 0);

        const expectedQty = initialQty + stacenoQty - vydejQty;

        // Pokud je zadaný fyzický stav v políčku, použijeme ho, jinak bereme očkávání
        const actualInputStr = actualStock[k];
        const actualQty = actualInputStr !== undefined && actualInputStr !== '' ? Number(actualInputStr) : expectedQty;

        const diffQty = actualQty - expectedQty;
        const priceCzk = p.volume_l > 20 ? 1500 : p.volume_l > 0.6 ? 250 : 45; // Orientační hodnota
        const diffCzk = diffQty * priceCzk;

        // Zobrazit pouze položky, které mají počáteční stav, pohyb, nebo zadanou inventuru
        if (initialQty !== 0 || stacenoQty !== 0 || vydejQty !== 0 || actualInputStr !== undefined) {
          list.push({
            beer_id: b.id,
            beer_name: b.name,
            package_id: p.id,
            package_label: p.label,
            price_czk: priceCzk,
            initialQty,
            stacenoQty,
            vydejQty,
            expectedQty,
            actualQty,
            diffQty,
            diffCzk,
          });
        }
      });
    });

    return list;
  }, [beers, packages, initialStock, actualStock, stacenoMap, vydejMap]);

  // Totals
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.initial += r.initialQty;
        acc.staceno += r.stacenoQty;
        acc.vydej += r.vydejQty;
        acc.expected += r.expectedQty;
        acc.actual += r.actualQty;
        acc.diffQty += r.diffQty;
        acc.diffCzk += r.diffCzk;
        return acc;
      },
      { initial: 0, staceno: 0, vydej: 0, expected: 0, actual: 0, diffQty: 0, diffCzk: 0 }
    );
  }, [rows]);

  function exportInventoryExcel() {
    const dataToExport = rows.map((r) => ({
      Pivo: r.beer_name,
      Obal: formatPackageLabel(r.package_label),
      'Počáteční stav (ks)': r.initialQty,
      'Stočeno v měsíci (+ks)': r.stacenoQty,
      'Vytočeno/Fasováno (-ks)': r.vydejQty,
      'Systémové očekávání (ks)': r.expectedQty,
      'Skutečná inventura (ks)': r.actualQty,
      'Odchylka (ks)': r.diffQty,
      'Odchylka (Kč)': r.diffCzk,
    }));

    exportHistoryDetailToExcel(
      dataToExport,
      ['Pivo', 'Obal', 'Počáteční (ks)', 'Stočeno (+ks)', 'Vytočeno (-ks)', 'Očekávání (ks)', 'Fyzická inventura (ks)', 'Manko/Přebytek (ks)', 'Rozdíl (Kč)'],
      ['Pivo', 'Obal', 'Počáteční stav (ks)', 'Stočeno v měsíci (+ks)', 'Vytočeno/Fasováno (-ks)', 'Systémové očekávání (ks)', 'Skutečná inventura (ks)', 'Odchylka (ks)', 'Odchylka (Kč)'],
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
          <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-2xl text-xs font-bold">
            <Calendar size={15} className="text-amber-400" />
            <span>Měsíc:</span>
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              className="bg-transparent text-amber-300 font-mono font-black border-none focus:outline-none"
            />
          </div>

          <button
            onClick={() => setShowPhotoCounter(true)}
            className="px-3.5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5"
          >
            <Camera size={16} /> Spočítat z fotek (Bedny & Lahve)
          </button>

          <button
            onClick={exportInventoryExcel}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Export Excel
          </button>

          <button
            onClick={handleLockAndTransferNextMonth}
            className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-amber-300 border border-neutral-700 font-black text-xs transition shadow-md flex items-center gap-1.5"
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
      </div>

      {/* TAB 1: FYZICKÁ INVENTURA & ROZDÍLY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Počáteční stav</span>
              <div className="font-display font-black text-xl text-neutral-900">{totals.initial} ks</div>
              <span className="text-[11px] text-neutral-600">Převedeno z minulého měsíce</span>
            </div>
            <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Nově stočeno (+ příjmy)</span>
              <div className="font-display font-black text-xl text-amber-600">{totals.staceno} ks</div>
              <span className="text-[11px] text-neutral-600">Zapsáno ve Stáčení</span>
            </div>
            <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-neutral-500">Vytočeno (- výdeje)</span>
              <div className="font-display font-black text-xl text-rose-600">{totals.vydej} ks</div>
              <span className="text-[11px] text-neutral-600">Fasováno + Odpis + Prodejna</span>
            </div>
            <div className="card p-4 bg-neutral-900 text-white rounded-2xl space-y-1">
              <span className="text-[10px] font-black uppercase text-amber-400">Celková odchylka (Manko/Přebytek)</span>
              <div className={`font-display font-black text-xl ${totals.diffQty < 0 ? 'text-rose-400' : totals.diffQty > 0 ? 'text-emerald-400' : 'text-white'}`}>
                {totals.diffQty > 0 ? `+${totals.diffQty}` : totals.diffQty} ks ({totals.diffCzk.toLocaleString('cs-CZ')} Kč)
              </div>
              <span className="text-[11px] text-neutral-300">Fyzický vs Systémový stav</span>
            </div>
          </div>

          <div className="card p-6 bg-white border border-neutral-200/90 rounded-3xl shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <div>
                <h3 className="font-display font-black text-lg text-neutral-900">Bilanční tabulka piva & Obalů k datu</h3>
                <p className="text-xs text-neutral-500 font-bold">Do sloupce Skutečná inventura zadej přesný počet kusů ve skladu</p>
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
              <div className="overflow-x-auto scrollbar-thin">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Pivo</th>
                      <th>Obal</th>
                      <th className="text-right">Počáteční (ks)</th>
                      <th className="text-right">Stočeno (+ks)</th>
                      <th className="text-right">Vytočeno (-ks)</th>
                      <th className="text-right">Očekávaný stav (ks)</th>
                      <th className="text-right bg-amber-50 border-x border-amber-200 text-amber-950 font-black">Fyzická Skutečnost (ks)</th>
                      <th className="text-right">Manko / Přebytek (ks)</th>
                      <th className="text-right">Rozdíl (Kč)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = `${r.beer_id}__${r.package_id}`;
                      const beer = beers.find((b) => b.id === r.beer_id);

                      return (
                        <tr key={k} className="hover:brightness-95 transition-colors" style={beer ? { backgroundColor: beerBg(beer) } : undefined}>
                          <td className={`font-black text-sm ${beer ? (beerText(beer) === 'text-white' ? 'text-white' : 'text-neutral-950') : 'text-neutral-950'}`}>{r.beer_name}</td>
                          <td className="font-extrabold text-neutral-950 text-xs">{formatPackageLabel(r.package_label)}</td>
                          <td className="text-right font-bold text-neutral-800">{r.initialQty} ks</td>
                          <td className="text-right font-black text-amber-700">+{r.stacenoQty}</td>
                          <td className="text-right font-black text-rose-700">-{r.vydejQty}</td>
                          <td className="text-right font-mono font-black text-neutral-900 text-sm">{r.expectedQty} ks</td>
                          <td className="text-right bg-amber-50/80 border-x border-amber-200">
                            <input
                              type="number"
                              min="0"
                              className="input !py-1 text-right font-mono font-black text-sm text-neutral-950 border-amber-300 w-24 ml-auto"
                              value={actualStock[k] !== undefined ? actualStock[k] : r.expectedQty}
                              onChange={(e) => setActualStock((prev) => ({ ...prev, [k]: e.target.value }))}
                            />
                          </td>
                          <td className={`text-right font-mono font-black text-sm ${r.diffQty < 0 ? 'text-rose-700' : r.diffQty > 0 ? 'text-emerald-700' : 'text-neutral-600'}`}>
                            {r.diffQty > 0 ? `+${r.diffQty}` : r.diffQty} ks
                          </td>
                          <td className={`text-right font-bold ${r.diffCzk < 0 ? 'text-rose-700' : r.diffCzk > 0 ? 'text-emerald-700' : 'text-neutral-600'}`}>
                            {r.diffCzk.toLocaleString('cs-CZ')} Kč
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                            className="input !py-1.5 font-mono font-black text-sm"
                            placeholder="0 ks"
                            value={initialStock[k] ?? ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setInitialStock((prev) => ({ ...prev, [k]: val }));
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
