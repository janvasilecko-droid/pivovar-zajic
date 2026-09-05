import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  BottleSanField,
  BottleSanitationEntry,
  BOTTLE_SAN_FIELDS,
  loadBottleSanitation,
  saveBottleSanEntry,
  removeBottleSanEntry,
  newBottleSanEntry,
} from '../lib/bottleSanitation';
import { Spinner } from './ui';
import { SanitationStepRow, currentTimeStr } from './SanitationStepRow';
import { Beaker, Calendar, CalendarDays, ClipboardCheck, Clock, Edit3, FileSpreadsheet, FileText, Check, CheckCircle2, Plus, Settings, ShieldAlert, SprayCan, Trash2, User, UserCheck, X } from 'lucide-react';
import { potvrd } from '../lib/toast';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Definice kroků sanitace lahví — pro zobrazení deníku jako tabulky (datum,
// co bylo provedeno, čím, koncentrace, čas). U lahví je chemie/koncentrace
// společná pro celý zápis (vybírá se ručně v `chemical_name`/`chemical_concentration`),
// jen krok "oplach vodou" ji nepoužívá. Pole `louh`/`proplach_vodou`/
// `cela_cesta_na_louhu`/`prostory` jsou starší přímé zápisy (auto-zápis
// z checklistu) — chemie/koncentrace se u nich neukládá ručně, proto mají
// napevno danou hodnotu.
type BottleStepKey =
  | 'proc_circulation' | 'proc_rinse_water' | 'proc_rinse_co2' | 'proc_disassembly'
  | 'louh' | 'proplach_vodou' | 'cela_cesta_na_louhu' | 'prostory';

const BOTTLE_STEP_DEFS: {
  key: BottleStepKey;
  label: string;
  chemical: (e: BottleSanitationEntry) => string;
  concentration: (e: BottleSanitationEntry) => string | null;
}[] = [
  { key: 'proc_circulation', label: 'Cirkulace sanitačního roztoku', chemical: (e) => e.chemical_name || '—', concentration: (e) => e.chemical_concentration || null },
  { key: 'proc_rinse_water', label: 'Oplach čistou vodou', chemical: () => 'Voda', concentration: () => null },
  { key: 'proc_rinse_co2', label: 'Finální výplach / profuk CO₂', chemical: () => 'Voda / CO₂', concentration: () => null },
  { key: 'proc_disassembly', label: 'Rozebrání a ruční čištění Pegasu', chemical: () => '—', concentration: () => null },
  { key: 'louh', label: 'Proplach stáčecích cest (louh)', chemical: () => 'NaOH (louh)', concentration: (e) => e.chemical_concentration || null },
  { key: 'proplach_vodou', label: 'Proplach čistou vodou', chemical: () => 'Voda', concentration: () => null },
  { key: 'cela_cesta_na_louhu', label: 'Celá cesta (vč. vzduchové) na louhu', chemical: () => 'NaOH (louh)', concentration: (e) => e.chemical_concentration || null },
  { key: 'prostory', label: 'Úklid prostor stáčení', chemical: () => '—', concentration: () => null },
];

type BottleStepRow = {
  entry: BottleSanitationEntry;
  label: string;
  chemical: string;
  concentration: string | null;
  time: string | null;
};

export default function BottleSanitationDiary() {
  const { profile, user } = useAuth();
  const defaultUserName = profile?.display_name || user?.email?.split('@')[0] || '';

  const [entries, setEntries] = useState<BottleSanitationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<BottleSanitationEntry | null>(null);
  
  // Basic Info
  const [sanDate, setSanDate] = useState(todayStr());
  const [sanTime, setSanTime] = useState('');
  const [performedBy, setPerformedBy] = useState(defaultUserName);
  
  // Equipment checklist
  const [eqPegas, setEqPegas] = useState(false);
  const [eqHoses, setEqHoses] = useState(false);
  const [eqCoupler, setEqCoupler] = useState(false);
  const [eqCo2, setEqCo2] = useState(false);
  
  // Reason
  const [reason, setReason] = useState('pravidelna');
  
  // Chemical parameters
  const [chemicalName, setChemicalName] = useState('');
  const [chemicalConcentration, setChemicalConcentration] = useState('');
  const [chemicalTemperature, setChemicalTemperature] = useState('');
  const [chemicalContactTime, setChemicalContactTime] = useState('');
  
  // Procedure checklist
  const [procRinseWater, setProcRinseWater] = useState(false);
  const [procCirculation, setProcCirculation] = useState(false);
  const [procRinseCo2, setProcRinseCo2] = useState(false);
  const [procDisassembly, setProcDisassembly] = useState(false);
  
  // Control points
  const [ctrlVisual, setCtrlVisual] = useState(false);
  const [ctrlCo2Pressure, setCtrlCo2Pressure] = useState(false);
  const [ctrlTightness, setCtrlTightness] = useState(false);
  const [ctrlValve, setCtrlValve] = useState(false);
  
  // Non-conformances & Actions
  const [mismatchNote, setMismatchNote] = useState('');
  const [mismatchAction, setMismatchAction] = useState('');
  
  // Approval
  const [approvedBy, setApprovedBy] = useState('');
  const [note, setNote] = useState('');

  // Časy jednotlivých kroků (step key -> HH:MM) — pole se zobrazí po zaškrtnutí.
  const [stepTimes, setStepTimes] = useState<Record<string, string>>({});
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (defaultUserName && !performedBy) setPerformedBy(defaultUserName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultUserName]);

  async function load() {
    setLoading(true);
    setEntries(await loadBottleSanitation());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditing(null);
    setSanDate(todayStr());
    
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setSanTime(timeStr);
    
    setEqPegas(true);
    setEqHoses(true);
    setEqCoupler(false);
    setEqCo2(false);
    setReason('pred_stacenim');
    setChemicalName('Peracetic (Persteril)');
    setChemicalConcentration('0.3%');
    setChemicalTemperature('20°C');
    setChemicalContactTime('15 min');
    
    setProcRinseWater(true);
    setProcCirculation(true);
    setProcRinseCo2(true);
    setProcDisassembly(false);
    
    setCtrlVisual(true);
    setCtrlCo2Pressure(true);
    setCtrlTightness(true);
    setCtrlValve(true);
    
    setMismatchNote('');
    setMismatchAction('');
    setApprovedBy('');
    setNote('');
    setPerformedBy(defaultUserName || performedBy);

    // Časy kroků — nový zápis: předvyplnit aktuálním časem hlavní kroky
    const t = currentTimeStr();
    setStepTimes({
      louh: t,
      proplach_vodou: t,
      cela_cesta_na_louhu: t,
      prostory: t,
      proc_rinse_water: t,
      proc_circulation: t,
      proc_rinse_co2: t,
      proc_disassembly: t,
      ctrl_visual: t,
      ctrl_co2_pressure: t,
      ctrl_tightness: t,
      ctrl_valve: t,
      eq_pegas: t,
      eq_hoses: t,
      eq_coupler: t,
      eq_co2: t,
    });

    setShowModal(true);
  }

  function openEdit(e: BottleSanitationEntry) {
    setEditing(e);
    setSanDate(e.sanitation_date);
    setSanTime(e.sanitation_time || '');
    
    setEqPegas(e.eq_pegas || false);
    setEqHoses(e.eq_hoses || false);
    setEqCoupler(e.eq_coupler || false);
    setEqCo2(e.eq_co2 || false);
    setReason(e.reason || 'pravidelna');
    setChemicalName(e.chemical_name || '');
    setChemicalConcentration(e.chemical_concentration || '');
    setChemicalTemperature(e.chemical_temperature || '');
    setChemicalContactTime(e.chemical_contact_time || '');
    
    setProcRinseWater(e.proc_rinse_water || false);
    setProcCirculation(e.proc_circulation || false);
    setProcRinseCo2(e.proc_rinse_co2 || false);
    setProcDisassembly(e.proc_disassembly || false);
    
    setCtrlVisual(e.ctrl_visual || false);
    setCtrlCo2Pressure(e.ctrl_co2_pressure || false);
    setCtrlTightness(e.ctrl_tightness || false);
    setCtrlValve(e.ctrl_valve || false);
    
    setMismatchNote(e.mismatch_note || '');
    setMismatchAction(e.mismatch_action || '');
    setApprovedBy(e.approved_by || '');
    
    setNote(e.note || '');
    setPerformedBy(e.performed_by || defaultUserName);

    // Načíst uložené časy kroků (pokud existují)
    setStepTimes({ ...(e.step_times || {}) });

    setShowModal(true);
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);

    const oldChecks = editing ? {
      louh: editing.louh,
      proplach_vodou: editing.proplach_vodou,
      cela_cesta_na_louhu: editing.cela_cesta_na_louhu,
      prostory: editing.prostory
    } : {
      louh: chemicalName.toLowerCase().includes('louh') || chemicalName.toLowerCase().includes('naoh'),
      proplach_vodou: procRinseWater,
      cela_cesta_na_louhu: procCirculation && (chemicalName.toLowerCase().includes('louh') || chemicalName.toLowerCase().includes('naoh')),
      prostory: false
    };

    const entry: BottleSanitationEntry = editing
      ? {
          ...editing,
          sanitation_date: sanDate,
          sanitation_time: sanTime || null,
          ...oldChecks,
          eq_pegas: eqPegas,
          eq_hoses: eqHoses,
          eq_coupler: eqCoupler,
          eq_co2: eqCo2,
          reason,
          chemical_name: chemicalName.trim() || null,
          chemical_concentration: chemicalConcentration.trim() || null,
          chemical_temperature: chemicalTemperature.trim() || null,
          chemical_contact_time: chemicalContactTime.trim() || null,
          proc_rinse_water: procRinseWater,
          proc_circulation: procCirculation,
          proc_rinse_co2: procRinseCo2,
          proc_disassembly: procDisassembly,
          ctrl_visual: ctrlVisual,
          ctrl_co2_pressure: ctrlCo2Pressure,
          ctrl_tightness: ctrlTightness,
          ctrl_valve: ctrlValve,
          mismatch_note: mismatchNote.trim() || null,
          mismatch_action: mismatchAction.trim() || null,
          approved_by: approvedBy.trim() || null,
          performed_by: performedBy.trim() || null,
          note: note.trim() || null,
          step_times: stepTimes,
        }
      : {
          ...newBottleSanEntry(sanDate, performedBy.trim() || null),
          sanitation_time: sanTime || null,
          ...oldChecks,
          eq_pegas: eqPegas,
          eq_hoses: eqHoses,
          eq_coupler: eqCoupler,
          eq_co2: eqCo2,
          reason,
          chemical_name: chemicalName.trim() || null,
          chemical_concentration: chemicalConcentration.trim() || null,
          chemical_temperature: chemicalTemperature.trim() || null,
          chemical_contact_time: chemicalContactTime.trim() || null,
          proc_rinse_water: procRinseWater,
          proc_circulation: procCirculation,
          proc_rinse_co2: procRinseCo2,
          proc_disassembly: procDisassembly,
          ctrl_visual: ctrlVisual,
          ctrl_co2_pressure: ctrlCo2Pressure,
          ctrl_tightness: ctrlTightness,
          ctrl_valve: ctrlValve,
          mismatch_note: mismatchNote.trim() || null,
          mismatch_action: mismatchAction.trim() || null,
          approved_by: approvedBy.trim() || null,
          note: note.trim() || null,
          step_times: stepTimes,
        };

    if (editing && !editing.id.includes('-')) {
      await removeBottleSanEntry(editing.id);
    }
    await saveBottleSanEntry(entry);
    setSaving(false);
    setShowModal(false);
    await load();
  }

  async function handleDelete(e: BottleSanitationEntry) {
    if (!(await potvrd(`Opravdu smazat záznam deníku lahví pro ${e.sanitation_date}?`))) return;
    await removeBottleSanEntry(e.id);
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
      'Provedl': e.performed_by ?? '—',
      'Důvod': e.reason === 'pred_stacenim' ? 'Před stáčením' : e.reason === 'po_staceni' ? 'Po stáčení' : 'Měsíční',
      'Chemie': e.chemical_name ?? '—',
      'Koncentrace': e.chemical_concentration ?? '—',
      'Teplota': e.chemical_temperature ?? '—',
      'Doba působení': e.chemical_contact_time ?? '—',
      'Zařízení PEGAS': e.eq_pegas ? 'ANO' + t('eq_pegas') : 'NE',
      'Zařízení Hadice': e.eq_hoses ? 'ANO' + t('eq_hoses') : 'NE',
      'Zařízení Narážeč': e.eq_coupler ? 'ANO' + t('eq_coupler') : 'NE',
      'Zařízení CO2': e.eq_co2 ? 'ANO' + t('eq_co2') : 'NE',
      'Oplach vodou': e.proc_rinse_water ? 'ANO' + t('proc_rinse_water') : 'NE',
      'Cirkulace': e.proc_circulation ? 'ANO' + t('proc_circulation') : 'NE',
      'Proplach CO2/voda': e.proc_rinse_co2 ? 'ANO' + t('proc_rinse_co2') : 'NE',
      'Rozebrání': e.proc_disassembly ? 'ANO' + t('proc_disassembly') : 'NE',
      'Vizuální kontrola': e.ctrl_visual ? 'ANO' + t('ctrl_visual') : 'NE',
      'Tlak CO2': e.ctrl_co2_pressure ? 'ANO' + t('ctrl_co2_pressure') : 'NE',
      'Těsnost': e.ctrl_tightness ? 'ANO' + t('ctrl_tightness') : 'NE',
      'Ventil': e.ctrl_valve ? 'ANO' + t('ctrl_valve') : 'NE',
      'Neshoda': e.mismatch_note ?? '—',
      'Nápravné opatření': e.mismatch_action ?? '—',
      'Schválil': e.approved_by ?? '—',
      'Poznámka': e.note ?? '',
    };
    });
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sanitární deník lahví');
    XLSX.writeFile(wb, `Sanitarni_denik_lahvi_${todayStr()}.xlsx`);
  }

  const filtered = entries.filter((e) => e.sanitation_date.slice(0, 7) === filterMonth);

  // Rozpad zápisů na jednotlivé provedené kroky (datum, co, čím, koncentrace,
  // čas) — jeden uložený zápis může obsahovat víc zaškrtnutých kroků.
  const stepRows: BottleStepRow[] = useMemo(() => {
    const rows: BottleStepRow[] = [];
    filtered.forEach((e) => {
      BOTTLE_STEP_DEFS.forEach((def) => {
        if (!e[def.key]) return;
        rows.push({
          entry: e,
          label: def.label,
          chemical: def.chemical(e),
          concentration: def.concentration(e),
          time: e.step_times?.[def.key] || e.sanitation_time || null,
        });
      });
    });
    return rows.sort((a, b) => (a.entry.sanitation_date < b.entry.sanitation_date ? 1 : a.entry.sanitation_date > b.entry.sanitation_date ? -1 : 0));
  }, [filtered]);

  function reasonLabelFor(e: BottleSanitationEntry): string {
    return e.reason === 'pred_stacenim' ? 'Před stáčením' : e.reason === 'po_staceni' ? 'Po stáčení' : 'Měsíční';
  }

  function eqListFor(e: BottleSanitationEntry): string {
    return [
      e.eq_pegas && 'PEGAS',
      e.eq_hoses && 'Hadice',
      e.eq_coupler && 'Narážeč',
      e.eq_co2 && 'CO2'
    ].filter(Boolean).join(', ');
  }

  return (
    <div className="space-y-4">
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
            <FileSpreadsheet size={16} className="text-emerald-600" />
            <span>Export do Excelu</span>
          </button>
          <button
            onClick={openNew}
            className="btn-primary !rounded flex items-center gap-1.5 text-xs font-black shadow-md bg-amber-500 hover:bg-amber-400 border-none text-neutral-950"
          >
            <Plus size={16} />
            <span>Zapsat sanitaci lahví</span>
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
          <p className="font-medium text-sm">V tomto měsíci zatím nebyly zapsány žádné sanitace lahví.</p>
        </div>
      ) : (
        <>
          {/* Mobilní karty */}
          <div className="grid grid-cols-1 gap-2.5 md:hidden">
            {filtered.map((e) => {
              const isProblem = !!e.mismatch_note;
              const reasonLabel = reasonLabelFor(e);
              const eqList = eqListFor(e);
              return (
                <div key={e.id} className="card p-3.5 bg-white border border-neutral-200/90 rounded shadow-xs space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-neutral-900 text-sm">
                      <Calendar size={14} className="text-amber-600 shrink-0" />
                      <span>{new Date(e.sanitation_date).toLocaleDateString('cs-CZ')}</span>
                      {e.sanitation_time && (
                        <span className="text-neutral-600 font-medium flex items-center gap-0.5 text-udaj bg-neutral-100 px-1.5 py-0.5 rounded">
                          <Clock size={12} /> {e.sanitation_time}
                        </span>
                      )}
                    </div>
                    {isProblem ? (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-udaj font-bold border border-rose-200">
                        <ShieldAlert size={12} /> Neshoda
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-udaj font-bold border border-emerald-200">
                        <CheckCircle2 size={12} /> V pořádku
                      </span>
                    )}
                  </div>

                  <div className="font-bold text-neutral-900 text-xs">{reasonLabel}</div>
                  <div className="bg-neutral-50/70 rounded px-2.5 py-2 space-y-1">
                    {stepRows.filter((r) => r.entry.id === e.id).length === 0 ? (
                      <span className="text-udaj text-neutral-400 italic">žádné kroky</span>
                    ) : (
                      stepRows.filter((r) => r.entry.id === e.id).map((r, i) => (
                        <div key={i} className="flex items-center justify-between gap-2 text-udaj font-semibold text-neutral-700">
                          <span className="flex items-center gap-1 min-w-0">
                            {r.time && <span className="font-mono font-black text-amber-800 shrink-0">{r.time}</span>}
                            <span className="truncate">{r.label}</span>
                          </span>
                          <span className="shrink-0 text-neutral-600 flex items-center gap-1">
                            <Beaker size={12} className="text-sky-500" />
                            {r.chemical}{r.concentration ? ` · ${r.concentration}` : ''}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="text-udaj font-semibold text-neutral-700">
                    Zařízení: {eqList || <span className="text-neutral-400 italic">žádné</span>}
                  </div>
                  {isProblem && (
                    <div className="text-udaj text-rose-600">{e.mismatch_note}</div>
                  )}

                  <div className="flex items-center gap-1 text-neutral-700 font-semibold text-xs">
                    <User size={14} className="text-neutral-400 shrink-0" />
                    {e.performed_by ?? '—'}
                    {e.approved_by && (
                      <span className="flex items-center gap-1 text-emerald-700 text-udaj font-bold ml-1.5">
                        <UserCheck size={12} /> Schválil: {e.approved_by}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-neutral-100">
                    <button
                      onClick={() => openEdit(e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-amber-100 border border-neutral-200 text-neutral-700 hover:text-amber-900 transition text-udaj font-bold tap"
                    >
                      <Edit3 size={14} /> Upravit
                    </button>
                    <button
                      onClick={() => handleDelete(e)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-neutral-100 hover:bg-rose-100 border border-neutral-200 text-neutral-700 hover:text-rose-900 transition text-udaj font-bold tap"
                    >
                      <Trash2 size={14} /> Smazat
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
                  <th scope="col" className="py-3 px-4">Datum</th>
                  <th scope="col" className="py-3 px-4">Co bylo provedeno</th>
                  <th scope="col" className="py-3 px-4">Čím</th>
                  <th scope="col" className="py-3 px-4">Koncentrace</th>
                  <th scope="col" className="py-3 px-4">Čas</th>
                  <th scope="col" className="py-3 px-4">Provedl / Schválil</th>
                  <th scope="col" className="py-3 px-4">Stav</th>
                  <th scope="col" className="py-3 px-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                {stepRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 px-4 text-center text-neutral-400 italic">Žádné kroky nebyly zaškrtnuty.</td>
                  </tr>
                ) : (
                  stepRows.map((r, i) => {
                    const isNewGroup = i === 0 || stepRows[i - 1].entry.id !== r.entry.id;
                    const isProblem = !!r.entry.mismatch_note;
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
                          {isNewGroup && <div className="text-udaj text-neutral-500 font-semibold mt-0.5">{reasonLabel}</div>}
                        </td>

                        {/* Čím */}
                        <td className="py-3 px-4 align-top text-neutral-700 font-semibold">
                          <span className="flex items-center gap-1">
                            <Beaker size={12} className="text-sky-500 shrink-0" />
                            {r.chemical}
                          </span>
                        </td>

                        {/* Koncentrace */}
                        <td className="py-3 px-4 align-top font-mono font-bold text-neutral-700">{r.concentration ?? '—'}</td>

                        {/* Čas */}
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          {r.time ? (
                            <span className="inline-flex items-center gap-1 text-neutral-700 font-bold">
                              <Clock size={12} className="text-neutral-400" /> {r.time}
                            </span>
                          ) : <span className="text-neutral-400 italic">—</span>}
                        </td>

                        {/* Performed / Approved */}
                        <td className="py-3 px-4 align-top whitespace-nowrap">
                          {isNewGroup && (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1 text-neutral-700 font-semibold">
                                <User size={14} className="text-neutral-400" />
                                {r.entry.performed_by ?? '—'}
                              </div>
                              {r.entry.approved_by && (
                                <div className="flex items-center gap-1 text-emerald-700 text-udaj font-bold">
                                  <UserCheck size={12} />
                                  <span>Schválil: {r.entry.approved_by}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Status / Problems */}
                        <td className="py-3 px-4 align-top">
                          {isNewGroup && (
                            isProblem ? (
                              <div className="space-y-1 max-w-xs">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-50 text-rose-700 text-udaj font-bold border border-rose-200">
                                  <ShieldAlert size={12} /> Neshoda
                                </span>
                                <div className="text-udaj text-rose-600 truncate" title={r.entry.mismatch_note!}>
                                  {r.entry.mismatch_note}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-udaj font-bold border border-emerald-200">
                                <CheckCircle2 size={12} /> V pořádku
                              </span>
                            )
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                          {isNewGroup && (
                            <div className="inline-flex gap-1.5">
                              <button
                                onClick={() => openEdit(r.entry)}
                                title="Upravit záznam" aria-label="Upravit záznam"
                                className="p-2 rounded bg-neutral-100 hover:bg-amber-100 border border-neutral-200 text-neutral-700 hover:text-amber-900 transition"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                onClick={() => handleDelete(r.entry)}
                                title="Smazat záznam" aria-label="Smazat záznam"
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
                <span><SprayCan className="ikona-text" /> {editing ? `Upravit sanitaci — ${editing.sanitation_date}` : 'Záznam sanitace stáčecí linky lahví'}</span>
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold" title="Zavřít" aria-label="Zavřít"><X size={18} /></button>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Left Column: Identifikace a Zařízení */}
              <div className="space-y-4">
                <div className="bg-amber-50/50 p-4 rounded border border-amber-100 space-y-3">
                  <h4 className="font-bold text-xs text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={14} /> 1. Základní identifikace
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label !text-udaj !mb-1">Datum</label>
                      <input type="date" value={sanDate} onChange={(e) => setSanDate(e.target.value)} className="input w-full font-bold text-xs" required />
                    </div>
                    <div>
                      <label className="label !text-udaj !mb-1">Čas sanitace</label>
                      <input type="time" value={sanTime} onChange={(e) => setSanTime(e.target.value)} className="input w-full font-bold text-xs" />
                    </div>
                  </div>

                  <div>
                    <label className="label !text-udaj !mb-1">Provedl (uživatel)</label>
                    <input type="text" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="input w-full text-xs font-semibold" required />
                  </div>

                  <div>
                    <label className="label !text-udaj !mb-1">Důvod sanitace</label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full text-xs font-semibold">
                      <option value="pred_stacenim">Před stáčením</option>
                      <option value="po_staceni">Po stáčení</option>
                      <option value="pravidelna">Měsíční sanitace</option>
                    </select>
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded border border-neutral-200/70 space-y-3">
                  <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Settings size={14} /> Sanované zařízení
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <SanitationStepRow
                      field="eq_pegas"
                      checked={eqPegas}
                      onChecked={setEqPegas}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      PEGAS hlava
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="eq_hoses"
                      checked={eqHoses}
                      onChecked={setEqHoses}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Hadice
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="eq_coupler"
                      checked={eqCoupler}
                      onChecked={setEqCoupler}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Narážeč
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="eq_co2"
                      checked={eqCo2}
                      onChecked={setEqCo2}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      CO₂ rozvody
                    </SanitationStepRow>
                  </div>
                </div>
              </div>

              {/* Right Column: Chemie a Postup */}
              <div className="space-y-4">
                <div className="bg-sky-50/50 p-4 rounded border border-sky-100 space-y-3">
                  <h4 className="font-bold text-xs text-sky-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Beaker size={14} /> 2. Použitá chemie (Zásadní pro HACCP)
                  </h4>
                  
                  <div>
                    <label className="label !text-udaj !mb-1">Název prostředku</label>
                    <input type="text" value={chemicalName} onChange={(e) => setChemicalName(e.target.value)} placeholder="Např. NaOH louh, Persteril..." className="input w-full text-xs font-bold" required />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="label !text-udaj !mb-1">Koncentrace</label>
                      <input type="text" value={chemicalConcentration} onChange={(e) => setChemicalConcentration(e.target.value)} placeholder="0.3%" className="input w-full text-xs font-bold text-center" required />
                    </div>
                    <div>
                      <label className="label !text-udaj !mb-1">Teplota</label>
                      <input type="text" value={chemicalTemperature} onChange={(e) => setChemicalTemperature(e.target.value)} placeholder="20°C" className="input w-full text-xs font-bold text-center" />
                    </div>
                    <div>
                      <label className="label !text-udaj !mb-1">Doba působení</label>
                      <input type="text" value={chemicalContactTime} onChange={(e) => setChemicalContactTime(e.target.value)} placeholder="15 min" className="input w-full text-xs font-bold text-center" />
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded border border-neutral-200/70 space-y-3">
                  <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Check size={14} /> 3. Postup sanitace
                  </h4>
                  <div className="space-y-2">
                    <SanitationStepRow
                      field="proc_rinse_water"
                      checked={procRinseWater}
                      onChecked={setProcRinseWater}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Oplach čistou vodou
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_circulation"
                      checked={procCirculation}
                      onChecked={setProcCirculation}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Cirkulace sanitačního roztoku (celý systém)
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_rinse_co2"
                      checked={procRinseCo2}
                      onChecked={setProcRinseCo2}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Finální výplach sterilní vodou / profuk CO₂
                    </SanitationStepRow>
                    <SanitationStepRow
                      field="proc_disassembly"
                      checked={procDisassembly}
                      onChecked={setProcDisassembly}
                      stepTimes={stepTimes}
                      setStepTimes={setStepTimes}
                    >
                      Rozebrání a ruční čištění Pegasu
                    </SanitationStepRow>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Row: Kontroly a Neshody */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-neutral-100 pt-4">
              
              <div className="bg-neutral-50 p-4 rounded border border-neutral-200/70 space-y-3">
                <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={14} /> 4. Kontrolní body (Měření)
                </h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <SanitationStepRow
                    field="ctrl_visual"
                    checked={ctrlVisual}
                    onChecked={setCtrlVisual}
                    stepTimes={stepTimes}
                    setStepTimes={setStepTimes}
                  >
                    Vizuální čistota / pach
                  </SanitationStepRow>
                  <SanitationStepRow
                    field="ctrl_co2_pressure"
                    checked={ctrlCo2Pressure}
                    onChecked={setCtrlCo2Pressure}
                    stepTimes={stepTimes}
                    setStepTimes={setStepTimes}
                  >
                    Tlak CO₂ (2–2.5 bar)
                  </SanitationStepRow>
                  <SanitationStepRow
                    field="ctrl_tightness"
                    checked={ctrlTightness}
                    onChecked={setCtrlTightness}
                    stepTimes={stepTimes}
                    setStepTimes={setStepTimes}
                  >
                    Těsnost rozvodů
                  </SanitationStepRow>
                  <SanitationStepRow
                    field="ctrl_valve"
                    checked={ctrlValve}
                    onChecked={setCtrlValve}
                    stepTimes={stepTimes}
                    setStepTimes={setStepTimes}
                  >
                    Funkčnost ventilů
                  </SanitationStepRow>
                </div>
              </div>

              <div className="bg-rose-50/50 p-4 rounded border border-rose-100 space-y-3">
                <h4 className="font-bold text-xs text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert size={14} /> 5. Neshody a nápravná opatření
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label !text-udaj !mb-1">Co bylo špatně</label>
                    <input type="text" value={mismatchNote} onChange={(e) => setMismatchNote(e.target.value)} placeholder="Zápach, pěnění, špína..." className="input w-full text-xs bg-white" />
                  </div>
                  <div>
                    <label className="label !text-udaj !mb-1">Opatření</label>
                    <input type="text" value={mismatchAction} onChange={(e) => setMismatchAction(e.target.value)} placeholder="Opakovaná sanitace..." className="input w-full text-xs bg-white" />
                  </div>
                </div>
              </div>

            </div>

            {/* Approval & Note */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-100 pt-4">
              <div>
                <label className="label">Schválil (odpovědná osoba / sládek)</label>
                <input type="text" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Např. Sládek Jan" className="input w-full text-xs font-bold" />
              </div>
              <div>
                <label className="label">Poznámka / doplňující text</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Libovolný doplňující záznam..." className="input w-full text-xs" />
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
