// Offline queue + sync for the PWA.
// Stores pending mutations in localStorage and replays them when online.
// Each entry is a Supabase operation: { table, op: 'insert'|'update'|'delete', match?: Record<string,any>, row?: Record<string,any> }.

const KEY = 'pivovar_offline_queue_v1';
// Důvody neúspěchu se drží vedle fronty, ne jen v paměti: aplikace se
// v telefonu restartuje běžně (upozornění na novou verzi, přepnutí aplikací)
// a po restartu by u uvízlého zápisu nebylo vidět PROČ uvízl ani tlačítko
// „Zahodit" — vypadal by jako každý jiný čekající zápis.
const KEY_CHYBY = 'pivovar_offline_chyby_v1';
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
  try {
    localStorage.setItem(KEY, JSON.stringify(q));
  } catch (e: any) {
    // Telefon má plnou paměť pro aplikaci. Bez téhle hlášky by se zobrazila
    // holá „QuotaExceededError", ze které nikdo nepozná, co s tím dělat.
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      throw new Error(
        'V telefonu došlo místo pro rozepsané zápisy. Připojte se k internetu ' +
        'a odešlete čekající zápisy (klepněte na kolečko stavu nahoře), pak to zkuste znovu.',
      );
    }
    throw e;
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: q.length }));
}

export function getQueue(): QueuedOp[] { return read(); }

export function queueLength() { return read().length; }

export function enqueue(op: Omit<QueuedOp, 'id' | 'ts'>) {
  const q = read();
  q.push({ ...op, id: crypto.randomUUID(), ts: Date.now() });
  write(q);
}

export function clearQueue() {
  write([]);
  zapisChyby([]);
}

export function removeOp(id: string) {
  write(read().filter((o) => o.id !== id));
  zapisChyby(getLastSyncFailures());
}

export type SyncFailure = { id: string; table: string; op: QueuedOp['op']; error: string };

// Chybové zprávy z posledního syncQueue() běhu — ať UI ukáže PROČ konkrétní
// zápis uvízl ve frontě (ne jen "selhalo N"), a uživatel se může rozhodnout
// položku zahodit (removeOp), pokud jde o trvalou chybu (např. duplicitní klíč).
export function getLastSyncFailures(): SyncFailure[] {
  try { return JSON.parse(localStorage.getItem(KEY_CHYBY) ?? '[]'); } catch { return []; }
}

function zapisChyby(chyby: SyncFailure[]) {
  try {
    // Chyby k zápisům, které už ve frontě nejsou, se nedrží — jinak by se
    // v seznamu hromadily řádky bez protějšku.
    const ve_fronte = new Set(read().map((o) => o.id));
    localStorage.setItem(KEY_CHYBY, JSON.stringify(chyby.filter((c) => ve_fronte.has(c.id))));
  } catch { /* na chybách o chybách nestojí nic zásadního */ }
}

/** Popis zápisu lidsky — v seznamu čekajících nikomu nepomůže „orders · insert". */
const NAZVY_TABULEK: Record<string, string> = {
  orders: 'Objednávka',
  order_items: 'Položka objednávky',
  kegging: 'Stáčení KEG',
  bottling: 'Stáčení lahví',
  fasovani: 'Fasování',
  fasovani_private: 'Fasování personál',
  writeoffs: 'Odpis',
  inventory: 'Inventura',
  inventory_adjustments: 'Dorovnání inventury',
  keg_prefuk: 'Přefuk KEG',
  akce: 'Akce',
  akce_items: 'Položka akce',
  zavoz_deductions: 'Odečet závozu',
  zavoz_ukoly_hotovo: 'Úkol k závozu',
  kegging_plan_checks: 'Odškrtnutí v plánu stáčení',
  cellar_tanks: 'Tank ve sklepě',
  keg_returns: 'Vrácení sudů',
};

const NAZVY_OPERACI: Record<QueuedOp['op'], string> = {
  insert: 'nový zápis',
  upsert: 'uložení',
  update: 'úprava',
  delete: 'smazání',
};

export function popisOperace(op: QueuedOp): string {
  const tabulka = NAZVY_TABULEK[op.table] ?? op.table;
  const zaklad = `${tabulka} — ${NAZVY_OPERACI[op.op] ?? op.op}`;

  // Pár polí, podle kterých se dá poznat, o který zápis jde. Víc než tohle
  // se do řádku stejně nevejde.
  const r = op.row ?? {};
  const detaily = [
    r.place_name,
    r.beer_name,
    r.package_label,
    r.quantity != null ? `${r.quantity} ks` : null,
    r.entry_date ?? r.order_date ?? r.delivery_date,
  ].filter(Boolean);

  return detaily.length ? `${zaklad}: ${detaily.join(' · ')}` : zaklad;
}

export async function syncQueue(): Promise<{ ok: number; failed: number; remaining: number }> {
  const { supabase } = await import('./supabase');
  const q = read();
  let ok = 0, failed = 0;
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
        failed++;
        failures.push({ id: op.id, table: op.table, op: op.op, error: res.error.message ?? String(res.error) });
      } else {
        ok++;
        // Odstranit HNED po úspěchu, ne až po celé dávce — jinak by reload
        // uprostřed synchronizace (např. po ťuknutí na "aktualizovat" z
        // upozornění na novou verzi) nechal už uloženou položku ve frontě a
        // příští sync by ji poslal ZNOVU (duplicitní objednávka v DB, i když
        // se uživatel nedotkl ničeho navíc — appka ji poslala sama podruhé).
        removeOp(op.id);
      }
    } catch (e: any) {
      failed++;
      failures.push({ id: op.id, table: op.table, op: op.op, error: e?.message ?? String(e) });
    }
  }
  zapisChyby(failures);
  const remaining = read();
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
