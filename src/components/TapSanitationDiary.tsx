import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import {
  TapSanitationEntry,
  TapSanitationStep,
  loadTapSanitation,
  saveTapSanEntry,
  removeTapSanEntry,
  newTapSanEntry,
  DEFAULT_TAP_SANITATION_STEPS,
  TAP_SAN_REASON_LABELS,
} from '../lib/tapSanitation';
import { SanitationStepRow, currentTimeStr } from './SanitationStepRow';
import { Spinner } from './ui';
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Edit3, FileSpreadsheet, Plus, Timer, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { potvrd } from '../lib/toast';

const todayStr = () => new Date().toISOString().slice(0, 10);

// Výčepy sdílené s obrazovkou „Výčepy“ (localStorage).
function loadTaps(): { id: string; name: string }[] {
  try {
    const saved = localStorage.getItem('vycepy_equipment_v1');
    if (saved) {
      const arr = JSON.parse(saved) as { id?: string; name?: string }[];
      return arr.filter((t) => t?.id && t?.name).map((t) => ({ id: t.id!, name: t.name! }));
    }
  } catch {}
  return [];
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export default function TapSanitationDiary() {
  const { profile, user } = useAuth();
  const defaultUserName = profile?.display_name || user?.email?.split('@')[0] || '';

  const [entries, setEntries] = useState<TapSanitationEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(todayStr().slice(0, 7));

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [sanDate, setSanDate] = useState(todayStr());
  const [sanTime, setSanTime] = useState('');
  const [performedBy, setPerformedBy] = useState(defaultUserName);
  const [approvedBy, setApprovedBy] = useState('');
  const [reason, setReason] = useState<'pred_stacenim' | 'po_staceni' | 'mesicni' | 'oprava'>('pred_stacenim');
  const [note, setNote] = useState('');
  const [tapId, setTapId] = useState('');
  const [steps, setSteps] = useState<TapSanitationStep[]>([]);
  const [stepTimesDraft, setStepTimesDraft] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const taps = loadTaps();

  useEffect(() => {
    if (defaultUserName && !performedBy) setPerformedBy(defaultUserName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultUserName]);

  async function load() {
    setLoading(true);
    setEntries(await loadTapSanitation());
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function shiftMonth(delta: number) {
    const [y, m] = filterMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setFilterMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  function openNew() {
    setEditingId(null);
    setSanDate(todayStr());
    setSanTime(currentTimeStr());
    setPerformedBy(defaultUserName);
    setApprovedBy('');
    setReason('pred_stacenim');
    setNote('');
    setTapId(taps[0]?.id ?? '');
    setSteps(
      DEFAULT_TAP_SANITATION_STEPS.map((s) => ({ id: s.id, text: s.text, completed: false, completedAt: null }))
    );
    setStepTimesDraft({});
    setShowModal(true);
  }

  function openEdit(entry: TapSanitationEntry) {
    setEditingId(entry.id);
    setSanDate(entry.sanitation_date);
    setSanTime(entry.sanitation_time || '');
    setPerformedBy(entry.performed_by || defaultUserName);
    setApprovedBy(entry.approved_by || '');
    setReason((entry.reason as any) || 'pred_stacenim');
    setNote(entry.note || '');
    setTapId(entry.tap_id || '');
    const draft: Record<string, string> = {};
    (entry.steps || []).forEach((s) => {
      if (s.completed && s.completedAt) draft[s.id] = s.completedAt;
    });
    setStepTimesDraft(draft);
    setSteps(
      DEFAULT_TAP_SANITATION_STEPS.map((s) => {
        const ex = (entry.steps || []).find((x) => x.id === s.id);
        return ex || { id: s.id, text: s.text, completed: false, completedAt: null };
      })
    );
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const tapName = taps.find((t) => t.id === tapId)?.name || `Výčep ${tapId}`;
      const entry: TapSanitationEntry = editingId
        ? { ...(entries.find((x) => x.id === editingId) as TapSanitationEntry) }
        : newTapSanEntry(tapId, tapName, sanDate, performedBy);

      entry.tap_id = tapId;
      entry.tap_name = tapName;
      entry.sanitation_date = sanDate;
      entry.sanitation_time = sanTime || entry.sanitation_time || currentTimeStr();
      entry.performed_by = performedBy || defaultUserName || null;
      entry.approved_by = approvedBy;
      entry.reason = reason;
      entry.note = note;
      entry.source = 'manual';
      entry.steps = steps.map((s) => ({
        ...s,
        completed: s.completed,
        completedAt: s.completed ? stepTimesDraft[s.id] ?? s.completedAt ?? entry.sanitation_time : null,
      }));
      // Rychlé souhrnné časy (voda, louh, rozebrání, vizuální kontrola)
      const low = entry.steps.map((s) => s.text.toLowerCase());
      const water = low.findIndex((t) => t.includes('oplach vodou') || (t.includes('oplach') && t.includes('vod')));
      const louh = low.findIndex((t) => t.includes('louh') || t.includes('naoh'));
      const disasm = low.findIndex((t) => t.includes('rozebr'));
      const visual = low.findIndex((t) => t.includes('vizu'));
      entry.water_rinse_time = water >= 0 && entry.steps[water].completedAt ? entry.steps[water].completedAt : null;
      entry.louh_sanitation_time = louh >= 0 && entry.steps[louh].completedAt ? entry.steps[louh].completedAt : null;
      entry.disassembly_time = disasm >= 0 && entry.steps[disasm].completedAt ? entry.steps[disasm].completedAt : null;
      entry.visual_check_time = visual >= 0 && entry.steps[visual].completedAt ? entry.steps[visual].completedAt : null;

      await saveTapSanEntry(entry);
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!(await potvrd('Opravdu smazat tento záznam sanitace výčepu?'))) return;
    await removeTapSanEntry(id);
    await load();
  }

  function exportExcel() {
    const rows = entries
      .filter((e) => e.sanitation_date.slice(0, 7) === filterMonth)
      .map((e) => {
        const done = (e.steps || []).filter((s) => s.completed);
        return {
          'Výčep': e.tap_name || e.tap_id || '',
          'Datum': formatDate(e.sanitation_date),
          'Čas': e.sanitation_time || '',
          'Důvod': TAP_SAN_REASON_LABELS[e.reason] || e.reason || '',
          'Provádí': e.performed_by || '',
          'Kroky (čas)': done.map((s) => `${s.text} ${s.completedAt ? '(' + s.completedAt + ')' : ''}`).join('; '),
          'Poznámka': e.note || '',
        };
      });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sanitace_vycepy');
    XLSX.writeFile(wb, `Sanitarni_denik_vycepu_${todayStr()}.xlsx`);
  }

  const filtered = entries.filter((e) => e.sanitation_date.slice(0, 7) === filterMonth);

  return (
    <div className="card p-4 sm:p-6 bg-white rounded shadow-sm border border-neutral-200/90 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display font-black text-xl text-neutral-900">🗜️ Sanitární deník výčepů</h3>
          <p className="text-xs text-neutral-500 font-semibold">Sanitace kohoutů a výčepních vedení s časem každého kroku.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded px-2 py-1.5 shadow-sm">
            <button onClick={() => shiftMonth(-1)} className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-bold text-amber-950 px-1 whitespace-nowrap">{filterMonth}</span>
            <button onClick={() => shiftMonth(1)} disabled={filterMonth >= todayStr().slice(0, 7)} className="w-6 h-6 grid place-items-center rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-xs transition disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
          <button onClick={exportExcel} className="px-3 py-2 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 text-xs font-black shadow-sm flex items-center gap-1.5">
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button onClick={openNew} className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black shadow-md flex items-center gap-1.5">
            <Plus size={15} /> Nový zápis
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-sm font-bold text-neutral-400">
          Pro tento měsíc zatím žádné záznamy sanitace výčepů.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => {
            const done = (e.steps || []).filter((s) => s.completed);
            const total = (e.steps || []).length || DEFAULT_TAP_SANITATION_STEPS.length;
            return (
              <div key={e.id} className="border border-neutral-200 rounded p-3.5 bg-white shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-neutral-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-neutral-900">{e.tap_name || e.tap_id}</span>
                    <span className="text-[11px] font-black text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded">{formatDate(e.sanitation_date)}</span>
                    {e.sanitation_time && (
                      <span className="text-[11px] font-mono font-black text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <Clock size={10} /> {e.sanitation_time}
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-neutral-500">{TAP_SAN_REASON_LABELS[e.reason] || e.reason}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEdit(e)}
                      className="p-1.5 rounded bg-neutral-100 hover:bg-amber-100 text-neutral-600 hover:text-amber-800 transition"
                      title="Upravit"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={() => handleDelete(e.id)}
                      className="p-1.5 rounded bg-neutral-100 hover:bg-rose-100 text-neutral-600 hover:text-rose-700 transition"
                      title="Smazat"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div className="pt-2.5 space-y-1">
                  {done.length === 0 ? (
                    <span className="text-[11px] text-neutral-400 font-semibold">Zatím bez dokončených kroků.</span>
                  ) : (
                    done.map((s) => (
                      <div key={s.id} className="flex items-center gap-2">
                        <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                        <span className="text-[11px] text-neutral-700 font-semibold flex-1">{s.text}</span>
                        {s.completedAt && <span className="text-[11px] font-mono font-black text-amber-800"><Timer className="ikona-text" /> {s.completedAt}</span>}
                      </div>
                    ))
                  )}
                </div>

                <div className="text-[11px] text-neutral-400 mt-2">
                  Hotovo <b className="text-neutral-600">{done.length}/{total}</b> · {e.performed_by ? `Provádí: ${e.performed_by}` : 'bez provádějící osoby'}
                </div>
              </div>
            );
          })}
        </div>
      )}
{/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded w-full max-w-2xl p-6 space-y-4 shadow-2xl border border-neutral-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">
                {editingId ? 'Upravit záznam sanitace výčepu' : 'Nový záznam sanitace výčepu'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-neutral-400 font-bold">✕</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Výčep</label>
                  <select value={tapId} onChange={(e) => setTapId(e.target.value)} required className="input w-full text-xs font-bold">
                    {taps.length === 0 && <option value="">Žádné výčepy — zadejte je v sekci „Výčepy“</option>}
                    {taps.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Důvod sanitace</label>
                  <select value={reason} onChange={(e) => setReason(e.target.value as any)} className="input w-full text-xs font-bold">
                    {Object.entries(TAP_SAN_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Datum</label>
                  <input type="date" required value={sanDate} onChange={(e) => setSanDate(e.target.value)} className="input w-full text-xs font-mono font-bold" />
                </div>
                <div>
                  <label className="label">Čas zahájení</label>
                  <input type="time" value={sanTime} onChange={(e) => setSanTime(e.target.value)} className="input w-full text-xs font-mono font-bold" />
                </div>
                <div>
                  <label className="label">Provádí</label>
                  <input type="text" value={performedBy} onChange={(e) => setPerformedBy(e.target.value)} className="input w-full text-xs" />
                </div>
                <div>
                  <label className="label">Schválil</label>
                  <input type="text" value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} placeholder="Sládek / odpovědná osoba" className="input w-full text-xs" />
                </div>
              </div>

              {/* Steps */}
              <div className="p-4 rounded border border-neutral-200 bg-neutral-50/50 space-y-2.5">
                <h4 className="font-black text-xs text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 size={13} className="text-amber-600" /> Kroky sanitace (s časem provedení)
                </h4>
                {steps.map((s, idx) => (
                  <SanitationStepRow
                    key={s.id}
                    field={s.id}
                    checked={s.completed}
                    onChecked={(v) => setSteps((prev) => prev.map((x, i) => (i === idx ? { ...x, completed: v } : x)))}
                    stepTimes={stepTimesDraft}
                    setStepTimes={setStepTimesDraft}
                  >
                    {s.text}
                  </SanitationStepRow>
                ))}
              </div>

              <div>
                <label className="label">Poznámka</label>
                <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="input w-full text-xs" />
              </div>

              <div className="flex justify-end gap-2 border-t border-neutral-100 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
                <button type="submit" disabled={saving} className="btn-primary !rounded text-xs font-black shadow-md bg-amber-500 hover:bg-amber-600 border-none text-neutral-950">
                  {saving ? 'Ukládám…' : 'Uložit do sanitačního deníku'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}