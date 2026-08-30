// Stopky / Časovač / Stočení sudu — tři drobné pracovní nástroje pro sklep a
// stáčírnu. Vzor záložek přesně podle PlanningTabbed.tsx (selectTab volá
// setPage(tab), ať funguje tlačítko Zpět). Stav je čistě lokální
// (localStorage, viz lib/stopwatchTimers.ts) — jde o efemérní pracovní
// pomůcku na jednom zařízení, ne o data ke sdílení mezi uživateli.
import { useState, useEffect, useMemo } from 'react';
import {
  Timer, AlarmClock, Hourglass, Play, Pause, RotateCcw, Flag, Plus, Trash2, Square, CheckCircle2, Pin,
} from 'lucide-react';
import {
  getStopwatchState, saveStopwatchState, stopwatchElapsedMs, type StopwatchState,
  getCountdowns, saveCountdowns, countdownRemainingMs, type CountdownTimer,
  startAllCountdowns, pauseAllCountdowns, resetAllCountdowns,
  getKegTimerState, startKegTimer, finishKegTimer, cancelKegTimer, removeKegHistoryEntry, getKegEstimateMs,
  formatDurationMs,
} from '../lib/stopwatchTimers';
import { TabBar, type TabBarItem } from '../components/TabBar';
import { NAV, EXTRA_NAV } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { getHomeLayout, saveHomeLayout, addTile, hideTile, type CountdownTileId } from '../lib/homeLayout';
import { potvrd, oznam } from '../lib/toast';
import { notifyTimerDone } from '../lib/notifications';

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
          <button onClick={pause} className="px-8 py-3 rounded font-black bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-2">
            <Pause size={18} /> Pauza
          </button>
        )}
        <button onClick={lap} disabled={!state.running} className="px-5 py-3 rounded font-black bg-neutral-200 text-neutral-700 disabled:opacity-40 flex items-center gap-2">
          <Flag size={16} /> Mezičas
        </button>
        <button onClick={reset} className="px-5 py-3 rounded font-black bg-neutral-100 text-neutral-600 flex items-center gap-2">
          <RotateCcw size={16} /> Reset
        </button>
      </div>
      {state.laps.length > 0 && (
        <div className="w-full max-w-sm space-y-1.5 pt-4 border-t border-neutral-200">
          <div className="text-xs font-bold text-neutral-400 uppercase tracking-wide px-1">Mezičasy ({state.laps.length})</div>
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
  const { user, profile, patchProfile } = useAuth();
  const allNavIds = useMemo(() => [...NAV.map((n) => n.id), ...EXTRA_NAV.map((n) => n.id)], []);
  const [list, setList] = useState<CountdownTimer[]>(() => getCountdowns());
  const [layout, setLayout] = useState(() => getHomeLayout(profile?.home_layout, allNavIds, []));
  const [, forceTick] = useState(0);
  const [newLabel, setNewLabel] = useState('Kotel');
  const [newMin, setNewMin] = useState('2');
  const [pinToHome, setPinToHome] = useState(true);

  useEffect(() => {
    setLayout(getHomeLayout(profile?.home_layout, allNavIds, []));
  }, [profile?.home_layout, allNavIds]);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  function persist(next: CountdownTimer[]) {
    setList(next);
    saveCountdowns(next);
  }

  function isPinned(timerId: string) {
    const cid: CountdownTileId = `cd_${timerId}`;
    return layout.pages.some((page) => page.includes(cid));
  }

  function togglePin(t: CountdownTimer) {
    const cid: CountdownTileId = `cd_${t.id}`;
    let nextLayout: ReturnType<typeof addTile>;
    if (isPinned(t.id)) {
      nextLayout = hideTile(layout, cid);
      oznam(`Odpočet "${t.label}" byl odebrán z plochy`);
    } else {
      nextLayout = addTile(layout, cid, 0);
      oznam(`Odpočet "${t.label}" byl přidán na plochu (Domů)`);
    }
    setLayout(nextLayout);
    patchProfile({ home_layout: nextLayout as any });
    if (user?.id) saveHomeLayout(user.id, nextLayout);
  }

  function addTimer(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(newMin);
    if (!minutes || minutes <= 0) return;
    const durationMs = Math.round(minutes * 60000);
    const newId = `t_${Math.random().toString(36).slice(2, 9)}`;
    const t: CountdownTimer = {
      id: newId,
      label: newLabel.trim() || `${minutes} min`,
      durationMs: autoStart ? 0 : durationMs,
      initialDurationMs: durationMs,
      targetAt: autoStart ? Date.now() + durationMs : null,
      notifiedAt: null,
    };
    persist([...list, t]);

    if (pinToHome) {
      const cid: CountdownTileId = `cd_${newId}`;
      const nextLayout = addTile(layout, cid, 0);
      setLayout(nextLayout);
      patchProfile({ home_layout: nextLayout as any });
      if (user?.id) saveHomeLayout(user.id, nextLayout);
      oznam(`⏱️ „${t.label}" ${autoStart ? 'spuštěn a ' : ''}přidán na plochu`);
    } else {
      oznam(`⏱️ „${t.label}" ${autoStart ? 'spuštěn' : 'vytvořen'}`);
    }

    setNewLabel('');
    setNewMin('2');
  }

  function start(id: string) {
    persist(list.map((t) => (t.id === id ? { ...t, targetAt: Date.now() + countdownRemainingMs(t), notifiedAt: null } : t)));
  }
  function pause(id: string) {
    persist(list.map((t) => (t.id === id ? { ...t, durationMs: countdownRemainingMs(t), targetAt: null } : t)));
  }
  function reset(id: string) {
    persist(list.map((t) => (t.id === id ? { ...t, durationMs: t.initialDurationMs || t.durationMs, targetAt: null, notifiedAt: null } : t)));
  }
  function remove(id: string) {
    persist(list.filter((t) => t.id !== id));
    if (isPinned(id)) {
      const cid: CountdownTileId = `cd_${id}`;
      const nextLayout = hideTile(layout, cid);
      setLayout(nextLayout);
      patchProfile({ home_layout: nextLayout as any });
      if (user?.id) saveHomeLayout(user.id, nextLayout);
    }
  }

  function handleStartAll() {
    startAllCountdowns();
    setList(getCountdowns());
    oznam('Všechny odpočty byly spuštěny');
  }
  function handlePauseAll() {
    pauseAllCountdowns();
    setList(getCountdowns());
    oznam('Všechny odpočty byly pozastaveny');
  }
  function handleResetAll() {
    resetAllCountdowns();
    setList(getCountdowns());
    oznam('Všechny odpočty byly resetovány');
  }
  function handleTestAlert() {
    notifyTimerDone('Test upozornění', 'Zvuk i vibrace fungují na 100 %');
  }

  const PRESETS = [
    { label: 'Kotel', min: '2' },
    { label: 'Chmelení', min: '15' },
    { label: 'Chmelovar', min: '60' },
    { label: 'Máčení kvasnic', min: '10' },
    { label: 'Pauza', min: '5' },
  ];

  const hasRunning = list.some((t) => t.targetAt !== null);

  /** Vytvoří nový odpočet, spustí ho a připne na plochu jedním kliknutím. */
  function quickStart(label: string, minutes: number) {
    const durationMs = Math.round(minutes * 60000);
    const newId = `t_${Math.random().toString(36).slice(2, 9)}`;
    const t: CountdownTimer = {
      id: newId,
      label: label.trim() || `${minutes} min`,
      durationMs: 0,
      initialDurationMs: durationMs,
      targetAt: Date.now() + durationMs,
      notifiedAt: null,
    };
    persist([...list, t]);

    // Automaticky připnout na plochu
    const cid: CountdownTileId = `cd_${newId}`;
    const nextLayout = addTile(layout, cid, 0);
    setLayout(nextLayout);
    patchProfile({ home_layout: nextLayout as any });
    if (user?.id) saveHomeLayout(user.id, nextLayout);
    oznam(`⏱️ „${t.label}" spuštěn a přidán na plochu`);
  }

  const [autoStart, setAutoStart] = useState(true);

  return (
    <div className="space-y-5">
      {/* Rychlý start jedním klepnutím */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-3">
        <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide">
          ⚡ Rychlý start — klepni a běží
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => quickStart(p.label, Number(p.min))}
              className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-sm font-black bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white border border-emerald-700 shadow-sm transition"
            >
              <Play size={16} className="fill-current shrink-0" />
              <span className="truncate">{p.label}</span>
              <span className="text-emerald-200 text-xs font-bold shrink-0">{p.min}′</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 leading-relaxed">
          Klepnutím na tlačítko se odpočet okamžitě <strong>vytvoří, spustí a připne na plochu</strong> —
          běží i na pozadí.
        </p>
      </div>

      {/* Vlastní odpočet */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-3">
        <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide">
          ＋ Vlastní odpočet
        </div>
        <form onSubmit={addTimer} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <label className="block text-[11px] font-bold text-neutral-500 mb-1">Název odpočtu</label>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="např. Kotel, Chmelení…"
              className="w-full border border-neutral-300 rounded px-3 py-2 text-sm font-semibold"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-neutral-500 mb-1">Délka (minuty)</label>
            <input
              type="number" inputMode="decimal" onWheel={(e) => e.currentTarget.blur()}
              min={0.1}
              step={0.5}
              value={newMin}
              onChange={(e) => setNewMin(e.target.value)}
              className="w-24 border border-neutral-300 rounded px-3 py-2 text-sm font-bold"
            />
          </div>
          <div className="flex flex-col gap-1.5 pb-1">
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={pinToHome}
                onChange={(e) => setPinToHome(e.target.checked)}
                className="rounded text-amber-500 focus:ring-amber-400"
              />
              <span>📌 Na plochu</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold text-neutral-700 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={autoStart}
                onChange={(e) => setAutoStart(e.target.checked)}
                className="rounded text-emerald-500 focus:ring-emerald-400"
              />
              <span>▶ Hned spustit</span>
            </label>
          </div>
          <button type="submit" className="btn-primary !rounded px-4 py-2 rounded font-black flex items-center gap-1.5">
            <Plus size={16} /> Přidat
          </button>
        </form>
      </div>

      {list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-neutral-50 p-3 rounded-xl border border-neutral-200">
          <div className="flex flex-wrap items-center gap-2">
            {!hasRunning ? (
              <button
                type="button"
                onClick={handleStartAll}
                className="btn-primary !rounded px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1"
              >
                <Play size={13} /> Spustit všechny
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseAll}
                className="px-3 py-1.5 rounded text-xs font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1"
              >
                <Pause size={13} /> Pozastavit všechny
              </button>
            )}
            <button
              type="button"
              onClick={handleResetAll}
              className="px-3 py-1.5 rounded text-xs font-bold bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 flex items-center gap-1"
            >
              <RotateCcw size={13} /> Resetovat vše
            </button>
          </div>
          <button
            type="button"
            onClick={handleTestAlert}
            className="px-3 py-1.5 rounded text-xs font-bold bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 flex items-center gap-1"
            title="Přehraje alarm a zavibruje pro otestování"
          >
            🔔 Vyzkoušet zvuk a vibrace
          </button>
        </div>
      )}

      {list.length === 0 && (
        <p className="text-sm text-neutral-500 text-center py-8">Zatím žádný časovač — přidej si první nahoře.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {list.map((t) => {
          const remaining = countdownRemainingMs(t);
          const running = t.targetAt !== null;
          const done = running && remaining === 0;
          const pinned = isPinned(t.id);

          return (
            <div key={t.id} className={`p-4 rounded-xl border-2 transition ${done ? 'bg-rose-50 border-rose-300 shadow-sm' : 'bg-white border-neutral-200'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-black text-base text-neutral-800 truncate flex items-center gap-1.5">
                  <AlarmClock size={16} className={running && !done ? 'animate-pulse text-amber-600' : 'text-neutral-500'} />
                  <span className="truncate">{t.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => togglePin(t)}
                    title={pinned ? 'Odebrat z domovské plochy' : 'Přidat na domovskou plochu jako dlaždici'}
                    className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 transition ${
                      pinned ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-neutral-50 text-neutral-500 border-neutral-200 hover:bg-neutral-100'
                    }`}
                  >
                    <Pin size={13} className={pinned ? 'rotate-45 fill-current' : ''} />
                    <span>{pinned ? 'Na ploše' : 'Plocha'}</span>
                  </button>
                  <button onClick={() => remove(t.id)} className="p-1.5 text-neutral-400 hover:text-rose-600 rounded-lg shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              <div className={`text-4xl font-black tabular-nums my-3 ${done ? 'text-rose-600 animate-pulse' : 'text-neutral-900'}`}>
                {formatDurationMs(remaining)}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                {!running ? (
                  <button onClick={() => start(t.id)} className="btn-primary !rounded px-4 py-2 rounded text-xs font-black flex items-center gap-1.5">
                    <Play size={14} /> Start
                  </button>
                ) : done ? (
                  <span className="text-xs font-black text-rose-700 flex items-center gap-1"><CheckCircle2 size={14} /> Hotovo</span>
                ) : (
                  <button onClick={() => pause(t.id)} className="px-4 py-2 rounded text-xs font-black bg-amber-500 hover:bg-amber-400 text-neutral-950 flex items-center gap-1.5">
                    <Pause size={14} /> Pauza
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => reset(t.id)}
                  title="Resetovat na původní čas"
                  className="px-3 py-2 rounded text-xs font-bold bg-neutral-100 hover:bg-neutral-200 text-neutral-700 flex items-center gap-1"
                >
                  <RotateCcw size={13} /> Reset
                </button>
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
  async function cancel() {
    if (!(await potvrd('Zrušit měření bez uložení do historie?'))) return;
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
                {overdue ? 'Sud by měl být stočený!' : `Zbývá odhadem ${formatDurationMs(remainingMs)}`}
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={finish} className="btn-primary !rounded px-8 py-3 rounded font-black flex items-center gap-2">
              <CheckCircle2 size={18} /> Stočeno
            </button>
            <button onClick={cancel} className="px-5 py-3 rounded font-black bg-neutral-100 text-neutral-600 flex items-center gap-2">
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
                  <button onClick={() => removeHistory(idx)} className="text-neutral-400 hover:text-rose-600">
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
