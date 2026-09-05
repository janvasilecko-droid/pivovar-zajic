import { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Plus, Check, Trash2, ClipboardCheck, RotateCcw, Sparkles } from 'lucide-react';
import { getDailyTasks, toggleDailyTask, addDailyTask, deleteDailyTask, resetAllDailyTasks, DAILY_CHECKLIST_CHANGED_EVENT, type DailyTask } from '../lib/homeChecklist';

export function HomeChecklistModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [{ tasks }, setState] = useState(() => getDailyTasks());
  const [newTitle, setNewTitle] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Provoz');

  useEffect(() => {
    const handleUpdate = () => setState(getDailyTasks());
    window.addEventListener(DAILY_CHECKLIST_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(DAILY_CHECKLIST_CHANGED_EVENT, handleUpdate);
  }, []);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    addDailyTask(newTitle, selectedCategory);
    setNewTitle('');
  }

  const completedCount = tasks.filter((t) => t.completed).length;
  const allCompleted = tasks.length > 0 && completedCount === tasks.length;

  return (
    <Modal open={isOpen} onClose={onClose} title="Denní kontrolní checklist">
      <div className="space-y-4">
        {/* Progress bar */}
        <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200/90 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-neutral-700 flex items-center gap-1.5">
              <ClipboardCheck size={16} className="text-amber-600" />
              Dnešní postup
            </span>
            <span className={allCompleted ? 'text-emerald-700 font-extrabold' : 'text-neutral-900'}>
              {completedCount} z {tasks.length} splněno {allCompleted && '🎉'}
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-neutral-200 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${allCompleted ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0}%` }}
            />
          </div>
        </div>

        {/* Formular pro pridani ukolu */}
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            type="text"
            className="flex-1 text-sm font-medium border border-neutral-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="+ Přidat úkol na dnešek..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newTitle.trim()}
            className="flex items-center gap-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-neutral-950 font-bold text-xs px-3.5 py-2 rounded-lg shadow-xs transition shrink-0"
          >
            <Plus size={16} /> Přidat
          </button>
        </form>

        {/* Seznam ukolu */}
        <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {tasks.map((task) => (
            <div
              key={task.id}
              onClick={() => toggleDailyTask(task.id)}
              className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition select-none ${
                task.completed
                  ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 opacity-80'
                  : 'bg-white border-neutral-200 hover:border-amber-400 text-neutral-900 shadow-xs'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-5 h-5 rounded-md border-2 grid place-items-center shrink-0 transition ${
                    task.completed ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-white border-neutral-300'
                  }`}
                >
                  {task.completed && <Check size={14} className="font-bold" />}
                </span>
                <span className={`text-sm font-bold truncate ${task.completed ? 'line-through text-neutral-500' : ''}`}>
                  {task.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {task.category && (
                  <span className="text-udaj font-bold px-2 py-0.5 rounded bg-neutral-100 text-neutral-600">
                    {task.category}
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteDailyTask(task.id);
                  }}
                  className="text-neutral-400 hover:text-rose-600 p-1 transition tap"
                  title="Smazat úkol"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Spodni tlacitko pro reset na novy den */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-100">
          <button
            type="button"
            onClick={resetAllDailyTasks}
            className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900 transition"
          >
            <RotateCcw size={14} /> Odznačit vše (Reset na ráno)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold bg-neutral-200 hover:bg-neutral-300 text-neutral-800 px-3.5 py-1.5 rounded-lg transition tap"
          >
            Hotovo
          </button>
        </div>
      </div>
    </Modal>
  );
}
