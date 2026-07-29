// Reads photos that were shared into the installed PWA via the Web Share Target
// API (e.g. sharing a photo from WhatsApp/e-mail directly to this app). The
// service worker (public/sw.js) intercepts the share POST, stores the raw file
// bytes in IndexedDB, and redirects the browser to /share. This helper reads
// those stashed files back out (and clears them so they aren't reused).

const SHARE_DB = 'pivovar-share';
const SHARE_STORE = 'files';

type StoredFile = { name: string; type: string; data: ArrayBuffer };

function openShareDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SHARE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Returns any photos pending from a Web Share Target hand-off, and clears
 * them from IndexedDB so they won't be imported twice. Returns an empty
 * array if there's nothing pending or IndexedDB isn't available (e.g. not
 * running as an installed PWA / unsupported browser).
 */
export async function getPendingSharedFiles(): Promise<File[]> {
  if (!('indexedDB' in window)) return [];
  try {
    const db = await openShareDb();
    const stored: StoredFile[] | undefined = await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      const store = tx.objectStore(SHARE_STORE);
      const getReq = store.get('pending');
      getReq.onsuccess = () => {
        const val = getReq.result;
        store.delete('pending');
        resolve(val);
      };
      getReq.onerror = () => reject(getReq.error);
    });
    db.close();
    if (!stored || !stored.length) return [];
    return stored.map((f, i) => new File([f.data], f.name || `sdilena-foto-${i + 1}.jpg`, { type: f.type || 'image/jpeg' }));
  } catch {
    return [];
  }
}
