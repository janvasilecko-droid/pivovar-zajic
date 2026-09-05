import { useState, useEffect, useMemo, useRef } from 'react';

import { Beer, Package, Place, fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { LABELS_LOW_STOCK_THRESHOLD } from '../lib/labelStock';
import { zustatkyZavirek, KORUNKY, UZAVERY_PET } from '../lib/materialSklad';
import { kusy } from '../lib/cisla';
import { Spinner, EmptyState } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { PlaceCombobox } from '../components/PlaceCombobox';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, Download, Check, CheckCircle2, Plus, Printer, Search, Tag, Trash2, Upload, Wine } from 'lucide-react';
import { chyba, oznam, potvrd } from '../lib/toast';
import { IkonaLahev } from '../components/ikony';

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
];

// Co se dá zapsat jako nákup. Závěrky jsou zvlášť a rozlišené — v jednom
// hrnci „Víčka" by pět tisíc PET víček přehlušilo nulu korunek a přehled
// by hlásil „v pořádku" ve chvíli, kdy sklo nejde stočit.
const NABIDKA_NAKUPU = [
  ...DEFAULT_BOTTLE_PACKAGES,
  KORUNKY,
  UZAVERY_PET,
];

// Klíč značky, že se staré nákupy z tohohle telefonu už nahrály do databáze.
const KLIC_PREVOD_NAKUPU = 'obal_nakupy_prevedeno';

// Normalizuje název obalu na standardní velikost lahve.
// Používá se, aby se v přehledu prázdných lahví zobrazovaly JEN velikosti
// 1.5L / 1L / 0.5L / 0.33L. Závěrky se sem už nepočítají: spotřeba se jim
// hledala mezi stočenými obaly podle názvu „Víčka" a žádný stočený obal se
// tak nejmenuje, takže vycházela nula a zůstatek vypadal pořád stejně dobře.
// Mají teď vlastní přehled, kde se spotřeba odečítá doopravdy.
function normalizeBottleLabel(label: string): string | null {
  const l = label.toLowerCase();
  if (l.includes('víčk') || l.includes('vick') || l.includes('uzávěr') || l.includes('uzaver')
      || l.includes('kork') || l.includes('korunk') || l.includes('kapsl')) return null;
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

  // Label purchases (sdílené přes Supabase — vidí je všechna zařízení stejně)
  const [labelPurchases, setLabelPurchases] = useState<LabelPurchase[]>([]);

  // Nákupy lahví a závěrek — sdílené přes Supabase (tabulka obal_nakupy).
  // Dřív žily jen v localStorage tohohle telefonu, takže každé zařízení
  // vidělo jiný stav a po vyčištění dat prohlížeče byla evidence pryč.
  const [bottlePurchases, setBottlePurchases] = useState<BottlePurchase[]>([]);
  // Tabulka obal_nakupy nemusí být (nepuštěná migrace) — obrazovka pak
  // funguje dál a jen řekne, co chybí, místo aby zápis tiše zahodila.
  const [nakupyChybi, setNakupyChybi] = useState(false);
  const prevodBezi = useRef(false);

  const [places, setPlaces] = useState<Place[]>([]);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [bottlingData, setBottlingData] = useState<{ beer_name: string; package_label: string; quantity: number; entry_date?: string | null; package_id?: string | null }[]>([]);
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

  async function loadData(tiche = false) {
    if (!tiche) setLoading(true);
    const [pRes, bRes, pkgRes, botRes, lpRes, onRes] = await Promise.all([
      supabase.from('places').select('*').order('name'),
      supabase.from('beers').select('*').eq('is_active', true).order('name'),
      supabase.from('packages').select('*').order('kind'),
      fetchAllRows('bottling', 'beer_name, package_label, quantity, entry_date, package_id'),
      supabase.from('label_purchases').select('id, beer_name, entry_date, quantity, note').order('entry_date', { ascending: false }),
      supabase.from('obal_nakupy').select('id, package_label, entry_date, quantity, note').order('entry_date', { ascending: false }),
    ]);

    const loadedBeers = (bRes.data as Beer[]) ?? [];
    setPlaces((pRes.data as Place[]) ?? []);
    setBeers(loadedBeers);
    setPackages((pkgRes.data as Package[]) ?? []);
    setBottlingData((botRes.data as any[]) ?? []);
    setLabelPurchases(((lpRes.data as any[]) ?? []).map((r) => ({ id: r.id, beer_name: r.beer_name, entry_date: r.entry_date, quantity: Number(r.quantity), note: r.note ?? undefined })));
    // Tabulka může chybět, dokud se nepustí migrace — obrazovka pak
    // funguje dál a jen se u nákupů řekne, že evidence není dostupná.
    setNakupyChybi(!!onRes.error);
    const nakupyZDb: BottlePurchase[] = ((onRes.data as any[]) ?? []).map((r) => ({
      id: r.id, package_label: r.package_label, entry_date: r.entry_date,
      quantity: Number(r.quantity), note: r.note ?? undefined,
    }));
    setBottlePurchases(nakupyZDb);
    if (!onRes.error) void prevedNakupyZTelefonu();

    if (loadedBeers.length > 0 && !labelBeerName) {
      setLabelBeerName(loadedBeers[0].name);
    }
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);
  // 🔇 Realtime přenačítá TIŠE. Bez toho zavolá loadData() bez parametru,
  // rozsvítí se spinner přes celou obrazovku (`if (loading) return <Spinner/>`),
  // obsah se odmountuje — a s ním spadne odrolování na nulu. Z provozu:
  // „když kliknu odečíst, vrací mě to vždycky nahoru." Vlastní zápis stránku
  // srovná kotvou (lib/drzPozici.ts), jenže 400 ms po něm dorazí realtime
  // událost o tomtéž zápisu a celou práci zahodí.
  useRealtime(['places', 'beers', 'packages', 'bottling', 'label_purchases', 'obal_nakupy'], () => loadData(true));

  function saveEntries(newEntries: PromoEntry[]) {
    setEntries(newEntries);
    localStorage.setItem('sklo_promo_entries', JSON.stringify(newEntries));
  }

  /**
   * Jednorázový převod nákupů z telefonu do databáze.
   *
   * Staré zápisy jsou v localStorage tohohle zařízení a nikdo jiný je
   * nevidí. Nechat je tam by znamenalo, že se po nasazení evidence
   * „vynuluje" — proto se jednou nahrají. Značka se ukládá na zařízení,
   * takže každý telefon nahraje své a nic se nezdvojí; původní kopie v
   * telefonu se nemaže (je to jen zrcadlo, ne originál).
   */
  async function prevedNakupyZTelefonu() {
    if (prevodBezi.current) return;
    let stare: BottlePurchase[] = [];
    try {
      if (localStorage.getItem(KLIC_PREVOD_NAKUPU)) return;
      stare = JSON.parse(localStorage.getItem('bottles_purchases') ?? '[]');
    } catch { return; }
    if (!Array.isArray(stare) || stare.length === 0) {
      try { localStorage.setItem(KLIC_PREVOD_NAKUPU, new Date().toISOString()); } catch { /* zamčené úložiště */ }
      return;
    }
    prevodBezi.current = true;
    const { error } = await supabase.from('obal_nakupy').insert(stare.map((bp) => ({
      entry_date: bp.entry_date, package_label: bp.package_label,
      quantity: Number(bp.quantity) || 0, note: bp.note ?? null, zdroj: 'prevod-z-telefonu',
    })));
    if (error) { prevodBezi.current = false; return; }
    try { localStorage.setItem(KLIC_PREVOD_NAKUPU, new Date().toISOString()); } catch { /* zamčené úložiště */ }
    oznam(`Přeneseno ${stare.length} starších nákupů z tohoto telefonu do databáze — teď je vidí i ostatní.`);
    await loadData(true);
    prevodBezi.current = false;
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

      const balance = inLabels - usedLabels;
      const isLow = balance < LABELS_LOW_STOCK_THRESHOLD;

      return { beer_name: bName, inLabels, usedLabels, balance, isLow };
    }).sort((a, b) => a.balance - b.balance);
  }, [beers, labelPurchases, bottlingData]);

  const lowLabelsCount = useMemo(() => labelsSummary.filter((l) => l.isLow && l.inLabels > 0).length, [labelsSummary]);

  // --- CALCULATIONS FOR LAHVE (EMPTY BOTTLES) ---
  // Zobrazují se JEN standardní velikosti 1.5L / 1L / 0.5L / 0.33L.
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

  /**
   * 🧴 Závěrky (korunky a PET víčka). Spotřeba se odečítá z nalahvovaných
   * lahví — každá zavřená lahev spotřebuje jednu závěrku. Dřív se hledala
   * mezi stočenými obaly podle názvu „Víčka", takže vycházela nula.
   */
  const zavirky = useMemo(() => {
    const objemPodleId = new Map(packages.map((p) => [p.id, Number(p.volume_l)]));
    return zustatkyZavirek(
      bottlePurchases.map((bp) => ({ package_label: bp.package_label, quantity: bp.quantity })),
      bottlingData.map((bd) => ({
        entry_date: bd.entry_date ?? null,
        package_label: bd.package_label ?? null,
        volume_l: bd.package_id ? objemPodleId.get(bd.package_id) ?? null : null,
        quantity: bd.quantity,
      })),
    );
  }, [bottlePurchases, bottlingData, packages]);

  const lowBottlesCount = useMemo(() => bottlesSummary.filter((b) => b.isLow && b.inBottles > 0).length, [bottlesSummary]);

  // Handlers for Sklo & Promo
  function handleAddIn(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(inQty);
    if (!qty || qty <= 0) { oznam('Zadejte platné množstí příjmu (ks).'); return; }
    const finalName = inItemName === '__custom__' ? inCustomName.trim() : inItemName;
    if (!finalName) { oznam('Zadejte název předmětu.'); return; }

    const newE: PromoEntry = {
      id: crypto.randomUUID(), entry_type: 'in', entry_date: inDate, category: inCategory,
      item_name: finalName, quantity: qty, destination: 'Sklad Kynšperk (Příjem)', note: inNote.trim() || undefined,
    };
    saveEntries([newE, ...entries]);
    setInQty(''); setInNote('');
    oznam(`Zapsán příjem ${qty} ks (${finalName}) na sklad!`);
  }

  function handleAddOut(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(outQty);
    if (!qty || qty <= 0) { oznam('Zadejte platné množstí výdeje (ks).'); return; }
    const placeObj = places.find((p) => p.id === outPlaceId);
    const dest = placeObj?.name ?? (outPlaceNameCustom.trim() || 'Odběratel / Akce');

    const newE: PromoEntry = {
      id: crypto.randomUUID(), entry_type: 'out', entry_date: outDate, category: outCategory,
      item_name: outItemName, quantity: qty, destination: dest, note: outNote.trim() || undefined,
    };
    saveEntries([newE, ...entries]);
    setOutQty(''); setOutNote('');
    oznam(`Zapsán výdej ${qty} ks (${outItemName}) pro ${dest}!`);
  }

  async function handleDeletePromo(id: string) {
    if (!(await potvrd('Smazat tento záznam?'))) return;
    saveEntries(entries.filter((e) => e.id !== id));
  }

  // Handlers for Etikety (Supabase — sdílené mezi zařízeními)
  async function handleAddLabelPurchase(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(labelQty);
    if (!qty || qty <= 0 || !labelBeerName) { oznam('Vyplňte platné pivo a množství etiket.'); return; }

    const { error } = await supabase.from('label_purchases').insert({
      beer_name: labelBeerName,
      entry_date: labelDate,
      quantity: qty,
      note: labelNote.trim() || null,
    });
    if (error) { chyba(`Nepodařilo se zapsat nákup etiket: ${error.message}`); return; }

    await loadData();
    setLabelQty('1000'); setLabelNote('');
    oznam(`Zapsán nákup ${qty} ks etiket pro pivo "${labelBeerName}"!`);
  }

  async function handleDeleteLabelPurchase(id: string) {
    if (!(await potvrd('Smazat tento nákup etiket?'))) return;
    const { error } = await supabase.from('label_purchases').delete().eq('id', id);
    if (error) { chyba(`Nepodařilo se smazat záznam: ${error.message}`); return; }
    await loadData();
  }

  // Handlers for Lahve
  async function handleAddBottlePurchase(e: React.FormEvent) {
    e.preventDefault();
    const qty = Number(bottleQty);
    if (!qty || qty <= 0 || !bottlePkgLabel) { oznam('Vyplňte platný obal a množství.'); return; }

    const { error } = await supabase.from('obal_nakupy').insert({
      entry_date: bottleDate, package_label: bottlePkgLabel,
      quantity: qty, note: bottleNote.trim() || null, zdroj: 'obrazovka',
    });
    if (error) { chyba(`Nákup se nepodařilo zapsat: ${error.message}`); return; }
    setBottleQty('1200'); setBottleNote('');
    oznam(`Zapsán nákup ${qty} ks „${bottlePkgLabel}".`);
    await loadData(true);
  }

  async function handleDeleteBottlePurchase(id: string) {
    if (!(await potvrd('Smazat tento nákup?'))) return;
    const { error } = await supabase.from('obal_nakupy').delete().eq('id', id);
    if (error) { chyba(`Nepodařilo se smazat záznam: ${error.message}`); return; }
    await loadData(true);
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
      Pohyb: e.entry_type === 'in' ? 'Příjem do skladu' : 'Výdej odběrateli',
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
      {/* Export je jediná akce téhle obrazovky, takže nemá tmavý panel:
          byl v něm jeden knoflík a 150 px prázdna vedle. Vedlejší akce =
          bílé tlačítko s rámečkem (docs/jednotny-styl.md). */}
      <div className="flex justify-end">
        <button onClick={exportExcel} className="btn-ghost !flex-none !text-xs">
          <Download size={16} /> Excel
        </button>
      </div>

      {/* Tabs — přilepené nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex flex-nowrap gap-2 overflow-x-auto scrollbar-thin border-b border-neutral-200 pb-3">
        <button
          onClick={() => setActiveTab('sklo')}
          className={`shrink-0 px-4 py-2.5 rounded font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'sklo'
              ? 'bg-amber-500 text-neutral-950 shadow-md scale-[1.02]'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Wine size={16} />
          <span>Sklo, Podtácky & Promo</span>
        </button>

        <button
          onClick={() => setActiveTab('etikety')}
          className={`shrink-0 px-4 py-2.5 rounded font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'etikety'
              ? 'bg-amber-500 text-neutral-950 shadow-md scale-[1.02]'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Tag size={16} />
          <span>Sledování etiket piva</span>
          {lowLabelsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[11px]">
              <AlertTriangle className="ikona-text" /> {lowLabelsCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('lahve')}
          className={`shrink-0 px-4 py-2.5 rounded font-black text-xs transition-all flex items-center gap-2 ${
            activeTab === 'lahve'
              ? 'bg-amber-500 text-neutral-950 shadow-md scale-[1.02]'
              : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <Boxes size={16} />
          <span>Sledování prázdných lahví (1.5L / 1L / 0.5L / 0.33L + Víčka)</span>
          {lowBottlesCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-mono text-[11px]">
              <AlertTriangle className="ikona-text" /> {lowBottlesCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: SKLO & PROMO */}
      {activeTab === 'sklo' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Příjem Skla & Promo */}
            <div className="card p-5 sm:p-6 bg-white border border-emerald-200 rounded shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
                <h3 className="font-display font-black text-base sm:text-lg text-emerald-950 flex items-center gap-2">
                  <ArrowDownCircle size={22} className="text-emerald-600" />
                  <span><Download className="ikona-text" /> Příjem na sklad (Přivezeno do pivovaru)</span>
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
                      <option value="sklenice">Sklo & Džbány</option>
                      <option value="podtacky">Podtácky</option>
                      <option value="kelimky">Kelímky (vratné/jednorázové)</option>
                      <option value="promo">Promo & Oblečení & Cedule</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Název předmětu</label>
                  <select value={inItemName} onChange={(e) => setInItemName(e.target.value)} className="input font-bold text-xs">
                    {DEFAULT_ITEMS.map((item) => (
                      <option key={item.name} value={item.name}>{item.name}</option>
                    ))}
                    <option value="__custom__">Jiný předmět (vlastní název)…</option>
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
                      <button type="button" onClick={() => setInQty(String(Math.max(0, (Number(inQty) || 0) - 50)))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition tap">−</button>
                      <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded py-2 shadow-2xs">{inQty || '0'}</span>
                      <button type="button" onClick={() => setInQty(String((Number(inQty) || 0) + 50))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-emerald-700 text-white font-bold text-sm select-none active:scale-95 transition tap">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Dodavatel / Poznámka</label>
                    <input type="text" value={inNote} onChange={(e) => setInNote(e.target.value)} placeholder="Ze sklárny" className="input text-xs font-medium" />
                  </div>
                </div>

                <button type="submit" className="w-full px-5 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs transition shadow-md flex items-center justify-center gap-2">
                  <Plus size={16} /> Zapsat příjem na sklad
                </button>
              </form>
            </div>

            {/* Výdej Skla & Promo */}
            <div className="card p-5 sm:p-6 bg-white border border-amber-200 rounded shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-amber-100 pb-3">
                <h3 className="font-display font-black text-base sm:text-lg text-amber-950 flex items-center gap-2">
                  <ArrowUpCircle size={22} className="text-amber-600" />
                  <span><Upload className="ikona-text" /> Výdej odběratelům & Na akce (Fasování)</span>
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
                      <option value="sklenice">Sklo & Džbány</option>
                      <option value="podtacky">Podtácky</option>
                      <option value="kelimky">Kelímky</option>
                      <option value="promo">Promo & Oblečení</option>
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
                      <button type="button" onClick={() => setOutQty(String(Math.max(0, (Number(outQty) || 0) - 10)))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition tap">−</button>
                      <span className="w-16 min-w-[3.5rem] px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded py-2 shadow-2xs">
                        {outQty || '0'}
                      </span>
                      <button type="button" onClick={() => setOutQty(String((Number(outQty) || 0) + 10))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-amber-950 text-white font-bold text-sm select-none active:scale-95 transition tap">+</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-neutral-700 mb-1">Poznámka</label>
                    <input type="text" value={outNote} onChange={(e) => setOutNote(e.target.value)} placeholder="Na zálohu" className="input text-xs font-medium" />
                  </div>
                </div>

                <button type="submit" className="w-full px-5 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md flex items-center justify-center gap-2">
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
                <div key={item.name} className={`p-4 rounded border-2 shadow-xs space-y-1 ${item.balance > 0 ? 'bg-white border-neutral-200' : 'bg-rose-50 border-rose-200'}`}>
                  <span className="text-[11px] font-black uppercase tracking-wider text-neutral-500 block truncate">{item.name}</span>
                  <div className="flex items-baseline justify-between">
                    <span className={`font-display font-black text-2xl ${item.balance > 0 ? 'text-neutral-950' : 'text-rose-600'}`}>
                      {item.balance.toLocaleString('cs-CZ')} ks
                    </span>
                    <span className="text-xs font-bold text-neutral-600">(<Download className="ikona-text" />+{item.inQty} / <Upload className="ikona-text" />-{item.outQty})</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabulka Sklo */}
          <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-4">
            <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-white pb-3 -mx-6 px-6 pt-1 -mt-1">
              <h3 className="font-display font-black text-lg text-neutral-900">Přehled zadaných pohybů ({filteredEntries.length})</h3>
              <div className="flex items-center gap-2">
                <input type="text" placeholder="Hledat odběratele nebo předmět…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="input !py-1.5 text-xs font-bold w-48" />
              </div>
            </div>

            {filteredEntries.length === 0 ? (
              <EmptyState text="Žádné zapsané pohyby skla." icon={Wine} />
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
                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[11px] font-bold"><Download className="ikona-text" /> PŘÍJEM</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 text-[11px] font-bold"><Upload className="ikona-text" /> VÝDEJ</span>
                          )}
                        </td>
                        <td className="font-black text-[11px]">{e.item_name}</td>
                        <td className="text-right font-mono font-black text-[11px]">{e.quantity} ks</td>
                        <td className="font-bold text-[11px]">{e.destination || '—'}</td>
                        <td className="text-[11px] text-neutral-600">{e.note || '—'}</td>
                        <td>
                          <button onClick={() => handleDeletePromo(e.id)} className="text-rose-600 hover:text-rose-800 p-1 tap"><Trash2 size={15} /></button>
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
            <div className="p-5 rounded bg-rose-50 border-2 border-rose-300 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-display font-black text-base">
                <AlertTriangle size={22} className="text-rose-600 animate-pulse" />
                <span>VAROVÁNÍ: NÍZKÝ STAV ETIKET U {lowLabelsCount} DRUHŮ PIVA! ({'<'} {LABELS_LOW_STOCK_THRESHOLD} ks)</span>

              </div>
              <p className="text-xs text-rose-800 font-medium">
                Při stáčení lahví bylo spotřebováno většinové množství etiket. U následujících piv zbývá méně než {LABELS_LOW_STOCK_THRESHOLD} ks etiket!
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {labelsSummary.filter((l) => l.isLow && l.inLabels > 0).map((l) => (
                  <span key={l.beer_name} className="px-3 py-1.5 rounded bg-rose-600 text-white font-bold text-xs shadow-xs">
                    <AlertTriangle className="ikona-text" /> {l.beer_name}: zbývá jen {l.balance} ks etiket!
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Form: Nákup etiket */}
          <div className="card p-6 bg-white border-2 border-amber-200 rounded shadow-sm space-y-4">
            <h3 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
              <Tag className="text-amber-600" size={20} />
              <span><Tag className="ikona-text" /> Zadání nákupu / příjmu etiket na sklad</span>
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
                  <button type="button" onClick={() => setLabelQty(String(Math.max(0, (Number(labelQty) || 0) - 500)))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition tap">−</button>
                  <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded py-2 shadow-2xs">{labelQty || '0'}</span>
                  <button type="button" onClick={() => setLabelQty(String((Number(labelQty) || 0) + 500))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-amber-950 text-white font-bold text-sm select-none active:scale-95 transition tap">+</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="text" value={labelNote} onChange={(e) => setLabelNote(e.target.value)} placeholder="Poznámka / Dodavatel" className="input text-xs font-medium flex-1" />
                <button type="submit" className="px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md shrink-0">
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
                <div key={l.beer_name} className={`p-5 rounded border-2 transition-all shadow-sm space-y-3 ${l.isLow ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-display font-black text-base text-neutral-950">{l.beer_name}</span>
                    {l.isLow ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[11px] animate-pulse">
                        <AlertTriangle className="ikona-text" /> POZOR {'<'} {LABELS_LOW_STOCK_THRESHOLD} KS!

                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[11px]">
                        <Check className="ikona-text" /> DOSTATEK
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    <div className="p-2 rounded bg-neutral-100">
                      <div className="text-[11px] font-bold text-neutral-500 uppercase">Nakoupeno</div>
                      <div className="text-sm font-black text-neutral-900">+{l.inLabels}</div>
                    </div>
                    <div className="p-2 rounded bg-neutral-100">
                      <div className="text-[11px] font-bold text-neutral-500 uppercase">Stočeno</div>
                      <div className="text-sm font-black text-neutral-900">−{l.usedLabels}</div>
                    </div>
                    <div className={`p-2 rounded ${l.isLow ? 'bg-rose-600 text-white' : 'bg-amber-500 text-neutral-950'}`}>
                      <div className="text-[11px] font-bold uppercase">Zbývá</div>
                      <div className="text-sm font-black">{l.balance} ks</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table: Label Purchases History */}
          <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-3">
            <h4 className="font-display font-black text-base text-neutral-900">Historie nákupů etiket ({labelPurchases.length})</h4>
            {labelPurchases.length === 0 ? (
              <EmptyState text="Zatiaľ nebol zadaný žiadny nákup etiket." icon={Tag} />
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
                      <td className="text-right"><button onClick={() => handleDeleteLabelPurchase(lp.id)} className="text-rose-600 hover:text-rose-800 p-1 tap"><Trash2 size={15} /></button></td>
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
            <div className="p-5 rounded bg-rose-50 border-2 border-rose-300 shadow-md space-y-2">
              <div className="flex items-center gap-2 text-rose-900 font-display font-black text-base">
                <AlertTriangle size={22} className="text-rose-600 animate-pulse" />
                <span>VAROVÁNÍ: NÍZKÝ STAV PRÁZDNÝCH LAHVÍ! ({'<'} 200 ks)</span>

              </div>
              <p className="text-xs text-rose-800 font-medium">
                Při stáčení lahví bylo spotřebováno většinové množství zadaných prázdných lahví. U následujících obalů zbývá méně než 200 ks!
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                {bottlesSummary.filter((b) => b.isLow && b.inBottles > 0).map((b) => (
                  <span key={b.package_label} className="px-3 py-1.5 rounded bg-rose-600 text-white font-bold text-xs shadow-xs">
                    <AlertTriangle className="ikona-text" /> {b.package_label}: zbývá jen {b.balance} ks prázdných lahví!
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 🧴 Závěrky — korunky a PET víčka. Zastaví stáčení stejně
              spolehlivě jako chybějící lahve, jen se jejich spotřeba
              doteď nikde neodečítala. */}
          {nakupyChybi ? (
            <div className="p-4 rounded bg-amber-50 border-2 border-amber-300 text-amber-900 text-sm font-semibold">
              <AlertTriangle className="ikona-text" /> Evidence nákupů obalů zatím není v databázi — je potřeba pustit
              migraci <span className="font-mono text-xs">20261228000000_nakupy_obalu_a_zavirek.sql</span>.
              Do té doby se nákup nedá zapsat (dřív žil jen v tomhle telefonu a ostatní ho neviděli).
            </div>
          ) : zavirky.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-display font-black text-lg text-neutral-900">Závěrky (korunky a PET víčka)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {zavirky.map((z) => (
                  <div key={z.nazev} className={`p-5 rounded border-2 shadow-sm space-y-3 ${z.malo ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-neutral-200'}`}>
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                      <span className="font-display font-black text-base text-neutral-950">{z.nazev}</span>
                      {z.malo ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[11px]">
                          <AlertTriangle className="ikona-text" /> NEZBÝVÁ NA STÁČENÍ
                        </span>
                      ) : z.bezEvidence ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[11px]">
                          NENÍ ZAPSANÝ NÁKUP
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[11px]">
                          <Check className="ikona-text" /> SKLADEM
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1 text-center font-mono">
                      <div className="p-2 rounded bg-neutral-100">
                        <div className="text-[11px] font-bold text-neutral-500 uppercase">Nakoupeno</div>
                        <div className="text-sm font-black text-neutral-900">+{z.nakoupeno}</div>
                      </div>
                      <div className="p-2 rounded bg-neutral-100">
                        <div className="text-[11px] font-bold text-neutral-500 uppercase">Zavřeno lahví</div>
                        <div className="text-sm font-black text-neutral-900">−{z.spotrebovano}</div>
                      </div>
                      <div className={`p-2 rounded ${z.malo ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                        <div className="text-[11px] font-bold uppercase">Zbývá</div>
                        <div className="text-sm font-black">{kusy(z.zustatek)}</div>
                      </div>
                    </div>
                    {/* Hranice „málo" není pevné číslo — u petek je 200 kusů pár
                        minut a u třicítek zásoba na měsíc. */}
                    <p className="text-[11px] font-semibold text-neutral-600">
                      {z.bezEvidence
                        ? 'Spotřeba se počítá, nákup ale zapsaný není — zůstatek proto nic neříká.'
                        : z.naJednoStaceni === null
                          ? 'Obvyklé jedno stáčení se ještě nedá spočítat — málo zápisů.'
                          : `Jedno obvyklé stáčení = ${kusy(z.naJednoStaceni)}${z.malo ? ' — na další už nezbývá.' : `, zásoba na ${Math.floor(z.zustatek / z.naJednoStaceni)}×.`}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form: Nákup prázdných lahví */}
          <div className="card p-6 bg-white border-2 border-emerald-200 rounded shadow-sm space-y-4">
            <h3 className="font-display font-black text-lg text-emerald-950 flex items-center gap-2">
              <Boxes className="text-emerald-600" size={20} />
              <span><IkonaLahev className="ikona-text" /> Zadání nákupu / příjmu lahví a závěrek na sklad</span>
            </h3>

            <form onSubmit={handleAddBottlePurchase} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Druh / Velikost obalu</label>
                <select value={bottlePkgLabel} onChange={(e) => setBottlePkgLabel(e.target.value)} className="input font-bold text-xs">
                  {NABIDKA_NAKUPU.map((pkg) => (
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
                  <button type="button" onClick={() => setBottleQty(String(Math.max(0, (Number(bottleQty) || 0) - 600)))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-neutral-200 text-neutral-800 font-bold text-sm select-none active:scale-95 transition tap">−</button>
                  <span className="w-20 px-2 text-center font-mono font-black text-sm bg-white border border-neutral-200 rounded py-2 shadow-2xs">{bottleQty || '0'}</span>
                  <button type="button" onClick={() => setBottleQty(String((Number(bottleQty) || 0) + 600))} className="w-8 h-8 shrink-0 grid place-items-center rounded bg-emerald-700 text-white font-bold text-sm select-none active:scale-95 transition tap">+</button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input type="text" value={bottleNote} onChange={(e) => setBottleNote(e.target.value)} placeholder="Poznámka / Paleta" className="input text-xs font-medium flex-1" />
                <button type="submit" className="px-4 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs transition shadow-md shrink-0">
                  + Zapsat nákup lahví
                </button>
              </div>
            </form>
          </div>

          {/* Cards per bottle package */}
          <div className="space-y-3">
            <h3 className="font-display font-black text-lg text-neutral-900">Stav prázdných lahví (1.5L / 1L / 0.5L / 0.33L)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {bottlesSummary.map((b) => (
                <div key={b.package_label} className={`p-5 rounded border-2 transition-all shadow-sm space-y-3 ${b.isLow ? 'bg-rose-50/70 border-rose-300' : 'bg-white border-neutral-200'}`}>
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-2">
                    <span className="font-display font-black text-base text-neutral-950">{b.package_label}</span>
                    {b.isLow ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-rose-600 text-white font-mono font-black text-[11px] animate-pulse">
                        <AlertTriangle className="ikona-text" /> POZOR {'<'} 200 KS!

                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-[11px]">
                        <Check className="ikona-text" /> SKLADEM
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-1 text-center font-mono">
                    <div className="p-2 rounded bg-neutral-100">
                      <div className="text-[11px] font-bold text-neutral-500 uppercase">Nakoupeno</div>
                      <div className="text-sm font-black text-neutral-900">+{b.inBottles}</div>
                    </div>
                    <div className="p-2 rounded bg-neutral-100">
                      <div className="text-[11px] font-bold text-neutral-500 uppercase">Stočeno</div>
                      <div className="text-sm font-black text-neutral-900">−{b.usedBottles}</div>
                    </div>
                    <div className={`p-2 rounded ${b.isLow ? 'bg-rose-100 text-rose-800' : 'bg-emerald-50 text-emerald-800'}`}>
                      <div className="text-[11px] font-bold uppercase">Zbývá</div>
                      <div className="text-sm font-black">{b.balance} ks</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Table: Bottle Purchases History */}
          <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-3">
            <h4 className="font-display font-black text-base text-neutral-900">Historie příjmů prázdných lahví ({bottlePurchases.length})</h4>
            {bottlePurchases.length === 0 ? (
              <EmptyState text="Zatiaľ nebol zadaný žiadny nákup prázdných lahví." icon={IkonaLahev} />
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
                      <td className="text-right"><button onClick={() => handleDeleteBottlePurchase(bp.id)} className="text-rose-600 hover:text-rose-800 p-1 tap"><Trash2 size={15} /></button></td>
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
