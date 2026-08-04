import { useState, useEffect, useMemo } from 'react';

import { supabase, useRealtime, Place, Beer, Package } from '../lib/supabase';
import { Spinner, EmptyState } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { Wine, Plus, Download, Printer, Trash2, ArrowDownCircle, ArrowUpCircle, Search, Boxes, Tag, AlertTriangle, CheckCircle2 } from 'lucide-react';

export type PromoEntry = {
  id: string;
  entry_type: 'in' | 'out'; // 'in' = Příjem do skladu, 'out' = Výdej odběrateli
  entry_date: string;
  category: 'sklenice' | 'podtacky' | 'kelimky' | 'promo' | string;
  item_name: string;
  quantity: number;
  destination?: string;
  note?: string;
};

export type LabelPurchase = {
  id: string;
  beer_name: string;
  entry_date: string;
  quantity: number;
  note?: string;
};

export type LabelIssue = {
  id: string;
  beer_name: string;
  entry_date: string;
  quantity: number;
  destination?: string;
  note?: string;
};

export type BottlePurchase = {
  id: string;
  package_label: string;
  entry_date: string;
  quantity: number;
  note?: string;
};

const DEFAULT_ITEMS = [
  { category: 'sklenice', name: 'Sklenice 0.5L (Pivovar Zajíček)' },
  { category: 'sklenice', name: 'Sklenice 0.3L (Pivovar Zajíček)' },
  { category: 'sklenice', name: 'Sklo: Willy 0.5L' },
  { category: 'sklenice', name: 'Sklo: Willy 0.3L' },
  { category: 'sklenice', name: 'Sklo: Tübinger 0.5L' },
  { category: 'sklenice', name: 'Sklo: Tübinger 0.33L' },
  { category: 'sklenice', name: 'Tučňák / Džbánek 1.0L' },
  { category: 'podtacky', name: 'Papírové podtácky Zajíček (balík)' },
  { category: 'kelimky',  name: 'Plastové vratné kelímky 0.5L' },
  { category: 'kelimky',  name: 'Jednorázové kelímky 0.5L' },
  { category: 'promo',    name: 'Trička pivovarské Zajíček' },
  { category: 'promo',    name: 'Plechové / Dřevěné cedule' },
  { category: 'promo',    name: 'Otvíráky na pivo' },
];

const DEFAULT_BOTTLE_PACKAGES = [
  '1.5L',
  '1L',
  '0.5L',
  '0.33L',
  'Víčka',
];

// Normalizuje název obalu na standardní velikost lahve (nebo "Víčka").
// Používá se, aby se v přehledu prázdných lahví zobrazovaly JEN velikosti 1.5L / 1L / 0.5L / 0.33L + víčka.
function normalizeBottleLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('víčk') || l.includes('vick') || l.includes('uzávěr') || l.includes('uzaver') || l.includes('kork')) return 'Víčka';
  const m = l.match(/(\d+(?:[.,]\d+)?)\s*(l|litr)/);
  if (!m) return null;
  const vol = parseFloat(m[1].replace(',', '.'));
  if (vol >= 1.4) return '1.5L';
  if (vol >= 0.9) return '1L';
  if (vol >= 0.45) return '0.5L';
  if (vol >= 0.25) return '0.33L';
  return null;
}

export default function SkloPromoScreen({ setPage }: { setPage?: (p: any) => void }) {
  const [activeTab, setActiveTab] = useState<'sklo' | 'etikety' | 'lahve'>('sklo');

  // Sklo & Promo entries
  const [entries, setEntries] = useState<PromoEntry[]>(() => {
    try {
      const saved = localStorage.getItem('sklo_promo_entries');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Label purchases
  const [labelPurchases, setLabelPurchases] = useState<LabelPurchase[]>(() => {
    try {
      const saved = localStorage.getItem('labels_purchases');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Label issues (výdej etiket - fasování)
  const [labelIssues, setLabelIssues] = useState<LabelIssue[]>(() => {
    try {
      const saved = localStorage.getItem('labels_issues');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Bottle purchases
  const [bottlePurchases, setBottlePurchases] = useState<BottlePurchase[]>(() => {
    try {
      const saved = localStorage.getItem('bottles_purchases');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [places, setPlaces] = useState<Place[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [bottlingData, setBottlingData] = useState<{ beer_name: string; package_label: string; quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Form 1: Sklo Příjem na sklad (IN)
  const [inDate, setInDate] = useState(new Date().toISOString().slice(0, 10));
  const [inCategory, setInCategory] = useState<'sklenice' | 'podtacky' | 'kelimky' | 'promo'>('sklenice');
  const [inItemName, setInItemName] = useState('Sklenice 0.5L (Pivovar Zajíček)');
  const [inCustomName, setInCustomName] = useState('');
  const [inQty, setInQty] = useState<string>('');
  const [inNote, setInNote] = useState('');

  // Form 2: Sklo Výdej odběrateli (OUT)
  const [outDate, setOutDate] = useState(new Date().toISOString().slice(0, 10));
  const [outCategory, setOutCategory] = useState<'sklenice' | 'podtacky' | 'kelimky' | 'promo'>('sklenice');
  const [outItemName, setOutItemName] = useState('Sklenice 0.5L (Pivovar Zajíček)');
  const [outPlaceId, setOutPlaceId] = useState('');
  const [outPlaceNameCustom, setOutPlaceNameCustom] = useState('');
  const [outQty, setOutQty] = useState<string>('');
  const [outNote, setOutNote] = useState('');

  // Form 3: Etikety Nákup
  const [labelBeerName, setLabelBeerName] = useState('');
  const [labelDate, setLabelDate] = useState(new Date().toISOString().slice(0, 10));
  const [labelQty, setLabelQty] = useState<string>('1000');
  const [labelNote, setLabelNote] = useState('');

  // Form 4: Lahve Nákup
  const [bottlePkgLabel, setBottlePkgLabel] = useState('0.5L');
  const [bottleDate, setBottleDate] = useState(new Date().toISOString().slice(0, 10));
  const [bottleQty, setBottleQty] = useState<string>('1200');
  const [bottleNote, setBottleNote] = useState('');

  async function loadData() {
    setLoading(true);
    const [pRes, bRes, pkgRes, botRes] = await Promise.all([
      supabase.from('places').select('*').order('name'),
      supabase.from('beers').select('*').order('name'),
      supabase.from('packages').select('*').order('kind'),
      supabase.from('bottling').select('beer_name, package_label, quantity'),
    ]);

    const loadedBeers = (bRes.data as Beer[]) ?? [];
    setPlaces((pRes.data as Place[]) ?? []);
    setBeers(loadedBeers);
    setPackages((pkgRes.data as Package[]) ?? []);
    setBottlingData((botRes.data as any[]) ?? []);

    if (loadedBeers.length > 0 && !labelBeerName) {
      setLabelBeerName(loadedBeers[0].name);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  useRealtime(['places', 'beers', 'packages', 'bottling'], loadData);

  function saveEntries(newEntries: PromoEntry[]) {
    setEntries(newEntries);
    localStorage.setItem('sklo_promo_entries', JSON.stringify(newEntries));
  }

  function saveLabelPurchases(newP: LabelPurchase[]) {
    setLabelPurchases(newP);
    localStorage.setItem('labels_purchases', JSON.stringify(newP));
  }

  function saveLabelIssues(newP: LabelIssue[]) {
    setLabelIssues(newP);
    localStorage.setItem('labels_issues', JSON.stringify(newP));
  }

  function saveBottlePurchases(newP: BottlePurchase[]) {
    setBottlePurchases(newP);
    localStorage.setItem('bottles_purchases', JSON.stringify(newP));
  }

  // --- CALCULATIONS FOR SKLO & PROMO ---
  const stockSummary = useMemo(() => {
    const map = new Map<string, { name: string; category: string; inQty: number; outQty: number; balance: number }>();
    DEFAULT_ITEMS.forEach((i) => {
      map.set(i.name, { name: i.name, category: i.category, inQty: 0, outQty: 0, balance: 0 });
    });
    entries.forEach((e) => {
      const cur = map.get(e.item_name) || { name: e.item_name, category: e.category, inQty: 0, outQty: 0, balance: 0 };
      if (e.entry_type === 'in') {
        cur.inQty += Number(e.quantity || 0);
      } else {
        cur.outQty += Number(e.quantity || 0);
      }
      cur.balance = cur.inQty - cur.outQty;
      map.set(e.item_name, cur);
    });
    return [...map.values()].sort((a, b) => b.balance - a.balance);
  }, [entries]);

  const itemOptions = useMemo(() => {
    const set = new Set<string>(DEFAULT_ITEMS.map((i) => i.name));
    entries.forEach((e) => set.add(e.item_name));
    return [...set];
  }, [entries]);

  // --- CALCULATIONS FOR ETIKETY (LABELS) ---
  const labelsSummary = useMemo(() => {
    const beerNames = beers.map((b) => b.name);
    // Add any custom ones from purchases or bottling
    labelPurchases.forEach((lp) => { if (!beerNames.includes(lp.beer_name)) beerNames.push(lp.beer_name); });
    bottlingData.forEach((bd) => { if (bd.beer_name && !beerNames.includes(bd.beer_name)) beerNames.push(bd.beer_name); });

    return beerNames.map((bName) => {
      const inLabels = labelPurchases
        .filter((lp) => lp.beer_name.toLowerCase().trim() === bName.toLowerCase().trim())
        .reduce((acc, lp) => acc + Number(lp.quantity || 0), 0);

      const usedLabels = bottlingData
        .filter((bd) => bd.beer_name && bd.beer_name.toLowerCase().trim() === bName.toLowerCase().trim())
        .reduce((acc, bd) => acc + Number(bd.quantity || 0), 0);

      const issuedLabels = labelIssues
        .filter((li) => li.beer_name.toLowerCase().trim() === bName.toLowerCase().trim())
        .reduce((acc, li) => acc + Number(li.quantity || 0), 0);

      const balance = inLabels - usedLabels - issuedLabels;
      const isLow = balance < 200;

      return { beer_name: bName, inLabels, usedLabels, issuedLabels, balance, isLow };
    }).sort((a, b) => a.balance - b.balance);
  }, [beers, labelPurchases, bottlingData, labelIssues]);

  const lowLabelsCount = useMemo(() => labelsSummary.filter((l) => l.isLow && l.inLabels > 0).length, [labelsSummary]);

  // --- CALCULATIONS FOR LAHVE (EMPTY BOTTLES) ---
  // Zobrazují se JEN standardní velikosti 1.5L / 1L / 0.5L / 0.33L + Víčka.
  // Všechny nákupy a stočené lahve se normalizují na tyto velikosti.
  const bottlesSummary = useMemo(() => {
    const pkgLabels = [...DEFAULT_BOTTLE_PACKAGES];

    // Normalizuj nákupy lahví na standardní velikost
    bottlePurchases.forEach((bp) => {
      const norm = normalizeBottleLabel(bp.package_label);
      if (norm && !pkgLabels.includes(norm)) pkgLabels.push(norm);
    });
    // Normalizuj stočené lahve na standardní velikost
    bottlingData.forEach((bd) => {
      if (bd.package_label) {
        const norm = normalizeBottleLabel(bd.package_label);
        if (norm && !pkgLabels.includes(norm)) pkgLabels.push(norm);
      }
    });

    return pkgLabels.map((pLabel) => {
      const inBottles = bottlePurchases
        .filter((bp) => normalizeBottleLabel(bp.package_label) === pLabel)
        .reduce((acc, bp) => acc + Number(bp.quantity || 0), 0);

      const usedBottles = bottlingData
        .filter((bd) => bd.package_label && normalizeBottleLabel(bd.package_label) === pLabel)
        .reduce((acc, bd) => acc + Number(bd.quantity || 0), 0);

      const balance = inBottles - usedBottles;
      const isLow = balance < 200;

      return { package_label: pLabel, inBottles, usedBottles, balance, isLow };
    }).sort((a, b) => a.balance - b.balance);
  }, [bottlePurchases, bottlingData]);

  const lowBottlesCount = useMemo(() => bottlesSummary.filter((b) => b.isLow && b.inBottles > 0).length, [bottlesSummary]);

  // Handlers for Sklo & Promo
  function handleAddIn(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(inQty);
    if (!qty || qty <= 0) { alert('Zadejte platné množstí příjmu (ks).'); return; }
    const finalName = inItemName === '__custom__' ? inCustomName.trim() : inItemName;
    if (!finalName) { alert('Zadejte název předmětu.'); return; }

    const newE: PromoEntry = {
      id: crypto.randomUUID(), entry_type: 'in', entry_date: inDate, category: inCategory,
      item_name: finalName, quantity: qty, destination: 'Sklad Kynšperk (Příjem)', note: inNote.trim() || undefined,
    };
    saveEntries([newE, ...entries]);
    setInQty(''); setInNote('');
    alert(`✅ Zapsán příjem ${qty} ks (${finalName}) na sklad!`);
  }

  function handleAddOut(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(outQty);
    if (!qty || qty <= 0) { alert('Zadejte platné množstí výdeje (ks).'); return; }
    const placeObj = places.find((p) => p.id === outPlaceId);
    const dest = placeObj?.name ?? (outPlaceNameCustom.trim() || 'Odběratel / Akce');

    const newE: PromoEntry = {
      id: crypto.randomUUID(), entry_type: 'out', entry_date: outDate, category: outCategory,
      item_name: outItemName, quantity: qty, destination: dest, note: outNote.trim() || undefined,
    };
    saveEntries([newE, ...entries]);
    setOutQty(''); setOutNote('');
    alert(`✅ Zapsán výdej ${qty} ks (${outItemName}) pro ${dest}!`);
  }

  function handleDeletePromo(id: string) {
    if (!window.confirm('Smazat tento záznam?')) return;
    saveEntries(entries.filter((e) => e.id !== id));
  }

  // Handlers for Etikety
  function handleAddLabelPurchase(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(labelQty);
    if (!qty || qty <= 0 || !labelBeerName) { alert('Vyplňte platné pivo a množství etiket.'); return; }

    const newLP: LabelPurchase = {
      id: crypto.randomUUID(), beer_name: labelBeerName, entry_date: labelDate, quantity: qty, note: labelNote.trim() || undefined,
    };
    saveLabelPurchases([newLP, ...labelPurchases]);
    setLabelQty('1000'); setLabelNote('');
    alert(`✅ Zapsán nákup ${qty} ks etiket pro pivo "${labelBeerName}"!`);
  }

  function handleDeleteLabelPurchase(id: string) {
    if (!window.confirm('Smazat tento nákup etiket?')) return;
    saveLabelPurchases(labelPurchases.filter((lp) => lp.id !== id));
  }

  // Handlers for Lahve
  function handleAddBottlePurchase(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(bottleQty);
    if (!qty || qty <= 0 || !bottlePkgLabel) { alert('Vyplňte platný obal a množství lahví.'); return; }

    const newBP: BottlePurchase = {
      id: crypto.randomUUID(), package_label: bottlePkgLabel, entry_date: bottleDate, quantity: qty, note: bottleNote.trim() || undefined,
    };
    saveBottlePurchases([newBP, ...bottlePurchases]);
    setBottleQty('1200'); setBottleNote('');
    alert(`✅ Zapsán nákup ${qty} ks prázdných lahví "${bottlePkgLabel}"!`);
  }

  function handleDeleteBottlePurchase(id: string) {
    if (!window.confirm('Smazat tento nákup lahví?')) return;
    saveBottlePurchases(bottlePurchases.filter((bp) => bp.id !== id));
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchesName = e.item_name.toLowerCase().includes(q);
        const matchesDest = (e.destination ?? '').toLowerCase().includes(q);
        if (!matchesName && !matchesDest) return false;
      }
      return true;
    });
  }, [entries, categoryFilter, searchTerm]);

  function exportExcel() {
    const dataToExport = filteredEntries.map((e) => ({
      Datum: new Date(e.entry_date).toLocaleDateString('cs-CZ'),
      Pohyb: e.entry_type === 'in' ? '📥 Příjem do skladu' : '📤 Výdej odběrateli',
      'Předmět / Obal': e.item_name,
      'Počet (ks)': e.quantity,
      'Cíl / Odběratel': e.destination || '—',
      Poznámka: e.note || '—',
    }));

    exportHistoryDetailToExcel(
      dataToExport,
      ['Datum', 'Pohyb', 'Předmět', 'Počet (ks)', 'Odběratel / Cíl', 'Poznámka'],
      ['Datum', 'Pohyb', 'Předmět / Obal', 'Počet (ks)', 'Cíl / Odběratel', 'Poznámka'],
      `Sklo_Podtacky_Etikety_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-neutral-900 text-white p-5 sm:p-7 rounded-3xl border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Wine size={18} />
            <span>Skladové zásoby & Materiál</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>🍷 Sklo, Podtácky, Etikety & Lahve</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Kompletní evidence pivního skla, podtácků, etiket a prázdných lahví s automatickým odečítáním ze stočených piv.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={exportExcel}
            className="px-3.5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Excel
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3">
        <button
          onClick={() => setActiveTab('sklo')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'sklo'
              ? 'bg-neutral-900 text-amber-400 shadow-md scale-[1.02]'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Wine size={16} />
          <span>Sklo, Podtácky & Promo</span>
        </button>

        <button
          onClick={() => setActiveTab('etikety')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'etikety'
              ? 'bg-neutral-900 text-amber-400 shadow-md scale-[1.02]'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Tag size={16} />
          <span>Sledování etiket piva</span>
          {lowLabelsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px]">
              ⚠️ {lowLabelsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('lahve')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'lahve'
              ? 'bg-neutral-900 text-amber-400 shadow-md scale-[1.02]'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Boxes size={16} />
          <span>Sledování prázdných lahví (1.5L / 1L / 0.5L / 0.33L + Víčka)</span>
          {lowBottlesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[10px]">
              ⚠️ {lowBottlesCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SKLO & PROMO */}
      {activeTab === 'sklo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Příjem Skla & Promo */}
            <div className="card p-5 sm:p-6 bg-white border border-emerald-200 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <h3 className="font-display font-black text-base sm:text-lg text-emerald-950 flex items-center gap-2">
                  <ArrowDownCircle size={22} className="text-emerald-600" />
                  <span>📥 Příjem na sklad (Přivezeno do pivovaru)</span>
                </h3>
              </div>

              <form onSubmit={handleAddIn} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Datum přivezení</label>
                    <input type="date" required value={inDate} onChange={(e) => setInDate(e.target.value)} className="input font-mono font-bold text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Kategorie</label>
                    <select value={inCategory} onChange={(e) => setInCategory(e.target.value as any)} className="input font-bold text-xs">
                      <option value="sklenice">🥛 Sklo & Džbány</option>
                      <option value="podtacky">📜 Podtácky</option>
                      <option value="kelimky">🥤 Kelímky (vratné/jednorázové)</option>
                      <option value="promo">🎁 Promo & Oblečení & Cedule</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Název předmětu</label>
                  <select value={inItemName} onChange={(e) => setInItemName(e.target.value)} className="input font-bold text-xs">
                    {DEFAULT_ITEMS.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                    <option value="__custom__">➕ Jiný předmět (vlastní název)…</option>
                  </select>
                </div>

                {inItemName === '__custom__' && (
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Vlastní název</label>
                    <input type="text" required value={inCustomName} onChange={(e) => setInCustomName(e.target.value)} placeholder="Např. Otvíráky Zajíček 2026" className="input font-bold text-xs" />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Přivezeno kusů (ks)</label>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setInQty(String(Math.max(0, (Number(inQty) || 0) - 50)))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition">−</button>
                      <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded-xl py-2 shadow-2xs">{inQty || '0'}</span>
                      <button type="button" onClick={() => setInQty(String((Number(inQty) || 0) + 50))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-emerald-700 text-white font-bold text-sm select-none active:scale-95 transition">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Dodavatel / Poznámka</label>
                    <input type="text" value={inNote} onChange={(e) => setInNote(e.target.value)} placeholder="Ze sklárny" className="input text-xs font-medium" />
                  </div>
                </div>

                <button type="submit" className="w-full px-5 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-2">
                  <Plus size={16} /> Zapsat příjem na sklad
                </button>
              </form>
            </div>

            {/* Výdej Skla & Promo */}
            <div className="card p-5 sm:p-6 bg-white border border-amber-200 rounded-3xl shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-amber-100 pb-3">
                <h3 className="font-display font-black text-base sm:text-lg text-amber-950 flex items-center gap-2">
                  <ArrowUpCircle size={22} className="text-amber-600" />
                  <span>📤 Výdej odběratelům & Na akce (Fasování)</span>
                </h3>
              </div>

              <form onSubmit={handleAddOut} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Datum výdeje</label>
                    <input type="date" required value={outDate} onChange={(e) => setOutDate(e.target.value)} className="input font-mono font-bold text-xs" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Kategorie</label>
                    <select value={outCategory} onChange={(e) => setOutCategory(e.target.value as any)} className="input font-bold text-xs">
                      <option value="sklenice">🥛 Sklo & Džbány</option>
                      <option value="podtacky">📜 Podtácky</option>
                      <option value="kelimky">🥤 Kelímky</option>
                      <option value="promo">🎁 Promo & Oblečení</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Vydávaný předmět</label>
                  <select value={outItemName} onChange={(e) => setOutItemName(e.target.value)} className="input font-bold text-xs">
                    {itemOptions.map((name) => {
                      const itemStock = stockSummary.find((s) => s.name === name)?.balance ?? 0;
                      return (
                        <option key={name} value={name}>
                          {name} (skladem: {itemStock} ks)
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Komu bylo vydáno</label>
                  <PlaceCombobox value={outPlaceId} onChange={(id) => setOutPlaceId(id)} places={places} placeholder="— Vyber odběratele —" />
                  {!outPlaceId && (
                    <input type="text" value={outPlaceNameCustom} onChange={(e) => setOutPlaceNameCustom(e.target.value)} placeholder="Nebo zadejte název akce…" className="input mt-1 text-xs font-medium" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Vydáno kusů (ks)</label>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setOutQty(String(Math.max(0, (Number(outQty) || 0) - 10)))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition">−</button>
                      <span className="w-16 min-w-[3.5rem] px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded-xl py-2 shadow-2xs">
                        {outQty || '0'}
                      </span>
                      <button type="button" onClick={() => setOutQty(String((Number(outQty) || 0) + 10))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-amber-950 text-white font-bold text-sm select-none active:scale-95 transition">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka</label>
                    <input type="text" value={outNote} onChange={(e) => setOutNote(e.target.value)} placeholder="Na zálohu" className="input text-xs font-medium" />
                  </div>
                </div>

                <button type="submit" className="w-full px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2">
                  <Plus size={16} /> Zapsat výdej pro odběratele
                </button>
              </form>
            </div>
          </div>

          {/* Zásoby karta Sklo */}
          <div className="space-y-4">
            <h2 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
              <Boxes className="text-amber-600" size={20} />
              <span>Aktuální zásoby skla a promo předmětů na skladě</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {stockSummary.slice(0, 8).map((item) => (
                <div key={item.name} className={`p-4 rounded-2xl border-2 shadow-xs space-y-1 ${item.balance > 0 ? 'bg-white border-neutral-200' : 'bg-rose-50 border-rose-200'}`}>
                  <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500 block truncate">{item.name}</span>
                  <div className="flex items-baseline justify-between">
                    <span className={`font-display font-black text-2xl ${item.balance > 0 ? 'text-neutral-950' : 'text-rose-600'}`}>
                      {item.balance.toLocaleString('cs-CZ')} ks
                    </span>
                    <span className="text-xs font-bold text-neutral-600">(📥+{item.inQty} / 📤-{item.outQty})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabulka Sklo */}
          <div className="card p-6 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Přehled zadaných pohybů ({filteredEntries.length})</h3>
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Hledat odběratele nebo předmět…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input !py-1.5 text-xs font-bold w-48" />
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <EmptyState text="Žádné zapsané pohyby skla." icon="🍷" />
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-xs">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Pohyb</th>
                      <th>Předmět</th>
                      <th className="text-right">Ks</th>
                      <th>Odběratel</th>
                      <th>Poznámka</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((e) => (
                      <tr key={e.id}>
                        <td className="font-bold text-[11px]">{new Date(e.entry_date).toLocaleDateString('cs-CZ')}</td>
                        <td>
                          {e.entry_type === 'in' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-bold">📥 PŘÍJEM</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 text-[11px] font-bold">📤 VÝDEJ</span>
                          )}
                        </td>
                        <td className="font-black text-[11px]">{e.item_name}</td>
                        <td className="text-right font-mono font-black text-[11px]">{e.quantity} ks</td>
                        <td className="font-bold text-[11px]">{e.destination || '—'}</td>
                        <td className="text-[11px] text-neutral-600">{e.note || '—'}</td>
                        <td>
                          <button onClick={() => handleDeletePromo(e.id)} className="text-rose-600 hover:text-rose-800 p-1"><Trash2 size={15} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: ETIKETY */}
      {activeTab === 'etikety' && (
        <div className="space-y-6">
          {/* Low Labels Warnings */}
          {lowLabelsCount > 0 && (
            <div className="p-5 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-display font-black text-base">
                <AlertTriangle size={22} className="text-rose-600 animate-pulse" />
                <span>VAROVÁNÍ: NÍZKÝ STAV ETIKET U {lowLabelsCount} DRUHŮ PIVA! ({'<'} 200 ks)</span>

              </div>
              <p className="text-xs text-rose-800 font-medium">
                Při stáčení lahví bylo spotřebováno většinové množství etiket. U následujících piv zbývá méně než 200 ks etiket!
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {labelsSummary.filter((l) => l.isLow && l.inLabels > 0).map((l) => (
                  <span key={l.beer_name} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xs">
                    ⚠️ {l.beer_name}: zbývá jen {l.balance} ks etiket!
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Form: Nákup etiket */}
          <div className="card p-6 bg-white border-2 border-amber-200 rounded-3xl shadow-sm space-y-4">
            <h3 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
              <Tag className="text-amber-600" size={20} />
              <span>🏷️ Zadání nákupu / příjmu etiket na sklad</span>
            </h3>

            <form onSubmit={handleAddLabelPurchase} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Druh piva</label>
                <select value={labelBeerName} onChange={(e) => setLabelBeerName(e.target.value)} className="input font-bold text-xs">
                  {beers.map((b) => (
                    <option key={b.id} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Datum přijetí</label>
                <input type="date" required value={labelDate} onChange={(e) => setLabelDate(e.target.value)} className="input font-mono font-bold text-xs" />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Nakoupeno etiket (ks)</label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setLabelQty(String(Math.max(0, (Number(labelQty) || 0) - 500)))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition">−</button>
                  <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded-xl py-2 shadow-2xs">{labelQty || '0'}</span>
                  <button type="button" onClick={() => setLabelQty(String((Number(labelQty) || 0) + 500))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-amber-950 text-white font-bold text-sm select-none active:scale-95 transition">+</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="text" value={labelNote} onChange={(e) => setLabelNote(e.target.value)} placeholder="Poznámka / Dodavatel" className="input text-xs font-medium flex-1" />
                <button type="submit" className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md shrink-0">
                  + Zapsat nákup
                </button>
              </div>
            </form>
          </div>

          {/* Cards per beer */}
          <div className="space-y-3">
            <h3 className="font-display font-black text-lg text-neutral-900">Stav etiket podle druhů piva</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {labelsSummary.map((l) => (
                <div key={l.beer_name} className={`p-5 rounded-3xl border-2 transition-all shadow-sm space-y-3 ${l.isLow ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-display font-black text-base text-neutral-950">{l.beer_name}</span>
                    {l.isLow ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[10px] animate-pulse">
                        ⚠️ POZOR {'<'} 200 KS!

                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                        🟢 DOSTATEK
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    <div className="p-2 rounded-xl bg-neutral-100">
                      <div className="text-[9px] font-bold text-neutral-500 uppercase">Nakoupeno</div>
                      <div className="text-sm font-black text-neutral-900">+{l.inLabels}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-neutral-100">
                      <div className="text-[9px] font-bold text-neutral-500 uppercase">Stočeno</div>
                      <div className="text-sm font-black text-neutral-900">−{l.usedLabels}</div>
                    </div>
                    <div className={`p-2 rounded-xl ${l.isLow ? 'bg-rose-600 text-white' : 'bg-amber-500 text-neutral-950'}`}>
                      <div className="text-[9px] font-bold uppercase">Zbývá</div>
                      <div className="text-sm font-black">{l.balance} ks</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table: Label Purchases History */}
          <div className="card p-6 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-3">
            <h4 className="font-display font-black text-base text-neutral-900">Historie nákupů etiket ({labelPurchases.length})</h4>
            {labelPurchases.length === 0 ? (
              <EmptyState text="Zatiaľ nebol zadaný žiadny nákup etiket." icon="🏷️" />
            ) : (
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Pivo</th>
                    <th className="text-right">Ks</th>
                    <th>Poznámka</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {labelPurchases.map((lp) => (
                    <tr key={lp.id}>
                      <td className="font-bold text-[11px]">{new Date(lp.entry_date).toLocaleDateString('cs-CZ')}</td>
                      <td className="font-black text-[11px]">{lp.beer_name}</td>
                      <td className="text-right font-mono font-black text-[11px] text-emerald-700">+{lp.quantity} ks</td>
                      <td className="text-[11px] text-neutral-600">{lp.note || '—'}</td>
                      <td className="text-right"><button onClick={() => handleDeleteLabelPurchase(lp.id)} className="text-rose-600 hover:text-rose-800 p-1"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LAHVE */}
      {activeTab === 'lahve' && (
        <div className="space-y-6">
          {/* Low Bottles Warnings */}
          {lowBottlesCount > 0 && (
            <div className="p-5 rounded-3xl bg-rose-50 border-2 border-rose-300 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-display font-black text-base">
                <AlertTriangle size={22} className="text-rose-600 animate-pulse" />
                <span>VAROVÁNÍ: NÍZKÝ STAV PRÁZDNÝCH LAHVÍ! ({'<'} 200 ks)</span>

              </div>
              <p className="text-xs text-rose-800 font-medium">
                Při stáčení lahví bylo spotřebováno většinové množství zadaných prázdných lahví. U následujících obalů zbývá méně než 200 ks!
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {bottlesSummary.filter((b) => b.isLow && b.inBottles > 0).map((b) => (
                  <span key={b.package_label} className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xs">
                    ⚠️ {b.package_label}: zbývá jen {b.balance} ks prázdných lahví!
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Form: Nákup prázdných lahví */}
          <div className="card p-6 bg-white border-2 border-emerald-200 rounded-3xl shadow-sm space-y-4">
            <h3 className="font-display font-black text-lg text-emerald-950 flex items-center gap-2">
              <Boxes className="text-emerald-600" size={20} />
              <span>🍾 Zadání nákupu / příjmu prázdných lahví na sklad</span>
            </h3>

            <form onSubmit={handleAddBottlePurchase} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Druh / Velikost obalu</label>
                <select value={bottlePkgLabel} onChange={(e) => setBottlePkgLabel(e.target.value)} className="input font-bold text-xs">
                  {DEFAULT_BOTTLE_PACKAGES.map((pkg) => (
                    <option key={pkg} value={pkg}>{pkg}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Datum přijetí</label>
                <input type="date" required value={bottleDate} onChange={(e) => setBottleDate(e.target.value)} className="input font-mono font-bold text-xs" />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Nakoupeno lahví (ks)</label>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setBottleQty(String(Math.max(0, (Number(bottleQty) || 0) - 600)))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition">−</button>
                  <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded-xl py-2 shadow-2xs">{bottleQty || '0'}</span>
                  <button type="button" onClick={() => setBottleQty(String((Number(bottleQty) || 0) + 600))} className="w-8 h-8 shrink-0 grid place-items-center rounded-xl bg-emerald-700 text-white font-bold text-sm select-none active:scale-95 transition">+</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="text" value={bottleNote} onChange={(e) => setBottleNote(e.target.value)} placeholder="Poznámka / Paleta" className="input text-xs font-medium flex-1" />
                <button type="submit" className="px-4 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-black text-xs transition shadow-md shrink-0">
                  + Zapsat nákup lahví
                </button>
              </div>
            </form>
          </div>

          {/* Cards per bottle package */}
          <div className="space-y-3">
            <h3 className="font-display font-black text-lg text-neutral-900">Stav prázdných lahví (1.5L / 1L / 0.5L / 0.33L + Víčka)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bottlesSummary.map((b) => (
                <div key={b.package_label} className={`p-5 rounded-3xl border-2 transition-all shadow-sm space-y-3 ${b.isLow ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-display font-black text-base text-neutral-950">{b.package_label}</span>
                    {b.isLow ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[10px] animate-pulse">
                        ⚠️ POZOR {'<'} 200 KS!

                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[10px]">
                        🟢 SKLADEM
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    <div className="p-2 rounded-xl bg-neutral-100">
                      <div className="text-[9px] font-bold text-neutral-500 uppercase">Nakoupeno</div>
                      <div className="text-sm font-black text-neutral-900">+{b.inBottles}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-neutral-100">
                      <div className="text-[9px] font-bold text-neutral-500 uppercase">Stočeno</div>
                      <div className="text-sm font-black text-neutral-900">−{b.usedBottles}</div>
                    </div>
                    <div className={`p-2 rounded-xl ${b.isLow ? 'bg-rose-600 text-white' : 'bg-emerald-700 text-white'}`}>
                      <div className="text-[9px] font-bold uppercase">Zbývá</div>
                      <div className="text-sm font-black">{b.balance} ks</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table: Bottle Purchases History */}
          <div className="card p-6 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-3">
            <h4 className="font-display font-black text-base text-neutral-900">Historie příjmů prázdných lahví ({bottlePurchases.length})</h4>
            {bottlePurchases.length === 0 ? (
              <EmptyState text="Zatiaľ nebol zadaný žiadny nákup prázdných lahví." icon="🍾" />
            ) : (
              <table className="table text-xs">
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Obal</th>
                    <th className="text-right">Ks</th>
                    <th>Poznámka</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {bottlePurchases.map((bp) => (
                    <tr key={bp.id}>
                      <td className="font-bold text-[11px]">{new Date(bp.entry_date).toLocaleDateString('cs-CZ')}</td>
                      <td className="font-black text-[11px]">{bp.package_label}</td>
                      <td className="text-right font-mono font-black text-[11px] text-emerald-700">+{bp.quantity} ks</td>
                      <td className="text-[11px] text-neutral-600">{bp.note || '—'}</td>
                      <td className="text-right"><button onClick={() => handleDeleteBottlePurchase(bp.id)} className="text-rose-600 hover:text-rose-800 p-1"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
