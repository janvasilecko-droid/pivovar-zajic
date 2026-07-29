// Minimal offline-first service worker for the Minipivovar PWA.
const CACHE = 'pivovar-v25';

const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './logo copy.jpg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

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


  // Network-first for navigation requests, manifests, and dev assets
  if (
    req.mode === 'navigate' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.includes('/.vite/') ||
    url.pathname.includes('/src/')
  ) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res && res.status === 200) {
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

  // Cache-first for static assets
  e.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === 'basic') {
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
});
