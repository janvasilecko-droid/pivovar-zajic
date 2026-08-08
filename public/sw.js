// Minimal offline-first service worker for the Minipivovar PWA.
// Cache version is fetched from version.json at install time so that
// every deploy automatically invalidates the old cache.
// SW_VERSION: 1.509 — change this to force SW update in browser
const CACHE_PREFIX = 'pivovar-';

const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo copy.jpg', './version.json'];

async function getCacheVersion() {
  try {
    // Cache-busting: unikátní URL, aby se nikdy nevracela stará verze z cache
    const resp = await fetch('./version.json?t=' + Date.now(), { cache: 'no-cache' });
    if (resp.ok) {
      const info = await resp.json();
      if (info?.version) return CACHE_PREFIX + info.version;
    }
  } catch {}
  // Fallback: use a timestamp so dev builds still get a unique cache
  return CACHE_PREFIX + Date.now().toString(36);
}

// Store the version we installed with so we can detect updates
let installedVersion = '';

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const CACHE = await getCacheVersion();
      installedVersion = CACHE;
      // Store the cache name so the activate handler can read it
      self.__pivovarCache = CACHE;
      const c = await caches.open(CACHE);
      await c.addAll(PRECACHE).catch(() => {});
    })()
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const CACHE = self.__pivovarCache || (await getCacheVersion());
      installedVersion = CACHE;
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // Notify all clients that a new version is now active — client si
      // vynutí reload, aby se okamžitě načetla nejnovější verze aplikace.
      const clients = await self.clients.matchAll();
      for (const client of clients) {
        client.postMessage({ type: 'SW_ACTIVATED', version: CACHE });
      }
    })()
  );
  self.clients.claim();
});

// Periodicky kontrolovat novou verzi SW (každou minutu).
// Bez toho by se SW aktualizoval jen při navigaci/načtení stránky a uživatel
// s otevřenou aplikací by zůstal na staré verzi, dokud by ručně nerefreshnul.
setInterval(() => {
  self.registration.update().catch(() => {});
}, 60 * 1000);

// Web Share Target: when the user shares an image (e.g. from WhatsApp) directly
// to this installed PWA, Chrome sends a POST request here with the photo(s)
// as multipart/form-data. We can't hand a POST body straight to a normal page
// navigation, so instead we read the shared files, stash them in IndexedDB,
// and then redirect the browser to /share which reads them back out.
const SHARE_DB = 'pivovar-share';
const SHARE_STORE = 'files';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(SHARE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function storeSharedFiles(files) {
  const db = await openShareDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(SHARE_STORE, 'readwrite');
    tx.objectStore(SHARE_STORE).put(files, 'pending');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// Check if there's a newer version of the SW available
async function checkForSWUpdate() {
  try {
    // Fetch the current SW script and compare
    const resp = await fetch('./sw.js', { cache: 'no-cache' });
    if (!resp.ok) return false;
    const text = await resp.text();
    // If the fetched SW has a different version string, there's an update
    // We compare by checking if the installed version appears in the new SW
    // A simpler approach: just check version.json
    const versionResp = await fetch('./version.json?t=' + Date.now(), { cache: 'no-cache' });
    if (versionResp.ok) {
      const info = await versionResp.json();
      const serverCacheName = CACHE_PREFIX + info.version;
      if (serverCacheName !== installedVersion) {
        return true;
      }
    }
  } catch {}
  return false;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Web Share Target
  if (req.method === 'POST' && url.pathname === '/share') {
    e.respondWith(
      (async () => {
        try {
          const formData = await req.formData();
          const files = formData.getAll('photos');
          const blobs = [];
          for (const f of files) {
            if (f && typeof f.arrayBuffer === 'function') {
              blobs.push({ name: f.name, type: f.type, data: await f.arrayBuffer() });
            }
          }
          await storeSharedFiles(blobs);
        } catch (err) {
          // ignore — /share page will just show no shared photos
        }
        return Response.redirect('/share', 303);
      })()
    );
    return;
  }

  if (req.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Supabase data & auth requests are handled by the app itself (offlineFetch:
  // cache + offline queue) — never let the SW intercept them, otherwise the
  // network-first fallback would serve index.html instead of data when offline.
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;

  // For navigation requests, use cache-first strategy for instant offline loading
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        // First, try cache
        const cached = await caches.match(req.url);
        if (cached) {
          // Cache hit: serve immediately, then refresh in background
          e.waitUntil(
            (async () => {
              try {
                const networkRes = await fetch(req);
                if (networkRes && networkRes.status === 200) {
                  const CACHE = self.__pivovarCache || (await getCacheVersion());
                  const clone = networkRes.clone();
                  caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
                  // Check for SW update
                  const hasUpdate = await checkForSWUpdate();
                  if (hasUpdate) {
                    const clients = await self.clients.matchAll();
                    for (const client of clients) {
                      client.postMessage({ type: 'NEW_VERSION_AVAILABLE' });
                    }
                  }
                }
              } catch {}
            })()
          );
          return cached;
        }

        // No cache: try network
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const CACHE = self.__pivovarCache || (await getCacheVersion());
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(req, clone)).catch(() => {});
          }
          return res;
        } catch {
          // If still no cache (first load offline) serve cached index.html as fallback
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Network-first for manifests, version.json and dev assets
  // version.json MUST always come fresh from the server, jinak by SW vracel
  // starou verzi a aplikace by nikdy nezjistila, že je dostupná nová verze.
  if (
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    url.pathname === '/version.json' ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/.vite/') ||
    url.pathname.includes('/src/')
  ) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
            const CACHE = self.__pivovarCache || (await getCacheVersion());
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        } catch {
          const fallback = await caches.match('/index.html');
          return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Network-first strategy for static assets & JS bundles (always get latest code if online)
  e.respondWith(
    (async () => {
      try {
        const networkRes = await fetch(req, { cache: 'no-cache' });
        if (networkRes && networkRes.status === 200) {
          const CACHE = self.__pivovarCache || (await getCacheVersion());
          const clone = networkRes.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          return networkRes;
        }
      } catch {
        // Fallback to cache if offline
      }
      const cached = await caches.match(req);
      if (cached) return cached;
      const fallback = await caches.match('/index.html');
      return fallback || new Response('Offline', { status: 503, statusText: 'Offline' });
    })()
  );
});
