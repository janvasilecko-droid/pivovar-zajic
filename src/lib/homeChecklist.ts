// Správce denního checklistu na domovské obrazovce.
// Automaticky udržuje stav dnešních úkolů a umožňuje jejich odškrtávání.
import { zavibruj } from './haptika';
import { businessDateISO } from './businessDate';

export type DailyTask = {
  id: string;
  title: string;
  completed: boolean;
  category?: string;
};

const STORAGE_KEY = 'pivovar_daily_checklist_v1';
const DATE_KEY = 'pivovar_daily_checklist_date';
export const DAILY_CHECKLIST_CHANGED_EVENT = 'pivovar_daily_checklist_changed';

const DEFAULT_TASKS: DailyTask[] = [
  { id: 'dt-1', title: 'Kontrola tlaku CO2 a teploty ve sklepě', completed: false, category: 'Sklep' },
  { id: 'dt-2', title: 'Ranní kontrola stáčecí linky', completed: false, category: 'Výroba' },
  { id: 'dt-4', title: 'Pravidelný odkalovací cyklus tanků', completed: false, category: 'Sklep' },
];

export function getDailyTasks(): { tasks: DailyTask[]; date: string } {
  try {
    const today = businessDateISO();
    const savedDate = localStorage.getItem(DATE_KEY);
    const raw = localStorage.getItem(STORAGE_KEY);

    if (savedDate !== today || !raw) {
      // Nový den -> reset splnění úkolů, ale zachování uživatelských položek
      let initialTasks = DEFAULT_TASKS;
      if (raw) {
        try {
          const prev = JSON.parse(raw);
          if (Array.isArray(prev) && prev.length > 0) {
            initialTasks = prev.map((t) => ({ ...t, completed: false }));
          }
        } catch {}
      }
      localStorage.setItem(DATE_KEY, today);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initialTasks));
      return { tasks: initialTasks, date: today };
    }

    const parsed = JSON.parse(raw);
    return { tasks: Array.isArray(parsed) ? parsed : DEFAULT_TASKS, date: today };
  } catch {
    return { tasks: DEFAULT_TASKS, date: businessDateISO() };
  }
}

function saveDailyTasks(tasks: DailyTask[]) {
  try {
    const today = businessDateISO();
    localStorage.setItem(DATE_KEY, today);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent(DAILY_CHECKLIST_CHANGED_EVENT, { detail: tasks }));
  } catch (e) {
    console.error('Chyba při ukládání checklistu:', e);
  }
}

export function toggleDailyTask(id: string): boolean {
  const { tasks } = getDailyTasks();
  let nextState = false;
  const updated = tasks.map((t) => {
    if (t.id === id) {
      nextState = !t.completed;
      return { ...t, completed: nextState };
    }
    return t;
  });
  saveDailyTasks(updated);
  try { zavibruj(nextState ? 'odskrtnuto' : 'klik'); } catch {}
  return nextState;
}

export function addDailyTask(title: string, category?: string): DailyTask {
  const { tasks } = getDailyTasks();
  const newTask: DailyTask = {
    id: `dt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    completed: false,
    category: category?.trim() || undefined,
  };
  const updated = [...tasks, newTask];
  saveDailyTasks(updated);
  try { zavibruj('klik'); } catch {}
  return newTask;
}

export function deleteDailyTask(id: string) {
  const { tasks } = getDailyTasks();
  const updated = tasks.filter((t) => t.id !== id);
  saveDailyTasks(updated);
  try { zavibruj('klik'); } catch {}
}

export function resetAllDailyTasks() {
  const { tasks } = getDailyTasks();
  const updated = tasks.map((t) => ({ ...t, completed: false }));
  saveDailyTasks(updated);
  try { zavibruj('klik'); } catch {}
}
