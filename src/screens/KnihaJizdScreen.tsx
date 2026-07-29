import { useState, useEffect, useMemo } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { Car, Plus, Download, Printer, Trash2, Calendar, MapPin, Navigation, User, Scale, ShieldCheck, CheckCircle2, Zap, Sparkles } from 'lucide-react';

export type LogbookEntry = {
  id: string;
  date: string;          // ISO YYYY-MM-DD
  vehicle_id?: string;
  vehicle_name: string;  // e.g. Velké auto (Peugeot Boxer)
  driver: string;        // e.g. Petr Bednář
  route_from: string;    // Kynšperk nad Ohří (Pivovar)
  route_to: string;      // e.g. Sokolov ➔ Karlovy Vary ➔ Kynšperk nad Ohří
  purpose: string;       // Rozvoz piva z objednávek & Svoz obalů
  km_start: number;      // Stav tachometru začátek
  km_end: number;        // Stav tachometru konec
  km_driven: number;     // Ujeté km
  fuel_liters?: number;  // Načerpáno paliva (l)
  note?: string;
};

type Vehicle = { id: string; name: string; spz?: string };

export default function KnihaJizdScreen({ setPage }: { setPage?: (p: any) => void }) {
  const [entries, setEntries] = useState<LogbookEntry[]>(() => {
    try {
      const saved = localStorage.getItem('kniha_jizd_entries');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));

  // Manual Add Modal / Form state
  const [showModal, setShowModal] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vehicleName, setVehicleName] = useState('');
  const [driver, setDriver] = useState('Petr Bednář');
  const [routeFrom, setRouteFrom] = useState('Kynšperk nad Ohří (Pivovar)');
  const [routeTo, setRouteTo] = useState('');
  const [purpose, setPurpose] = useState('Rozvoz piva z objednávek & Svoz obalů');
  const [kmStart, setKmStart] = useState<string>('125000');
  const [kmDriven, setKmDriven] = useState<string>('85');
  const [note, setNote] = useState('');

  // Auto Generator Modal state
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoMonth, setAutoMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [autoVehicle, setAutoVehicle] = useState('Velké auto (Peugeot Boxer / 3K1 2244)');
  const [autoDriver, setAutoDriver] = useState('Petr Bednář');
  const [autoStartKm, setAutoStartKm] = useState<string>('120000');
  const [autoEndKm, setAutoEndKm] = useState<string>('120850');
  const [autoGenerating, setAutoGenerating] = useState(false);

  async function loadVehicles() {
    setLoading(true);
    const { data } = await supabase.from('vehicles').select('*').order('name');
    const vList = (data as Vehicle[]) ?? [];
    setVehicles(vList);
    if (vList.length > 0) {
      // Find large vehicle primary option
      const largeV = vList.find((v) => v.name.toLowerCase().includes('velk') || v.name.toLowerCase().includes('boxer') || v.name.toLowerCase().includes('transit')) ?? vList[0];
      const defaultName = largeV.spz ? `${largeV.name} (${largeV.spz})` : largeV.name;
      setVehicleName((prev) => prev || defaultName);
      setAutoVehicle((prev) => prev || defaultName);
    }
    setLoading(false);
  }

  useEffect(() => { loadVehicles(); }, []);
  useRealtime(['vehicles'], loadVehicles);

  function saveEntriesToStorage(newEntries: LogbookEntry[]) {
    setEntries(newEntries);
    localStorage.setItem('kniha_jizd_entries', JSON.stringify(newEntries));
  }

  function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    const start = Number(kmStart) || 0;
    const driven = Number(kmDriven) || 0;

    const newE: LogbookEntry = {
      id: crypto.randomUUID(),
      date,
      vehicle_name: vehicleName || 'Velké auto (Peugeot Boxer / 3K1 2244)',
      driver,
      route_from: routeFrom,
      route_to: routeTo || 'Sokolov - Karlovy Vary - Kynšperk nad Ohří',
      purpose,
      km_start: start,
      km_end: start + driven,
      km_driven: driven,
      note,
    };

    saveEntriesToStorage([newE, ...entries]);
    setShowModal(false);
    setRouteTo('');
    setNote('');
  }

  function handleDelete(id: string) {
    if (!window.confirm('Opravdu smazat tento záznam z Knihy jízd?')) return;
    saveEntriesToStorage(entries.filter((e) => e.id !== id));
  }

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => e.date.startsWith(filterMonth));
  }, [entries, filterMonth]);

  const totalKmMonth = useMemo(() => {
    return filteredEntries.reduce((sum, e) => sum + Number(e.km_driven || 0), 0);
  }, [filteredEntries]);

  // ---- AUTOMATICKÝ VÝPOČET A GENEROVÁNÍ KNIHY JÍZD Z OBJEDNÁVEK ----
  async function handleAutoGenerate(e: React.FormEvent) {
    e.preventDefault();
    const startKmNum = Number(autoStartKm) || 0;
    const endKmNum = Number(autoEndKm) || 0;
    const totalDistance = endKmNum - startKmNum;

    if (totalDistance <= 0) {
      alert('Konečný stav tachometru musí být větší než počáteční stav km.');
      return;
    }

    setAutoGenerating(true);

    try {
      // 1. Fetch orders from Supabase for selected month
      const { data: rawOrders } = await supabase
        .from('orders')
        .select('*')
        .neq('status', 'storno')
        .gte('order_date', `${autoMonth}-01`)
        .lte('order_date', `${autoMonth}-31`)
        .order('order_date', { ascending: true });

      const ordersList = (rawOrders as any[]) ?? [];

      if (!ordersList.length) {
        alert(`V měsíci ${autoMonth} nebyly nalezeny žádné objednávky pro vytvoření tras.`);
        setAutoGenerating(false);
        return;
      }

      // 2. Group orders by delivery date or order date
      const dateGroups = new Map<string, { date: string; places: Set<string> }>();
      ordersList.forEach((o) => {
        const d = o.delivery_date || o.order_date;
        if (!d) return;
        const pName = o.place_name || 'Místní odběratel';
        const cur = dateGroups.get(d) || { date: d, places: new Set<string>() };
        cur.places.add(pName);
        dateGroups.set(d, cur);
      });

      const sortedGroupList = [...dateGroups.values()].sort((a, b) => a.date.localeCompare(b.date));

      if (!sortedGroupList.length) {
        alert('Nebyly nalezeny žádné dny s objednávkami.');
        setAutoGenerating(false);
        return;
      }

      // 3. For each day, build route starting and ending in Kynšperk nad Ohří
      // Format: Kynšperk nad Ohří (Pivovar) ➔ [Place 1] ➔ [Place 2] ➔ Kynšperk nad Ohří
      const routes = sortedGroupList.map((g) => {
        const placesArr = Array.from(g.places);
        const routeToText = placesArr.length > 0 
          ? `${placesArr.join(' ➔ ')} ➔ Kynšperk nad Ohří`
          : 'Kynšperk nad Ohří (Okruh)';
        
        // Base weight calculation: 30 km return loop + 25 km per stop
        const rawWeight = 30 + (placesArr.length * 25);
        return {
          date: g.date,
          routeFrom: 'Kynšperk nad Ohří (Pivovar)',
          routeTo: routeToText,
          stopsCount: placesArr.length,
          rawWeight,
        };
      });

      // 4. Distribute totalDistance proportionally & evenly across all delivery days
      const totalRawWeight = routes.reduce((s, r) => s + r.rawWeight, 0);

      let currentKm = startKmNum;
      const generatedEntries: LogbookEntry[] = [];

      routes.forEach((r, idx) => {
        let driven: number;
        if (idx === routes.length - 1) {
          // Last entry gets exact remainder to hit endKmNum precisely
          driven = Math.max(1, endKmNum - currentKm);
        } else {
          const proportion = r.rawWeight / totalRawWeight;
          driven = Math.max(1, Math.round(totalDistance * proportion));
        }

        const kmStartVal = currentKm;
        const kmEndVal = currentKm + driven;
        currentKm = kmEndVal;

        generatedEntries.push({
          id: crypto.randomUUID(),
          date: r.date,
          vehicle_name: autoVehicle || 'Velké auto (Peugeot Boxer / 3K1 2244)',
          driver: autoDriver || 'Petr Bednář',
          route_from: r.routeFrom,
          route_to: r.routeTo,
          purpose: 'Rozvoz piva z objednávek & Svoz obalů',
          km_start: kmStartVal,
          km_end: kmEndVal,
          km_driven: driven,
          note: `Automaticky vygenerováno z objednávek (${r.stopsCount} zastávek v daný den)`,
        });
      });

      // Prepend generated entries, replacing any previous entries for the same dates
      const existingOtherDates = entries.filter((e) => !routes.some((r) => r.date === e.date));
      const updatedEntries = [...generatedEntries, ...existingOtherDates].sort((a, b) => b.date.localeCompare(a.date));

      saveEntriesToStorage(updatedEntries);
      setFilterMonth(autoMonth);
      setShowAutoModal(false);
      alert(`✅ Úspěšně vygenerováno ${generatedEntries.length} závozových jízd (start i cíl Kynšperk) v celkové délce ${totalDistance} km!`);
    } catch (err: any) {
      alert(`Chyba při generování Knihy jízd: ${err?.message || err}`);
    } finally {
      setAutoGenerating(false);
    }
  }

  function exportExcelLogbook() {
    const dataToExport = filteredEntries.map((e) => ({
      Datum: new Date(e.date).toLocaleDateString('cs-CZ'),
      Vozidlo: e.vehicle_name,
      Řidič: e.driver,
      'Odkud': e.route_from,
      'Kam / Trasa': e.route_to,
      'Účel jízdy': e.purpose,
      'Tachometr start': e.km_start,
      'Tachometr konec': e.km_end,
      'Ujeté km': e.km_driven,
      Poznámka: e.note || '—',
    }));

    exportHistoryDetailToExcel(
      dataToExport,
      ['Datum', 'Vozidlo', 'Řidič', 'Odkud', 'Trasa', 'Účel', 'Km Start', 'Km Konec', 'Ujeté km', 'Poznámka'],
      ['Datum', 'Vozidlo', 'Řidič', 'Odkud', 'Kam / Trasa', 'Účel jízdy', 'Tachometr start', 'Tachometr konec', 'Ujeté km', 'Poznámka'],
      `Kniha_jizd_${filterMonth}.xlsx`
    );
  }

  function printLogbook() {
    const rowsHtml = filteredEntries.map((e) => `
      <tr>
        <td style="padding:6px;border:1px solid #ccc;font-weight:bold;">${new Date(e.date).toLocaleDateString('cs-CZ')}</td>
        <td style="padding:6px;border:1px solid #ccc;">${e.vehicle_name}</td>
        <td style="padding:6px;border:1px solid #ccc;">${e.driver}</td>
        <td style="padding:6px;border:1px solid #ccc;">${e.route_from} ➔ ${e.route_to}</td>
        <td style="padding:6px;border:1px solid #ccc;">${e.purpose}</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:right;">${e.km_start} km</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:right;">${e.km_end} km</td>
        <td style="padding:6px;border:1px solid #ccc;text-align:right;font-weight:bold;">${e.km_driven} km</td>
      </tr>
    `).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html>
        <head>
          <title>Kniha jízd — ${filterMonth}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #000; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 14px; font-size: 12px; }
            th { background: #f3f4f6; padding: 8px; border: 1px solid #ccc; text-align: left; }
          </style>
        </head>
        <body>
          <h1>🚚 Kniha jízd pivovaru — Měsíc ${filterMonth}</h1>
          <p style="font-size:12px;color:#555;">Kynšperský pivovar s.r.o. · Celkem ujeto v měsíci: <strong>${totalKmMonth} km</strong></p>
          <table>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Vozidlo</th>
                <th>Řidič</th>
                <th>Trasa (Odkud ➔ Kam)</th>
                <th>Účel jízdy</th>
                <th>Start (km)</th>
                <th>Konec (km)</th>
                <th>Ujeto (km)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml || '<tr><td colspan="8" style="text-align:center;padding:20px;">Žádné jízdní záznamy</td></tr>'}
            </tbody>
          </table>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    win.document.close();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6 pb-12">
      {/* Banner */}
      <div className="bg-neutral-900 text-white p-6 rounded-3xl border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Car size={18} />
            <span>Doprava & Logistika</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span>🚗 Kniha jízd pro daňové účetnictví</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Automatické i ruční generování evidencí jízd z rozvozových tras pro finanční úřad
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded-2xl text-xs font-bold">
            <Calendar size={15} className="text-amber-400" />
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="bg-transparent text-amber-300 font-mono font-black border-none focus:outline-none"
            />
          </div>

          <button
            onClick={() => setShowAutoModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5 animate-pulse"
            title="Automaticky spočítat trasy z objednávek podle dnů s rovnoměrným rozpočítáním tachometru"
          >
            <Zap size={16} className="fill-current text-neutral-950" /> Generovat z objednávek
          </button>

          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Plus size={16} /> Ruční jízda
          </button>

          <button
            onClick={exportExcelLogbook}
            className="px-3 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Excel
          </button>

          <button
            onClick={printLogbook}
            className="px-3 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Printer size={16} /> Tisk pro účetní
          </button>
        </div>
      </div>

      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-500">Ujeté km za měsíc</span>
          <div className="font-display font-black text-2xl text-amber-600">{totalKmMonth} km</div>
          <span className="text-[11px] text-neutral-600">Celkový nájezd měsíce {filterMonth}</span>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-neutral-500">Počet služebních jízd</span>
          <div className="font-display font-black text-2xl text-neutral-900">{filteredEntries.length} jízd</div>
          <span className="text-[11px] text-neutral-600">Rozvozy & Svozy</span>
        </div>
        <div className="card p-4 bg-neutral-900 text-white rounded-2xl space-y-1">
          <span className="text-[10px] font-black uppercase text-amber-400">Pivovarský vozový park</span>
          <div className="font-display font-black text-xl text-white">{vehicles.length || 1} vozidel</div>
          <span className="text-[11px] text-neutral-300">Primárně Velké auto (Kynšperk)</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="card p-6 bg-white border border-neutral-200 rounded-3xl shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <span>Evidenční list jízd ({filteredEntries.length})</span>
          </h3>
          <button
            onClick={() => setShowAutoModal(true)}
            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded-xl transition flex items-center gap-1"
          >
            <Sparkles size={14} /> Automatické dopočítání z tachometru
          </button>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-12 text-xs font-bold text-neutral-500 space-y-3">
            <p>V měsíci {filterMonth} zatím nebyly zapsané žádné jízdy.</p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setShowAutoModal(true)}
                className="px-4 py-2.5 rounded-xl bg-amber-500 text-neutral-950 font-black text-xs shadow-xs flex items-center gap-1.5"
              >
                <Zap size={15} /> Generovat z objednávek
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2.5 rounded-xl bg-neutral-100 text-neutral-800 font-extrabold text-xs"
              >
                + Zadat ručně
              </button>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="table">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Vozidlo</th>
                  <th>Řidič</th>
                  <th>Trasa (Odkud ➔ Kam)</th>
                  <th>Účel jízdy</th>
                  <th className="text-right">Tachometr Start</th>
                  <th className="text-right">Tachometr Konec</th>
                  <th className="text-right font-black text-amber-950">Ujeté km</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-50/80 transition-colors">
                    <td className="font-bold text-xs text-neutral-900 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString('cs-CZ')}
                    </td>
                    <td className="font-black text-xs text-neutral-950">{e.vehicle_name}</td>
                    <td className="font-bold text-xs text-neutral-700">{e.driver}</td>
                    <td className="font-medium text-xs text-neutral-900">
                      <span className="text-neutral-500">{e.route_from}</span> ➔ <strong className="text-amber-900">{e.route_to}</strong>
                    </td>
                    <td className="text-xs text-neutral-600 font-medium">{e.purpose}</td>
                    <td className="text-right font-mono text-xs text-neutral-700">{e.km_start.toLocaleString('cs-CZ')} km</td>
                    <td className="text-right font-mono text-xs text-neutral-700">{e.km_end.toLocaleString('cs-CZ')} km</td>
                    <td className="text-right font-mono font-black text-sm text-amber-600">
                      {e.km_driven.toLocaleString('cs-CZ')} km
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(e.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600 transition"
                        title="Smazat jízdu"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL PRO AUTOMATICKÉ VYGENEROVÁNÍ Z OBJEDNÁVEK */}
      {showAutoModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Zap className="text-amber-500 fill-current" size={20} />
                <span>Generovat Knihu jízd z objednávek</span>
              </h3>
              <button onClick={() => setShowAutoModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleAutoGenerate} className="space-y-3">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 font-medium space-y-1">
                <p className="font-bold flex items-center gap-1 text-amber-900">
                  <CheckCircle2 size={14} className="text-amber-600" />
                  <span>Automatická trasa Kynšperk ➔ Zastávky ➔ Kynšperk</span>
                </p>
                <p>
                  Aplikace vyhledá objednávky v daném měsíci podle dnů, vytvoří trasy začínající i končící v Kynšperku nad Ohří a <strong>rozpočítá celkový stav tachometru rovnoměrně do všech jízd</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Měsíc objednávek</label>
                  <input
                    type="month"
                    required
                    value={autoMonth}
                    onChange={(e) => setAutoMonth(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Řidič</label>
                  <input
                    type="text"
                    required
                    value={autoDriver}
                    onChange={(e) => setAutoDriver(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Vozidlo (Primárně Velké auto)</label>
                <select
                  value={autoVehicle}
                  onChange={(e) => setAutoVehicle(e.target.value)}
                  className="input font-bold text-xs"
                >
                  <option value="Velké auto (Peugeot Boxer / 3K1 2244)">Velké auto (Peugeot Boxer / 3K1 2244)</option>
                  {vehicles.map((v) => {
                    const label = v.spz ? `${v.name} (${v.spz})` : v.name;
                    return <option key={v.id} value={label}>{label}</option>;
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Tachometr START (km)</label>
                  <input
                    type="number"
                    required
                    value={autoStartKm}
                    onChange={(e) => setAutoStartKm(e.target.value)}
                    className="input font-mono font-bold text-xs"
                    placeholder="Např. 120000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Tachometr KONEC (km)</label>
                  <input
                    type="number"
                    required
                    value={autoEndKm}
                    onChange={(e) => setAutoEndKm(e.target.value)}
                    className="input font-mono font-bold text-xs"
                    placeholder="Např. 120850"
                  />
                </div>
              </div>

              {Number(autoEndKm) > Number(autoStartKm) && (
                <div className="p-2.5 rounded-xl bg-neutral-900 text-amber-300 font-mono font-bold text-xs flex justify-between items-center">
                  <span>Celkem ujeto k rozpočítání:</span>
                  <span className="text-sm font-black text-white">{(Number(autoEndKm) - Number(autoStartKm)).toLocaleString('cs-CZ')} km</span>
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowAutoModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  disabled={autoGenerating}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Zap size={16} />
                  <span>{autoGenerating ? 'Generuji trasy...' : 'Vygenerovat jízdy'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PRO RUČNÍ ZADÁNÍ NOVÉ JÍZDY */}
      {showModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Car className="text-amber-600" size={20} />
                <span>Zapsat ruční jízdu do Knihy jízd</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
            </div>

            <form onSubmit={handleAddEntry} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Datum jízdy</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Řidič</label>
                  <input
                    type="text"
                    required
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Vozidlo</label>
                {vehicles.length > 0 ? (
                  <select
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    className="input font-bold text-xs"
                  >
                    {vehicles.map((v) => {
                      const label = v.spz ? `${v.name} (${v.spz})` : v.name;
                      return <option key={v.id} value={label}>{label}</option>;
                    })}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    value={vehicleName}
                    onChange={(e) => setVehicleName(e.target.value)}
                    placeholder="Např. Velké auto (Peugeot Boxer / 3K1 2244)"
                    className="input font-bold text-xs"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Odkud</label>
                  <input
                    type="text"
                    required
                    value={routeFrom}
                    onChange={(e) => setRouteFrom(e.target.value)}
                    className="input font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Kam / Trasa jízdy</label>
                  <input
                    type="text"
                    required
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    placeholder="Např. Sokolov ➔ Karlovy Vary ➔ Kynšperk nad Ohří"
                    className="input font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Účel jízdy</label>
                <input
                  type="text"
                  required
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="input font-bold text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Stav tachometru start (km)</label>
                  <input
                    type="number"
                    required
                    value={kmStart}
                    onChange={(e) => setKmStart(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Ujeté km (vzdálenost)</label>
                  <input
                    type="number"
                    required
                    value={kmDriven}
                    onChange={(e) => setKmDriven(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
                >
                  Uložit jízdu
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
