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

export type VersionInfo = {
  version: string;
  date: string;
};

let currentVersion: string | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let listeners: Array<(info: VersionInfo) => void> = [];

export function onNewVersion(cb: (info: VersionInfo) => void): () => void {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function notify(info: VersionInfo) {
  for (const cb of listeners) cb(info);
}

export async function checkVersion(): Promise<VersionInfo | null> {
  try {
    // Necháme service worker zkontrolovat, jestli není dostupná nová verze SW.
    // Bez toho by starý SW vracel z cache starý version.json a aplikace by
    // nikdy nezjistila, že je dostupná nová verze (dokud uživatel nerefreshne).
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.update().catch(() => {});
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
      notify(info);
    }
    return info;
  } catch {
    // offline nebo chyba sítě — ticho
    return null;
  }
}

export function startVersionCheck() {
  // První kontrola za 3 sekundy po startu
  setTimeout(() => checkVersion(), 3000);

  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(() => checkVersion(), CHECK_INTERVAL_MS);
}

/**
 * Automatická aktualizace: pokud je dostupná nová verze, aplikace se sama
 * obnoví (bez nutnosti klikat na tlačítko). Aby uživatel nepřišel o rozpracovaný
 * zápis, obnoví se jen tehdy, když zrovna nepíše do žádného pole.
 *
 * Vrací true, pokud se aktualizace spustila.
 */
export async function autoRefreshIfNewVersion(): Promise<boolean> {
  const info = await checkVersion();
  if (!info) return false;

  // Pokud uživatel zrovna píše do formuláře, necháme ho dokončit zápis —
  // aktualizace proběhne při příští kontrole (za 5 minut).
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
    return false;
  }

  // Krátké zpoždění, aby se stihlo zobrazit upozornění
  setTimeout(() => { forceRefresh(); }, 1500);
  return true;
}

export function stopVersionCheck() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

export function getCurrentVersion(): string | null {
  return currentVersion;
}

/**
 * Vynucená aktualizace: zruší všechny service workery, vymaže cache
 * a reloadne stránku.
 */
export async function forceRefresh() {
  // 1. Odregistrovat service workery
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const reg of registrations) {
      await reg.unregister();
    }
  }

  // 2. Vymazat všechny cache
  if ('caches' in window) {
    const keys = await caches.keys();
    for (const key of keys) {
      await caches.delete(key);
    }
  }

  // 3. Reload
  window.location.reload();
}
