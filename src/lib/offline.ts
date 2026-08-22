// Offline queue + sync for the PWA.
// Stores pending mutations in localStorage and replays them when online.
// Each entry is a Supabase operation: { table, op: 'insert'|'update'|'delete', match?: Record<string,any>, row?: Record<string,any> }.

const KEY = 'pivovar_offline_queue_v1';
const EVT = 'pivovar:sync';

export type QueuedOp = {
  id: string;
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  match?: Record<string, any>;     // for update/delete: .eq columns
  inMatch?: Record<string, any[]>; // for update/delete: .in columns
  row?: Record<string, any>;       // for insert/update/upsert: payload
  onConflict?: string;             // for upsert: on_conflict column(s)
  ts: number;
};

function read(): QueuedOp[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function write(q: QueuedOp[]) {
  localStorage.setItem(KEY, JSON.stringify(q));
  window.dispatchEvent(new CustomEvent(EVT, { detail: q.length }));
}

export function getQueue(): QueuedOp[] { return read(); }

export function queueLength() { return read().length; }

export function enqueue(op: Omit<QueuedOp, 'id' | 'ts'>) {
  const q = read();
  q.push({ ...op, id: crypto.randomUUID(), ts: Date.now() });
  write(q);
}

export function clearQueue() { write([]); }

export function removeOp(id: string) {
  write(read().filter((o) => o.id !== id));
}

export type SyncFailure = { id: string; table: string; op: QueuedOp['op']; error: string };

// Chybové zprávy z posledního syncQueue() běhu — ať UI ukáže PROČ konkrétní
// zápis uvízl ve frontě (ne jen "selhalo N"), a uživatel se může rozhodnout
// položku zahodit (removeOp), pokud jde o trvalou chybu (např. duplicitní klíč).
let lastFailures: SyncFailure[] = [];
export function getLastSyncFailures(): SyncFailure[] { return lastFailures; }

export async function syncQueue(): Promise<{ ok: number; failed: number; remaining: number }> {
  const { supabase } = await import('./supabase');
  const q = read();
  let ok = 0, failed = 0;
  const failedIds = new Set<string>();
  const failures: SyncFailure[] = [];
  for (const op of q) {
    let res: { error: any } | null = null;
    try {
      if (op.op === 'insert') res = await supabase.from(op.table).insert(op.row ?? {});
      else if (op.op === 'upsert') res = await supabase.from(op.table).upsert(op.row ?? {}, op.onConflict ? { onConflict: op.onConflict } : {});
      else if (op.op === 'update') {
        let b = supabase.from(op.table).update(op.row ?? {});
        for (const [k, v] of Object.entries(op.match ?? {})) b = b.eq(k, v);
        for (const [k, v] of Object.entries(op.inMatch ?? {})) b = b.in(k, v);
        res = await b;
      } else if (op.op === 'delete') {
        let b = supabase.from(op.table).delete();
        for (const [k, v] of Object.entries(op.match ?? {})) b = b.eq(k, v);
        for (const [k, v] of Object.entries(op.inMatch ?? {})) b = b.in(k, v);
        res = await b;
      }
      if (res?.error) {
        failed++; failedIds.add(op.id);
        failures.push({ id: op.id, table: op.table, op: op.op, error: res.error.message ?? String(res.error) });
      } else ok++;
    } catch (e: any) {
      failed++; failedIds.add(op.id);
      failures.push({ id: op.id, table: op.table, op: op.op, error: e?.message ?? String(e) });
    }
  }
  lastFailures = failures;
  // Během synchronizace mohl uživatel přidat další operace. Zachováme je a
  // odstraníme pouze úspěšně zpracované položky z původního snapshotu.
  const processedIds = new Set(q.map((op) => op.id));
  const remaining = read().filter((op) => !processedIds.has(op.id) || failedIds.has(op.id));
  write(remaining);
  return { ok, failed, remaining: remaining.length };
}

export function onQueueChange(cb: (n: number) => void) {
  const h = (e: Event) => cb((e as CustomEvent).detail ?? queueLength());
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// Online/offline detection
export function isOnline() { return navigator.onLine; }
export function onConnectivityChange(cb: (online: boolean) => void) {
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}
