import { smaz, uloz } from './uloziste';
// Offline queue + sync for the PWA.
// Stores pending mutations in localStorage and replays them when online.
// Each entry is a Supabase operation: { table, op: 'insert'|'update'|'delete', match?: Record<string,any>, row?: Record<string,any> }.

const KEY = 'pivovar_offline_queue_v1';
// Důvody neúspěchu se drží vedle fronty, ne jen v paměti: aplikace se
// v telefonu restartuje běžně (upozornění na novou verzi, přepnutí aplikací)
// a po restartu by u uvízlého zápisu nebylo vidět PROČ uvízl ani tlačítko
// „Zahodit" — vypadal by jako každý jiný čekající zápis.
const KEY_CHYBY = 'pivovar_offline_chyby_v1';
const EVT = 'pivovar:sync';

export type QueuedOp = {
  id: string;
  table: string;
  op: 'insert' | 'update' | 'delete' | 'upsert';
  match?: Record<string, any>;     // for update/delete: .eq columns
  inMatch?: Record<string, any[]>; // for update/delete: .in columns
  row?: Record<string, any>;       // for insert/update/upsert: payload
  onConflict?: string;             // for upsert: on_conflict column(s)
  ts: number;
};

// Zápisy, které do fronty nepatří (supabase.ts MIMO_FRONTU je už ani
// nezařadí) — tady se vyhodí i ty, co tam zůstaly z dřívějška: konec
// odpočtu pro push (odpocty_push) je po chvíli k ničemu (29. 9. 2026).
const ZAHODIT_Z_FRONTY = new Set(['odpocty_push']);

/**
 * Hromadné „zavezeno" z Rozvozu (29. 9. 2026) se mohlo zařadit jen s
 * podmínkou is_delivered = false (bez „závoz před dneškem") — po odeslání by
 * označilo jako zavezené i budoucí objednávky. Takový zápis se zahodí; noční
 * úloha v databázi ho udělá správně.
 */
function jeNebezpecneOznaceniZavozu(op: QueuedOp): boolean {
  if (op.table !== 'orders' || op.op !== 'update') return false;
  const m = op.match ?? {};
  return Object.keys(m).length === 1 && 'is_delivered' in m && !op.inMatch;
}

/**
 * Zápisy s `.in()`, které se do fronty dostaly s hodnotami „(a" … „b)".
 * Do 14. 10. 2026 se filtr `in.(a,b)` z adresy rozdělil jen podle čárek a
 * závorky zůstaly v první a poslední hodnotě (viz hodnotyZIn v supabase.ts).
 * Takový zápis po návratu signálu nikdy neodešel s pravými id a visel mezi
 * čekajícími — tady se z hodnot závorky sundají. Seznam je „obalený závorkami",
 * jen když první hodnota začíná „(" a poslední končí „)".
 */
export function opravInMatch(inMatch: Record<string, any[]> | undefined): Record<string, any[]> | undefined {
  if (!inMatch) return inMatch;
  const out: Record<string, any[]> = {};
  for (const [k, vals] of Object.entries(inMatch)) {
    const obaleno = vals.length > 0 && String(vals[0]).startsWith('(') && String(vals[vals.length - 1]).endsWith(')');
    out[k] = obaleno
      ? vals.map((v, i) => {
          let t = String(v);
          if (i === 0) t = t.slice(1);
          if (i === vals.length - 1) t = t.slice(0, -1);
          return t;
        })
      : vals;
  }
  return out;
}

function read(): QueuedOp[] {
  try {
    const q: QueuedOp[] = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return q
      .filter((op) => !ZAHODIT_Z_FRONTY.has(op.table) && !jeNebezpecneOznaceniZavozu(op))
      .map((op) => (op.inMatch ? { ...op, inMatch: opravInMatch(op.inMatch) } : op));
  } catch { return []; }
}
function write(q: QueuedOp[]) {
  try {
    uloz(KEY, JSON.stringify(q));
  } catch (e: any) {
    // Telefon má plnou paměť pro aplikaci. Bez téhle hlášky by se zobrazila
    // holá „QuotaExceededError", ze které nikdo nepozná, co s tím dělat.
    if (e?.name === 'QuotaExceededError' || e?.code === 22) {
      throw new Error(
        'V telefonu došlo místo pro rozepsané zápisy. Připojte se k internetu ' +
        'a odešlete čekající zápisy (klepněte na kolečko stavu nahoře), pak to zkuste znovu.',
      );
    }
    throw e;
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: q.length }));
}

export function getQueue(): QueuedOp[] { return read(); }

export function queueLength() { return read().length; }

/**
 * Kdy naposledy šel zápis do fronty místo do databáze.
 *
 * Offline zápis se tváří jako povedený (viz synthesizeWrite v supabase.ts) —
 * a obrazovka pak ukáže zelené „Uloženo" úplně stejné jako při odeslání.
 * Ve sklepě s kolísavým signálem se kvůli tomu zapisovalo stáčení s tím, že
 * je hotovo. Podle téhle značky umí oznámení doříct, že zápis zatím leží
 * v telefonu (viz `zapisSelDoFronty`).
 */
let poslednizapisDoFronty = 0;

/**
 * `ts` = kdy člověk zápis dělal (zahájení požadavku), ne kdy po desetivteřinovém
 * čekání spadl do fronty. Podle toho se ve staré mezipaměti skládá pořadí zápisů
 * (viz aplikujOperace) a prošlý zápis z doby mezi tím by jinak vyšel dřív.
 */
export function enqueue(op: Omit<QueuedOp, 'id' | 'ts'>, ts: number = Date.now()) {
  const q = read();
  q.push({ ...op, id: crypto.randomUUID(), ts });
  write(q);
  poslednizapisDoFronty = Date.now();
}

// ── Nedávné prošlé zápisy ──────────────────────────────────────────────────
// 14. 10. 2026: „nejde mi označovat, že mám připravený lahve" — telefon na
// slabém signálu (E, pár KB/s). Odškrtnutí na server DOŠLO, jenže po každé
// změně se obrazovka přenačítá a přenačtení se na desetivteřinových dotazech
// odpovědi nedočkalo a spadlo na starou mezipaměť. Ta znala jen zápisy
// ČEKAJÍCÍ ve frontě; o odškrtnutí, které prošlo rovnou, nevěděla — a to se
// po chvíli vrátilo zpátky. V databázi přitom bylo odškrtnuto, na telefonu ne.
//
// Proto se na chvíli pamatuje i zápis, který prošel, a ve staré mezipaměti se
// přimíchá stejně jako fronta. Čerstvá data ze serveru se tím nikdy nemění.
const KEY_NEDAVNE = 'pivovar_nedavne_zapisy_v1';
/** Jak dlouho se prošlý zápis pamatuje (jedna směna). */
export const NEDAVNE_MAX_STARI_MS = 12 * 60 * 60 * 1000;
const NEDAVNE_MAX_POCET = 300;

function readNedavne(): QueuedOp[] {
  try {
    const q = JSON.parse(localStorage.getItem(KEY_NEDAVNE) ?? '[]');
    return Array.isArray(q) ? q : [];
  } catch { return []; }
}

/** Zapamatuje prošlý zápis (úprava nebo smazání) pro starou mezipaměť. Nikdy nic neshodí. */
export function zapamatujProsly(op: Omit<QueuedOp, 'id' | 'ts'>, ts: number = Date.now(), ted: number = Date.now()) {
  try {
    const dosud = readNedavne().filter((o) => ted - o.ts < NEDAVNE_MAX_STARI_MS);
    dosud.push({ ...op, id: crypto.randomUUID(), ts });
    uloz(KEY_NEDAVNE, JSON.stringify(dosud.slice(-NEDAVNE_MAX_POCET)));
  } catch { /* pojistka pro starou mezipaměť — zápis kvůli ní nikdy nespadne */ }
}

/** Prošlé zápisy do tabulky za posledních NEDAVNE_MAX_STARI_MS. */
export function nedavneProslyZapisy(table: string, ted: number = Date.now()): QueuedOp[] {
  return readNedavne().filter((o) => o.table === table && ted - o.ts < NEDAVNE_MAX_STARI_MS);
}

/** Jen pro testy. */
export function zapomenProslyZapisy() {
  smaz(KEY_NEDAVNE);
}

/**
 * Čekající ÚPRAVY tabulky, které se mají promítnout i do ČERSTVÝCH dat ze serveru.
 *
 * Zápis, který na slabém signálu vypršel (10 s) a skončil ve frontě, server ještě
 * nezná. První přenačtení, které potom projde, by ho z obrazovky smazalo — odškrtnutí
 * by zmizelo, i když v telefonu čeká na odeslání („Čeká 1 změn"). Do čerstvých dat
 * se proto přimíchají úpravy (ne vkládání a mazání — to by měnilo počty řádků).
 *
 * Nepromítají se úpravy, které při posledním odesílání selhaly (uvízly; v databázi
 * nikdy nebudou, takže by je obrazovka ukazovala neprávem), a úpravy starší než
 * NEDAVNE_MAX_STARI_MS.
 */
export function cekajiciUpravy(table: string, ted: number = Date.now()): QueuedOp[] {
  const fronta = read();
  if (fronta.length === 0) return [];
  const selhalo = new Set(getLastSyncFailures().map((f) => f.id));
  return fronta.filter((o) => o.table === table && o.op === 'update' && !selhalo.has(o.id) && ted - o.ts < NEDAVNE_MAX_STARI_MS);
}

function rowMatches(row: any, match?: Record<string, any>): boolean {
  if (!match) return true;
  return Object.entries(match).every(([k, v]) => row?.[k] === v || String(row?.[k]) === String(v));
}

/** Řádek vyhovuje filtru `.in()` — v každém sloupci je jedna z hodnot. */
function vInMatch(row: any, inMatch?: Record<string, any[]>): boolean {
  if (!inMatch) return true;
  return Object.entries(inMatch).every(([k, vals]) => vals.some((v) => String(row?.[k]) === String(v)));
}

/**
 * Přimíchá zápisy (fronta, nedávné prošlé) do řádků ze STARÉ mezipaměti, ať
 * obrazovka po výpadku nebo pomalé síti ukazuje i to, co člověk právě udělal.
 * Zápisy se skládají v pořadí, v jakém se dělaly (`ts`).
 *
 * Úprava s filtrem zasáhne jen řádky, které filtru vyhovují — i u `.in()`.
 * Dřív se `.in()` nebralo v úvahu a hromadná úprava ve frontě se ve staré
 * mezipaměti přimíchala do VŠECH řádků tabulky.
 */
export function aplikujOperace(rows: any[], ops: QueuedOp[]): any[] {
  if (ops.length === 0) return rows;
  let result = rows.slice();
  for (const op of [...ops].sort((a, b) => a.ts - b.ts)) {
    if (op.op === 'insert') {
      const r = op.row;
      if (!r) continue;
      const idx = result.findIndex((x) => x?.id && r.id && x.id === r.id);
      if (idx >= 0) result[idx] = { ...result[idx], ...r };
      else result.push({ ...r });
    } else if (op.op === 'update' || op.op === 'upsert') {
      const r = op.row;
      if (!r) continue;
      const maFiltr = !!op.match || !!op.inMatch;
      let found = false;
      result = result.map((x) => {
        if (r.id && x?.id && x.id === r.id) { found = true; return { ...x, ...r }; }
        if (!r.id && maFiltr && rowMatches(x, op.match) && vInMatch(x, op.inMatch)) { found = true; return { ...x, ...r }; }
        return x;
      });
      if (!found && r.id && !op.match && !op.inMatch) result.push({ ...r });
    } else if (op.op === 'delete') {
      if (!op.match && !op.inMatch) continue;
      result = result.filter((x) => !(rowMatches(x, op.match) && vInMatch(x, op.inMatch)));
    }
  }
  return result;
}

/**
 * Šel poslední zápis do fronty (a je to tak čerstvé, že se to týká právě
 * zobrazovaného oznámení)?
 *
 * `ted` je kvůli testům — v provozu se dosadí aktuální čas.
 */
export function zapisSelDoFronty(oknoMs = 4000, ted = Date.now()): boolean {
  return poslednizapisDoFronty > 0 && ted - poslednizapisDoFronty <= oknoMs;
}

/** Jen pro testy — vrátí značku do výchozího stavu. */
export function zapomenZapisDoFronty() {
  poslednizapisDoFronty = 0;
}

export function clearQueue() {
  write([]);
  zapisChyby([]);
}

export function removeOp(id: string) {
  write(read().filter((o) => o.id !== id));
  zapisChyby(getLastSyncFailures());
}

export type SyncFailure = { id: string; table: string; op: QueuedOp['op']; error: string };

// Chybové zprávy z posledního syncQueue() běhu — ať UI ukáže PROČ konkrétní
// zápis uvízl ve frontě (ne jen "selhalo N"), a uživatel se může rozhodnout
// položku zahodit (removeOp), pokud jde o trvalou chybu (např. duplicitní klíč).
export function getLastSyncFailures(): SyncFailure[] {
  try { return JSON.parse(localStorage.getItem(KEY_CHYBY) ?? '[]'); } catch { return []; }
}

function zapisChyby(chyby: SyncFailure[]) {
  try {
    // Chyby k zápisům, které už ve frontě nejsou, se nedrží — jinak by se
    // v seznamu hromadily řádky bez protějšku.
    const ve_fronte = new Set(read().map((o) => o.id));
    uloz(KEY_CHYBY, JSON.stringify(chyby.filter((c) => ve_fronte.has(c.id))));
  } catch { /* na chybách o chybách nestojí nic zásadního */ }
}

/** Popis zápisu lidsky — v seznamu čekajících nikomu nepomůže „orders · insert". */
const NAZVY_TABULEK: Record<string, string> = {
  orders: 'Objednávka',
  order_items: 'Položka objednávky',
  kegging: 'Stáčení KEG',
  bottling: 'Stáčení lahví',
  fasovani: 'Fasování',
  fasovani_private: 'Fasování personál',
  writeoffs: 'Odpis',
  inventory: 'Inventura',
  inventory_adjustments: 'Dorovnání inventury',
  keg_prefuk: 'Přefuk KEG',
  akce: 'Akce',
  akce_items: 'Položka akce',
  zavoz_deductions: 'Odečet závozu',
  zavoz_ukoly_hotovo: 'Úkol k závozu',
  kegging_plan_checks: 'Odškrtnutí v plánu stáčení',
  cellar_tanks: 'Tank ve sklepě',
  keg_returns: 'Vrácení sudů',
  odpocty_push: 'Odpočet (upozornění na telefon)',
};

const NAZVY_OPERACI: Record<QueuedOp['op'], string> = {
  insert: 'nový zápis',
  upsert: 'uložení',
  update: 'úprava',
  delete: 'smazání',
};

export function popisOperace(op: QueuedOp): string {
  const tabulka = NAZVY_TABULEK[op.table] ?? op.table;
  const zaklad = `${tabulka} — ${NAZVY_OPERACI[op.op] ?? op.op}`;

  // Pár polí, podle kterých se dá poznat, o který zápis jde. Víc než tohle
  // se do řádku stejně nevejde.
  const r = op.row ?? {};
  const detaily = [
    r.place_name,
    r.beer_name,
    r.package_label,
    r.quantity != null ? `${r.quantity} ks` : null,
    r.entry_date ?? r.order_date ?? r.delivery_date,
  ].filter(Boolean);

  return detaily.length ? `${zaklad}: ${detaily.join(' · ')}` : zaklad;
}

export async function syncQueue(): Promise<{ ok: number; failed: number; remaining: number }> {
  // Dynamicky SCHVÁLNĚ: `supabase.ts` si tenhle modul importuje staticky
  // (odesílání jde přes jeho `fetch`), takže statický import zpátky by byl
  // kruh. Build kvůli tomu hlásí „dynamic import will not move module into
  // another chunk" — to je v pořádku, nic se tu rozdělit nemá; jde jen
  // o rozbití kruhu. Nepřepisovat na statický import.
  const { supabase } = await import('./supabase');
  const q = read();
  let ok = 0, failed = 0;
  const failures: SyncFailure[] = [];
  for (const op of q) {
    // Zbytky z doby, kdy se do fronty řadila i RPC volání (do 5. 10. 2026):
    // bez jména funkce se odeslat nedají, takže se zahodí.
    if (op.table === 'rpc') { removeOp(op.id); continue; }
    let res: { error: any } | null = null;
    try {
      if (op.op === 'insert') res = await supabase.from(op.table).insert(op.row ?? {});
      else if (op.op === 'upsert') res = await supabase.from(op.table).upsert(op.row ?? {}, op.onConflict ? { onConflict: op.onConflict } : {});
      else if (op.op === 'update') {
        let b = supabase.from(op.table).update(op.row ?? {});
        for (const [k, v] of Object.entries(op.match ?? {})) b = b.eq(k, v);
        for (const [k, v] of Object.entries(op.inMatch ?? {})) b = b.in(k, v);
        res = await b;
      } else if (op.op === 'delete') {
        let b = supabase.from(op.table).delete();
        for (const [k, v] of Object.entries(op.match ?? {})) b = b.eq(k, v);
        for (const [k, v] of Object.entries(op.inMatch ?? {})) b = b.in(k, v);
        res = await b;
      }
      if (res?.error) {
        failed++;
        failures.push({ id: op.id, table: op.table, op: op.op, error: res.error.message ?? String(res.error) });
      } else {
        ok++;
        // Odstranit HNED po úspěchu, ne až po celé dávce — jinak by reload
        // uprostřed synchronizace (např. po ťuknutí na "aktualizovat" z
        // upozornění na novou verzi) nechal už uloženou položku ve frontě a
        // příští sync by ji poslal ZNOVU (duplicitní objednávka v DB, i když
        // se uživatel nedotkl ničeho navíc — appka ji poslala sama podruhé).
        removeOp(op.id);
      }
    } catch (e: any) {
      failed++;
      failures.push({ id: op.id, table: op.table, op: op.op, error: e?.message ?? String(e) });
    }
  }
  zapisChyby(failures);
  const remaining = read();
  return { ok, failed, remaining: remaining.length };
}

export function onQueueChange(cb: (n: number) => void) {
  const h = (e: Event) => cb((e as CustomEvent).detail ?? queueLength());
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

// Online/offline detection
export function isOnline() { return navigator.onLine; }
export function onConnectivityChange(cb: (online: boolean) => void) {
  const on = () => cb(true);
  const off = () => cb(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}
