import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Plus, User } from 'lucide-react';
import { supabase, useRealtime } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';

type MaintenanceTaskType = 'sanitation' | 'o_rings' | 'lubrication' | 'pressure_test' | 'valve_replacement';

type MaintenanceTaskRow = {
  id: string;
  equipment_name: string;
  task_type: MaintenanceTaskType;
  interval_days: number;
  last_done_at: string;
  next_due_at: string;
  assigned_operator: string | null;
  notes: string | null;
};

// Stav se POČÍTÁ z next_due_at vs. dnešek, ne ukládá — uložený status by se
// nikdy sám neposunul na "po termínu", jak čas plyne bez zápisu.
function statusOf(nextDueAt: string, todayStr: string): 'ok' | 'due' | 'overdue' {
  if (nextDueAt < todayStr) return 'overdue';
  const daysLeft = Math.round((new Date(nextDueAt + 'T00:00:00Z').getTime() - new Date(todayStr + 'T00:00:00Z').getTime()) / 86400000);
  return daysLeft <= 3 ? 'due' : 'ok';
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BottlingLineMaintenance() {
  const [tasks, setTasks] = useState<MaintenanceTaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Add form state
  const [equipmentName, setEquipmentName] = useState('');
  const [taskType, setTaskType] = useState<MaintenanceTaskType>('o_rings');
  const [intervalDays, setIntervalDays] = useState('30');
  const [assignedOperator, setAssignedOperator] = useState('Sládek');
  const [notes, setNotes] = useState('');

  async function load() {
    const { data, error } = await supabase
      .from('bottling_line_maintenance_tasks')
      .select('*')
      .order('next_due_at', { ascending: true });
    if (!error && data) setTasks(data as MaintenanceTaskRow[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['bottling_line_maintenance_tasks'], load);

  async function completeTask(task: MaintenanceTaskRow) {
    const todayStr = businessDateISO();
    const nextDate = addDaysISO(todayStr, task.interval_days);
    setErr(null);
    const { error } = await supabase
      .from('bottling_line_maintenance_tasks')
      .update({ last_done_at: todayStr, next_due_at: nextDate })
      .eq('id', task.id);
    if (error) { setErr('Chyba při ukládání: ' + error.message); return; }
    load();
  }

  async function addTask() {
    if (!equipmentName.trim()) return;
    const interval = Number(intervalDays) || 30;
    const todayStr = businessDateISO();
    const nextDate = addDaysISO(todayStr, interval);
    setSaving(true);
    setErr(null);
    const { error } = await supabase.from('bottling_line_maintenance_tasks').insert({
      equipment_name: equipmentName.trim(),
      task_type: taskType,
      interval_days: interval,
      last_done_at: todayStr,
      next_due_at: nextDate,
      assigned_operator: assignedOperator.trim() || 'Sládek',
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (error) { setErr('Chyba při ukládání: ' + error.message); return; }
    setShowAddModal(false);
    setEquipmentName('');
    setNotes('');
    load();
  }

  const todayStr = businessDateISO();

  if (loading) {
    return <div className="text-sm text-neutral-500 font-medium py-8 text-center">Načítám plán údržby…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-neutral-900 via-neutral-950 to-neutral-900 text-white rounded space-y-4 shadow-xl border border-neutral-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-2xl shadow-lg">
              🛠️
            </div>
            <div>
              <h3 className="font-display font-black text-xl text-amber-400">
                Plánování údržby a servisu stáčecí linky & CCT
              </h3>
              <p className="text-xs text-neutral-300 font-medium">
                Sledování servisních intervalů výměny těsnění, tlakových zkoušek, mazání a sanitačních prověrek plniček.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="btn-amber !rounded text-xs font-black px-4 py-2.5 shadow-md flex items-center gap-2"
          >
            <Plus size={16} />
            <span>+ Nový úkon údržby</span>
          </button>
        </div>
      </div>

      {err && <div className="text-sm text-rose-600 bg-rose-500/10 rounded px-3 py-2">{err}</div>}

      {tasks.length === 0 && (
        <div className="text-sm text-neutral-500 font-medium py-8 text-center">
          Zatím žádné naplánované úkony údržby — přidejte první tlačítkem výše.
        </div>
      )}

      {/* Task Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((task) => {
          const status = statusOf(task.next_due_at, todayStr);
          return (
          <div
            key={task.id}
            className={`card p-5 border-2 rounded space-y-3 shadow-xs flex flex-col justify-between transition ${
              status === 'overdue'
                ? 'bg-rose-50/50 border-rose-300'
                : status === 'due'
                ? 'bg-amber-50/50 border-amber-300'
                : 'bg-white border-neutral-200'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md border border-neutral-200">
                    Interval: každých {task.interval_days} dní
                  </span>
                  <h4 className="font-display font-black text-base text-neutral-900 mt-1">{task.equipment_name}</h4>
                </div>

                <span
                  className={`chip shrink-0 ${
                    status === 'overdue'
                      ? 'bg-rose-500 text-white font-black animate-pulse'
                      : status === 'due'
                      ? 'bg-amber-500 text-neutral-950 font-black'
                      : 'bg-emerald-100 text-emerald-950 font-extrabold border border-emerald-300'
                  }`}
                >
                  {status === 'overdue' ? '⚠️ Po termínu!' : status === 'due' ? '⏳ Připravit servis' : '✅ V pořádku'}
                </span>
              </div>

              <div className="p-3.5 rounded bg-white border border-neutral-200 mt-3 space-y-1.5 text-xs text-neutral-800 font-medium">
                {task.notes && <div><strong><ClipboardList className="ikona-text" /> Úkon:</strong> {task.notes}</div>}
                <div><User className="ikona-text" /> Odpovědná osoba: <strong>{task.assigned_operator || '—'}</strong></div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100">
                  <span>Poslední údržba: <strong>{task.last_done_at}</strong></span>
                  <span>Příští údržba: <strong className="text-amber-700 font-bold">{task.next_due_at}</strong></span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                onClick={() => completeTask(task)}
                className="btn-emerald text-xs font-black py-2 px-4 shadow-2xs flex items-center gap-1.5"
              >
                <CheckCircle2 size={16} />
                <span>Odsouhlasit provedení údržby (Dnes)</span>
              </button>
            </div>
          </div>
          );
        })}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-neutral-950/75 backdrop-blur-xs flex items-center justify-center p-4 z-[999]">
          <div className="bg-white rounded max-w-md w-full p-6 space-y-5 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
            <div className="border-b border-neutral-100 pb-3">
              <h3 className="font-display font-black text-lg text-neutral-900">+ Nový plánovaný úkon údržby</h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Zařízení / Stáčecí technologie</label>
                <input
                  type="text"
                  className="input font-bold text-sm"
                  value={equipmentName}
                  onChange={(e) => setEquipmentName(e.target.value)}
                  placeholder="Plnička lahví / Myčka KEG sudů"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Typ údržby</label>
                <select className="input font-bold text-sm" value={taskType} onChange={(e) => setTaskType(e.target.value as any)}>
                  <option value="o_rings">🔧 Výměna těsnění a O-kroužků</option>
                  <option value="sanitation">🧼 CIP Sanitace & Proplach</option>
                  <option value="lubrication">🛢️ Mazání čerpadel a ložisek</option>
                  <option value="pressure_test">💨 Tlaková zkouška CO₂ a ventilů</option>
                  <option value="valve_replacement">⚙️ Servis plnících jehel</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Servisní interval (Dní)</label>
                  <input
                    type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
                    className="input font-bold text-sm"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                    placeholder="30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-neutral-700 mb-1">Odpovědná osoba</label>
                  <input
                    type="text"
                    className="input font-bold text-sm"
                    value={assignedOperator}
                    onChange={(e) => setAssignedOperator(e.target.value)}
                    placeholder="Sládek"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-neutral-700 mb-1">Popis úkonu & Pokyny</label>
                <textarea
                  rows={2}
                  className="input font-bold text-sm"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Popis postupu servisu…"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-100">
              <button onClick={() => setShowAddModal(false)} className="btn-ghost !rounded text-xs font-bold" disabled={saving}>Zrušit</button>
              <button onClick={addTask} disabled={!equipmentName.trim() || saving} className="btn-amber !rounded text-xs font-black px-5 py-2.5">
                {saving ? 'Ukládám…' : 'Uložit plán údržby'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
