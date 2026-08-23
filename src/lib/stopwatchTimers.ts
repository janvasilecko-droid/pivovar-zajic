// Lokální (per-zařízení) uložiště pro Stopky / Časovač / Stočení sudu
// (TimersScreen.tsx) — čistě localStorage, žádná synchronizace přes Supabase.
// Jde o efemérní pracovní nástroj používaný přímo na místě ve sklepě/na
// stáčírně, ne o data, která by měla smysl sdílet mezi uživateli/zařízeními
// (na rozdíl od home_layout, viz homeLayout.ts).

// ---- Stopky ----
export type StopwatchState = {
  running: boolean;
  /** Date.now() při posledním spuštění/pokračování, null když neběží. */
  startedAt: number | null;
  /** Nasčítaný čas (ms) před posledním spuštěním. */
  elapsedBeforeMs: number;
  /** Uložené mezičasy — celkový čas od startu (ms) v okamžiku kliknutí na Mezičas. */
  laps: number[];
};

const STOPWATCH_KEY = 'timers_stopwatch_v1';
const DEFAULT_STOPWATCH: StopwatchState = { running: false, startedAt: null, elapsedBeforeMs: 0, laps: [] };

export function getStopwatchState(): StopwatchState {
  try {
    const saved = localStorage.getItem(STOPWATCH_KEY);
    if (saved) return { ...DEFAULT_STOPWATCH, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_STOPWATCH;
}

export function saveStopwatchState(state: StopwatchState) {
  try { localStorage.setItem(STOPWATCH_KEY, JSON.stringify(state)); } catch {}
}

/** Aktuální nasčítaný čas v ms — počítá se z reálného času, funguje i bez re-renderu. */
export function stopwatchElapsedMs(state: StopwatchState): number {
  if (!state.running || state.startedAt === null) return state.elapsedBeforeMs;
  return state.elapsedBeforeMs + (Date.now() - state.startedAt);
}

// ---- Časovač — víc pojmenovaných odpočtů najednou (např. "Chmelení 15 min" +
// "Máčení kvasnic 10 min" souběžně) ----
export type CountdownTimer = {
  id: string;
  label: string;
  durationMs: number;
  /** Date.now() cíl konce; null = zatím nespuštěno / pozastaveno. */
  targetAt: number | null;
  notifiedAt: number | null;
};

const COUNTDOWNS_KEY = 'timers_countdowns_v1';

export function getCountdowns(): CountdownTimer[] {
  try {
    const saved = localStorage.getItem(COUNTDOWNS_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return [];
}

export function saveCountdowns(list: CountdownTimer[]) {
  try { localStorage.setItem(COUNTDOWNS_KEY, JSON.stringify(list)); } catch {}
}

export function countdownRemainingMs(t: CountdownTimer): number {
  if (t.targetAt === null) return t.durationMs;
  return Math.max(0, t.targetAt - Date.now());
}

// ---- Stočení sudu — pamatuje si, jak dlouho stáčení naposledy trvalo, a při
// příštím stáčení stačí stisknout tlačítko: sám odhadne, kdy by měl být sud
// hotový, a upozorní (viz KegTimerNotificationManager.tsx). ----
export type KegTimerState = {
  active: { startedAt: number; estimateMs: number | null; notifiedAt: number | null } | null;
  /** Posledních KEG_HISTORY_MAX skutečných dob (ms), nejnovější na konci. */
  history: number[];
};

const KEG_TIMER_KEY = 'timers_keg_v1';
const DEFAULT_KEG_TIMER: KegTimerState = { active: null, history: [] };
const KEG_HISTORY_MAX = 15;

export function getKegTimerState(): KegTimerState {
  try {
    const saved = localStorage.getItem(KEG_TIMER_KEY);
    if (saved) return { ...DEFAULT_KEG_TIMER, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_KEG_TIMER;
}

export function saveKegTimerState(state: KegTimerState) {
  try { localStorage.setItem(KEG_TIMER_KEY, JSON.stringify(state)); } catch {}
}

/** Odhad doby stáčení (ms) = průměr historie, nebo null bez historie. */
export function getKegEstimateMs(history: number[]): number | null {
  if (history.length === 0) return null;
  return Math.round(history.reduce((a, b) => a + b, 0) / history.length);
}

export function startKegTimer(): KegTimerState {
  const state = getKegTimerState();
  const estimateMs = getKegEstimateMs(state.history);
  const next: KegTimerState = { ...state, active: { startedAt: Date.now(), estimateMs, notifiedAt: null } };
  saveKegTimerState(next);
  return next;
}

/** Stočení dokončeno — spočítá skutečnou dobu a zapíše ji do historie (přepočte odhad pro příště). */
export function finishKegTimer(): KegTimerState {
  const state = getKegTimerState();
  if (!state.active) return state;
  const durationMs = Date.now() - state.active.startedAt;
  const history = [...state.history, durationMs].slice(-KEG_HISTORY_MAX);
  const next: KegTimerState = { active: null, history };
  saveKegTimerState(next);
  return next;
}

/** Zruší běžící měření bez zápisu do historie (falešný start). */
export function cancelKegTimer(): KegTimerState {
  const state = getKegTimerState();
  const next: KegTimerState = { ...state, active: null };
  saveKegTimerState(next);
  return next;
}

export function removeKegHistoryEntry(index: number): KegTimerState {
  const state = getKegTimerState();
  const next: KegTimerState = { ...state, history: state.history.filter((_, i) => i !== index) };
  saveKegTimerState(next);
  return next;
}

/** Poznamená, že upozornění na vypršelý odhad už bylo jednou vystřeleno (viz KegTimerNotificationManager). */
export function markKegTimerNotified(): KegTimerState {
  const state = getKegTimerState();
  if (!state.active) return state;
  const next: KegTimerState = { ...state, active: { ...state.active, notifiedAt: Date.now() } };
  saveKegTimerState(next);
  return next;
}

export function formatDurationMs(ms: number, withTenths = false): string {
  const totalMs = Math.max(0, ms);
  const totalSec = Math.floor(totalMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const base = h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
  if (!withTenths) return base;
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${base}.${tenths}`;
}
