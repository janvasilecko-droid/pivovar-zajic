import { useState, useEffect, useMemo } from 'react';
import { fetchAllRows, supabase, useRealtime } from '../lib/supabase';
import { Spinner } from '../components/ui';
import { exportHistoryDetailToExcel } from '../lib/excel';
import { AlertTriangle, Bird, ChevronLeft, Calendar, Car, CheckCircle2, Download, MapPin, Navigation, Plus, Printer, Scale, ShieldCheck, Sparkles, Trash2, User, X, Zap } from 'lucide-react';
import { isOrderKachna } from '../lib/zavozSecondCar';
import { printTable } from '../lib/safePrint';
import { computeRouteDistanceKm } from '../lib/routeDistance';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import { DAYS } from '../lib/shared';
import { chyba, oznam, potvrd } from '../lib/toast';

export type LogbookEntry = {
  id: string;
  date: string;          // ISO YYYY-MM-DD
  vehicle_id?: string;
  vehicle_name: string;  // e.g. Velké auto (Peugeot Boxer)
  driver: string;        // e.g. Petr Bednář
  route_from: string;    // Kynšperk nad Ohří (Pivovar)
  route_to: string;      // e.g. Sokolov → Karlovy Vary → Kynšperk nad Ohří
  purpose: string;       // Rozvoz piva z objednávek & Svoz obalů
  km_start: number;      // Stav tachometru začátek
  km_end: number;        // Stav tachometru konec
  km_driven: number;     // Ujeté km
  fuel_liters?: number;  // Načerpáno paliva (l)
  note?: string;
};

type Vehicle = { id: string; name: string; spz?: string };

// Sloupec v DB je entry_date; ve zbytku obrazovky (a v LogbookEntry typu výše)
// se pole jmenuje `date`, ať se nemusí přejmenovávat na desítkách míst.
function rowToEntry(r: any): LogbookEntry {
  return {
    id: r.id,
    date: r.entry_date,
    vehicle_id: r.vehicle_id ?? undefined,
    vehicle_name: r.vehicle_name,
    driver: r.driver,
    route_from: r.route_from,
    route_to: r.route_to,
    purpose: r.purpose,
    km_start: Number(r.km_start) || 0,
    km_end: Number(r.km_end) || 0,
    km_driven: Number(r.km_driven) || 0,
    fuel_liters: r.fuel_liters ?? undefined,
    note: r.note ?? undefined,
  };
}

export default function KnihaJizdScreen({ setPage }: { setPage?: (p: any) => void }) {
  const [entries, setEntries] = useState<LogbookEntry[]>([]);

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
  const [previewDays, setPreviewDays] = useState<{ date: string; routeTo: string; stopsCount: number; isKachna: boolean; km: string; missingCoords: string[] }[]>([]);

  function openAutoModal() {
    setAutoStep('form');
    setPreviewDays([]);
    setShowAutoModal(true);
  }

  // Poslední zaznamenaný stav tachometru (km_end) pro každé vozidlo — entries
  // jsou seřazené od nejnovějšího data, takže první výskyt daného vozidla je
  // jeho poslední záznam. Použije se pro předvyplnění i kontrolu návaznosti.
  const lastKmEndByVehicle = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of entries) {
      if (!(e.vehicle_name in map)) map[e.vehicle_name] = e.km_end;
    }
    return map;
  }, [entries]);

  function openAddModal() {
    const last = lastKmEndByVehicle[vehicleName];
    if (last != null) setKmStart(String(last));
    setShowModal(true);
  }

  async function loadVehicles() {
    const { data } = await supabase.from('vehicles').select('*').order('name');
    const vList = (data as Vehicle[]) ?? [];
    setVehicles(vList);
    if (vList.length > 0) {
      // Find large vehicle primary option
      const largeV = vList.find((v) => v.name.toLowerCase().includes('velk') || v.name.toLowerCase().includes('boxer') || v.name.toLowerCase().includes('transit')) ?? vList[0];
      const defaultName = largeV.spz ? `${largeV.name} (${largeV.spz})` : largeV.name;
      setVehicleName((prev) => prev || defaultName);
    }
  }

  async function loadEntries() {
    const { data } = await fetchAllRows('logbook_entries', '*').order('entry_date', { ascending: false }).order('created_at', { ascending: false });
    setEntries(((data as any[]) ?? []).map(rowToEntry));
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadVehicles(), loadEntries()]).finally(() => setLoading(false));
  }, []);
  useRealtime(['vehicles'], loadVehicles);
  useRealtime(['logbook_entries'], loadEntries);

  // Uloží nové záznamy do Supabase (sdílená Kniha jízd, ne lokální prohlížeč)
  // a rovnou je promítne do UI, ať uživatel nečeká na realtime echo.
  async function persistNewEntries(newEntries: LogbookEntry[]) {
    const payload = newEntries.map((e) => ({
      id: e.id,
      entry_date: e.date,
      vehicle_id: e.vehicle_id ?? null,
      vehicle_name: e.vehicle_name,
      driver: e.driver,
      route_from: e.route_from,
      route_to: e.route_to,
      purpose: e.purpose,
      km_start: e.km_start,
      km_end: e.km_end,
      km_driven: e.km_driven,
      fuel_liters: e.fuel_liters ?? null,
      note: e.note ?? null,
    }));
    const { error } = await supabase.from('logbook_entries').insert(payload);
    if (error) {
      chyba(`Nepodařilo se uložit jízdu/jízdy do Knihy jízd: ${error.message}`);
      return;
    }
    setEntries((prev) => [...newEntries, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
  }

  // Kniha jízd VŽDY začíná a končí v pivovaru (Kynšperk nad Ohří) — doplní se
  // automaticky na konec trasy, pokud tam uživatel zapomene napsat.
  const HOME_BASE = 'Kynšperk nad Ohří (Pivovar)';
  function ensureEndsAtHomeBase(routeToRaw: string): string {
    const r = routeToRaw.trim() || 'Okruh po odběratelích';
    return /kynšperk/i.test(r) ? r : `${r} → Kynšperk nad Ohří`;
  }

  async function handleAddEntry(e: React.FormEvent) {
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

    await persistNewEntries([newE]);
    setShowModal(false);
    setRouteTo('');
    setNote('');
  }

  async function handleDelete(id: string) {
    if (!(await potvrd('Opravdu smazat tento záznam z Knihy jízd?'))) return;
    const { error } = await supabase.from('logbook_entries').delete().eq('id', id);
    if (error) {
      chyba(`Nepodařilo se smazat záznam: ${error.message}`);
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
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

  // ---- KROK 1: NAČÍST DNY ZÁVOZU Z OBJEDNÁVEK ----
  async function handleBuildPreview(e: React.FormEvent) {
    e.preventDefault();
    setAutoGenerating(true);

    try {
      // Většina objednávek nemá vyplněné konkrétní delivery_date (to se ukládá
      // jen u výslovně napsaného data) — místo toho mají delivery_day (den v
      // týdnu: po/ut/st/ct/pa/so/ne) + order_date, ze kterých appka jinde
      // (Orders.tsx, isoWeekKey(o.delivery_date || o.order_date)) dopočítává
      // skutečné datum. Bez tohoto dopočtu by generátor přeskočil naprostou
      // většinu reálných rozvozů (viz bug: srpen nabídl jen objednávky s ručně
      // vyplněným přesným datem, zbytek — vč. několika jízd do Prahy — chyběl).
      //
      // Načteme širší okno podle order_date (± 1 týden přes hranice měsíce,
      // pro případ přelivu týdne přes konec/začátek měsíce) SJEDNOCENÉ s
      // objednávkami, co mají explicitní delivery_date přímo v měsíci (to může
      // být naplánováno i mimo okno order_date, viz orders s delivery_date o
      // dost dní/týdny později než order_date).
      const monthStart = `${autoMonth}-01`;
      const [yy, mm] = autoMonth.split('-').map(Number);
      const monthEnd = `${autoMonth}-${String(new Date(Date.UTC(yy, mm, 0)).getUTCDate()).padStart(2, '0')}`;
      const addDaysISO = (iso: string, delta: number) => {
        const d = new Date(iso + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() + delta);
        return d.toISOString().slice(0, 10);
      };
      const bufStart = addDaysISO(monthStart, -7);
      const bufEnd = addDaysISO(monthEnd, 7);

      const [{ data: rawOrders }, { data: rawPlaces }] = await Promise.all([
        fetchAllRows('orders', '*')
          .neq('status', 'storno')
          .or(
            `and(delivery_date.gte.${monthStart},delivery_date.lte.${monthEnd}),and(order_date.gte.${bufStart},order_date.lte.${bufEnd})`
          )
          .order('order_date', { ascending: true }),
        supabase.from('places').select('id, name, lat, lng'),
      ]);

      const dayCodeOffset = (code: string | null | undefined): number | null => {
        if (!code) return null;
        const idx = DAYS.findIndex((d) => d.v === code);
        return idx >= 0 ? idx : null;
      };

      // Skutečné datum dodání: explicitní delivery_date má přednost, jinak
      // dopočet z týdne objednávky (order_date) + den v týdnu (delivery_day).
      const effectiveDeliveryDate = (o: any): string | null => {
        if (o.delivery_date) return o.delivery_date;
        const offset = dayCodeOffset(o.delivery_day);
        if (offset === null || !o.order_date) return null;
        const weekStart = weekRange(isoWeekKey(o.order_date)).start;
        const d = new Date(weekStart);
        d.setUTCDate(d.getUTCDate() + offset);
        return d.toISOString().slice(0, 10);
      };

      const ordersList = ((rawOrders as any[]) ?? [])
        .map((o) => ({ ...o, _effectiveDate: effectiveDeliveryDate(o) }))
        .filter((o) => o._effectiveDate && o._effectiveDate >= monthStart && o._effectiveDate <= monthEnd);

      const skippedNoDay = ((rawOrders as any[]) ?? []).filter((o) => !effectiveDeliveryDate(o)).length;

      const placesById = new Map<string, { lat: number | null; lng: number | null }>(
        ((rawPlaces as any[]) ?? []).map((p) => [p.id, { lat: p.lat, lng: p.lng }])
      );

      if (!ordersList.length) {
        oznam(`V měsíci ${autoMonth} nebyly nalezeny žádné objednávky s rozpoznatelným dnem rozvozu.`);
        setAutoGenerating(false);
        return;
      }

      if (skippedNoDay > 0) {
        console.warn(`Kniha jízd: ${skippedNoDay} objednávek přeskočeno — chybí den v týdnu (delivery_day) i konkrétní datum.`);
      }

      // Objednávky dne rozdělíme podle toho, kterou objednávku odbavil v Závozu
      // zaškrtnutím "🦆 Kačena" — smíšený den (část objednávek Kačenou, část
      // velkým autem) vytvoří DVĚ samostatné jízdy pro stejné datum.
      const dateGroups = new Map<string, any[]>();
      ordersList.forEach((o) => {
        const d = o._effectiveDate as string;
        const arr = dateGroups.get(d) ?? [];
        arr.push(o);
        dateGroups.set(d, arr);
      });

      const buildRoute = (dayOrders: any[]) => {
        const placeNames = Array.from(new Set(dayOrders.map((o) => o.place_name || 'Místní odběratel')));
        return placeNames.length > 0 ? `${placeNames.join(' → ')} → Kynšperk nad Ohří` : 'Kynšperk nad Ohří (Okruh)';
      };

      // Zastávky dne v pořadí prvního výskytu — pro OSRM výpočet reálné jízdní
      // vzdálenosti pivovar → zastávky → pivovar. Zastávky bez uložených
      // souřadnic (u odběratele) se do výpočtu nezapočítají.
      const buildStops = (dayOrders: any[]) => {
        const seen = new Set<string>();
        const stops: { name: string; lat: number | null; lng: number | null }[] = [];
        dayOrders.forEach((o) => {
          const name = o.place_name || 'Místní odběratel';
          const key = o.place_id || name;
          if (seen.has(key)) return;
          seen.add(key);
          const p = o.place_id ? placesById.get(o.place_id) : undefined;
          stops.push({ name, lat: p?.lat ?? null, lng: p?.lng ?? null });
        });
        return stops;
      };

      const groups: { date: string; routeTo: string; stopsCount: number; isKachna: boolean; stops: { name: string; lat: number | null; lng: number | null }[] }[] = [];
      [...dateGroups.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([dDate, dayOrders]) => {
          const kachnaOrders = dayOrders.filter((o) => isOrderKachna(o.id));
          const bigOrders = dayOrders.filter((o) => !isOrderKachna(o.id));
          if (bigOrders.length > 0) {
            groups.push({
              date: dDate,
              routeTo: buildRoute(bigOrders),
              stopsCount: new Set(bigOrders.map((o) => o.place_name)).size,
              isKachna: false,
              stops: buildStops(bigOrders),
            });
          }
          if (kachnaOrders.length > 0) {
            groups.push({
              date: dDate,
              routeTo: buildRoute(kachnaOrders),
              stopsCount: new Set(kachnaOrders.map((o) => o.place_name)).size,
              isKachna: true,
              stops: buildStops(kachnaOrders),
            });
          }
        });

      // Reálná jízdní vzdálenost přes OSRM — pro každý den/auto zvlášť, ať se
      // dá km po vygenerování náhledu ještě ručně opravit.
      const days: typeof previewDays = await Promise.all(
        groups.map(async (g) => {
          const { km, missingCoords } = await computeRouteDistanceKm(g.stops);
          return {
            date: g.date,
            routeTo: g.routeTo,
            stopsCount: g.stopsCount,
            isKachna: g.isKachna,
            km: km > 0 ? String(km) : '',
            missingCoords,
          };
        })
      );

      setPreviewDays(days);
      setAutoStep('preview');
    } catch (err: any) {
      chyba(`Chyba při načítání objednávek: ${err?.message || err}`);
    } finally {
      setAutoGenerating(false);
    }
  }

  // ---- KROK 2: Z NÁHLEDU (upravené km + vozidlo na den) VYTVOŘIT ZÁZNAMY ----
  async function handleGenerateFromPreview() {
    if (previewDays.some((d) => !d.km || Number(d.km) <= 0)) {
      if (!(await potvrd('Některé dny nemají vyplněné ujeté km. Pokračovat i tak (budou mít 0 km)?'))) return;
    }
    let currentKm = Number(autoStartKm) || 0;
    const generatedEntries: LogbookEntry[] = previewDays.map((d) => {
      const driven = Math.max(0, Number(d.km) || 0);
      const kmStartVal = currentKm;
      const kmEndVal = currentKm + driven;
      currentKm = kmEndVal;
      const missingNote = d.missingCoords.length > 0
        ? ` — km odhad neúplný, chybí souřadnice u: ${d.missingCoords.join(', ')} (doplň v Odběratelích)`
        : '';
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
        note: `Vygenerováno z objednávek (${d.stopsCount} zastávek v daný den)${d.isKachna ? ' — auto Kachna' : ' — Velké auto'}${missingNote}`,
      };
    });

    // Znovu-vygenerování za stejné dny nahradí předchozí záznamy pro tyto
    // dny, ať se při opakovaném běhu nehromadí duplicity.
    const affectedDates = Array.from(new Set(previewDays.map((d) => d.date)));
    const { error: delError } = await supabase.from('logbook_entries').delete().in('entry_date', affectedDates);
    if (delError) {
      chyba(`Nepodařilo se nahradit stávající záznamy: ${delError.message}`);
      return;
    }
    setEntries((prev) => prev.filter((e) => !affectedDates.includes(e.date)));

    await persistNewEntries(generatedEntries);
    setFilterMonth(autoMonth);
    setShowAutoModal(false);
    setAutoStep('form');
    setPreviewDays([]);
    oznam(`Úspěšně vygenerováno ${generatedEntries.length} závozových jízd!`);
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
      heading: `Kniha jízd pivovaru — Měsíc ${filterMonth}`,
      summary: `Kynšperský pivovar s.r.o. · Celkem ujeto v měsíci: ${totalKmMonth} km`,
      columns: [
        { label: 'Datum' },
        { label: 'Vozidlo' },
        { label: 'Řidič' },
        { label: 'Trasa (Odkud → Kam)' },
        { label: 'Účel jízdy' },
        { label: 'Start (km)', align: 'right' },
        { label: 'Konec (km)', align: 'right' },
        { label: 'Ujeto (km)', align: 'right' },
      ],
      rows: filteredEntries.map((entry) => [
        new Date(entry.date).toLocaleDateString('cs-CZ'),
        entry.vehicle_name,
        entry.driver,
        `${entry.route_from} → ${entry.route_to}`,
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
      <div className="bg-neutral-900 text-white p-6 rounded border border-amber-500/30 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-xs uppercase tracking-widest mb-1">
            <Car size={18} />
            <span>Doprava & Logistika</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
            <span><Car className="ikona-text" /> Kniha jízd pro daňové účetnictví</span>
          </h1>
          <p className="text-xs text-neutral-400 font-medium mt-1">
            Automatické i ruční generování evidencí jízd z rozvozových tras pro finanční úřad
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded text-xs font-bold">
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
            className="px-4 py-2.5 rounded bg-amber-400 hover:bg-amber-300 text-neutral-950 font-black text-xs transition shadow-md flex items-center gap-1.5 animate-pulse"
            title="Automaticky spočítat trasy z objednávek podle dnů s rovnoměrným rozpočítáním tachometru"
          >
            <Zap size={16} className="fill-current text-neutral-950" /> Generovat z objednávek
          </button>

          <button
            onClick={openAddModal}
            className="px-4 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Plus size={16} /> Ruční jízda
          </button>

          <button
            onClick={exportExcelLogbook}
            className="px-3 py-2.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Download size={16} /> Excel
          </button>

          <button
            onClick={printLogbook}
            className="px-3 py-2.5 rounded bg-neutral-800 hover:bg-neutral-700 text-white font-extrabold text-xs transition shadow-xs flex items-center gap-1.5"
          >
            <Printer size={16} /> Tisk pro účetní
          </button>
        </div>
      </div>

      {/* Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Ujeté km za měsíc</span>
          <div className="font-display font-black text-2xl text-amber-600">{totalKmMonth} km</div>
          <span className="text-[11px] text-neutral-600">Celkový nájezd měsíce {filterMonth}</span>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Počet služebních jízd</span>
          <div className="font-display font-black text-2xl text-neutral-900">{filteredEntries.length} jízd</div>
          <span className="text-[11px] text-neutral-600">Rozvozy & Svozy</span>
        </div>
        <div className="card p-4 bg-white border border-neutral-200 rounded space-y-1">
          <span className="text-[11px] font-black uppercase text-neutral-500">Pivovarský vozový park</span>
          <div className="font-display font-black text-xl text-neutral-900">{vehicles.length || 1} vozidel</div>
          <span className="text-[11px] text-neutral-600">Primárně Velké auto (Kynšperk)</span>
        </div>
      </div>

      {/* Main Table */}
      <div className="card p-6 bg-white border border-neutral-200 rounded shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <span>Evidenční list jízd ({filteredEntries.length})</span>
          </h3>
          <button
            onClick={openAutoModal}
            className="text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-3 py-1.5 rounded transition flex items-center gap-1"
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
                className="px-4 py-2.5 rounded bg-amber-500 text-neutral-950 font-black text-xs shadow-xs flex items-center gap-1.5"
              >
                <Zap size={15} /> Generovat z objednávek
              </button>
              <button
                onClick={openAddModal}
                className="px-4 py-2.5 rounded bg-neutral-100 text-neutral-800 font-extrabold text-xs"
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
              <div key={e.id} className="rounded border border-neutral-200 bg-white p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-sm text-neutral-950">{e.vehicle_name}</div>
                    <div className="text-[11px] text-neutral-500 font-bold">{new Date(e.date).toLocaleDateString('cs-CZ')} · {e.driver}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-black text-sm text-amber-600 whitespace-nowrap">{e.km_driven.toLocaleString('cs-CZ')} km</span>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="w-9 h-9 grid place-items-center rounded hover:bg-rose-100 text-rose-600 transition shrink-0"
                      title="Smazat jízdu"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-neutral-700 font-medium">
                  <span className="text-neutral-500">{e.route_from}</span> → <strong className="text-amber-900">{e.route_to}</strong>
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
                  <th>Trasa (Odkud → Kam)</th>
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
                      <span className="text-neutral-500">{e.route_from}</span> → <strong className="text-amber-900">{e.route_to}</strong>
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
                        className="p-1.5 rounded hover:bg-rose-100 text-rose-600 transition"
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
          <div className="bg-white rounded max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Zap className="text-amber-500 fill-current" size={20} />
                <span>Generovat Knihu jízd z objednávek</span>
              </h3>
              <button onClick={() => setShowAutoModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg" title="Zavřít"><X size={18} /></button>
            </div>

            {autoStep === 'form' ? (
              <form onSubmit={handleBuildPreview} className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-950 font-medium space-y-1">
                  <p className="font-bold flex items-center gap-1 text-amber-900">
                    <CheckCircle2 size={14} className="text-amber-600" />
                    <span>Trasa Kynšperk → Zastávky → Kynšperk</span>
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
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
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
                    className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                  >
                    Zrušit
                  </button>
                  <button
                    type="submit"
                    disabled={autoGenerating}
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Zap size={16} />
                    <span>{autoGenerating ? 'Načítám dny…' : 'Načíst dny z objednávek →'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3">
                <p className="text-[11px] text-neutral-500 font-bold leading-snug">
                  Nalezeno <strong>{previewDays.length}</strong> {previewDays.length === 1 ? 'jízda' : 'jízd'} se závozem v {autoMonth} — vozidlo je předvyplněné podle značení <strong><Bird className="ikona-text" /> Kačena</strong> u jednotlivých objednávek v Závozu (smíšený den = dvě jízdy). Klidně přeškrtni, jinak se použije <strong>{bigVehicleLabel}</strong>. Km jsou předvyplněná reálnou jízdní vzdálenostní trasy pivovar → zastávky → pivovar — klidně uprav podle tachometru, pokud se liší.
                </p>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {previewDays.map((d, i) => (
                    <div key={`${d.date}-${d.isKachna ? 'kachna' : 'velke'}-${i}`} className="rounded border border-neutral-200 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-xs text-neutral-900 flex items-center gap-1.5">
                          {new Date(d.date).toLocaleDateString('cs-CZ')}
                          <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black uppercase ${d.isKachna ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {d.isKachna ? 'Kačena' : 'Velké auto'}
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-neutral-500">{d.stopsCount} zastávek</span>
                      </div>
                      <div className="text-[11px] text-neutral-600 font-medium leading-snug">{d.routeTo}</div>
                      {d.missingCoords.length > 0 && (
                        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 font-semibold leading-snug">
                          <AlertTriangle className="ikona-text" /> Chybí souřadnice u: {d.missingCoords.join(', ')} — km je jen odhad zbylých zastávek, doplň v Odběratelích nebo uprav ručně.
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1.5 text-xs font-bold text-neutral-700 shrink-0">
                          <input
                            type="checkbox"
                            checked={d.isKachna}
                            onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, isKachna: e.target.checked } : r))}
                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 accent-amber-500"
                          />
                          <Bird className="ikona-text" /> Kachna
                        </label>
                        <input
                          type="number" onWheel={(e) => e.currentTarget.blur()}
                          min={0}
                          step="0.1"
                          inputMode="decimal"
                          className="input !py-1.5 flex-1 font-mono font-bold text-xs"
                          placeholder="km za tento den"
                          value={d.km}
                          onChange={(e) => setPreviewDays((rs) => rs.map((r, j) => j === i ? { ...r, km: e.target.value.replace(/[^0-9.]/g, '') } : r))}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-3 flex justify-between gap-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setAutoStep('form')}
                    className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                  >
                    <ChevronLeft className="ikona-text" /> Zpět
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateFromPreview}
                    className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-1.5"
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
          <div className="bg-white rounded max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <Car className="text-amber-600" size={20} />
                <span>Zapsat ruční jízdu do Knihy jízd</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg" title="Zavřít"><X size={18} /></button>
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
                    onChange={(e) => {
                      setVehicleName(e.target.value);
                      const last = lastKmEndByVehicle[e.target.value];
                      if (last != null) setKmStart(String(last));
                    }}
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
                    className="input font-bold text-xs bg-neutral-100 text-neutral-600 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Kam / Trasa jízdy</label>
                  <input
                    type="text"
                    required
                    value={routeTo}
                    onChange={(e) => setRouteTo(e.target.value)}
                    placeholder="Např. Sokolov → Karlovy Vary (vrátí se automaticky do Kynšperku)"
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
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                    required
                    value={kmStart}
                    onChange={(e) => setKmStart(e.target.value)}
                    className="input font-mono font-bold text-xs"
                  />
                  {lastKmEndByVehicle[vehicleName] != null && Number(kmStart) !== lastKmEndByVehicle[vehicleName] && (
                    <p className="text-[11px] text-amber-700 font-bold mt-1 leading-snug">
                      <AlertTriangle className="ikona-text" /> Poslední záznam tohoto vozidla končí na {lastKmEndByVehicle[vehicleName].toLocaleString('cs-CZ')} km — nenavazuje.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Ujeté km (vzdálenost)</label>
                  <input
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
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
                  className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
                >
                  Zrušit
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
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
