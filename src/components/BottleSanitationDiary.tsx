import { useEffect, useState } from 'react';
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
import { 
  Plus, 
  FileSpreadsheet, 
  Calendar, 
  User, 
  Edit3, 
  Trash2, 
  ClipboardCheck, 
  Check, 
  Clock, 
  FileText, 
  Beaker, 
  Settings, 
  ShieldAlert, 
  CheckCircle2, 
  UserCheck 
} from 'lucide-react';
import * as XLSX from 'xlsx';

const todayStr = () => new Date().toISOString().slice(0, 10);

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
    if (!window.confirm(`Opravdu smazat záznam deníku lahví pro ${e.sanitation_date}?`)) return;
    await removeBottleSanEntry(e.id);
    await load();
  }

  function exportExcel() {
    const rows = filtered.map((e) => ({
      'Datum': e.sanitation_date,
      'Čas': e.sanitation_time ?? '—',
      'Provedl': e.performed_by ?? '—',
      'Důvod': e.reason === 'pred_stacenim' ? 'Před stáčením' : e.reason === 'po_staceni' ? 'Po stáčení' : 'Pravidelná',
      'Chemie': e.chemical_name ?? '—',
      'Koncentrace': e.chemical_concentration ?? '—',
      'Teplota': e.chemical_temperature ?? '—',
      'Doba působení': e.chemical_contact_time ?? '—',
      'Zařízení PEGAS': e.eq_pegas ? 'ANO' : 'NE',
      'Zařízení Hadice': e.eq_hoses ? 'ANO' : 'NE',
      'Zařízení Narážeč': e.eq_coupler ? 'ANO' : 'NE',
      'Zařízení CO2': e.eq_co2 ? 'ANO' : 'NE',
      'Oplach vodou': e.proc_rinse_water ? 'ANO' : 'NE',
      'Cirkulace': e.proc_circulation ? 'ANO' : 'NE',
      'Proplach CO2/voda': e.proc_rinse_co2 ? 'ANO' : 'NE',
      'Rozebrání': e.proc_disassembly ? 'ANO' : 'NE',
      'Vizuální kontrola': e.ctrl_visual ? 'ANO' : 'NE',
      'Tlak CO2': e.ctrl_co2_pressure ? 'ANO' : 'NE',
      'Těsnost': e.ctrl_tightness ? 'ANO' : 'NE',
      'Ventil': e.ctrl_valve ? 'ANO' : 'NE',
      'Neshoda': e.mismatch_note ?? '—',
      'Nápravné opatření': e.mismatch_action ?? '—',
      'Schválil': e.approved_by ?? '—',
      'Poznámka': e.note ?? '',
    }));
    
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sanitární deník lahví');
    XLSX.writeFile(wb, `Sanitarni_denik_lahvi_${todayStr()}.xlsx`);
  }

  const filtered = entries.filter((e) => e.sanitation_date.slice(0, 7) === filterMonth);

  return (
    <div className="space-y-4">
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
            <span>Zapsat sanitaci lahví</span>
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
          <p className="font-medium text-sm">V tomto měsíci zatím nebyly zapsány žádné sanitace lahví.</p>
        </div>
      ) : (
        <div className="card bg-white border border-neutral-200/90 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-50/70 border-b border-neutral-100 text-neutral-500 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Datum a čas</th>
                  <th className="py-3 px-4">Důvod a Prostředek</th>
                  <th className="py-3 px-4">Zařízení</th>
                  <th className="py-3 px-4">Provedl / Schválil</th>
                  <th className="py-3 px-4">Stav / Neshody</th>
                  <th className="py-3 px-4 text-right">Akce</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium text-neutral-800">
                {filtered.map((e) => {
                  const isProblem = !!e.mismatch_note;
                  const reasonLabel = 
                    e.reason === 'pred_stacenim' ? 'Před stáčením' : 
                    e.reason === 'po_staceni' ? 'Po stáčení' : 'Pravidelná';
                  
                  const eqList = [
                    e.eq_pegas && 'PEGAS',
                    e.eq_hoses && 'Hadice',
                    e.eq_coupler && 'Narážeč',
                    e.eq_co2 && 'CO2'
                  ].filter(Boolean).join(', ');

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

                      {/* Reason & Agent */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1">
                          <div className="font-bold text-neutral-900">{reasonLabel}</div>
                          {e.chemical_name && (
                            <div className="text-[11px] text-neutral-600 flex items-center gap-1">
                              <Beaker size={11} className="text-blue-500" />
                              <span>{e.chemical_name} {e.chemical_concentration ? `(${e.chemical_concentration})` : ''}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Equipment */}
                      <td className="py-3.5 px-4 text-neutral-700">
                        <div className="text-[11px] font-semibold">{eqList || <span className="text-neutral-400 italic">žádné</span>}</div>
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

                      {/* Status / Problems */}
                      <td className="py-3.5 px-4">
                        {isProblem ? (
                          <div className="space-y-1 max-w-xs">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold border border-red-200">
                              <ShieldAlert size={10} /> Neshoda
                            </span>
                            <div className="text-[10px] text-red-600 truncate" title={e.mismatch_note!}>
                              {e.mismatch_note}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                            <CheckCircle2 size={10} /> V pořádku
                          </span>
                        )}
                      </td>

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
                <span>🧼 {editing ? `Upravit sanitaci — ${editing.sanitation_date}` : 'Záznam sanitace stáčecí linky lahví'}</span>
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-neutral-400 hover:text-neutral-800 text-lg font-bold">✕</button>
            </div>

            {/* Grid layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Left Column: Identifikace a Zařízení */}
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
                    <label className="label !text-[11px] !mb-1">Důvod sanitace</label>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} className="input w-full text-xs font-semibold">
                      <option value="pred_stacenim">🧼 Před stáčením</option>
                      <option value="po_staceni">🧼 Po stáčení</option>
                      <option value="pravidelna">🧼 Pravidelná sanitace</option>
                    </select>
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-3">
                  <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Settings size={13} /> Sanované zařízení
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 p-2 rounded-xl border bg-white cursor-pointer hover:border-amber-400">
                      <input type="checkbox" checked={eqPegas} onChange={() => setEqPegas(!eqPegas)} className="accent-amber-500 h-4 w-4" />
                      <span className="text-xs font-bold">PEGAS hlava</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-xl border bg-white cursor-pointer hover:border-amber-400">
                      <input type="checkbox" checked={eqHoses} onChange={() => setEqHoses(!eqHoses)} className="accent-amber-500 h-4 w-4" />
                      <span className="text-xs font-bold">Hadice</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-xl border bg-white cursor-pointer hover:border-amber-400">
                      <input type="checkbox" checked={eqCoupler} onChange={() => setEqCoupler(!eqCoupler)} className="accent-amber-500 h-4 w-4" />
                      <span className="text-xs font-bold">Narážeč</span>
                    </label>
                    <label className="flex items-center gap-2 p-2 rounded-xl border bg-white cursor-pointer hover:border-amber-400">
                      <input type="checkbox" checked={eqCo2} onChange={() => setEqCo2(!eqCo2)} className="accent-amber-500 h-4 w-4" />
                      <span className="text-xs font-bold">CO₂ rozvody</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Right Column: Chemie a Postup */}
              <div className="space-y-4">
                <div className="bg-blue-50/50 p-4 rounded-2xl border border-blue-100 space-y-3">
                  <h4 className="font-bold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Beaker size={13} /> 2. Použitá chemie (Zásadní pro HACCP)
                  </h4>
                  
                  <div>
                    <label className="label !text-[11px] !mb-1">Název prostředku</label>
                    <input type="text" value={chemicalName} onChange={(e) => setChemicalName(e.target.value)} placeholder="Např. NaOH louh, Persteril..." className="input w-full text-xs font-bold" required />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-1">
                      <label className="label !text-[11px] !mb-1">Koncentrace</label>
                      <input type="text" value={chemicalConcentration} onChange={(e) => setChemicalConcentration(e.target.value)} placeholder="0.3%" className="input w-full text-xs font-bold text-center" required />
                    </div>
                    <div>
                      <label className="label !text-[11px] !mb-1">Teplota</label>
                      <input type="text" value={chemicalTemperature} onChange={(e) => setChemicalTemperature(e.target.value)} placeholder="20°C" className="input w-full text-xs font-bold text-center" />
                    </div>
                    <div>
                      <label className="label !text-[11px] !mb-1">Doba působení</label>
                      <input type="text" value={chemicalContactTime} onChange={(e) => setChemicalContactTime(e.target.value)} placeholder="15 min" className="input w-full text-xs font-bold text-center" />
                    </div>
                  </div>
                </div>

                <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-3">
                  <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Check size={13} /> 3. Postup sanitace
                  </h4>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={procRinseWater} onChange={() => setProcRinseWater(!procRinseWater)} className="accent-amber-500 h-4 w-4" />
                      <span>Oplach čistou vodou</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={procCirculation} onChange={() => setProcCirculation(!procCirculation)} className="accent-amber-500 h-4 w-4" />
                      <span>Cirkulace sanitačního roztoku (celý systém)</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={procRinseCo2} onChange={() => setProcRinseCo2(!procRinseCo2)} className="accent-amber-500 h-4 w-4" />
                      <span>Finální výplach sterilní vodou / profuk CO₂</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input type="checkbox" checked={procDisassembly} onChange={() => setProcDisassembly(!procDisassembly)} className="accent-amber-500 h-4 w-4" />
                      <span>Rozebrání a ruční čištění Pegasu</span>
                    </label>
                  </div>
                </div>
              </div>

            </div>

            {/* Bottom Row: Kontroly a Neshody */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 border-t border-neutral-100 pt-4">
              
              <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200/70 space-y-3">
                <h4 className="font-bold text-xs text-neutral-700 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck size={13} /> 4. Kontrolní body (Měření)
                </h4>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={ctrlVisual} onChange={() => setCtrlVisual(!ctrlVisual)} className="accent-amber-500 h-4 w-4" />
                    <span>Vizuální čistota / pach</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={ctrlCo2Pressure} onChange={() => setCtrlCo2Pressure(!ctrlCo2Pressure)} className="accent-amber-500 h-4 w-4" />
                    <span>Tlak CO₂ (2–2.5 bar)</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={ctrlTightness} onChange={() => setCtrlTightness(!ctrlTightness)} className="accent-amber-500 h-4 w-4" />
                    <span>Těsnost rozvodů</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={ctrlValve} onChange={() => setCtrlValve(!ctrlValve)} className="accent-amber-500 h-4 w-4" />
                    <span>Funkčnost ventilů</span>
                  </label>
                </div>
              </div>

              <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100 space-y-3">
                <h4 className="font-bold text-xs text-red-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert size={13} /> 5. Neshody a nápravná opatření
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label !text-[10px] !mb-1">Co bylo špatně</label>
                    <input type="text" value={mismatchNote} onChange={(e) => setMismatchNote(e.target.value)} placeholder="Zápach, pěnění, špína..." className="input w-full text-xs bg-white" />
                  </div>
                  <div>
                    <label className="label !text-[10px] !mb-1">Opatření</label>
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
