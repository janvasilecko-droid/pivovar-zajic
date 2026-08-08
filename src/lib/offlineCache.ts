// IndexedDB-based cache for Supabase GET responses.
// Used by offlineFetch in supabase.ts so the app can keep working (reading
// reference data + previously seen records) while offline.
//
// Two stores:
//   - responses: exact request URL -> { rows, contentRange }
//   - tables:    table name -> { rows }  (upsert by row id, latest wins)

const DB_NAME = 'pivovar-offline';
const DB_VERSION = 1;
const RESPONSES_STORE = 'responses';
const TABLES_STORE = 'tables';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(RESPONSES_STORE)) db.createObjectStore(RESPONSES_STORE);
        if (!db.objectStoreNames.contains(TABLES_STORE)) db.createObjectStore(TABLES_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then((db) => {
    if (!db) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  });
}

export type CachedResponse = {
  rows: any[];
  contentRange: string | null;
};

export function cacheGetResponse(url: string, rows: any[], contentRange: string | null): Promise<void> {
  return tx(RESPONSES_STORE, 'readwrite', (s) => s.put({ rows, contentRange, t: Date.now() }, url)).then(() => undefined);
}

export function getCachedResponse(url: string): Promise<CachedResponse | null> {
  return tx(RESPONSES_STORE, 'readonly', (s) => s.get(url)).then((v) =>
    v && Array.isArray(v.rows) ? { rows: v.rows, contentRange: v.contentRange ?? null } : null
  );
}

/** Upsert rows into the per-table store (merged by row id). */
export function upsertTableRows(table: string, rows: any[]): Promise<void> {
  return tx(TABLES_STORE, 'readonly', (s) => s.get(table)).then((existing) => {
    const map = new Map<string, any>();
    for (const r of (existing?.rows as any[]) ?? []) if (r && typeof r.id === 'string') map.set(r.id, r);
    for (const r of rows) if (r && typeof r.id === 'string') map.set(r.id, r);
    const merged = Array.from(map.values());
    return tx(TABLES_STORE, 'readwrite', (s) => s.put({ rows: merged }, table)).then(() => undefined);
  });
}

export function getTableRows(table: string): Promise<any[] | null> {
  return tx(TABLES_STORE, 'readonly', (s) => s.get(table)).then((v) =>
    v && Array.isArray(v.rows) ? v.rows : null
  );
}
