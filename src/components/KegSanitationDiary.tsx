import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import {
  KegSanitationEntry,
  loadKegSanitation,
  saveKegSanEntry,
  removeKegSanEntry,
  newKegSanEntry,
  isLastWeekOfMonth,
} from '../lib/kegSanitation';
import { SanitationStepRow, currentTimeStr } from './SanitationStepRow';
import { Spinner } from './ui';
import { AlertTriangle, Calendar, CalendarDays, Clock, Edit3, FileSpreadsheet, FileText, Check, CheckCircle2, Moon, Plus, Settings, ShieldAlert, SprayCan, Sun, Trash2, User, UserCheck, X } from 'lucide-react';
import { potvrd } from '../lib/toast';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Definice jednotlivých kroků sanitace KEGů — pro zobrazení deníku jako
// tabulky (datum, co bylo provedeno, čím, koncentrace, čas). Chemie a
// koncentrace jsou u KEGů dané typem kroku (na rozdíl od lahví, kde se
// volí ručně), takže je tu mapujeme napevno podle názvu pole.
type KegStepKey =
  | 'proc_rinse_naoh_2_20' | 'proc_rinse_persteril_02_10' | 'proc_rinse_water_before'
  | 'proc_scrub_valves_naoh_2_15' | 'proc_spray_valves_persteril_02_10' | 'proc_rinse_water_after_valves'
  | 'proc_end_rinse_lines_water' | 'proc_end_rinse_valves_water' | 'proc_end_rinse_couplers_water'
  | 'proc_end_rinse_floors_cellar' | 'proc_end_rinse_floors_walls_bottlers' | 'proc_end_coupler_heads_persteril_bucket'
  | 'proc_month_disassemble_couplers' | 'proc_month_clean_brush_24h' | 'proc_month_rinse_water' | 'proc_month_visual_clean';

const KEG_STEP_DEFS: { key: KegStepKey; label: string; chemical: string; concentration: string | null }[] = [
  { key: 'proc_rinse_naoh_2_20', label: 'Proplach cest', chemical: 'NaOH (louh)', concentration: '2 %' },
  { key: 'proc_rinse_persteril_02_10', label: 'Proplach cest', chemical: 'Persteril', concentration: '0,2 %' },
  { key: 'proc_rinse_water_before', label: 'Oplach stáčečky', chemical: 'Voda', concentration: null },
  { key: 'proc_scrub_valves_naoh_2_15', label: 'Sanitace klapek (kartáč)', chemical: 'NaOH (louh)', concentration: '2 %' },
  { key: 'proc_spray_valves_persteril_02_10', label: 'Sanitace klapek (postřik)', chemical: 'Persteril', concentration: '0,2 %' },
  { key: 'proc_rinse_water_after_valves', label: 'Oplach klapek', chemical: 'Voda', concentration: null },
  { key: 'proc_end_rinse_lines_water', label: 'Proplach pivních cest', chemical: 'Voda', concentration: null },
  { key: 'proc_end_rinse_valves_water', label: 'Oplach klapek', chemical: 'Voda', concentration: null },
  { key: 'proc_end_rinse_couplers_water', label: 'Oplach narážečů + kontrola', chemical: 'Voda', concentration: null },
  { key: 'proc_end_rinse_floors_cellar', label: 'Spláchnutí podlah (sklep)', chemical: 'Voda', concentration: null },
  { key: 'proc_end_rinse_floors_walls_bottlers', label: 'Spláchnutí podlah/stěn (stáčečky)', chemical: 'Voda', concentration: null },
  { key: 'proc_end_coupler_heads_persteril_bucket', label: 'Narážeče v kýblu', chemical: 'Persteril', concentration: null },
  { key: 'proc_month_disassemble_couplers', label: 'Rozborka narážečů do louhu', chemical: 'NaOH (louh)', concentration: null },
  { key: 'proc_month_clean_brush_24h', label: 'Čištění kartáčem (24h louhování)', chemical: 'NaOH (louh)', concentration: null },
  { key: 'proc_month_rinse_water', label: 'Oplach vodou', chemical: 'Voda', concentration: null },
  { key: 'proc_month_visual_clean', label: 'Vizuální kontrola čistoty', chemical: '—', concentration: null },
];

type KegStepRow = {
  entry: KegSanitationEntry;
  label: string;
  chemical: string;
  concentration: string | null;
  time: string | null;
};

export default function KegSanitationDiary() {
  const { profile, user } = useAuth();
  const defaultUserName = profile?.display_name || user?.email?.split('@')[0] || '';

  const [entries, setEntries] = useState<KegSanitationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<KegSanitationEntry | null>(null);

  // Form states
  const [sanDate, setSanDate] = useState(todayStr());
  const [sanTime, setSanTime] = useState('');
  const [performedBy, setPerformedBy] = useState(defaultUserName);
  const [approvedBy, setApprovedBy] = useState('');
  const [reason, setReason] = useState('pred_stacenim');
  const [note, setNote] = useState('');

  // Checklist před stáčením (Before)
  const [procRinseNaoh, setProcRinseNaoh] = useState(false);
  const [procRinsePersteril, setProcRinsePersteril] = useState(false);
  const [procRinseWaterBefore, setProcRinseWaterBefore] = useState(false);
  const [procScrubValvesNaoh, setProcScrubValvesNaoh] = useState(false);
  const [procSprayValvesPersteril, setProcSprayValvesPersteril] = useState(false);
  const [procRinseWaterAfterValves, setProcRinseWaterAfterValves] = useState(false);

  // Checklist po stáčení (After)
  const [procEndRinseLinesWater, setProcEndRinseLinesWater] = useState(false);
  const [procEndRinseValvesWater, setProcEndRinseValvesWater] = useState(false);
  const [procEndRinseCouplersWater, setProcEndRinseCouplersWater] = useState(false);
  const [procEndRinseFloorsCellar, setProcEndRinseFloorsCellar] = useState(false);
  const [procEndRinseFloorsWallsBottlers, setProcEndRinseFloorsWallsBottlers] = useState(false);
  const [procEndCouplerHeadsPersterilBucket, setProcEndCouplerHeadsPersterilBucket] = useState(false);

  // Měsíční sanitace (Monthly)
  const [procMonthDisassembleCouplers, setProcMonthDisassembleCouplers] = useState(false);
  const [procMonthCleanBrush24h, setProcMonthCleanBrush24h] = useState(false);
  const [procMonthRinseWater, setProcMonthRinseWater] = useState(false);
  const [procMonthVisualClean, setProcMonthVisualClean] = useState(false);

  // Časy jednotlivých kroků (step key -> HH:MM) — pole se zobrazí po zaškrtnutí.
  const [stepTimes, setStepTimes] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultUserName && !performedBy) setPerformedBy(defaultUserName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultUserName]);

  async function load() {
    setLoading(true);
    setEntries(await loadKegSanitation());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  // Check if monthly warning should be displayed
  const showMonthlyWarning = useMemo(() => {
    const isLastWeek = isLastWeekOfMonth();
    if (!isLastWeek) return false;
    
    // Check if there is already a monthly sanitation entry for the current month
    const currentMonth = new Date().toISOString().slice(0, 7);
    const hasMonthly = entries.some(
      (e) => e.reason === 'mesicni' && e.sanitation_date.slice(0, 7) === currentMonth
    );
    return !hasMonthly;
  }, [entries]);

  function openNew() {
    setEditing(null);
    setSanDate(todayStr());
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setSanTime(timeStr);
    
    setReason('pred_stacenim');
    setPerformedBy(defaultUserName || performedBy);
    setApprovedBy('');
    setNote('');

    // Reset before checkboxes
    setProcRinseNaoh(true);
    setProcRinsePersteril(false);
    setProcRinseWaterBefore(true);
    setProcScrubValvesNaoh(false);
    setProcSprayValvesPersteril(true);
    setProcRinseWaterAfterValves(true);

    // Reset after checkboxes
    setProcEndRinseLinesWater(false);
    setProcEndRinseValvesWater(false);
    setProcEndRinseCouplersWater(false);
    setProcEndRinseFloorsCellar(false);
    setProcEndRinseFloorsWallsBottlers(false);
    setProcEndCouplerHeadsPersterilBucket(false);

    // Reset monthly checkboxes
    setProcMonthDisassembleCouplers(false);
    setProcMonthCleanBrush24h(false);
    setProcMonthRinseWater(false);
    setProcMonthVisualClean(false);

    // Časy kroků — nový zápis: předvyplnit aktuálním časem u přednastavených kroků
    const t = currentTimeStr();
    const st: Record<string, string> = {
      proc_rinse_naoh_2_20: t,
      proc_rinse_persteril_02_10: t,
      proc_rinse_water_before: t,
      proc_scrub_valves_naoh_2_15: t,
      proc_spray_valves_persteril_02_10: t,
      proc_rinse_water_after_valves: t,
    };
    setStepTimes(st);

    setShowModal(true);
  }

  function openEdit(e: KegSanitationEntry) {
    setEditing(e);
    setSanDate(e.sanitation_date);
    setSanTime(e.sanitation_time || '');
    setReason(e.reason || 'pred_stacenim');
    setPerformedBy(e.performed_by || defaultUserName);
    setApprovedBy(e.approved_by || '');
    setNote(e.note || '');

    setProcRinseNaoh(e.proc_rinse_naoh_2_20);
    setProcRinsePersteril(e.proc_rinse_persteril_02_10);
    setProcRinseWaterBefore(e.proc_rinse_water_before);
    setProcScrubValvesNaoh(e.proc_scrub_valves_naoh_2_15);
    setProcSprayValvesPersteril(e.proc_spray_valves_persteril_02_10);
    setProcRinseWaterAfterValves(e.proc_rinse_water_after_valves);

    setProcEndRinseLinesWater(e.proc_end_rinse_lines_water);
    setProcEndRinseValvesWater(e.proc_end_rinse_valves_water);
    setProcEndRinseCouplersWater(e.proc_end_rinse_couplers_water);
    setProcEndRinseFloorsCellar(e.proc_end_rinse_floors_cellar);
    setProcEndRinseFloorsWallsBottlers(e.proc_end_rinse_floors_walls_bottlers);
    setProcEndCouplerHeadsPersterilBucket(e.proc_end_coupler_heads_persteril_bucket);

    setProcMonthDisassembleCouplers(e.proc_month_disassemble_couplers);
    setProcMonthCleanBrush24h(e.proc_month_clean_brush_24h);
    setProcMonthRinseWater(e.proc_month_rinse_water);
    setProcMonthVisualClean(e.proc_month_visual_clean);

    // Načíst uložené časy kroků (pokud existují)
    setStepTimes({ ...(e.step_times || {}) });

    setShowModal(true);
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);

    const entry: KegSanitationEntry = editing
      ? {
          ...editing,
          sanitation_date: sanDate,
          sanitation_time: sanTime || null,
          performed_by: performedBy.trim() || null,
          approved_by: approvedBy.trim() || null,
          reason,
          note: note.trim() || null,

          proc_rinse_naoh_2_20: procRinseNaoh,
          proc_rinse_persteril_02_10: procRinsePersteril,
          proc_rinse_water_before: procRinseWaterBefore,
          proc_scrub_valves_naoh_2_15: procScrubValvesNaoh,
          proc_spray_valves_persteril_02_10: procSprayValvesPersteril,
          proc_rinse_water_after_valves: procRinseWaterAfterValves,

          proc_end_rinse_lines_water: procEndRinseLinesWater,
          proc_end_rinse_valves_water: procEndRinseValvesWater,
          proc_end_rinse_couplers_water: procEndRinseCouplersWater,
          proc_end_rinse_floors_cellar: procEndRinseFloorsCellar,
          proc_end_rinse_floors_walls_bottlers: procEndRinseFloorsWallsBottlers,
          proc_end_coupler_heads_persteril_bucket: procEndCouplerHeadsPersterilBucket,

          proc_month_disassemble_couplers: procMonthDisassembleCouplers,
          proc_month_clean_brush_24h: procMonthCleanBrush24h,
          proc_month_rinse_water: procMonthRinseWater,
          proc_month_visual_clean: procMonthVisualClean,

          step_times: stepTimes,
        }
      : {
          ...newKegSanEntry(sanDate, performedBy.trim() || null),
          sanitation_time: sanTime || null,
          approved_by: approvedBy.trim() || null,
          reason,
          note: note.trim() || null,

          proc_rinse_naoh_2_20: procRinseNaoh,
          proc_rinse_persteril_02_10: procRinsePersteril,
          proc_rinse_water_before: procRinseWaterBefore,
          proc_scrub_valves_naoh_2_15: procScrubValvesNaoh,
          proc_spray_valves_persteril_02_10: procSprayValvesPersteril,
          proc_rinse_water_after_valves: procRinseWaterAfterValves,

          proc_end_rinse_lines_water: procEndRinseLinesWater,
          proc_end_rinse_valves_water: procEndRinseValvesWater,
          proc_end_rinse_couplers_water: procEndRinseCouplersWater,
          proc_end_rinse_floors_cellar: procEndRinseFloorsCellar,
          proc_end_rinse_floors_walls_bottlers: procEndRinseFloorsWallsBottlers,
          proc_end_coupler_heads_persteril_bucket: procEndCouplerHeadsPersterilBucket,

          proc_month_disassemble_couplers: procMonthDisassembleCouplers,
          proc_month_clean_brush_24h: procMonthCleanBrush24h,
          proc_month_rinse_water: procMonthRinseWater,
          proc_month_visual_clean: procMonthVisualClean,

          step_times: stepTimes,
        };

    if (editing && !editing.id.includes('-')) {
      await removeKegSanEntry(editing.id);
    }
    await saveKegSanEntry(entry);
    setSaving(false);
    setShowModal(false);
    await load();
  }

  async function handleDelete(e: KegSanitationEntry) {
    if (!(await potvrd(`Opravdu smazat záznam deníku KEGů pro ${e.sanitation_date}?`))) return;
    await removeKegSanEntry(e.id);
    await load();
  }

  async function exportExcel() {
    // Knihovna na Excel váží 628 kB — načte se teprve tady, při kliknutí na
    // export. Dřív se importovala staticky, takže se stahovala s obrazovkou
    // i tomu, kdo nikdy nic neexportuje.
    const XLSX = await import('xlsx-js-style');
    const rows = filtered.map((e) => {
      const st = e.step_times || {};
      const t = (key: string) => (st[key] ? ` (${st[key]})` : '');
      return {
      'Datum': e.sanitation_date,
      'Čas': e.sanitation_time ?? '—',
      'Důvod': e.reason === 'pred_stacenim' ? 'Před stáčením' : e.reason === 'po_staceni' ? 'Po stáčení' : 'Měsíční',
      'Provedl': e.performed_by ?? '—',
      'Schválil': e.approved_by ?? '—',
      'NaOH 2% 20min': e.proc_rinse_naoh_2_20 ? 'ANO' + t('proc_rinse_naoh_2_20') : 'NE',
      'Persteril 0.2% 10min': e.proc_rinse_persteril_02_10 ? 'ANO' + t('proc_rinse_persteril_02_10') : 'NE',
      'Oplach vodou stáčečku (2 min)': e.proc_rinse_water_before ? 'ANO' + t('proc_rinse_water_before') : 'NE',
      'Klapky: vystříkat Persterilem 0.2%': e.proc_spray_valves_persteril_02_10 ? 'ANO' + t('proc_spray_valves_persteril_02_10') : 'NE',
      'Oplach klapek vodou': e.proc_rinse_water_after_valves ? 'ANO' + t('proc_rinse_water_after_valves') : 'NE',
      'Po konci: proplach cest vodou': e.proc_end_rinse_lines_water ? 'ANO' + t('proc_end_rinse_lines_water') : 'NE',
      'Po konci: oplach klapek vodou': e.proc_end_rinse_valves_water ? 'ANO' + t('proc_end_rinse_valves_water') : 'NE',
      'Po konci: oplach + kontrola narážečů': e.proc_end_rinse_couplers_water ? 'ANO' + t('proc_end_rinse_couplers_water') : 'NE',
      'Po konci: spláchnutí podlah sklep': e.proc_end_rinse_floors_cellar ? 'ANO' + t('proc_end_rinse_floors_cellar') : 'NE',
      'Po konci: spláchnutí podlah/stěn stáčečky': e.proc_end_rinse_floors_walls_bottlers ? 'ANO' + t('proc_end_rinse_floors_walls_bottlers') : 'NE',
      'Po konci: narážeče v persterilu': e.proc_end_coupler_heads_persteril_bucket ? 'ANO' + t('proc_end_coupler_heads_persteril_bucket') : 'NE',
      'Měsíční: rozebrat narážeče a rychlospojky v louhu': e.proc_month_disassemble_couplers ? 'ANO' + t('proc_month_disassemble_couplers') : 'NE',
      'Měsíční: čištění kartáčem 24h': e.proc_month_clean_brush_24h ? 'ANO' + t('proc_month_clean_brush_24h') : 'NE',
      'Měsíční: oplach vodou': e.proc_month_rinse_water ? 'ANO' + t('proc_month_rinse_water') : 'NE',
      'Měsíční: vizuální čistota': e.proc_month_visual_clean ? 'ANO' + t('proc_month_visual_clean') : 'NE',
      'Poznámka': e.note ?? '',
    };
    });
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sanitární deník KEGů');
    XLSX.writeFile(wb, `Sanitarni_denik_kegu_${todayStr()}.xlsx`);
  }

  const filtered = entries.filter((e) => e.sanitation_date.slice(0, 7) === filterMonth);

  // Rozpad zápisů na jednotlivé provedené kroky (datum, co, čím, koncentrace,
  // čas) — jeden uložený zápis může obsahovat víc zaškrtnutých kroků, takže
  // ho pro tabulkové zobrazení "rozbalíme" na víc řádků.
  const stepRows: KegStepRow[] = useMemo(() => {
    const rows: KegStepRow[] = [];
    filtered.forEach((e) => {
      KEG_STEP_DEFS.forEach((def) => {
        if (!e[def.key]) return;
        rows.push({
          entry: e,
          label: def.label,
          chemical: def.chemical,
          concentration: def.concentration,
          time: e.step_times?.[def.key] || e.sanitation_time || null,
        });
      });
    });
    return rows.sort((a, b) => (a.entry.sanitation_date < b.entry.sanitation_date ? 1 : a.entry.sanitation_date > b.entry.sanitation_date ? -1 : 0));
  }, [filtered]);

  function reasonLabelFor(e: KegSanitationEntry): string {
    return e.reason === 'pred_stacenim' ? 'Před stáčením' : e.reason === 'po_staceni' ? 'Po stáčení' : 'Měsíční';
  }

  return (
    <div className="space-y-4">
      {/* Monthly Warning Banner */}
      {showMonthlyWarning && (
        <div className="card p-4 bg-rose-50 border-2 border-rose-300 rounded flex items-start gap-3 shadow-sm animate-pulse-subtle">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-bold text-xs text-rose-950 uppercase tracking-wide"><AlertTriangle className="ikona-text" /> Upozornění: Poslední týden v měsíci!</h4>
            <p className="text-xs text-rose-900 mt-1 font-semibold">
              Je potřeba provést a zapsat **MĚSÍČNÍ SANITACI KEGŮ** (kompletní rozebrání narážečů, naložení do louhu na 24 hodin, vyčištění kartáčem, oplach a vizuální kontrola).
            </p>
            <button
              onClick={() => {
                openNew();
                setReason('mesicni');
                setProcMonthDisassembleCouplers(true);
                setProcMonthCleanBrush24h(true);
                setProcMonthRinseWater(true);
                setProcMonthVisualClean(true);
              }}
              className="mt-2.5 px-3 py-1.5 rounded bg-rose-600 text-white font-black text-[11px] hover:bg-rose-700 transition"
            >
              <CheckCircle2 className="ikona-text" /> Zahájit měsíční sanitaci
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="card p-4 bg-white border border-neutral-200/90 rounded flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <span><CalendarDays className="ikona-text" /> Měsíc:</span>
          </div>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input !py-1.5 !px-3 text-xs font-semibold"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0}
            className="btn-ghost !rounded flex items-center gap-1.5 text-xs font-bold border border-neutral-200 hover:bg-neutral-50"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Export do Excelu</span>
          </button>
          <button
            onClick={openNew}
            className="btn-primary !rounded flex items-center gap-1.5 text-xs font-black shadow-md bg-amber-500 hover:bg-amber-400 border-none text-neutral-950"
          >
            <Plus size={15} />
            <span>Zapsat sanitaci KEGů</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 bg-white text-center text-neutral-500 border border-neutral-200/60 rounded">
          <Calendar size={48} className="mx-auto mb-3 opacity-20 text-neutral-600" />
          <p className="font-medium text-sm">V tomto měsíci zatím nebyly zapsány žádné sanitace KEGů.</p>
        </div>
      ) : (
        <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filtered.map((e) => {
              const reasonLabel = reasonLabelFor(e);
              return (
                <div key={e.id} className="card p-3.5 bg-white border border-neutral-200/90 rounded shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-sm">
                      <Calendar size={14} className="text-amber-600 shrink-0" />
                      <span>{new Date(e.sanitation_date).toLocaleDateString('cs-CZ')}</span>
                      {e.sanitation_time && (
                        <span className="text-neutral-600 font-medium flex items-center gap-0.5 text-[11px] bg-neutral-100 px-1.5 py-0.5 rounded">
                          <Clock size={10} /> {e.sanitation_time}
                        </span>
                      )}
                    </div>
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded border font-bold text-[11px] shadow-xs ${
                      e.reason === 'mesicni'
                        ? 'bg-rose-100 border-rose-300 text-rose-950'
                        : e.reason === 'po_staceni'
                          ? 'bg-violet-100 border-violet-300 text-violet-950'
                          : 'bg-sky-100 border-sky-300 text-sky-950'
                    }`}>
                      {reasonLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 text-neutral-700 font-semibold text-xs">
                    <User size={13} className="text-neutral-400 shrink-0" />
                    {e.performed_by ?? '—'}
                    {e.approved_by && (
                      <span className="flex items-center gap-1 text-emerald-700 text-[11px] font-bold ml-1.5">
                        <UserCheck size={11} /> Schválil: {e.approved_by}
                      </span>
                    )}
                  </div>

                  <div className="bg-neutral-50/70 rounded px-2.5 py-2 space-y-1">
                    {stepRows.filter((r) => r.entry.id === e.id).length === 0 ? (
                      <span className="text-[11px] text-neutral-400 italic">žádné kroky</span>
                    ) : (
                      stepRows.filter((r) => r.entry.id === e.id).map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-[11px] font-semibold text-neutral-700">
                          <span className="flex items-center gap-1 min-w-0">
                            {r.time && <span className="font-mono font-black text-amber-800 shrink-0">{r.time}</span>}
                            <span className="truncate">{r.label}</span>
                          </span>
                          <span className="shrink-0 text-neutral-600">
                            {r.chemical}{r.concentration ? ` · ${r.concentration}` : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  {e.note && <div className="text-xs text-neutral-600">{e.note}</div>}

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-neutral-100">
                    <button
                      onClick={() => openEdit(e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-amber-100 border border-neutral-200 text-neutral-700 hover:text-amber-900 transition text-[11px] font-bold"
                    >
                      <Edit3 size={13} /> Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-rose-100 border border-neutral-200 text-neutral-700 hover:text-rose-900 transition text-[11px] font-bold"
                    >
                      <Trash2 size={13} /> Smazat
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        <div className="hidden md:block card bg-white border border-neutral-200/90 rounded shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50/70 border-b border-neutral-100 text-neutral-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Datum</th>
                  <th className="py-3 px-4">Co bylo provedeno</th>
                  <th className="py-3 px-4">Čím</th>
                  <th className="py-3 px-4">Koncentrace</th>
                  <th className="py-3 px-4">Čas</th>
                  <th className="py-3 px-4">Provedl / Schválil</th>
                  <th className="py-3 px-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                {stepRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 px-4 text-center text-neutral-400 italic">Žádné kroky nebyly zaškrtnuty.</td>
                  </tr>
                ) : (
                  stepRows.map((r, i) => {
                    const isNewGroup = i === 0 || stepRows[i - 1].entry.id !== r.entry.id;
                    const reasonLabel = reasonLabelFor(r.entry);
                    return (
                      <tr key={`${r.entry.id}-${i}`} className={`hover:bg-amber-50/20 transition-colors ${isNewGroup ? 'border-t-2 border-neutral-200' : ''}`}>
                        {/* Date */}
                        <td className="py-3 px-4 font-bold text-neutral-900 whitespace-nowrap align-top">
                          {isNewGroup && (
                            <div className="flex items-center gap-1.5">
                              <Calendar size={14} className="text-amber-600 shrink-0" />
                              <span>{new Date(r.entry.sanitation_date).toLocaleDateString('cs-CZ')}</span>
                            </div>
                          )}
                        </td>

                        {/* Co bylo provedeno */}
                        <td className="py-3 px-4 align-top">
                          <div className="font-bold text-neutral-900">{r.label}</div>
                          {isNewGroup && (
                            <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded border font-bold text-[11px] shadow-xs ${
                              r.entry.reason === 'mesicni'
                                ? 'bg-rose-100 border-rose-300 text-rose-950'
                                : r.entry.reason === 'po_staceni'
                                  ? 'bg-violet-100 border-violet-300 text-violet-950'
                                  : 'bg-sky-100 border-sky-300 text-sky-950'
                            }`}>
                              {reasonLabel}
                            </span>
                          )}
                        </td>

                        {/* Čím */}
                        <td className="py-3 px-4 align-top text-neutral-700 font-semibold">{r.chemical}</td>

                        {/* Koncentrace */}
                        <td className="py-3 px-4 align-top font-mono font-bold text-neutral-700">{r.concentration ?? '—'}</td>

                        {/* Čas */}
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          {r.time ? (
                            <span className="inline-flex items-center gap-1 text-neutral-700 font-bold">
                              <Clock size={11} className="text-neutral-400" /> {r.time}
                            </span>
                          ) : <span className="text-neutral-400 italic">—</span>}
                        </td>

                        {/* Performed / Approved */}
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          {isNewGroup && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-neutral-700 font-semibold">
                                <User size={13} className="text-neutral-400" />
                                {r.entry.performed_by ?? '—'}
                              </div>
                              {r.entry.approved_by && (
                                <div className="flex items-center gap-1 text-emerald-700 text-[11px] font-bold">
                                  <UserCheck size={11} />
                                  <span>Schválil: {r.entry.approved_by}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                          {isNewGroup && (
                            <div className="inline-flex gap-1.5">
                              <button
                                onClick={() => openEdit(r.entry)}
                                title="Upravit záznam"
                                className="p-2 rounded bg-neutral-100 hover:bg-amber-100 border border-neutral-200 text-neutral-700 hover:text-amber-900 transition"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(r.entry)}
                                title="Smazat záznam"
                                className="p-2 rounded bg-neutral-100 hover:bg-rose-100 border border-neutral-200 text-neutral-700 hover:text-rose-900 transition"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSave} className="card p-6 bg-white rounded max-w-2xl w-full border-2 border-amber-400 shadow-2xl space-y-5 animate-scale-in my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span><SprayCan className="ikona-text" /> {editing ? `Upravit sanitaci KEGů — ${editing.sanitation_date}` : 'Záznam sanitace stáčecí linky KEGů'}</span>
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold" title="Zavřít"><X size={18} /></button>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Left Column: Identifikace & Důvod */}
              <div className="space-y-4">
                <div className="bg-amber-50/50 p-4 rounded border border-amber-100 space-y-3">
                  <h4 className="font-bold text-xs text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={13} /> 1. Základní identifikace
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label !text-[11px] !mb-1">Datum</label>
                      <input type="date" value={sanDate} onChange={(e) => setSanDate(e.target.value)} className="input w-full font-bold text-xs" required />
                    </div>
                    <div>
                      <label className="label !text-[11px] !mb-1">Čas sanitace</label>
                      <input type="time" value={sanTime} onChange={(e) => setSanTime(e.target.value)} className="input w-full font-bold text-xs" />
                    </div>
                  </div>

                  <div>
                    <label className="label !text-[11px] !mb-1">Provedl (uživatel)</label>
                    <input type="text" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="input w-full text-xs font-semibold" required />
                  </div>

                  <div>
                    <label className="label !text-[11px] !mb-1">Typ / Důvod sanitace</label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full text-xs font-semibold">
                      <option value="pred_stacenim">Před stáčením (Zahájení)</option>
                      <option value="po_staceni">Po stáčení (Po konci)</option>
                      <option value="mesicni">Měsíční sanitace (Generální)</option>
                    </select>
                  </div>
                </div>
                
                {/* Approval & Note */}
                <div className="space-y-3">
                  <div>
                    <label className="label !text-[11px] !mb-1">Schválil (odpovědná osoba / sládek)</label>
                    <input type="text" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Např. Sládek Jan" className="input w-full text-xs font-bold" />
                  </div>
                  <div>
                    <label className="label !text-[11px] !mb-1">Poznámka / doplňující záznam</label>
                    <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Jakékoliv doplňující informace..." className="input w-full text-xs" />
                  </div>
                </div>
              </div>

              {/* Right Column: Checklists depending on Reason */}
              <div className="space-y-4">
                
                {/* Section A: Před stáčením */}
                <div className={`p-4 rounded border transition ${reason === 'pred_stacenim' ? 'bg-sky-50/50 border-sky-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    <Sun className="ikona-text" /> Část A: Před stáčením
                  </h4>
                  <div className="space-y-2">
                    <SanitationStepRow
                      field="proc_rinse_naoh_2_20"
                      checked={procRinseNaoh}
                      onChecked={setProcRinseNaoh}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Proplach cest **NaOH 2%** (20 minut)
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_rinse_persteril_02_10"
                      checked={procRinsePersteril}
                      onChecked={setProcRinsePersteril}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      **Nebo** proplach **Persteril 0.2%** (10 minut)
                    </SanitationStepRow>
                    <div className="border-t border-neutral-200/80 my-2 pt-2 space-y-1.5">
                      <span className="block text-[11px] font-bold text-neutral-500 uppercase">Sanitace klapek:</span>
                      <SanitationStepRow
                        field="proc_spray_valves_persteril_02_10"
                        checked={procSprayValvesPersteril}
                        onChecked={setProcSprayValvesPersteril}
                        stepTimes={stepTimes}
                        setStepTimes={setStepTimes}
                      >
                        Vystříkat klapky **Persterilem 0.2%**
                      </SanitationStepRow>
                      <SanitationStepRow
                        field="proc_rinse_water_after_valves"
                        checked={procRinseWaterAfterValves}
                        onChecked={setProcRinseWaterAfterValves}
                        stepTimes={stepTimes}
                        setStepTimes={setStepTimes}
                      >
                        Oplach klapek vodou
                      </SanitationStepRow>
                    </div>
                    <SanitationStepRow
                      field="proc_rinse_water_before"
                      checked={procRinseWaterBefore}
                      onChecked={setProcRinseWaterBefore}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Oplach vodou stáčečku (2 minuty)
                    </SanitationStepRow>
                  </div>
                </div>

                {/* Section B: Po stáčení */}
                <div className={`p-4 rounded border transition ${reason === 'po_staceni' ? 'bg-violet-50/50 border-violet-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    <Moon className="ikona-text" /> Část B: Po stáčení / Po konci
                  </h4>
                  <div className="space-y-2">
                    <SanitationStepRow
                      field="proc_end_rinse_lines_water"
                      checked={procEndRinseLinesWater}
                      onChecked={setProcEndRinseLinesWater}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Proplach pivních cest vodou
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_end_rinse_valves_water"
                      checked={procEndRinseValvesWater}
                      onChecked={setProcEndRinseValvesWater}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Opláchnutí klapek vodou
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_end_rinse_couplers_water"
                      checked={procEndRinseCouplersWater}
                      onChecked={setProcEndRinseCouplersWater}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Oplach narážečů vodou + kontrola
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_end_rinse_floors_cellar"
                      checked={procEndRinseFloorsCellar}
                      onChecked={setProcEndRinseFloorsCellar}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Spláchnutí podlah ve sklepě
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_end_rinse_floors_walls_bottlers"
                      checked={procEndRinseFloorsWallsBottlers}
                      onChecked={setProcEndRinseFloorsWallsBottlers}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Spláchnutí podlahy a stěn u stáčeček
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_end_coupler_heads_persteril_bucket"
                      checked={procEndCouplerHeadsPersterilBucket}
                      onChecked={setProcEndCouplerHeadsPersterilBucket}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Hlavy narážečů ponořeny do kýble v Persterilu
                    </SanitationStepRow>
                  </div>
                </div>

                {/* Section C: Měsíční sanitace */}
                <div className={`p-4 rounded border transition ${reason === 'mesicni' ? 'bg-rose-50/50 border-rose-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    <Calendar className="ikona-text" /> Část C: Měsíční sanitace (Poslední týden)
                  </h4>
                  <div className="space-y-2">
                    <SanitationStepRow
                      field="proc_month_disassemble_couplers"
                      checked={procMonthDisassembleCouplers}
                      onChecked={setProcMonthDisassembleCouplers}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Rozebrat VŠECHNY narážeče a rychlospojky a naložit do louhu
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_month_clean_brush_24h"
                      checked={procMonthCleanBrush24h}
                      onChecked={setProcMonthCleanBrush24h}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Vyčistit rozebrané díly kartáčem (louhování 24 hodin)
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_month_rinse_water"
                      checked={procMonthRinseWater}
                      onChecked={setProcMonthRinseWater}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Poté oplach čistou vodou
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_month_visual_clean"
                      checked={procMonthVisualClean}
                      onChecked={setProcMonthVisualClean}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Vizuální kontrola čistoty a těsnění
                    </SanitationStepRow>
                  </div>
                </div>

              </div>

            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
              <button type="button" onClick={() => setShowModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button type="submit" disabled={saving} className="btn-primary !rounded text-xs font-black shadow-md bg-amber-500 hover:bg-amber-400 border-none text-neutral-950">
                {saving ? 'Ukládám…' : 'Uložit do sanitačního deníku'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
