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
import { 
  Plus, 
  FileSpreadsheet, 
  Calendar, 
  User, 
  Edit3, 
  Trash2, 
  Check, 
  Clock, 
  FileText, 
  Settings, 
  ShieldAlert, 
  CheckCircle2, 
  UserCheck,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

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
    if (!window.confirm(`Opravdu smazat záznam deníku KEGů pro ${e.sanitation_date}?`)) return;
    await removeKegSanEntry(e.id);
    await load();
  }

  function exportExcel() {
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
      'Měsíční: rozebrat narážeče v louhu': e.proc_month_disassemble_couplers ? 'ANO' + t('proc_month_disassemble_couplers') : 'NE',
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

  return (
    <div className="space-y-4">
      {/* Monthly Warning Banner */}
      {showMonthlyWarning && (
        <div className="card p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-start gap-3 shadow-sm animate-pulse-subtle">
          <AlertTriangle className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-bold text-xs text-rose-950 uppercase tracking-wide">⚠️ Upozornění: Poslední týden v měsíci!</h4>
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
              className="mt-2.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white font-black text-[11px] hover:bg-rose-700 transition"
            >
              ✅ Zahájit měsíční sanitaci
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="card p-4 bg-white border border-neutral-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-bold text-neutral-700">
            <span>🗓️ Měsíc:</span>
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
            className="btn-ghost flex items-center gap-1.5 text-xs font-bold border border-neutral-200 hover:bg-neutral-50"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Export do Excelu</span>
          </button>
          <button
            onClick={openNew}
            className="btn-primary flex items-center gap-1.5 text-xs font-black shadow-md bg-amber-500 hover:bg-amber-600 border-none text-neutral-950"
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
        <div className="card p-12 bg-white text-center text-neutral-400 border border-neutral-200/60 rounded-2xl">
          <Calendar size={48} className="mx-auto mb-3 opacity-20 text-neutral-600" />
          <p className="font-medium text-sm">V tomto měsíci zatím nebyly zapsány žádné sanitace KEGů.</p>
        </div>
      ) : (
        <div className="card bg-white border border-neutral-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50/70 border-b border-neutral-100 text-neutral-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Datum a čas</th>
                  <th className="py-3 px-4">Typ / Důvod</th>
                  <th className="py-3 px-4">Provedl / Schválil</th>
                  <th className="py-3 px-4">Provedené kroky</th>
                  <th className="py-3 px-4">Poznámka</th>
                  <th className="py-3 px-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                {filtered.map((e) => {
                  const reasonLabel = 
                    e.reason === 'pred_stacenim' ? 'Před stáčením' : 
                    e.reason === 'po_staceni' ? 'Po stáčení' : 'Měsíční';
                  
                  // Summary of checked steps to display in table
                  const st = e.step_times || {};
                  const withTime = (label: string | boolean | null | undefined, key: string) => {
                    if (!label || typeof label === 'boolean') return '';
                    return st[key] ? `${label} ⏱${st[key]}` : label;
                  };
                  let stepsSummary = '';
                  if (e.reason === 'pred_stacenim') {
                    stepsSummary = [
                      withTime(e.proc_rinse_naoh_2_20 && 'NaOH 2%', 'proc_rinse_naoh_2_20'),
                      withTime(e.proc_rinse_persteril_02_10 && 'Persteril 0.2%', 'proc_rinse_persteril_02_10'),
                      withTime(e.proc_rinse_water_before && 'Proplach vodou', 'proc_rinse_water_before'),
                      withTime(e.proc_scrub_valves_naoh_2_15 && 'Klapky: louh 2% (kartáč)', 'proc_scrub_valves_naoh_2_15'),
                      withTime(e.proc_spray_valves_persteril_02_10 && 'Klapky: persteril 0.2%', 'proc_spray_valves_persteril_02_10'),
                      withTime(e.proc_rinse_water_after_valves && 'Oplach klapek', 'proc_rinse_water_after_valves')
                    ].filter(Boolean).join(', ');
                  } else if (e.reason === 'po_staceni') {
                    stepsSummary = [
                      withTime(e.proc_end_rinse_lines_water && 'Proplach pivních cest', 'proc_end_rinse_lines_water'),
                      withTime(e.proc_end_rinse_valves_water && 'Oplach klapek', 'proc_end_rinse_valves_water'),
                      withTime(e.proc_end_rinse_couplers_water && 'Oplach narážečů', 'proc_end_rinse_couplers_water'),
                      withTime(e.proc_end_rinse_floors_cellar && 'Spláchnutí sklepa', 'proc_end_rinse_floors_cellar'),
                      withTime(e.proc_end_rinse_floors_walls_bottlers && 'Spláchnutí stáčeček', 'proc_end_rinse_floors_walls_bottlers'),
                      withTime(e.proc_end_coupler_heads_persteril_bucket && 'Narážeče v persterilu', 'proc_end_coupler_heads_persteril_bucket')
                    ].filter(Boolean).join(', ');
                  } else {
                    stepsSummary = [
                      withTime(e.proc_month_disassemble_couplers && 'Rozborka do louhu', 'proc_month_disassemble_couplers'),
                      withTime(e.proc_month_clean_brush_24h && 'Čištění kartáčem (24h)', 'proc_month_clean_brush_24h'),
                      withTime(e.proc_month_rinse_water && 'Oplach vodou', 'proc_month_rinse_water'),
                      withTime(e.proc_month_visual_clean && 'Vizuální čistota OK', 'proc_month_visual_clean')
                    ].filter(Boolean).join(', ');
                  }

                  return (
                    <tr key={e.id} className="hover:bg-amber-50/20 transition-colors">
                      {/* Date & Time */}
                      <td className="py-3.5 px-4 font-bold text-neutral-900 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={14} className="text-amber-600 shrink-0" />
                          <span>{new Date(e.sanitation_date).toLocaleDateString('cs-CZ')}</span>
                          {e.sanitation_time && (
                            <span className="text-neutral-500 font-medium flex items-center gap-0.5 text-[10px] ml-1 bg-neutral-100 px-1.5 py-0.5 rounded">
                              <Clock size={10} /> {e.sanitation_time}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg border font-bold text-[11px] shadow-xs ${
                          e.reason === 'mesicni' 
                            ? 'bg-rose-100 border-rose-300 text-rose-950' 
                            : e.reason === 'po_staceni'
                              ? 'bg-purple-100 border-purple-300 text-purple-950'
                              : 'bg-sky-100 border-sky-300 text-sky-950'
                        }`}>
                          {reasonLabel}
                        </span>
                      </td>

                      {/* Performed / Approved */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-neutral-700 font-semibold">
                            <User size={13} className="text-neutral-400" />
                            {e.performed_by ?? '—'}
                          </div>
                          {e.approved_by && (
                            <div className="flex items-center gap-1 text-emerald-700 text-[10px] font-bold">
                              <UserCheck size={11} />
                              <span>Schválil: {e.approved_by}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Steps Summary */}
                      <td className="py-3.5 px-4 max-w-xs text-neutral-700 font-medium text-[11px] leading-relaxed">
                        {stepsSummary || <span className="text-neutral-400 italic">žádné kroky</span>}
                      </td>

                      {/* Note */}
                      <td className="py-3.5 px-4 max-w-[200px] text-neutral-600 truncate">{e.note || <span className="text-neutral-400 italic">—</span>}</td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => openEdit(e)}
                            title="Upravit záznam"
                            className="p-2 rounded-xl bg-neutral-100 hover:bg-amber-100 border border-neutral-200 text-neutral-700 hover:text-amber-900 transition"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(e)}
                            title="Smazat záznam"
                            className="p-2 rounded-xl bg-neutral-100 hover:bg-rose-100 border border-neutral-200 text-neutral-700 hover:text-rose-900 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <form onSubmit={handleSave} className="card p-6 bg-white rounded-3xl max-w-2xl w-full border-2 border-amber-400 shadow-2xl space-y-5 animate-scale-in my-8">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
                <span>🧼 {editing ? `Upravit sanitaci KEGů — ${editing.sanitation_date}` : 'Záznam sanitace stáčecí linky KEGů'}</span>
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold">✕</button>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Left Column: Identifikace & Důvod */}
              <div className="space-y-4">
                <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100 space-y-3">
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
                      <option value="pred_stacenim">☀️ Před stáčením (Zahájení)</option>
                      <option value="po_staceni">🌙 Po stáčení (Po konci)</option>
                      <option value="mesicni">📅 Měsíční sanitace (Generální)</option>
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
                <div className={`p-4 rounded-2xl border transition ${reason === 'pred_stacenim' ? 'bg-sky-50/50 border-sky-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    ☀️ Část A: Před stáčením
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
                      <span className="block text-[10px] font-bold text-neutral-500 uppercase">Sanitace klapek:</span>
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
                <div className={`p-4 rounded-2xl border transition ${reason === 'po_staceni' ? 'bg-purple-50/50 border-purple-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    🌙 Část B: Po stáčení / Po konci
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
                <div className={`p-4 rounded-2xl border transition ${reason === 'mesicni' ? 'bg-rose-50/50 border-rose-300 shadow-sm' : 'bg-neutral-50/50 border-neutral-200 opacity-60'}`}>
                  <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                    📅 Část C: Měsíční sanitace (Poslední týden)
                  </h4>
                  <div className="space-y-2">
                    <SanitationStepRow
                      field="proc_month_disassemble_couplers"
                      checked={procMonthDisassembleCouplers}
                      onChecked={setProcMonthDisassembleCouplers}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Rozebrat narážeče a nechat v louhu
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_month_clean_brush_24h"
                      checked={procMonthCleanBrush24h}
                      onChecked={setProcMonthCleanBrush24h}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Vyčistit kartáčem (louhování 24 hodin)
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
              <button type="button" onClick={() => setShowModal(false)} className="btn-ghost text-xs font-bold">Zrušit</button>
              <button type="submit" disabled={saving} className="btn-primary text-xs font-black shadow-md bg-amber-500 hover:bg-amber-600 border-none text-neutral-950">
                {saving ? 'Ukládám…' : '✅ Uložit do sanitačního deníku'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
