/**
 * Automatická kontrola nové verze aplikace.
 *
 * Pravidelně stahuje `version.json` ze serveru a porovnává ho s lokální
 * `APP_VERSION`. Pokud se liší, vyvolá událost `pivovar:new-version`
 * a zobrazí uživateli tlačítko pro aktualizaci.
 */

import { APP_VERSION } from './version';

const CHECK_INTERVAL_MS = 60 * 1000; // 1 minuta — rychlejší detekce nové verze
const VERSION_URL = './version.json';
export const APP_CACHE_PREFIX = 'pivovar-';

export type VersionInfo = {
  version: string;
  date: string;
};

let currentVersion: string | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let initialCheckTimer: ReturnType<typeof setTimeout> | null = null;
let latestAvailableVersion: VersionInfo | null = null;
const listeners = new Set<(info: VersionInfo) => void>();

export function onNewVersion(cb: (info: VersionInfo) => void): () => void {
  listeners.add(cb);
  if (latestAvailableVersion) cb(latestAvailableVersion);
  return () => {
    listeners.delete(cb);
  };
}

function notify(info: VersionInfo) {
  for (const cb of listeners) cb(info);
}

export async function checkVersion(silent = false): Promise<VersionInfo | null> {
  try {
    // Necháme service worker zkontrolovat, jestli není dostupná nová verze SW.
    // Bez toho by starý SW vracel z cache starý version.json a aplikace by
    // nikdy nezjistila, že je dostupná nová verze (dokud uživatel nerefreshne).
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update().catch(() => undefined);
      }
    }

    // Cache-busting query param: i kdyby starý service worker vracel version.json
    // z cache (cache-first), unikátní URL s časovým razítkem cache minout a
    // vždy se stáhne čerstvá verze ze serveru.
    const bust = `?t=${Date.now()}`;
    const resp = await fetch(VERSION_URL + bust, {
      method: 'GET',
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!resp.ok) return null;
    const info: VersionInfo = await resp.json();
    if (!info?.version) return null;

    currentVersion = info.version;

    if (info.version !== APP_VERSION) {
      latestAvailableVersion = info;
    } else {
      latestAvailableVersion = null;
    }

    if (!silent && latestAvailableVersion) {
      notify(info);
    }
    return info;
  } catch {
    // offline nebo chyba sítě — ticho
    return null;
  }
}


export function startVersionCheck() {
  // Idempotentní start: main.tsx je jediný vlastník časovačů. Opakované
  // zavolání nesmí vytvořit další timeout ani interval.
  if (checkTimer || initialCheckTimer) return;

  // První kontrola za 3 sekundy po startu
  initialCheckTimer = setTimeout(() => {
    initialCheckTimer = null;
    void checkVersion();
  }, 3000);

  checkTimer = setInterval(() => { void checkVersion(); }, CHECK_INTERVAL_MS);
}

export function stopVersionCheck() {
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer);
    initialCheckTimer = null;
  }
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

/** Odstraní jen CacheStorage položky vlastněné touto aplikací. */
export async function clearAppCaches(): Promise<void> {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((key) => key.startsWith(APP_CACHE_PREFIX))
      .map((key) => caches.delete(key)),
  );
}

export function getCurrentVersion(): string | null {
  return currentVersion;
}

/**
 * Vynucená aktualizace: zruší registraci této aplikace, vymaže její cache
 * a znovu načte stránku.
 */
export async function forceRefresh() {
  // Aktualizace je vždy explicitní akce uživatele. Automatická kontrola pouze
  // zobrazí upozornění a nikdy sama nereloaduje rozpracovanou obrazovku.
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.unregister();
  }

  await clearAppCaches();
  window.location.reload();
}
