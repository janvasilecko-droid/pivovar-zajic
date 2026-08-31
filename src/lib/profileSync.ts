// 📒 Jeden bezpečný, sériový zápis do profiles.home_layout pro celou appku.
// ---------------------------------------------------------------------------
// home_layout je jeden sdílený JSON blob (rozložení dlaždic, odpočty,
// poznámky), ale ukládal si ho po svém KAŽDÝ modul zvlášť (saveHomeNotes,
// saveCountdowns, saveHomeLayout) — každý přečetl aktuální stav z cloudu,
// domíchal svoje pole a zapsal zpátky celý objekt. Když se dva takové zápisy
// překryly (typicky: přidání poznámky s "Umístit dlaždici na plochu" —
// to je ukládání poznámek I rozložení najednou), ten pomalejší zápis přečetl
// cloud PŘED tím, než ten druhý stihl uložit svoje čerstvá data, a pak je
// svým zápisem přepsal zpátky na starou verzi. U odpočtů to konkrétně
// "vzkřísilo" už dokončený a potvrzený časovač zpátky do stavu
// "doběhl, ještě neoznámeno" — a přes synchronizaci mezi zařízeními se
// zvukový alarm spustil znovu, i když už jednou proběhl.
//
// Řešení: víc změn (patchů) na sebe navazujících v krátké době se sloučí
// DO PAMĚTI (ne do dvou souběžných zápisů) a do cloudu jde jen JEDEN sériový
// zápis, který navíc čte cloud těsně před zápisem — ne minuty/sekundy
// předem. Další zápis čeká, až ten předchozí doopravdy doběhne.
import { supabase } from './supabase';

let pendingPatch: Record<string, unknown> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

const DEBOUNCE_MS = 250;

function flush() {
  flushTimer = null;
  const patch = pendingPatch;
  pendingPatch = {};
  if (Object.keys(patch).length === 0) return;

  // Sériově za předchozím zápisem — ne souběžně s ním.
  writeChain = writeChain.then(async () => {
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) return;
      const { data: prof } = await supabase.from('profiles').select('home_layout').eq('id', userId).maybeSingle();
      const cur = (prof?.home_layout as any) || {};
      await supabase.from('profiles').update({ home_layout: { ...cur, ...patch } }).eq('id', userId);
    } catch {
      // Tichý neúspěch — appka žije dál z localStorage, cloud dožene při
      // příštím úspěšném zápisu (další patch stejně přebije totéž pole).
    }
  });
}

/**
 * Zařadí částečnou změnu home_layout ke sloučení a odloženému zápisu.
 * Víc volání v rychlém sledu (např. addHomeNote + togglePin ve stejném
 * kliknutí) se slije do jednoho zápisu místo dvou souběžných.
 */
export function queueHomeLayoutPatch(patch: Record<string, unknown>): void {
  pendingPatch = { ...pendingPatch, ...patch };
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

// Pojistka: appka se dá na mobilu zavřít/přepnout kdykoli, i uprostřed těch
// 250ms debounce okna. Odložený zápis by se pak ztratil (do localStorage se
// uloží vždy hned, ale cloud by dohnal až při dalším spuštění některé z
// save* funkcí). Při schování stránky proto zápis vynutíme hned.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && flushTimer) {
      clearTimeout(flushTimer);
      flush();
    }
  });
}
