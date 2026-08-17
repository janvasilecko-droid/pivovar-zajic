import { useState, useEffect, useMemo } from 'react';
import { supabase, useRealtime } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { Car, Plus, Download, Printer, Trash2, Calendar, MapPin, Navigation, User, Scale, ShieldCheck, CheckCircle2, Zap, Sparkles } from 'lucide-react';
import { isOrderKachna } from '../lib/zavozSecondCar';
import { printTable } from '../lib/safePrint';

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
  const [routeTo, setRouteTo] = useState('');
  const [purpose, setPurpose] = useState('Rozvoz piva z objednávek & Svoz obalů');
  const [kmStart, setKmStart] = useState<string>('125000');
  const [kmDriven, setKmDriven] = useState<string>('85');
  const [note, setNote] = useState('');

  // Auto Generator Modal state — dvoukrokové: 1) měsíc/řidič/počáteční km → načte dny
  // z objednávek, 2) náhled dnů s editovatelným km a přepínačem vozidla (Velké auto/Kachna).
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoStep, setAutoStep] = useState<'form' | 'preview'>('form');
  const [autoMonth, setAutoMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [autoDriver, setAutoDriver] = useState('Petr Bednář');
  const [autoStartKm, setAutoStartKm] = useState<string>('120000');
  const [autoGenerating, setAutoGenerating] = useState(false);
  const [previewDays, setPreviewDays] = useState<{ date: string; routeTo: string; stopsCount: number; isKachna: boolean; km: string }[]>([]);

  function openAutoModal() {
    setAutoStep('form');
    setPreviewDays([]);
    setShowAutoModal(true);
  }

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
    }
    setLoading(false);
  }

  useEffect(() => { loadVehicles(); }, []);
  useRealtime(['vehicles'], loadVehicles);

  function saveEntriesToStorage(newEntries: LogbookEntry[]) {
    setEntries(newEntries);
    localStorage.setItem('kniha_jizd_entries', JSON.stringify(newEntries));
  }

  // Kniha jízd VŽDY začíná a končí v pivovaru (Kynšperk nad Ohří) — doplní se
  // automaticky na konec trasy, pokud tam uživatel zapomene napsat.
  const HOME_BASE = 'Kynšperk nad Ohří (Pivovar)';
  function ensureEndsAtHomeBase(routeToRaw: string): string {
    const r = routeToRaw.trim() || 'Okruh po odběratelích';
    return /kynšperk/i.test(r) ? r : `${r} ➔ Kynšperk nad Ohří`;
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
      route_from: HOME_BASE,
      route_to: ensureEndsAtHomeBase(routeTo),
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

  // Velké auto — výchozí vozidlo pro vygenerované jízdy z objednávek
  const bigVehicleLabel = useMemo(() => {
    const big =
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return n.includes('velk') || n.includes('boxer') || n.includes('transit');
      }) ?? vehicles[0];
    return big ? (big.spz ? `${big.name} (${big.spz})` : big.name) : 'Velké auto (Peugeot Boxer / 3K1 2244)';
  }, [vehicles]);

  // Druhé vozidlo pivovaru (Kachna / Kačena) — dny označené v Závozu se zapíšou na něj
  const secondVehicleLabel = useMemo(() => {
    const second =
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return n.includes('kachna') || n.includes('kačena') || n.includes('kacena');
      }) ??
      vehicles.find((v) => {
        const n = v.name.toLowerCase();
        return !n.includes('velk') && !n.includes('boxer') && !n.includes('transit');
      }) ??
      vehicles[1];
    return second ? (second.spz ? `${second.name} (${second.spz})` : second.name) : 'Kachna (Kačena)';
  }, [vehicles]);

  // ---- KROK 1: NAČÍST DNY ZÁVOZU Z OBJEDNÁVEK (jen ty, které MAJÍ nastavený den závozu) ----
  async function handleBuildPreview(e: React.FormEvent) {
    e.preventDefault();
    setAutoGenerating(true);

    try {
      // Jen objednávky s nastaveným dnem závozu (delivery_date) — objednávky bez něj
      // by vytvářely fiktivní jízdy na den vytvoření objednávky, ne na skutečný den rozvozu.
      const { data: rawOrders } = await supabase
        .from('orders')
        .select('*')
        .neq('status', 'storno')
        .not('delivery_date', 'is', null)
        .gte('delivery_date', `${autoMonth}-01`)
        .lte('delivery_date', `${autoMonth}-31`)
        .order('delivery_date', { ascending: true });

      const ordersList = (rawOrders as any[]) ?? [];

      if (!ordersList.length) {
        alert(`V měsíci ${autoMonth} nebyly nalezeny žádné objednávky s nastaveným dnem závozu.`);
        setAutoGenerating(false);
        return;
      }

      // Objednávky dne rozdělíme podle toho, kterou objednávku odbavil v Závozu
      // zaškrtnutím "🦆 Kačena" — smíšený den (část objednávek Kačenou, část
      // velkým autem) vytvoří DVĚ samostatné jízdy pro stejné datum.
      const dateGroups = new Map<string, any[]>();
      ordersList.forEach((o) => {
        const d = o.delivery_date;
        if (!d) return;
        const arr = dateGroups.get(d) ?? [];
        arr.push(o);
        dateGroups.set(d, arr);
      });

      const buildRoute = (dayOrders: any[]) => {
        const placeNames = Array.from(new Set(dayOrders.map((o) => o.place_name || 'Místní odběratel')));
        return placeNames.length > 0 ? `${placeNames.join(' ➔ ')} ➔ Kynšperk nad Ohří` : 'Kynšperk nad Ohří (Okruh)';
      };

      const days: typeof previewDays = [];
      [...dateGroups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([dDate, dayOrders]) => {
          const kachnaOrders = dayOrders.filter((o) => isOrderKachna(o.id));
          const bigOrders = dayOrders.filter((o) => !isOrderKachna(o.id));
          if (bigOrders.length > 0) {
            days.push({
              date: dDate,
              routeTo: buildRoute(bigOrders),
              stopsCount: new Set(bigOrders.map((o) => o.place_name)).size,
              isKachna: false,
              km: '',
            });
          }
          if (kachnaOrders.length > 0) {
            days.push({
              date: dDate,
              routeTo: buildRoute(kachnaOrders),
              stopsCount: new Set(kachnaOrders.map((o) => o.place_name)).size,
              isKachna: true,
              km: '',
            });
          }
        });

      setPreviewDays(days);
      setAutoStep('preview');
    } catch (err: any) {
      alert(`Chyba při načítání objednávek: ${err?.message || err}`);
    } finally {
      setAutoGenerating(false);
    }
  }

  // ---- KROK 2: Z NÁHLEDU (upravené km + vozidlo na den) VYTVOŘIT ZÁZNAMY ----
  function handleGenerateFromPreview() {
    if (previewDays.some((d) => !d.km || Number(d.km) <= 0)) {
      if (!window.confirm('Některé dny nemají vyplněné ujeté km. Pokračovat i tak (budou mít 0 km)?')) return;
    }
    let currentKm = Number(autoStartKm) || 0;
    const generatedEntries: LogbookEntry[] = previewDays.map((d) => {
      const driven = Math.max(0, Number(d.km) || 0);
      const kmStartVal = currentKm;
      const kmEndVal = currentKm + driven;
      currentKm = kmEndVal;
      return {
        id: crypto.randomUUID(),
        date: d.date,
        vehicle_name: d.isKachna ? secondVehicleLabel : bigVehicleLabel,
        driver: autoDriver || 'Petr Bednář',
        route_from: HOME_BASE,
        route_to: d.routeTo,
        purpose: 'Rozvoz piva z objednávek & Svoz obalů',
        km_start: kmStartVal,
        km_end: kmEndVal,
        km_driven: driven,
        note: `Vygenerováno z objednávek (${d.stopsCount} zastávek v daný den)${d.isKachna ? ' — auto Kachna' : ' — Velké auto'}`,
      };
    });

    const existingOtherDates = entries.filter((e) => !previewDays.some((d) => d.date === e.date));
    const updatedEntries = [...generatedEntries, ...existingOtherDates].sort((a, b) => b.date.localeCompare(a.date));

    saveEntriesToStorage(updatedEntries);
    setFilterMonth(autoMonth);
    setShowAutoModal(false);
    setAutoStep('form');
    setPreviewDays([]);
    alert(`✅ Úspěšně vygenerováno ${generatedEntries.length} závozových jízd!`);
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
    printTable({
      title: `Kniha jízd — ${filterMonth}`,
      heading: `🚚 Kniha jízd pivovaru — Měsíc ${filterMonth}`,
      summary: `Kynšperský pivovar s.r.o. · Celkem ujeto v měsíci: ${totalKmMonth} km`,
      columns: [
        { label: 'Datum' },
        { label: 'Vozidlo' },
        { label: 'Řidič' },
        { label: 'Trasa (Odkud ➔ Kam)' },
        { label: 'Účel jízdy' },
        { label: 'Start (km)', align: 'right' },
        { label: 'Konec (km)', align: 'right' },
        { label: 'Ujeto (km)', align: 'right' },
      ],
      rows: filteredEntries.map((entry) => [
        new Date(entry.date).toLocaleDateString('cs-CZ'),
        entry.vehicle_name,
        entry.driver,
        `${entry.route_from} ➔ ${entry.route_to}`,
        entry.purpose,
        `${entry.km_start} km`,
        `${entry.km_end} km`,
        `${entry.km_driven} km`,
      ]),
      emptyMessage: 'Žádné jízdní záznamy',
    });
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
            onClick={openAutoModal}
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
            onClick={openAutoModal}
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
                onClick={openAutoModal}
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
          <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filteredEntries.map((e) => (
              <div key={e.id} className="rounded-2xl border border-neutral-200 bg-white p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-sm text-neutral-950">{e.vehicle_name}</div>
                    <div className="text-[11px] text-neutral-500 font-bold">{new Date(e.date).toLocaleDateString('cs-CZ')} · {e.driver}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-black text-sm text-amber-600 whitespace-nowrap">{e.km_driven.toLocaleString('cs-CZ')} km</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="w-9 h-9 grid place-items-center rounded-lg hover:bg-rose-100 text-rose-600 transition shrink-0"
                      title="Smazat jízdu"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-neutral-700 font-medium">
                  <span className="text-neutral-500">{e.route_from}</span> ➔ <strong className="text-amber-900">{e.route_to}</strong>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500 font-mono">
                  <span>{e.purpose}</span>
                  <span>{e.km_start.toLocaleString('cs-CZ')} → {e.km_end.toLocaleString('cs-CZ')} km</span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto scrollbar-thin">
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
          </>
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

            {autoStep === 'form' ? (
              <form onSubmit={handleBuildPreview} className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 font-medium space-y-1">
                  <p className="font-bold flex items-center gap-1 text-amber-900">
                    <CheckCircle2 size={14} className="text-amber-600" />
                    <span>Trasa Kynšperk ➔ Zastávky ➔ Kynšperk</span>
                  </p>
                  <p>
                    Načtou se dny, které mají v objednávkách nastavený <strong>den závozu</strong>. V dalším kroku pro každý den zvolíš vozidlo (výchozí Velké auto, nebo zaškrtneš Kachnu) a doplníš skutečně ujeté km.
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
                  <label className="block text-xs font-black text-neutral-700 mb-1">Tachometr na začátku měsíce (km)</label>
                  <input
                    type="number"
                    required
                    value={autoStartKm}
                    onChange={(e) => setAutoStartKm(e.target.value)}
                    className="input font-mono font-bold text-xs"
                    placeholder="Např. 120000"
                  />
                </div>

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
                    <span>{autoGenerating ? 'Načítám dny…' : 'Načíst dny z objednávek →'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-neutral-500 font-bold leading-snug">
                  Nalezeno <strong>{previewDays.length}</strong> {previewDays.length === 1 ? 'jízda' : 'jízd'} se závozem v {autoMonth} — vozidlo je předvyplněné podle značení <strong>🦆 Kačena</strong> u jednotlivých objednávek v Závozu (smíšený den = dvě jízdy). Klidně přeškrtni, jinak se použije <strong>{bigVehicleLabel}</strong>. Doplň ujeté km z tachometru za danou jízdu.
                </p>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {previewDays.map((d, i) => (
                    <div key={`${d.date}-${d.isKachna ? 'kachna' : 'velke'}-${i}`} className="rounded-2xl border border-neutral-200 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-xs text-neutral-900 flex items-center gap-1.5">
                          {new Date(d.date).toLocaleDateString('cs-CZ')}
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${d.isKachna ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {d.isKachna ? '🦆 Kačena' : '🚐 Velké auto'}
                          </span>
                        </span>
                        <span className="text-[10px] font-bold text-neutral-500">{d.stopsCount} zastávek</span>
                      </div>
                      <div className="text-[11px] text-neutral-600 font-medium leading-snug">{d.routeTo}</div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 shrink-0">
                          <input
                            type="checkbox"
                            checked={d.isKachna}
                            onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, isKachna: e.target.checked } : r))}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500"
                          />
                          🦆 Kachna
                        </label>
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          className="input !py-1.5 flex-1 font-mono font-bold text-xs"
                          placeholder="km za tento den"
                          value={d.km}
                          onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, km: e.target.value.replace(/[^0-9]/g, '') } : r))}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 flex justify-between gap-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setAutoStep('form')}
                    className="px-4 py-2 rounded-xl bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                  >
                    ← Zpět
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateFromPreview}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-1.5"
                  >
                    <Zap size={16} />
                    <span>Vygenerovat {previewDays.length} jízd</span>
                  </button>
                </div>
              </div>
            )}
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
                    disabled
                    value={HOME_BASE}
                    title="Každá jízda vždy začíná v pivovaru"
                    className="input font-bold text-xs bg-neutral-100 text-neutral-500 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Kam / Trasa jízdy</label>
                  <input
                    type="text"
                    required
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    placeholder="Např. Sokolov ➔ Karlovy Vary (vrátí se automaticky do Kynšperku)"
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
