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

const frontaTabulek = new Map<string, Promise<void>>();

/**
 * Upsert rows into the per-table store (merged by row id).
 *
 * Běží po tabulkách jedna po druhé: souběžné stránky téže tabulky (stahují
 * se naráz, viz fetchAllRows) by si jinak navzájem přepsaly výsledek —
 * obě přečtou stejný starý obsah a vyhraje ta, co zapíše poslední.
 *
 * Řádky bez `id` (většina výčtů sloupců u pohybů) se uložit nedají — dřív se
 * kvůli nim stejně přečetla a znovu zapsala celá uložená tabulka, zbytečně.
 */
export function upsertTableRows(table: string, rows: any[]): Promise<void> {
  const sId = rows.filter((r) => r && typeof r.id === 'string');
  if (sId.length === 0) return Promise.resolve();
  const predchozi = frontaTabulek.get(table) ?? Promise.resolve();
  const dalsi = predchozi.then(() => tx(TABLES_STORE, 'readonly', (s) => s.get(table)).then((existing) => {
    const map = new Map<string, any>();
    for (const r of (existing?.rows as any[]) ?? []) if (r && typeof r.id === 'string') map.set(r.id, r);
    for (const r of sId) map.set(r.id, r);
    const merged = Array.from(map.values());
    return tx(TABLES_STORE, 'readwrite', (s) => s.put({ rows: merged }, table)).then(() => undefined);
  })).catch(() => undefined);
  frontaTabulek.set(table, dalsi);
  void dalsi.then(() => { if (frontaTabulek.get(table) === dalsi) frontaTabulek.delete(table); });
  return dalsi;
}

/**
 * Smaže uložené odpovědi starší než `maxStariMs`. Dřív se nemazalo nic:
 * každá jiná adresa dotazu (jiné datum, jiná dávka objednávek…) přidala
 * trvalý záznam, takže úložiště v telefonu jen rostlo.
 */
export function uklidStareOdpovedi(maxStariMs = 30 * 24 * 3600_000): Promise<number> {
  return openDb().then((db) => {
    if (!db) return 0;
    return new Promise<number>((resolve) => {
      let smazano = 0;
      try {
        const hranice = Date.now() - maxStariMs;
        const t = db.transaction(RESPONSES_STORE, 'readwrite');
        const req = t.objectStore(RESPONSES_STORE).openCursor();
        req.onsuccess = () => {
          const kurzor = req.result;
          if (!kurzor) return;
          const v = kurzor.value as { t?: number } | undefined;
          if (!v || typeof v.t !== 'number' || v.t < hranice) { kurzor.delete(); smazano++; }
          kurzor.continue();
        };
        t.oncomplete = () => resolve(smazano);
        t.onerror = () => resolve(smazano);
        t.onabort = () => resolve(smazano);
      } catch {
        resolve(smazano);
      }
    });
  });
}

export function getTableRows(table: string): Promise<any[] | null> {
  return tx(TABLES_STORE, 'readonly', (s) => s.get(table)).then((v) =>
    v && Array.isArray(v.rows) ? v.rows : null
  );
}
