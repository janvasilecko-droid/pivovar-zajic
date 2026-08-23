// Stopky / Časovač / Stočení sudu — tři drobné pracovní nástroje pro sklep a
// stáčírnu. Vzor záložek přesně podle PlanningTabbed.tsx (selectTab volá
// setPage(tab), ať funguje tlačítko Zpět). Stav je čistě lokální
// (localStorage, viz lib/stopwatchTimers.ts) — jde o efemérní pracovní
// pomůcku na jednom zařízení, ne o data ke sdílení mezi uživateli.
import { useState, useEffect } from 'react';
import {
  Timer, AlarmClock, Hourglass, Play, Pause, RotateCcw, Flag, Plus, Trash2, Square, CheckCircle2,
} from 'lucide-react';
import {
  getStopwatchState, saveStopwatchState, stopwatchElapsedMs, type StopwatchState,
  getCountdowns, saveCountdowns, countdownRemainingMs, type CountdownTimer,
  getKegTimerState, startKegTimer, finishKegTimer, cancelKegTimer, removeKegHistoryEntry, getKegEstimateMs,
  formatDurationMs,
} from '../lib/stopwatchTimers';
import { TabBar, type TabBarItem } from '../components/TabBar';

type TimersTab = 'stopwatch' | 'timer' | 'keg';

interface TimersScreenProps {
  initialTab?: TimersTab;
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: TimersTab })[] = [
  { id: 'stopwatch', label: 'Stopky', icon: Timer, color: '#d4a017' },
  { id: 'timer', label: 'Časovač', icon: AlarmClock, color: '#7c5cff' },
  { id: 'keg', label: 'Stočení sudu', icon: Hourglass, color: '#ffa94d' },
];

export default function TimersScreen({ initialTab = 'stopwatch', setPage }: TimersScreenProps) {
  const [activeTab, setActiveTab] = useState<TimersTab>(initialTab);
  useEffect(() => setActiveTab(initialTab), [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), stejně jako
  // PlanningTabbed/OrdersTabbed — jinak by tlačítko Zpět z téhle obrazovky
  // přeskočilo rovnou do hlavního menu místo na předchozí záložku.
  function selectTab(tab: TimersTab) {
    if (setPage) setPage(tab === 'timer' ? 'timer' : tab === 'keg' ? 'keg_timer' : 'stopwatch');
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as TimersTab)} />

      <div className="transition-all duration-200">
        {activeTab === 'stopwatch' && <StopwatchTool />}
        {activeTab === 'timer' && <CountdownTimersTool />}
        {activeTab === 'keg' && <KegRackingTimerTool />}
      </div>
    </div>
  );
}

// ==========================================
// 1. STOPKY
// ==========================================
function StopwatchTool() {
  const [state, setState] = useState<StopwatchState>(() => getStopwatchState());
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!state.running) return;
    const id = setInterval(() => forceTick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [state.running]);

  function persist(next: StopwatchState) {
    setState(next);
    saveStopwatchState(next);
  }

  function start() { persist({ ...state, running: true, startedAt: Date.now() }); }
  function pause() { persist({ ...state, running: false, startedAt: null, elapsedBeforeMs: stopwatchElapsedMs(state) }); }
  function reset() { persist({ running: false, startedAt: null, elapsedBeforeMs: 0, laps: [] }); }
  function lap() { persist({ ...state, laps: [...state.laps, stopwatchElapsedMs(state)] }); }

  const elapsed = stopwatchElapsedMs(state);

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <div className="text-6xl font-black tabular-nums text-neutral-900">{formatDurationMs(elapsed, true)}</div>
      <div className="flex flex-wrap justify-center gap-3">
        {!state.running ? (
          <button onClick={start} className="btn-primary !rounded px-8 py-3 rounded font-black flex items-center gap-2">
            <Play size={18} /> Start
          </button>
        ) : (
          <button onClick={pause} className="px-8 py-3 rounded font-black bg-amber-500 hover:bg-amber-400 text-white flex items-center gap-2">
            <Pause size={18} /> Pauza
          </button>
        )}
        <button onClick={lap} disabled={!state.running} className="px-5 py-3 rounded font-black bg-neutral-200 text-neutral-700 disabled:opacity-40 flex items-center gap-2">
          <Flag size={16} /> Mezičas
        </button>
        <button onClick={reset} className="px-5 py-3 rounded font-black bg-neutral-100 text-neutral-500 flex items-center gap-2">
          <RotateCcw size={16} /> Reset
        </button>
      </div>
      {state.laps.length > 0 && (
        <div className="w-full max-w-sm space-y-1">
          {state.laps.slice().reverse().map((lapMs, i) => {
            const idx = state.laps.length - i;
            const prevMs = idx > 1 ? state.laps[idx - 2] : 0;
            return (
              <div key={idx} className="flex items-center justify-between text-sm font-bold bg-white rounded px-3 py-2 border border-neutral-200">
                <span className="text-neutral-500">Mezičas {idx}</span>
                <span className="tabular-nums">{formatDurationMs(lapMs - prevMs, true)}</span>
                <span className="tabular-nums text-neutral-400">{formatDurationMs(lapMs, true)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. ČASOVAČ
// ==========================================
function CountdownTimersTool() {
  const [list, setList] = useState<CountdownTimer[]>(() => getCountdowns());
  const [, forceTick] = useState(0);
  const [newLabel, setNewLabel] = useState('');
  const [newMin, setNewMin] = useState('10');

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function persist(next: CountdownTimer[]) {
    setList(next);
    saveCountdowns(next);
  }

  function addTimer(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(newMin);
    if (!minutes || minutes <= 0) return;
    const t: CountdownTimer = {
      id: `t_${Math.random().toString(36).slice(2, 9)}`,
      label: newLabel.trim() || `${minutes} min`,
      durationMs: minutes * 60000,
      targetAt: null,
      notifiedAt: null,
    };
    persist([...list, t]);
    setNewLabel('');
    setNewMin('10');
  }

  function start(id: string) {
    persist(list.map((t) => (t.id === id ? { ...t, targetAt: Date.now() + countdownRemainingMs(t), notifiedAt: null } : t)));
  }
  function pause(id: string) {
    persist(list.map((t) => (t.id === id ? { ...t, durationMs: countdownRemainingMs(t), targetAt: null } : t)));
  }
  function remove(id: string) {
    persist(list.filter((t) => t.id !== id));
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addTimer} className="flex flex-wrap items-end gap-2 bg-white p-4 rounded border border-neutral-200">
        <div>
          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Název</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="např. Chmelení"
            className="border border-neutral-300 rounded px-3 py-2 text-sm w-40"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-neutral-500 mb-1">Minuty</label>
          <input
            type="number"
            min={1}
            value={newMin}
            onChange={(e) => setNewMin(e.target.value)}
            className="border border-neutral-300 rounded px-3 py-2 text-sm w-24"
          />
        </div>
        <button type="submit" className="btn-primary !rounded px-4 py-2 rounded font-black flex items-center gap-1.5">
          <Plus size={16} /> Přidat časovač
        </button>
      </form>

      {list.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-8">Zatím žádný časovač — přidej si první nahoře.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((t) => {
          const remaining = countdownRemainingMs(t);
          const running = t.targetAt !== null;
          const done = running && remaining === 0;
          return (
            <div key={t.id} className={`p-4 rounded border-2 ${done ? 'bg-rose-50 border-rose-300' : 'bg-white border-neutral-200'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-black text-sm text-neutral-800 truncate">{t.label}</div>
                <button onClick={() => remove(t.id)} className="text-neutral-400 hover:text-rose-600 shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
              <div className={`text-3xl font-black tabular-nums mb-3 ${done ? 'text-rose-600' : 'text-neutral-900'}`}>
                {formatDurationMs(remaining)}
              </div>
              <div className="flex gap-2">
                {!running ? (
                  <button onClick={() => start(t.id)} className="btn-primary !rounded px-4 py-2 rounded text-xs font-black flex items-center gap-1.5">
                    <Play size={14} /> Start
                  </button>
                ) : done ? (
                  <span className="text-xs font-black text-rose-700 flex items-center gap-1"><CheckCircle2 size={14} /> Hotovo</span>
                ) : (
                  <button onClick={() => pause(t.id)} className="px-4 py-2 rounded text-xs font-black bg-amber-500 hover:bg-amber-400 text-white flex items-center gap-1.5">
                    <Pause size={14} /> Pauza
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================
// 3. STOČENÍ SUDU
// ==========================================
function KegRackingTimerTool() {
  const [state, setState] = useState(() => getKegTimerState());
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!state.active) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [state.active]);

  const estimateMs = state.active?.estimateMs ?? getKegEstimateMs(state.history);
  const elapsedMs = state.active ? Date.now() - state.active.startedAt : 0;
  const remainingMs = state.active && state.active.estimateMs !== null
    ? Math.max(0, state.active.startedAt + state.active.estimateMs - Date.now())
    : null;
  const overdue = state.active !== null && remainingMs === 0;

  function begin() { setState(startKegTimer()); }
  function finish() { setState(finishKegTimer()); }
  function cancel() {
    if (!window.confirm('Zrušit měření bez uložení do historie?')) return;
    setState(cancelKegTimer());
  }
  function removeHistory(i: number) { setState(removeKegHistoryEntry(i)); }

  return (
    <div className="flex flex-col items-center gap-6 py-4">
      {!state.active ? (
        <>
          <div className="text-center">
            <div className="text-sm font-bold text-neutral-500 mb-1">Odhad doby stáčení</div>
            <div className="text-3xl font-black text-neutral-900">
              {estimateMs !== null ? formatDurationMs(estimateMs) : '—'}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              {state.history.length > 0 ? `z posledních ${state.history.length} stáčení` : 'zatím žádná historie — první stočení se jen změří'}
            </div>
          </div>
          <button onClick={begin} className="btn-primary !rounded px-10 py-4 rounded font-black text-lg flex items-center gap-2">
            <Play size={20} /> Začít stáčení
          </button>
        </>
      ) : (
        <>
          <div className={`text-center p-6 rounded border-2 w-full max-w-xs ${overdue ? 'bg-rose-50 border-rose-300 animate-pulse' : 'bg-white border-neutral-200'}`}>
            <div className="text-xs font-bold text-neutral-500 mb-1">Uplynulo</div>
            <div className="text-4xl font-black tabular-nums text-neutral-900 mb-3">{formatDurationMs(elapsedMs)}</div>
            {remainingMs !== null && (
              <div className={`text-sm font-black ${overdue ? 'text-rose-700' : 'text-emerald-700'}`}>
                {overdue ? '⏰ Sud by měl být stočený!' : `Zbývá odhadem ${formatDurationMs(remainingMs)}`}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={finish} className="btn-primary !rounded px-8 py-3 rounded font-black flex items-center gap-2">
              <CheckCircle2 size={18} /> Stočeno
            </button>
            <button onClick={cancel} className="px-5 py-3 rounded font-black bg-neutral-100 text-neutral-500 flex items-center gap-2">
              <Square size={16} /> Zrušit
            </button>
          </div>
        </>
      )}

      {state.history.length > 0 && (
        <div className="w-full max-w-sm">
          <div className="text-xs font-bold text-neutral-500 mb-2">Historie posledních stáčení</div>
          <div className="space-y-1">
            {state.history.slice().reverse().map((ms, i) => {
              const idx = state.history.length - 1 - i;
              return (
                <div key={idx} className="flex items-center justify-between text-sm font-bold bg-white rounded px-3 py-2 border border-neutral-200">
                  <span className="tabular-nums text-neutral-700">{formatDurationMs(ms)}</span>
                  <button onClick={() => removeHistory(idx)} className="text-neutral-300 hover:text-rose-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
