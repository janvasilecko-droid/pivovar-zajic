import { createClient } from '@supabase/supabase-js';
import { useEffect, useRef } from 'react';
import { cacheGetResponse, getCachedResponse, getTableRows, upsertTableRows } from './offlineCache';
import { enqueue, getQueue } from './offline';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;


// ---------------------------------------------------------------------------
// Offline-aware fetch wrapper.
//
// Supabase-js v2 lets us inject a custom `fetch` (it is used for REST, auth and
// storage alike). We intercept ONLY the PostgREST API (/rest/v1/):
//
//   GET    → network-first; successful responses are cached in IndexedDB and
//            served back (exact URL, then whole-table fallback) when offline.
//   write  → network-first; on network failure the operation is queued in
//            localStorage and a synthetic success response is returned so the
//            UI can continue. Queue is replayed by syncQueue() when online.
//
// POZOR: Vite vkládá VITE_* proměnné do klientského bundle. Service-role klíč
// sem proto NIKDY nepřidávat — obcházel by RLS a kdokoliv by ho měl v JS bundle.
// ---------------------------------------------------------------------------

const REST_PREFIX = '/rest/v1/';
const FILTER_RE = /^(eq|neq|gt|gte|lt|lte|in|is|like|ilike|match|or|not|cs|cd|ov|sl|sr|nxr|nxl|adj|fts|plfts|phfts|wfts)\./;
// Telemetrie, kterou nemá smysl řadit do offline fronty.
const TELEMETRY_TABLES = new Set(['user_app_versions', 'app_versions']);

type RestInfo = { table: string; eq: Record<string, any>; inMatch: Record<string, any[]>; onConflict: string | null };

function getUrl(input: RequestInfo | URL): URL | null {
  try {
    if (input instanceof URL) return input;
    if (input instanceof Request) return new URL(input.url);
    return new URL(input);
  } catch {
    return null;
  }
}

function getHeader(init: RequestInit | undefined, name: string): string | null {
  const h = init?.headers;
  if (!h) return null;
  if (h instanceof Headers) return h.get(name);
  if (Array.isArray(h)) {
    for (const [k, v] of h) if (String(k).toLowerCase() === name.toLowerCase()) return String(v);
    return null;
  }
  return (h as Record<string, string>)[name] ?? null;
}

function parseRest(url: URL): RestInfo | null {
  const idx = url.pathname.indexOf(REST_PREFIX);
  if (idx === -1) return null;
  const rest = url.pathname.slice(idx + REST_PREFIX.length);
  const table = rest.split('/')[0];
  const eq: Record<string, any> = {};
  const inMatch: Record<string, any[]> = {};
  let onConflict: string | null = null;
  for (const [k, v] of url.searchParams) {
    if (k === 'on_conflict') { onConflict = v; continue; }
    if (v.startsWith('eq.')) eq[k] = v.slice(3);
    else if (v.startsWith('in.')) inMatch[k] = v.slice(3).split(',').map((s) => s.trim());
  }
  return { table, eq, inMatch, onConflict };
}

function hasRowFilters(url: URL): boolean {
  for (const [, v] of url.searchParams) if (FILTER_RE.test(v)) return true;
  return false;
}

function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}): Response {
  const h = new Headers({ 'Content-Type': 'application/json', ...headers });
  return new Response(JSON.stringify(body), { status, headers: h });
}

function rowMatches(row: any, match?: Record<string, any>): boolean {
  if (!match) return true;
  return Object.entries(match).every(([k, v]) => row?.[k] === v || String(row?.[k]) === String(v));
}

/** Merge pending (queued) ops for a table into cached rows so offline lists reflect local changes. */
function applyPendingOps(rows: any[], table: string): any[] {
  const ops = getQueue().filter((o) => o.table === table);
  if (ops.length === 0) return rows;
  let result = rows.slice();
  for (const op of ops) {
    if (op.op === 'insert') {
      const r = op.row;
      if (!r) continue;
      const idx = result.findIndex((x) => x?.id && r.id && x.id === r.id);
      if (idx >= 0) result[idx] = { ...result[idx], ...r };
      else result.push({ ...r });
    } else if (op.op === 'update' || op.op === 'upsert') {
      const r = op.row;
      if (!r) continue;
      let found = false;
      result = result.map((x) => {
        if (r.id && x?.id && x.id === r.id) { found = true; return { ...x, ...r }; }
        if (!r.id && rowMatches(x, op.match)) { found = true; return { ...x, ...r }; }
        return x;
      });
      if (!found && r.id && !op.match && !op.inMatch) result.push({ ...r });
    } else if (op.op === 'delete') {
      const inMatch = op.inMatch;
      if (inMatch) {
        result = result.filter((x) => {
          for (const [k, vals] of Object.entries(inMatch)) {
            if (x?.[k] !== undefined && (vals as any[]).includes(x[k])) return false;
          }
          return true;
        });
      } else if (op.match && Object.keys(op.match).length > 0) {
        result = result.filter((x) => !rowMatches(x, op.match));
      }
    }
  }
  return result;
}

async function serveCached(url: URL, rest: RestInfo | null, wantCount: boolean): Promise<Response> {
  let rows: any[] | null = null;
  let contentRange: string | null = null;
  const cached = await getCachedResponse(url.toString());
  if (cached) { rows = cached.rows; contentRange = cached.contentRange; }
  if (!rows && rest) {
    const tblRows = await getTableRows(rest.table);
    // Celý obsah tabulky vracíme jen pro dotazy bez filtrů (např. číselníky) —
    // filtrovaný dotaz by jinak dostal nesprávná data.
    if (tblRows && tblRows.length > 0 && !hasRowFilters(url)) rows = tblRows;
  }
  const finalRows = applyPendingOps(rows ?? [], rest?.table ?? '');
  const headers: Record<string, string> = {};
  if (wantCount) headers['Content-Range'] = `0-${Math.max(finalRows.length - 1, 0)}/${finalRows.length}`;
  else if (contentRange) headers['Content-Range'] = contentRange;
  // Tady víme, že odpověď vznikla offline (fetch selhal) a data jsou buď z
  // mezipaměti, nebo prázdná — uživatel by si myslel, že v tabulce nic není.
  // Signalizujeme UI banner (Layout.tsx), aby ukázal, že data nemusí být aktuální.
  if (typeof window !== 'undefined' && !navigator.onLine) signalOfflineStale();
  return jsonResponse(finalRows, 200, headers);
}

// ---------------------------------------------------------------------------
// Signalizace "offline → zobrazena zastaralá/prázdná data" pro UI banner.
// Guard omezuje dispatch na ~1x za 3 s, aby opakované dotazy (např. realtime
// retry) nespamovaly Layout banner. Viz Layout.tsx → 'pivovar:offline-stale'.
// ---------------------------------------------------------------------------
let staleSignalCooldown = false;
function signalOfflineStale(): void {
  if (staleSignalCooldown) return;
  staleSignalCooldown = true;
  window.dispatchEvent(new CustomEvent('pivovar:offline-stale'));
  setTimeout(() => { staleSignalCooldown = false; }, 3000);
}

async function handleGet(input: RequestInfo | URL, init: RequestInit | undefined, url: URL, rest: RestInfo | null): Promise<Response> {
  const prefer = getHeader(init, 'prefer') ?? '';
  const wantCount = prefer.includes('count=exact');
  try {
    const res = await fetch(input, init);
    if (res && res.ok) {
      const text = await res.clone().text();
      if (text && rest) {
        try {
          const rows = JSON.parse(text);
          const arr = Array.isArray(rows) ? rows : [rows];
          const cr = res.headers.get('content-range');
          if (arr.length > 0 || cr) cacheGetResponse(url.toString(), arr, cr);
          if (arr.length > 0) upsertTableRows(rest.table, arr);
        } catch { /* non-JSON body — nothing to cache */ }
      }
    }
    return res;
  } catch {
    // Offline (nebo síťová chyba) → servírujeme z mezipaměti.
    return serveCached(url, rest, wantCount);
  }
}

function synthesizeWrite(init: RequestInit, rest: RestInfo, method: string): Response {
  const prefer = getHeader(init, 'prefer') ?? '';
  const returnsRepr = prefer.includes('return=representation');
  const isUpsert = !!rest.onConflict && prefer.includes('resolution=merge-duplicates');
  const skip = TELEMETRY_TABLES.has(rest.table);

  let body: any = null;
  try {
    body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : null;
  } catch { body = null; }
  const rows = Array.isArray(body) ? body : body ? [body] : [];

  if (method === 'POST') {
    const op = isUpsert ? 'upsert' : 'insert';
    const out: any[] = [];
    for (const raw of rows) {
      const row = { ...(raw ?? {}) };
      if (!row.id) row.id = crypto.randomUUID();
      if (!skip) enqueue({ table: rest.table, op, row, onConflict: rest.onConflict ?? undefined });
      out.push(row);
    }
    return jsonResponse(returnsRepr ? out : [], 201);
  }

  if (method === 'PATCH') {
    const row = rows[0] ?? {};
    if (!skip) {
      enqueue({
        table: rest.table, op: 'update',
        match: Object.keys(rest.eq).length ? rest.eq : undefined,
        inMatch: Object.keys(rest.inMatch).length ? rest.inMatch : undefined,
        row,
      });
    }
    return jsonResponse(returnsRepr ? [row] : [], 200);
  }

  if (method === 'DELETE') {
    if (!skip) {
      enqueue({
        table: rest.table, op: 'delete',
        match: Object.keys(rest.eq).length ? rest.eq : undefined,
        inMatch: Object.keys(rest.inMatch).length ? rest.inMatch : undefined,
      });
    }
    return jsonResponse([], 200);
  }

  return new Response(null, { status: 405 });
}

async function handleWrite(input: RequestInfo | URL, init: RequestInit, rest: RestInfo): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();

  // Bezpečnostní pojistka: update/delete bez jakéhokoli filtru se nedá offline
  // bezpečně zopakovat (hrozilo by smazání všech řádků) → nikdy neřadit.
  if ((method === 'PATCH' || method === 'DELETE') && Object.keys(rest.eq).length === 0 && Object.keys(rest.inMatch).length === 0) {
    return fetch(input, init);
  }

  // Nejdřív zkusíme síť (přeskočíme, když víme, že jsme offline).
  if (navigator.onLine) {
    try {
      const res = await fetch(input, init);
      if (res.ok && method === 'POST') {
        const prefer = getHeader(init, 'prefer') ?? '';
        if (prefer.includes('return=representation')) {
          const text = await res.clone().text();
          if (text) {
            try {
              const rows = JSON.parse(text);
              const arr = Array.isArray(rows) ? rows : [rows];
              if (arr.length > 0) upsertTableRows(rest.table, arr);
            } catch { /* ignore */ }
          }
        }
      }
      return res;
    } catch { /* síťová chyba → zařadit do fronty */ }
  }

  return synthesizeWrite(init, rest, method);
}

async function offlineFetch(input: RequestInfo | URL, init?: RequestInit, opts?: { admin?: boolean }): Promise<Response> {
  const url = getUrl(input);
  if (!url || !url.pathname.includes(REST_PREFIX) || opts?.admin) return fetch(input, init);
  const rest = parseRest(url);
  const method = (init?.method ?? 'GET').toUpperCase();

  if (method === 'GET') return handleGet(input, init, url, rest);
  if ((method === 'POST' || method === 'PATCH' || method === 'DELETE') && rest) return handleWrite(input, init ?? {}, rest);
  return fetch(input, init);
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 5 } },
  global: { fetch: (input, init) => offlineFetch(input, init, { admin: false }) },
});

/**
 * Subscribe to realtime changes on one or more tables and trigger a reload.
 * Returns nothing; calls `onChange` (debounced via microtask) whenever any
 * of the tables receives an INSERT/UPDATE/DELETE.
 *
 * Usage:  useRealtime(['bottling','fasovani'], load);
 */
export function useRealtime(tables: string[], onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  useEffect(() => {
    // Zdržení (debounce) před přenačtením. Dřív se slučovalo jen přes
    // Promise.resolve() — mikrotask, který spojí jen události doručené ve
    // STEJNÉ synchronní dávce. Jednotlivé zprávy z WebSocketu ale chodí
    // každá zvlášť, takže uložení objednávky s 15 položkami spustilo 15
    // kompletních přenačtení; a jedno přenačtení Stáčení je 15 dotazů,
    // tedy až 225 požadavků z jednoho uložení. Půlsekundové zdržení je
    // pod hranicí vnímání a sloučí celou dávku do jednoho načtení.
    //
    // 👀 A NEPŘENAČÍTAT DO KAPSY. Jedno přenačtení Stáčení KEG je 17 dotazů
    // a odběr má 17 tabulek — takže když někdo v kanceláři upraví
    // objednávku, telefonu u stáčecí linky se přenačte všech 17, i když má
    // člověk appku jen otevřenou v pozadí. Při šesti lidech v provozu to
    // jsou desítky zbytečných dotazů za minutu, mobilní data a baterka.
    // Když je stránka schovaná, událost se jen POZNAMENÁ a přenačte se
    // jednou, až se člověk vrátí — což je přesně ta chvíle, kdy na data
    // kouká.
    let timer: ReturnType<typeof setTimeout> | null = null;
    let zmeskano = false;
    const jeSchovana = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const trigger = () => {
      if (jeSchovana()) { zmeskano = true; return; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; ref.current(); }, 400);
    };
    const naNavrat = () => {
      if (jeSchovana() || !zmeskano) return;
      zmeskano = false;
      trigger();
    };
    document.addEventListener('visibilitychange', naNavrat);
    const channels = tables.map((t) =>
      supabase
        .channel(`rt-${t}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: t }, trigger)
        .subscribe()
    );
    window.addEventListener('pivovar:online-refetch', trigger);
    return () => {
      if (timer) clearTimeout(timer);
      channels.forEach((c) => supabase.removeChannel(c));
      window.removeEventListener('pivovar:online-refetch', trigger);
      document.removeEventListener('visibilitychange', naNavrat);
    };
  }, [tables.join(',')]);
}

export type Beer = {
  id: string; name: string; short_name: string | null; degree: string | null; color: string | null;
  beer_color: string | null;
  price_per_liter: number | null;
  is_active: boolean; sort_order: number; created_at: string;
};

export const BEER_COLOR_PRESETS = [
  '#FEF3C7', '#FDE68A', '#FCD34D', '#F59E0B',
  '#FED7AA', '#FCA5A5', '#F87171', '#EF4444',
  '#DCFCE7', '#86EFAC', '#4ADE80', '#22C55E',
  '#DBEAFE', '#93C5FD', '#60A5FA', '#3B82F6',
  '#E0E7FF', '#C4B5FD', '#A78BFA', '#8B5CF6',
  '#FCE7F3', '#F9A8D4', '#F472B6', '#EC4899',
  '#C7D2FE', '#A5B4FC', '#818CF8', '#6366F1',
  '#99F6E4', '#5EEAD4', '#2DD4BF', '#14B8A6',
  '#FECACA', '#FCA5A5', '#F87171', '#DC2626',
  '#44403B', '#1E293B', '#0F172A', '#F3F4F6',
];

export function beerBg(beer: { beer_color?: string | null } | null | undefined): string {
  // Náhrada pro pivo bez barvy jde z PROMĚNNÉ, ne z napsaného odstínu:
  // `#F3F4F6` je světle šedá, která v tmavém režimu zůstala světlá a
  // dělala z řádku svítící pruh. V inline stylu `var()` funguje stejně
  // jako ve třídě.
  return beer?.beer_color ?? 'rgb(var(--bg-neutral-100))';
}
/** Je barva piva tmavá natolik, že na ní musí být světlé písmo? */
function beerJeTmave(beer: { beer_color?: string | null } | null | undefined): boolean {
  const c = beer?.beer_color;
  if (!c) return false;
  const hex = c.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
}

/**
 * Barva písma na dlaždici piva — podle jasu barvy, kterou má pivo uložené
 * v databázi.
 *
 * Tmavý odstín je schválně zapsaný natvrdo (`text-[#451f10]`), ne jako
 * `text-primary-900`: pozadí dlaždice je barva piva z databáze a ta se
 * s režimem aplikace NEMĚNÍ. Kdyby se použila třída z palety, v tmavém
 * režimu by zesvětlala (viz proměnné v index.css) a na světle zelené
 * „Desítce" by pak svítilo světlé písmo v poměru 1,1 : 1.
 * Rozhodnutí „tohle pozadí je světlé, písmo musí být tmavé" padlo tady
 * a nesmí ho nic dodatečně otočit. Hodnota odpovídá primary-900.
 */
export function beerText(beer: { beer_color?: string | null } | null | undefined): string {
  return beerJeTmave(beer) ? 'text-white' : 'text-[#451f10]';
}

/**
 * Totéž jako beerText, ale jako hodnota do CSS proměnné `--ink-plochy`.
 *
 * Je to pro řádky a pruhy, které mají barvu piva jako pozadí, ale text v nich
 * sedí v potomcích s VLASTNÍMI barvami (`text-rose-800`, `text-amber-900`…) —
 * ty by třídu z beerText přebily. Proměnnou si přečte pravidlo v index.css
 * a přebije jí celý podstrom.
 *
 * Nešlo to udělat jedním pevným pravidlem v CSS: barvy piv nejsou jen světlé
 * pastely, „Krvavý pomeranč" má tmavě vínovou. Pevně tmavý text by na ní byl
 * stejně nečitelný jako pevně světlý na žluté — o barvě musí rozhodnout jas,
 * a ten zná jen JavaScript.
 */
export function beerInk(beer: { beer_color?: string | null } | null | undefined): string {
  return beerJeTmave(beer) ? '#ffffff' : '#0f172a';
}
export function beerBorder(beer: { beer_color?: string | null } | null | undefined): string {
  return beer?.beer_color ?? 'rgb(var(--bd-neutral-200))';
}

/**
 * Vrátí zkratku piva (short_name), pokud existuje, jinak celý název.
 * Použít všude v UI, kde se zobrazuje název piva.
 */
export function beerName(beer: { short_name?: string | null; name?: string | null } | null | undefined): string {
  if (!beer) return '—';
  return beer.short_name || beer.name || '—';
}

export function formatPackageLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/(\d+(?:[.,]\d+)?)(\s*)([lL])\b/gi, '$1 L');
}

export function pkgBg(pkg: { volume_l?: number | null; kind?: string | null; label?: string | null } | null | undefined): string {
  if (!pkg) return '#F3F4F6';
  const vol = Number(pkg.volume_l ?? 0);
  const label = (pkg.label ?? '').toLowerCase();
  const isKeg = pkg.kind === 'keg' || label.includes('keg') || label.includes('sud');

  if (isKeg) {
    if (vol >= 45) return '#1E3A8A'; // KEG 50L - tmavě modrá
    if (vol >= 28) return '#D97706'; // KEG 30L - jantarově oranžová
    if (vol >= 18) return '#0D9488'; // KEG 20L - tyrkysová
    if (vol >= 14) return '#7C3AED'; // KEG 15L - fialová
    if (vol >= 8)  return '#E11D48'; // KEG 10L - tmavě růžová
    return '#475569';
  } else {
    // Lahve / PET / Sklo
    if (vol >= 1.4) return '#9333EA'; // Lahve 1.5L - purpurová
    if (vol >= 0.9) return '#059669'; // Lahve 1L - smaragdově zelená
    if (vol >= 0.7) return '#CA8A04'; // Lahve 0.75L - zlatá
    if (vol >= 0.45) return '#0284C7'; // Lahve 0.5L - modrá
    if (vol >= 0.3) return '#F43F5E'; // Lahve 0.33L - růžová
    return '#64748B';
  }
}

export function pkgText(pkg: { volume_l?: number | null; kind?: string | null; label?: string | null } | null | undefined): string {
  const c = pkgBg(pkg);
  if (c === '#F3F4F6' || c === '#E5E7EB') return 'text-neutral-900';
  return 'text-white';
}

export type Package = {
  id: string; code: string; kind: 'keg' | 'bottle'; volume_l: number;
  label: string; sort_order: number;
};
export type Place = {
  id: string; name: string; note: string | null; created_at: string;
  address: string | null; phone: string | null; opening_hours: string | null;
  contact_name?: string | null; email?: string | null;
  delivery_group?: string | null;
  lat?: number | null; lng?: number | null;
};

export type Profile = {
  id: string;
  display_name: string | null;
  role: 'admin' | 'user';
  receive_vehicle_alerts?: boolean | null;
  password_set?: boolean | null;
  home_layout?: unknown;
  created_at: string;
};

export type Vehicle = {
  id: string;
  name: string;
  spz: string | null;
  stk_valid_until: string | null;
  highway_toll_valid_until: string | null;
  note: string | null;
  created_at?: string;
};

export type EntryRow = {
  id: string; entry_date: string;
  beer_id: string | null; beer_name: string | null;
  package_id: string | null; package_label: string | null;
  quantity: number; note: string | null; created_at: string;
  who?: string | null; reason?: string | null;
  source_volume_l?: number | null;
  tank_id?: string | null;
  cellar_tank_id?: string | null;
  loss_l?: number | null;
  kegs_used?: number | null;
  kegs_used_package_id?: string | null;
};


export type KeggingTank = {
  id: string;
  label: string | null;
  beer_id: string | null;
  beer_name: string | null;
  started_at: string;
  closed_at: string | null;
  note: string | null;
  created_at: string;
};

export type ParserAlias = {
  id: string;
  alias_text: string;
  beer_id: string | null;
  package_id: string | null;
  hit_count: number;
  created_at: string;
  updated_at: string;
};

export type AkceItem = {
  id: string;
  akce_id: string;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity_taken: number;
  quantity_returned: number;
  /** Jednotné množství: kladné = vráceno/přifasováno zpět do skladu, záporné = odvezeno/odečteno ze skladu */
  quantity: number;
  created_at: string;
};

export type Akce = {
  id: string;
  entry_date: string;
  name: string;
  who: string | null;
  beer_id: string | null;
  beer_name: string | null;
  package_id: string | null;
  package_label: string | null;
  quantity_taken: number;
  quantity_returned: number;
  /** Kolik se na akci celkem vydělalo (Kč) */
  revenue: number;
  note: string | null;
  created_at: string;
  items?: AkceItem[];
};

export type CalendarEvent = {
  id: string;
  event_date: string;
  title: string;
  description: string | null;
  reminder: boolean;
  reminder_time: string | null;
  color: string;
  created_by: string | null;
  created_at: string;
};

export type Note = {
  id: string;
  title: string | null;
  body: string;
  color: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceListItem = {
  id: string;
  beer_id: string | null;
  package_id: string | null;
  price_per_unit: number;
  currency: string;
  valid_from: string | null;
  valid_to: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type CellarTank = {
  id: string;
  label: string;
  capacity_l: number;
  current_beer_id: string | null;
  current_beer_name: string | null;
  current_volume_l: number;
  status: 'empty' | 'filling' | 'active' | 'emptying' | 'cleaning' | 'sanitizing' | 'rinsing';
  note: string | null;
  kegging_date: string | null;
  beer_type: string | null;
  started_at: string | null;
  initial_volume_l: number | null;
  // Aktivní stáčecí zdroj — ze kterého tanku se právě odečítá stáčení
  kegging_active?: boolean | null;
  kegging_started_at?: string | null;
  kegging_ended_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CellarTransfer = {
  id: string;
  transfer_date: string;
  from_tank_id: string | null;
  to_tank_id: string | null;
  beer_id: string | null;
  beer_name: string | null;
  volume_l: number;
  loss_l: number;
  note: string | null;
  created_at: string;
};

export type KegPrefuk = {
  id: string;
  entry_date: string;
  beer_id: string | null;
  beer_name: string | null;
  from_package_id: string | null;
  from_package_label: string | null;
  from_count: number;
  to_package_id: string | null;
  to_package_label: string | null;
  to_count: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

export type CellarTankCycle = {
  id: string;
  tank_id: string | null;
  tank_label: string | null;
  beer_id: string | null;
  beer_name: string | null;
  initial_volume_l: number;
  kegged_volume_l: number;
  keg_count: number;
  loss_l: number;
  loss_pct: number;
  started_at: string | null;
  ended_at: string;
  duration_hours: number | null;
  note: string | null;
  created_at: string;
};


export type SanitationLog = {
  id: string;
  sanitation_date: string;
  sanitation_time?: string | null;
  tank_id: string | null;
  tank_label: string;
  method: 'kyselina_dusicna' | 'louh' | 'oplach_vodou' | 'persteril' | 'kombinovana';
  method_label: string;
  chemical_name: string | null;
  concentration_pct: number | null;
  temperature_c: number | null;
  duration_minutes: number | null;
  performed_by: string | null;
  note: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  changed_by: string | null;
  changed_at: string;
};

/**
 * 📄 Načte VŠECHNY řádky tabulky, i když jich je přes tisíc.
 * ---------------------------------------------------------------------------
 * Supabase vrací na jeden dotaz nejvýš 1000 řádků a zbytek TIŠE zahodí — bez
 * chyby, bez varování. U skladových výpočtů je to zákeřné: jakmile tabulka
 * přeroste tisícovku, část pohybů se prostě přestane počítat a sklad začne
 * ukazovat víc, než je ve skutečnosti. Nic přitom nespadne.
 *
 * Stav k 26. 8. 2026: zavoz_deductions 473 řádků, order_items 496 — při
 * tempu zhruba 250 odečtů měsíčně se hranice překročí během pár měsíců.
 *
 * `select` je stejný řetězec jako u supabase.from(t).select(...).
 *
 * `.in(sloupec, hodnoty)` je tu taky, a je to nejzákeřnější případ: dotaz
 * typu „položky těchhle objednávek" vypadá omezeně, ale položek může být
 * násobně víc než objednávek, takže tisícovku přeroste dřív než tabulka
 * sama. Seznam hodnot se posílá po stovkách kvůli délce URL a každá dávka
 * se navíc stránkuje.
 */
export function fetchAllRows<T = any>(
  table: string,
  select = '*'
): PromiseLike<{ data: T[] | null; error: { message: string } | null }> & {
  order: (col: string, opts?: any) => any;
  gte: (col: string, val: any) => any;
  lte: (col: string, val: any) => any;
  eq: (col: string, val: any) => any;
  neq: (col: string, val: any) => any;
  lt: (col: string, val: any) => any;
  gt: (col: string, val: any) => any;
  is: (col: string, val: any) => any;
  not: (col: string, op: string, val: any) => any;
  or: (vyraz: string) => any;
  filter: (col: string, op: string, val: any) => any;
  in: (col: string, vals: any[]) => any;
} {
  // Modifikátory (order/eq/gte/…) se posbírají a použijí na každou stránku.
  const kroky: ((q: any) => any)[] = [];
  // `in` se drží zvlášť: dlouhý seznam hodnot se musí rozsekat, aby se URL
  // dotazu vešlo do limitu serveru.
  let inFiltr: { col: string; vals: any[] } | null = null;

  /** Jedna stránkovaná dávka — vrátí VŠECHNY řádky, které dotazu odpovídají. */
  const nactiStranky = async (uprav: (q: any) => any) => {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      let q: any = supabase.from(table).select(select);
      for (const k of kroky) q = k(q);
      q = uprav(q);
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) {
        console.error(`fetchAllRows(${table}) selhalo:`, error.message);
        return { data: out, error };
      }
      const batch = (data ?? []) as T[];
      out.push(...batch);
      if (batch.length < PAGE) break;
      if (out.length > 500_000) break; // pojistka proti nekonečné smyčce
    }
    return { data: out, error: null as any };
  };

  const nacti = async () => {
    if (!inFiltr) return nactiStranky((q) => q);

    // Prázdný seznam by bez téhle zkratky poslal dotaz `in.()`, na který
    // PostgREST odpoví chybou — přitom správná odpověď je „žádné řádky".
    if (inFiltr.vals.length === 0) return { data: [] as T[], error: null as any };

    // Hodnoty po stovkách kvůli délce URL; každá dávka se pak sama stránkuje,
    // takže na počtu hodnot v dávce nezáleží — sto objednávek může mít klidně
    // dva tisíce položek a všechny se načtou.
    const CHUNK = 100;
    const out: T[] = [];
    for (let i = 0; i < inFiltr.vals.length; i += CHUNK) {
      const cast = inFiltr.vals.slice(i, i + CHUNK);
      const { data, error } = await nactiStranky((q) => q.in(inFiltr!.col, cast));
      out.push(...data);
      if (error) return { data: out, error };
    }
    return { data: out, error: null as any };
  };

  const api: any = {
    then: (...a: any[]) => nacti().then(...a),
    order: (col: string, opts?: any) => { kroky.push((q) => q.order(col, opts)); return api; },
    gte: (col: string, val: any) => { kroky.push((q) => q.gte(col, val)); return api; },
    lte: (col: string, val: any) => { kroky.push((q) => q.lte(col, val)); return api; },
    eq: (col: string, val: any) => { kroky.push((q) => q.eq(col, val)); return api; },
    neq: (col: string, val: any) => { kroky.push((q) => q.neq(col, val)); return api; },
    lt: (col: string, val: any) => { kroky.push((q) => q.lt(col, val)); return api; },
    gt: (col: string, val: any) => { kroky.push((q) => q.gt(col, val)); return api; },
    is: (col: string, val: any) => { kroky.push((q) => q.is(col, val)); return api; },
    not: (col: string, op: string, val: any) => { kroky.push((q) => q.not(col, op, val)); return api; },
    or: (vyraz: string) => { kroky.push((q) => q.or(vyraz)); return api; },
    filter: (col: string, op: string, val: any) => { kroky.push((q) => q.filter(col, op, val)); return api; },
    in: (col: string, vals: any[]) => { inFiltr = { col, vals }; return api; },
  };
  return api;
}
