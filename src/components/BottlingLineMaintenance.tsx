import { useState } from 'react';
import { Wrench, CheckCircle2, AlertTriangle, Calendar, Clock, Plus, ShieldCheck } from 'lucide-react';

type MaintenanceTask = {
  id: string;
  equipmentName: string;
  taskType: 'sanitation' | 'o_rings' | 'lubrication' | 'pressure_test' | 'valve_replacement';
  intervalDays: number;
  lastDoneAt: string;
  nextDueAt: string;
  assignedOperator: string;
  notes: string;
  status: 'ok' | 'due' | 'overdue';
};

const DEFAULT_MAINTENANCE_TASKS: MaintenanceTask[] = [
  {
    id: 'maint_1',
    equipmentName: 'Automatická plnička a zátkovačka lahví (6-hlavá)',
    taskType: 'o_rings',
    intervalDays: 30,
    lastDoneAt: '2026-06-25',
    nextDueAt: '2026-07-25',
    assignedOperator: 'Sládek (Vasil)',
    notes: 'Kontrola a výměna silikonových těsnění plnících jehel a CO₂ evakuace.',
    status: 'overdue',
  },
  {
    id: 'maint_2',
    equipmentName: 'Myčka a plnička KEG sudů (2-hlavá)',
    taskType: 'pressure_test',
    intervalDays: 14,
    lastDoneAt: '2026-07-15',
    nextDueAt: '2026-07-29',
    assignedOperator: 'Martin Sládek',
    notes: 'Tlaková zkouška pneumatických ventilů a kontrola dávkovacího čerpadla lihu.',
    status: 'ok',
  },
  {
    id: 'maint_3',
    equipmentName: 'Mladinový deskový chladič (2-stupňový)',
    taskType: 'sanitation',
    intervalDays: 7,
    lastDoneAt: '2026-07-21',
    nextDueAt: '2026-07-28',
    assignedOperator: 'Vasil',
    notes: 'Kyselá sanitace kyselinou dusičnou + sanitační výplach 85°C vodou.',
    status: 'due',
  },
  {
    id: 'maint_4',
    equipmentName: 'Vzduchový kompresor s mikrofiltry CO₂',
    taskType: 'lubrication',
    intervalDays: 90,
    lastDoneAt: '2026-05-10',
    nextDueAt: '2026-08-10',
    assignedOperator: 'Údržba Pivovaru',
    notes: 'Výměna oleje v kompresoru a kontrola sterilních vzduchových filtrů 0.2 µm.',
    status: 'ok',
  },
];

export function BottlingLineMaintenance() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>(DEFAULT_MAINTENANCE_TASKS);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add form state
  const [equipmentName, setEquipmentName] = useState('');
  const [taskType, setTaskType] = useState<MaintenanceTask['taskType']>('o_rings');
  const [intervalDays, setIntervalDays] = useState('30');
  const [assignedOperator, setAssignedOperator] = useState('Sládek');
  const [notes, setNotes] = useState('');

  function completeTask(id: string) {
    const todayStr = new Date().toISOString().split('T')[0];
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextDate = new Date(Date.now() + t.intervalDays * 86400000).toISOString().split('T')[0];
          return {
            ...t,
            lastDoneAt: todayStr,
            nextDueAt: nextDate,
            status: 'ok',
          };
        }
        return t;
      })
    );
  }

  function addTask() {
    if (!equipmentName.trim()) return;
    const interval = Number(intervalDays) || 30;
    const todayStr = new Date().toISOString().split('T')[0];
    const nextDate = new Date(Date.now() + interval * 86400000).toISOString().split('T')[0];

    const newTask: MaintenanceTask = {
      id: `maint_${Date.now()}`,
      equipmentName,
      taskType,
      intervalDays: interval,
      lastDoneAt: todayStr,
      nextDueAt: nextDate,
      assignedOperator: assignedOperator || 'Sládek',
      notes,
      status: 'ok',
    };

    setTasks((prev) => [newTask, ...prev]);
    setShowAddModal(false);
    setEquipmentName('');
    setNotes('');
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

      {/* Task Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {tasks.map((task) => (
          <div
            key={task.id}
            className={`card p-5 border-2 rounded space-y-3 shadow-xs flex flex-col justify-between transition ${
              task.status === 'overdue'
                ? 'bg-rose-50/50 border-rose-300'
                : task.status === 'due'
                ? 'bg-amber-50/50 border-amber-300'
                : 'bg-white border-neutral-200'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-md border border-neutral-200">
                    Interval: každých {task.intervalDays} dní
                  </span>
                  <h4 className="font-display font-black text-base text-neutral-900 mt-1">{task.equipmentName}</h4>
                </div>

                <span
                  className={`chip shrink-0 ${
                    task.status === 'overdue'
                      ? 'bg-rose-500 text-white font-black animate-pulse'
                      : task.status === 'due'
                      ? 'bg-amber-500 text-neutral-950 font-black'
                      : 'bg-emerald-100 text-emerald-950 font-extrabold border border-emerald-300'
                  }`}
                >
                  {task.status === 'overdue' ? '⚠️ Po termínu!' : task.status === 'due' ? '⏳ Připravit servis' : '✅ V pořádku'}
                </span>
              </div>

              <div className="p-3.5 rounded bg-white border border-neutral-200 mt-3 space-y-1.5 text-xs text-neutral-800 font-medium">
                <div><strong>📋 Úkon:</strong> {task.notes}</div>
                <div>👤 Odpovědná osoba: <strong>{task.assignedOperator}</strong></div>
                <div className="flex items-center justify-between text-[11px] text-neutral-500 pt-1 border-t border-neutral-100">
                  <span>Poslední údržba: <strong>{task.lastDoneAt}</strong></span>
                  <span>Příští údržba: <strong className="text-amber-700 font-bold">{task.nextDueAt}</strong></span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-100 flex justify-end">
              <button
                onClick={() => completeTask(task.id)}
                className="btn-emerald text-xs font-black py-2 px-4 shadow-2xs flex items-center gap-1.5"
              >
                <CheckCircle2 size={16} />
                <span>Otsouhlasit provedení údržby (Dnes)</span>
              </button>
            </div>
          </div>
        ))}
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
                    type="number"
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
              <button onClick={() => setShowAddModal(false)} className="btn-ghost !rounded text-xs font-bold">Zrušit</button>
              <button onClick={addTask} disabled={!equipmentName.trim()} className="btn-amber !rounded text-xs font-black px-5 py-2.5">
                Uložit plán údržby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
