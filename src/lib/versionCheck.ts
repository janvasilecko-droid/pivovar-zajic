/**
 * Automatická kontrola nové verze aplikace.
 *
 * Pravidelně stahuje `version.json` ze serveru a porovnává ho s lokální
 * `APP_VERSION`. Pokud se liší, vyvolá událost `pivovar:new-version`
 * a zobrazí uživateli tlačítko pro aktualizaci.
 */

import { ulozMistoPredObnovou } from './mistoPoAktualizaci';
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
    } else if (!latestAvailableVersion) {
      // Už ohlášená nová verze se tu nemaže. Další kontrola občas vrátí
      // pořád tu starou (cache) a lišta by zmizela, aniž by se kleplo
      // na Aktualizovat.
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

/** Jak dlouho se nejdéle čeká, než server potvrdí, že odpovídá (ms). */
export const OVERENI_SPOJENI_MS = 8_000;
/**
 * Jak dlouho se nejdéle čeká na zrušení registrace service workeru (ms). Prohlížeč ho vyřídí až po právě
 * běžící instalaci nové verze — na slabém signálu to trvá. Když se to nestihne, nemaže se nic (viz forceRefresh).
 */
export const CEKANI_NA_ODREGISTRACI_MS = 30_000;
/** Jak dlouho se po klepnutí na Aktualizovat čeká, až se nová verze dostahuje do telefonu (ms). */
export const CEKANI_NA_INSTALACI_MS = 15_000;
/** Jak dlouho se čeká, až nová verze převezme stránku (ms); pak se stránka načte znovu tak jako tak. */
export const CEKANI_NA_PREVZETI_MS = 5_000;
/** Po kolika marných pokusech o šetrnou aktualizaci za sebou sáhne tlačítko po vynucené (ať nejde uvíznout). */
export const POKUSU_PRED_VYNUCENIM = 2;

/**
 * Co se po klepnutí na Aktualizovat stalo: stránka se načítá znovu — nebo to teď nejde, protože server
 * neodpovídá (`bez-spojeni`), nebo protože se nová verze do telefonu teprve stahuje (`stahuje-se`).
 */
export type VysledekObnovy = 'obnovuji' | 'bez-spojeni' | 'stahuje-se';

/** Co říct člověku, když aktualizace teď nejde. Jedna věta pro lištu, dlaždici i Nastavení. */
export const TEXT_OBNOVA_BEZ_SPOJENI =
  'Teď aktualizovat nejde — server neodpovídá (bez signálu nebo slabý signál). Aplikace běží dál, zkus to znovu, až bude signál.';
export const TEXT_OBNOVA_STAHUJE_SE =
  'Nová verze se do telefonu ještě stahuje (na slabém signálu to chvíli trvá). Aplikace běží dál, zkus to za chvíli znovu.';

/** Věta k výsledku aktualizace — nebo `null`, když se stránka právě načítá znovu a není co říkat. */
export function textVysledkuObnovy(vysledek: VysledekObnovy): string | null {
  if (vysledek === 'bez-spojeni') return TEXT_OBNOVA_BEZ_SPOJENI;
  if (vysledek === 'stahuje-se') return TEXT_OBNOVA_STAHUJE_SE;
  return null;
}

function pockej(ms: number): Promise<void> {
  return new Promise((hotovo) => setTimeout(hotovo, ms));
}

/**
 * Odpovídá server PRÁVĚ TEĎ?
 *
 * Ptá se na `version.json` s jedinečnou adresou. Service worker takovou adresu v paměti nemá, takže bez
 * spojení vrátí 503 — „ano" tedy znamená opravdu odpověď ze serveru, ne uloženou kopii.
 */
export async function serverOdpovida(limitMs: number = OVERENI_SPOJENI_MS): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const zrus = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let casovac: ReturnType<typeof setTimeout> | null = null;
  const limit = new Promise<boolean>((hotovo) => {
    casovac = setTimeout(() => {
      try { zrus?.abort(); } catch { /* starý prohlížeč */ }
      hotovo(false);
    }, limitMs);
  });
  const dotaz = (async () => {
    try {
      const resp = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        ...(zrus ? { signal: zrus.signal } : {}),
      });
      if (!resp.ok) return false;
      const info = await resp.json();
      return typeof info?.version === 'string' && info.version.length > 0;
    } catch {
      return false;
    }
  })();
  try {
    return await Promise.race([dotaz, limit]);
  } finally {
    if (casovac) clearTimeout(casovac);
  }
}

/** Nové načtení stránky. Zvlášť kvůli testům: `location.reload` se v testovacím prohlížeči nedá sledovat. */
export const obnova = {
  nactiZnovu: (): void => { window.location.reload(); },
};

let obnovaBezi: Promise<VysledekObnovy> | null = null;

/**
 * Vynucená aktualizace — NOUZOVÁ cesta: zruší registraci této aplikace, vymaže její cache
 * a znovu načte stránku ze sítě. Běžné „Aktualizovat" dělá `aktualizuj()` níž a nic nemaže.
 *
 * 🛑 NEJDŘÍV ověří, že server odpovídá. Tahle funkce maže kopii aplikace uloženou v telefonu — to jediné,
 * z čeho appka bez signálu naběhne. Dřív ji mazala vždycky: kdo ve sklepě bez signálu klepl na žlutou lištu
 * „Aktualizovat" (nejde zavřít), přišel o aplikaci, dokud se signál nevrátil — ani z ikony nenaběhla.
 * Stejnou cestou si ji appka mazala i sama, při „automatické opravě" po chybě sítě (main.tsx). Změřeno
 * v prohlížeči 28. 11. 2026 (docs/offline.md). Když server neodpovídá, nesmaže se nic a appka běží dál ve
 * stávající verzi.
 *
 * Zrušení registrace vyřídí prohlížeč až po právě běžící instalaci nové verze. Když se to nestihne do
 * `CEKANI_NA_ODREGISTRACI_MS`, taky se nic nemaže (`stahuje-se`): smazat cache pod rukama rozdělané instalaci
 * by nechalo v telefonu service worker s prázdnou pamětí.
 *
 * Vrací, co se stalo — kdo ji volá na klepnutí, řekne člověku `textVysledkuObnovy`. Opakované klepnutí
 * během běžící aktualizace nic dalšího nespustí.
 */
export function forceRefresh(): Promise<VysledekObnovy> {
  if (obnovaBezi) return obnovaBezi;
  const beh = (async (): Promise<VysledekObnovy> => {
    if (!(await serverOdpovida())) return 'bez-spojeni';
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          const zruseno = await Promise.race([
            registration.unregister().then(() => true, () => true),
            pockej(CEKANI_NA_ODREGISTRACI_MS).then(() => false),
          ]);
          if (!zruseno) return 'stahuje-se';
        }
      }
      // Aktualizace je vždy explicitní akce uživatele. Automatická kontrola pouze
      // zobrazí upozornění a nikdy sama nereloaduje rozpracovanou obrazovku.
      // Místo (obrazovka + záložka) se schová do sessionStorage. localStorage
      // s rozepsanými zápisy se nemaže — po návratu je formulář znovu vyplněný.
      ulozMistoPredObnovou();
      await clearAppCaches();
    } catch {
      // Úklid se nepovedl (soukromý režim, plný telefon) — nové načtení ze sítě má smysl i tak.
    }
    obnova.nactiZnovu();
    return 'obnovuji';
  })();
  obnovaBezi = beh;
  // Když to teď nešlo, jde to zkusit znovu; po spuštěném načítání už ne (stránka se právě zahazuje).
  void beh.then((v) => { if (v !== 'obnovuji') obnovaBezi = null; }, () => { obnovaBezi = null; });
  return beh;
}

/** Počká, až rozdělaná instalace nové verze skončí. Vrací čekající service worker, nebo `null` (nestihla to, selhala). */
function pockejNaInstalaci(reg: ServiceWorkerRegistration, limitMs: number): Promise<ServiceWorker | null> {
  return new Promise((hotovo) => {
    const sw = reg.installing;
    if (!sw) { hotovo(reg.waiting ?? null); return; }
    let casovac: ReturnType<typeof setTimeout> | null = null;
    const konec = (vysledek: ServiceWorker | null) => {
      if (casovac) clearTimeout(casovac);
      sw.removeEventListener('statechange', naZmenu);
      hotovo(vysledek);
    };
    function naZmenu() {
      if (sw!.state === 'installed') konec(reg.waiting ?? sw);
      else if (sw!.state !== 'installing') konec(null);         // selhala (redundant), nebo se rovnou zapnula
    }
    sw.addEventListener('statechange', naZmenu);
    casovac = setTimeout(() => konec(null), limitMs);
    naZmenu();                                                  // stav se mohl změnit dřív, než jsme začali poslouchat
  });
}

/** Počká, až stránku převezme nový service worker (nejdéle `limitMs`). */
function pockejNaPrevzeti(limitMs: number): Promise<void> {
  return new Promise((hotovo) => {
    let casovac: ReturnType<typeof setTimeout> | null = null;
    const konec = () => {
      if (casovac) clearTimeout(casovac);
      try { navigator.serviceWorker.removeEventListener('controllerchange', konec); } catch { /* nic */ }
      hotovo();
    };
    try { navigator.serviceWorker.addEventListener('controllerchange', konec); } catch { /* starý prohlížeč — rozhodne limit */ }
    casovac = setTimeout(konec, limitMs);
  });
}

let aktualizaceBezi: Promise<VysledekObnovy> | null = null;
let marnePokusy = 0;

/**
 * Tlačítko „Aktualizovat": přepne na novou verzi, která už je v telefonu stažená CELÁ. Nic nemaže.
 *
 * Service worker nové verze se instaluje na pozadí (stáhne jádro i všechny obrazovky) a pak čeká. Tady se mu
 * jen řekne, ať převezme stránku (`SKIP_WAITING`), a stránka se načte znovu — už z jeho paměti. Jde to tedy
 * i bez signálu a po přepnutí appka hned umí všechno, co uměla (není žádné okno, kdy by bez signálu nenaběhla).
 *
 * - Nová verze se ještě stahuje → chvíli počká (`CEKANI_NA_INSTALACI_MS`), pak vrátí `stahuje-se`.
 * - Service worker není (starý prohlížeč) → nouzová `forceRefresh` (se spojením).
 * - Když šetrná cesta dvakrát po sobě nic nepřipraví, třetí klepnutí sáhne po `forceRefresh`, ať se nedá
 *   uvíznout na staré verzi (chyba v service workeru, plná paměť telefonu).
 *
 * `priStahovani` se zavolá, když se čeká na dostahování — obrazovka podle toho změní popisek tlačítka.
 */
export function aktualizuj(priStahovani?: () => void): Promise<VysledekObnovy> {
  if (aktualizaceBezi) return aktualizaceBezi;
  const beh = (async (): Promise<VysledekObnovy> => {
    let reg: ServiceWorkerRegistration | undefined;
    try {
      reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    } catch {
      reg = undefined;
    }
    if (!reg || marnePokusy >= POKUSU_PRED_VYNUCENIM) {
      marnePokusy = 0;
      return forceRefresh();
    }
    // Kontrola verze mohla novou verzi vidět dřív, než ji prohlížeč začal instalovat → říct si o ni.
    if (!reg.waiting && !reg.installing) {
      await Promise.race([reg.update().then(() => undefined, () => undefined), pockej(OVERENI_SPOJENI_MS)]);
    }
    let ceka: ServiceWorker | null = reg.waiting ?? null;
    if (!ceka && reg.installing) {
      priStahovani?.();
      ceka = await pockejNaInstalaci(reg, CEKANI_NA_INSTALACI_MS);
    }
    if (!ceka) {
      marnePokusy++;
      return 'stahuje-se';
    }
    marnePokusy = 0;
    ulozMistoPredObnovou();
    const prevzato = pockejNaPrevzeti(CEKANI_NA_PREVZETI_MS);
    try { ceka.postMessage({ type: 'SKIP_WAITING' }); } catch { /* načte se znovu i tak */ }
    await prevzato;
    obnova.nactiZnovu();
    return 'obnovuji';
  })();
  aktualizaceBezi = beh;
  void beh.then((v) => { if (v !== 'obnovuji') aktualizaceBezi = null; }, () => { aktualizaceBezi = null; });
  return beh;
}
