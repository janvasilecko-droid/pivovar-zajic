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
import { jeNahled } from './nahledUzivatele';
import { supabase } from './supabase';

let pendingPatch: Record<string, unknown> = {};
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let writeChain: Promise<void> = Promise.resolve();

const DEBOUNCE_MS = 250;

// ⏳ Jak dlouho po dokončení zápisu ještě pole bráníme před přepsáním z cloudu.
//
// ⚠️ PROČ TO TU JE (z provozu 19. 9. 2026: „poznámkový blok nefunguje,
// nepřidá se na plochu do té dlaždice"): appka poslouchá realtime změny
// `profiles` a při každé z nich přepisovala místní poznámky tím, co přišlo ze
// serveru (viz lib/auth.tsx). Jenže ty události chodí i jako OZVĚNA vlastních
// zápisů — a přidání poznámky se zapisuje odloženě (debounce), kdežto
// připnutí dlaždice na plochu hned. Ozvěna toho druhého zápisu tak dorazila
// ještě se STARÝM seznamem poznámek a čerstvou poznámku smazala zároveň
// z úložiště i z dlaždice. Vypadalo to přesně jako „neuložilo se to".
//
// Okno je široké schválně: ozvěna chodí do pár set milisekund, ale na telefonu
// v provozu (slabý signál) klidně za několik sekund.
const OCHRANA_PO_ZAPISU_MS = 10_000;

/** Pole home_layout → dokdy je místní kopie novější než cokoliv z cloudu. */
const cerstvaPole = new Map<string, number>();

/**
 * Změny, které se NEPODAŘILO odeslat (slabý signál, výpadek serveru) — čekají
 * na další pokus a do té doby je cloud nesmí přepsat.
 *
 * Bez toho by pravidelné stahování z cloudu (lib/obnovaZCloudu.ts) poznámku
 * napsanou za špatného signálu smazalo: ochranné okno po zápisu trvá deset
 * sekund, a jakmile signál naskočí, přišlo by ze serveru starší znění
 * a přepsalo to, co se na serveru nikdy neobjevilo. `supabase.update` při
 * síťové chybě nevyhodí výjimku, vrátí `{ error }` — dřív se na ni vůbec
 * nekoukalo a zápis se tiše považoval za hotový.
 */
let neodeslano: Record<string, unknown> = {};

function ochranej(pole: string[], dokdy: number) {
  for (const p of pole) cerstvaPole.set(p, Math.max(cerstvaPole.get(p) ?? 0, dokdy));
}

/**
 * Smí cloud přepsat tohle pole místní kopie?
 *
 * `false` znamená „máme rozepsanou nebo právě odeslanou změnu, kterou server
 * ještě neviděl" — přijatá hodnota by byla starší než to, co máme u sebe.
 */
export function cloudSmiPrepsat(pole: string): boolean {
  // Změna, kterou server nikdy nedostal, je novější než všechno, co má on.
  if (pole in neodeslano) return false;
  const dokdy = cerstvaPole.get(pole);
  if (dokdy === undefined) return true;
  if (Date.now() >= dokdy) { cerstvaPole.delete(pole); return true; }
  return false;
}

/**
 * Znovu zařadí k odeslání změny, které minule selhaly. Volá se z pravidelné
 * obnovy z cloudu těsně před stažením, ať se napřed odešlo, co se nepodařilo.
 */
export function zkusOdeslatZnovu(): void {
  if (Object.keys(neodeslano).length === 0) return;
  // Novější změna, která už čeká na odeslání, má přednost.
  queueHomeLayoutPatch({ ...neodeslano, ...pendingPatch });
}

function flush() {
  flushTimer = null;
  const patch = pendingPatch;
  pendingPatch = {};
  if (Object.keys(patch).length === 0) return;
  // Náhled „nový běžný uživatel“: nic se nesmí zapsat do správcova profilu.
  if (jeNahled()) return;

  // Sériově za předchozím zápisem — ne souběžně s ním.
  const pole = Object.keys(patch);
  writeChain = writeChain.then(async () => {
    let odeslano = false;
    try {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId) {
        // Nikdo přihlášený: není komu psát a není co opakovat.
        odeslano = true;
        return;
      }
      const { data: prof, error: chybaCteni } = await supabase.from('profiles').select('home_layout').eq('id', userId).maybeSingle();
      if (chybaCteni) throw chybaCteni;
      const cur = (prof?.home_layout as any) || {};
      const { error } = await supabase.from('profiles').update({ home_layout: { ...cur, ...patch } }).eq('id', userId);
      if (error) throw error;
      odeslano = true;
    } catch {
      // Appka žije dál z localStorage; co se neodeslalo, se zkusí znovu
      // (zkusOdeslatZnovu) a do té doby to cloud nepřepíše (cloudSmiPrepsat).
    } finally {
      for (const p of pole) {
        // Novější změna téhož pole už čeká v rozepsaném patchi — ta rozhodne.
        if (p in pendingPatch) continue;
        if (odeslano) delete neodeslano[p];
        else neodeslano[p] = patch[p];
      }
      // Až teď začíná běžet ochranné okno: ozvěna vlastního zápisu přijde až
      // po něm. Při neúspěchu je to o to důležitější — server naši změnu nemá
      // a jeho hodnota by tu místní rovnou přebila.
      ochranej(pole, Date.now() + OCHRANA_PO_ZAPISU_MS);
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
  // Od téhle chvíle je místní kopie novější než cloud — i během čekání na flush.
  ochranej(Object.keys(patch), Date.now() + DEBOUNCE_MS + OCHRANA_PO_ZAPISU_MS);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, DEBOUNCE_MS);
}

/** Jen pro testy — zapomene, co je rozepsané. */
export function zapomenOchranu(): void {
  cerstvaPole.clear();
  neodeslano = {};
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
