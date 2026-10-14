/**
 * 🧠 Data skladu sdílená mezi obrazovkami.
 * ---------------------------------------------------------------------------
 * Z provozu 25. 9. 2026: „dlouho se načítají jednotlivé stránky". Objednávky,
 * Přehled, Inventura, Stáčení KEG, Lahve, Rozvoz a Sklad si každá sama
 * stahovala stejných ~12 tabulek s CELOU historií pohybů — přepnutí
 * Objednávky → Stáčení → Rozvoz stáhlo totéž třikrát. A každá obrazovka to
 * po otevření stáhla ještě jednou, jakmile se připojil živý kanál.
 *
 * Tady se ty tabulky načtou jednou a obrazovky si je půjčují z paměti.
 * Zastaralá data se nikdy neukážou, protože paměť se zahodí:
 *  • při každém vlastním zápisu do tabulky (supabase.ts, obal kolem fetch),
 *  • při změně z jiného zařízení (vlastní realtime kanál níž + kanály
 *    obrazovek v useRealtime),
 *  • po návratu do appky a po obnovení připojení,
 *  • a nejpozději po minutě, kdyby živý kanál tiše umřel.
 *
 * Stabilita: dřív měla každá kopie načítání vlastní výčet sloupců a dvakrát
 * se stalo, že kopie chtěla sloupec, který v tabulce není (kegs_used
 * u kegging, deducted_date) — celý dotaz pak tiše vracel nic. Výčet je teď
 * na jednom místě (SLOUPCE).
 */
import { fetchAllRows, supabase } from './supabase';
import { NADRAZENE, verzeTabulky, zneplatniVse } from './zneplatneni';
import { tydenniJakoInventura } from './tydenniInventura';
import { businessDateISO } from './businessDate';
import { TYDENNI_INVENTURA_DO_SKLADU } from './skryteModuly';

// Výčet sloupců je ve vlastním souboru bez vedlejších účinků (skript
// rozbor-skladu ho potřebuje bez klienta Supabase z VITE_* proměnných).
import { SLOUPCE, type SdilenaTabulka } from './sdilenaDataSloupce';
export { SLOUPCE, type SdilenaTabulka };

/** Jak dlouho smí data ležet v paměti, i když o žádné změně nevíme. */
export const MAX_STARI_MS = 60_000;

type Vysledek<T> = { data: T[] | null; error: { message: string } | null };
type Zaznam = { data: unknown[]; kdy: number; verze: string };

const pamet = new Map<SdilenaTabulka, Zaznam>();
const probiha = new Map<SdilenaTabulka, { verze: string; slib: Promise<Vysledek<unknown>> }>();

/**
 * Každá obrazovka dostane vlastní kopii — kdyby si jedna řádky seřadila nebo
 * přepsala, nesmí to prosáknout do ostatních.
 */
function kopie<T>(data: T[]): T[] {
  return typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data));
}

let hlidaniSpusteno = false;
function spustHlidani() {
  if (hlidaniSpusteno || typeof window === 'undefined') return;
  hlidaniSpusteno = true;

  // Po návratu do appky / obnovení sítě mohlo cokoli utéct.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') zneplatniVse();
  });
  window.addEventListener('online', zneplatniVse);

  // Vlastní kanál, aby paměť zneplatnila i změna tabulky, kterou zrovna
  // žádná otevřená obrazovka nesleduje.
  try {
    const kanal = supabase.channel('sdilena-data');
    (Object.keys(SLOUPCE) as SdilenaTabulka[]).forEach((t) => {
      kanal.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, () => {
        pamet.delete(t);
      });
    });
    Object.entries(NADRAZENE).forEach(([vnorena, nadrazene]) => {
      kanal.on('postgres_changes' as any, { event: '*', schema: 'public', table: vnorena }, () => {
        nadrazene.forEach((t) => pamet.delete(t as SdilenaTabulka));
      });
    });
    let prvniPripojeni = true;
    kanal.subscribe((status: string) => {
      // Výpadek nebo opětovné připojení — co se změnilo mezitím, kanál
      // nedožene. (První připojení ne: paměť je v tu chvíli čerstvě načtená.)
      if (status === 'SUBSCRIBED') {
        if (!prvniPripojeni) pamet.clear();
        prvniPripojeni = false;
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        pamet.clear();
      }
    });
  } catch { /* bez kanálu drží čerstvost aspoň MAX_STARI_MS */ }
}

/**
 * Celá tabulka (všechny řádky, jednotný výčet sloupců) — z paměti, pokud je
 * čerstvá, jinak ze serveru. Souběžné žádosti o tutéž tabulku se spojí do
 * jednoho dotazu.
 */
export async function nactiSdilenouTabulku<T = any>(tabulka: SdilenaTabulka): Promise<Vysledek<T>> {
  spustHlidani();
  const verze = verzeTabulky(tabulka);

  const z = pamet.get(tabulka);
  if (z && z.verze === verze && Date.now() - z.kdy < MAX_STARI_MS) {
    return { data: kopie(z.data as T[]), error: null };
  }

  let bezici = probiha.get(tabulka);
  if (!bezici || bezici.verze !== verze) {
    const slib = Promise.resolve(fetchAllRows<unknown>(tabulka, SLOUPCE[tabulka]))
      .then((r) => (tabulka === 'inventory' && !r.error && TYDENNI_INVENTURA_DO_SKLADU ? sTydenniInventurou(r) : r))
      .then((r) => (tabulka === 'zavoz_deductions' && !r.error ? bezBudoucichOdpoctu(r) : r))
      .then((r) => {
      // Mezitím přišel zápis → tahle data už nemusí platit, do paměti ne.
      if (!r.error && verzeTabulky(tabulka) === verze) {
        pamet.set(tabulka, { data: r.data ?? [], kdy: Date.now(), verze });
      }
      if (probiha.get(tabulka)?.slib === slib) probiha.delete(tabulka);
      return r as Vysledek<unknown>;
    });
    bezici = { verze, slib };
    probiha.set(tabulka, bezici);
  }

  const r = await bezici.slib;
  return { data: r.data ? kopie(r.data as T[]) : r.data as null, error: r.error };
}

/**
 * Odpočet s datem v budoucnu ještě neproběhl.
 *
 * 13. 10. 2026: u objednávky Malešice (závoz 14. 10.) zůstaly odpočty s datem
 * zítřka (po změně dne závozu je databáze přesunula, ne smazala). Plán „Co
 * stočit" i Sklad podle nich poznali položku jako „už odečtenou" a 2× 30 l
 * Jantar nenabídly ke stočení, přestože na skladě byla nula. Skladová kniha
 * budoucí pohyby přeskakuje už dávno — tady se přeskočí i u příznaku
 * „odečteno". Z databáze se nic nemaže: v den závozu se odpočet projeví sám.
 */
function bezBudoucichOdpoctu(r: Vysledek<unknown>): Vysledek<unknown> {
  const dnes = businessDateISO();
  return { ...r, data: (r.data as { deduct_date?: string | null }[] | null)?.filter((x) => !x.deduct_date || String(x.deduct_date).slice(0, 10) <= dnes) ?? r.data };
}

/**
 * K inventuře se přidají uložené týdenní inventury jako stav v pondělí ráno
 * (tydenniJakoInventura) — Sklad pak v pondělí ukazuje napočítané a všechny
 * obrazovky počítají ze stejného. Když se týdenní inventura nenačte, zůstane
 * jen měsíční (a zapíše se varování) — Sklad se kvůli tomu nesmí rozbít.
 */
async function sTydenniInventurou(r: Vysledek<unknown>): Promise<Vysledek<unknown>> {
  try {
    const t = await fetchAllRows<any>('tydenni_inventura', 'tyden_od,tyden_do,beer_id,beer_name,package_id,package_label,napocitano,updated_at');
    if (t?.error || !Array.isArray(t?.data)) {
      if (t?.error) console.warn('[sdilenaData] týdenní inventura se nenačetla:', t.error.message);
      return r;
    }
    return { data: [...(r.data ?? []), ...tydenniJakoInventura(t.data)], error: null };
  } catch (e) {
    console.warn('[sdilenaData] týdenní inventura se nenačetla:', e);
    return r;
  }
}

/** Pro testy: zapomenout všechno. */
export function vycistiSdilenaData(): void {
  pamet.clear();
  probiha.clear();
}
