// 📴 Obrazovky aplikace uložené v telefonu — aby šly otevřít i bez signálu.
// ---------------------------------------------------------------------------
// Aplikace je rozdělená na ~130 kusů (každá obrazovka svůj). Service worker (public/sw.js, KUSY) je ukládá
// do telefonu při instalaci verze; tady si stránka po spuštění a po návratu signálu řekne, ať doplní, co
// případně chybí (instalace na slabém signálu nemusela doběhnout), a zapamatuje si stav pro Nastavení.
//
// Majitel 27. 11. 2026: „napíše to, že to je offline, a neukážou se mi žádný data" — Sklad se bez signálu
// vůbec nenačetl, protože jeho kus v telefonu chyběl.
import { nactiJson, ulozJson } from './uloziste';
import { UDALOST_SPOJENI_ZPET } from './jisticSpojeni';

export const KLIC_STAVU_OBRAZOVEK = 'pivovar_offline_obrazovky_v1';
export const UDALOST_OBRAZOVEK = 'pivovar:offline-obrazovky';

export type StavObrazovek = { ulozeno: number; celkem: number; t: number };

export function stavObrazovek(): StavObrazovek | null {
  const s = nactiJson<Partial<StavObrazovek> | null>(KLIC_STAVU_OBRAZOVEK, null);
  return s && typeof s.ulozeno === 'number' && typeof s.celkem === 'number' && typeof s.t === 'number'
    ? { ulozeno: s.ulozeno, celkem: s.celkem, t: s.t }
    : null;
}

/** Požádá service worker, ať doplní chybějící obrazovky. Bez service workeru (starý prohlížeč, náhled) nic. */
export function doplnObrazovky(): void {
  try {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
    if (!sw) return;
    const zprava = { type: 'DOPLN_OFFLINE' };
    if (sw.controller) sw.controller.postMessage(zprava);
    else void sw.ready.then((reg) => { if (reg.active) reg.active.postMessage(zprava); }).catch(() => undefined);
  } catch { /* jen zrychlení — bez něj se obrazovky uloží při prvním otevření jako dřív */ }
}

/** Po spuštění a po návratu signálu nechá doplnit obrazovky a poslouchá, kolik jich v telefonu je. Vrací úklid. */
export function spustDoplnovaniObrazovek(odklad = 6000): () => void {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : undefined;
  if (!sw || typeof window === 'undefined') return () => {};
  const naZpravu = (e: MessageEvent) => {
    const d = e.data as { type?: unknown; ulozeno?: unknown; celkem?: unknown } | null;
    if (!d || d.type !== 'OFFLINE_STAV' || typeof d.ulozeno !== 'number' || typeof d.celkem !== 'number') return;
    ulozJson(KLIC_STAVU_OBRAZOVEK, { ulozeno: d.ulozeno, celkem: d.celkem, t: Date.now() });
    try { window.dispatchEvent(new Event(UDALOST_OBRAZOVEK)); } catch { /* stav si obrazovka přečte příště */ }
  };
  sw.addEventListener('message', naZpravu);
  const casovac = setTimeout(doplnObrazovky, odklad);
  window.addEventListener('online', doplnObrazovky);
  // Server zase odpovídá po výpadku, o kterém telefon sám nevěděl (slabý signál — lib/jisticSpojeni.ts).
  window.addEventListener(UDALOST_SPOJENI_ZPET, doplnObrazovky);
  return () => {
    clearTimeout(casovac);
    sw.removeEventListener('message', naZpravu);
    window.removeEventListener('online', doplnObrazovky);
    window.removeEventListener(UDALOST_SPOJENI_ZPET, doplnObrazovky);
  };
}
