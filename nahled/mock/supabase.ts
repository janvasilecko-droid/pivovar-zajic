// Náhrada `src/lib/supabase.ts` pro náhled — tabulky drží v paměti prohlížeče.
//
// Podstrčí se přes `vite.nahled.config.ts`, produkční kód se nemění. Není to
// druhá implementace Supabase, jen tolik, kolik panel opravdu zavolá:
// `select` s `eq`/`in`/`order`, `insert`, `upsert`, `update` a jedno `rpc`.
// Co panel nezavolá, tu schválně není — mlčící útržek by se maskoval jako
// funkční a náhled by pak lhal o tom, co appka umí.
//
// Zápisy MĚNÍ data v paměti, takže se náhled chová jako appka: napočítáš
// rozdíl, klikneš „Zapsat do stáčení" a řádek se pak srovná. Po obnovení
// stránky je zase výchozí stav.
import { useEffect, useRef } from 'react';
import * as vychozi from './data';

type Radek = Record<string, any>;

/** Živá kopie dat. Klonuje se, ať se úpravou nezmění vzor pro reload. */
const db: Record<string, Radek[]> = {
  beers: [...vychozi.beers],
  packages: [...vychozi.packages],
  inventory: [...vychozi.inventory],
  kegging: [...vychozi.kegging],
  bottling: [...vychozi.bottling],
  fasovani: [...vychozi.fasovani],
  fasovani_private: [...vychozi.fasovani_private],
  writeoffs: [...vychozi.writeoffs],
  inventory_adjustments: [...vychozi.inventory_adjustments],
  zavoz_deductions: [...vychozi.zavoz_deductions],
  akce: [...vychozi.akce],
  keg_prefuk: [...vychozi.keg_prefuk],
  cellar_tanks: vychozi.cellar_tanks.map((t) => ({ ...t })),
  tydenni_inventura: vychozi.tydenni_inventura.map((r) => ({ ...r })),
  // Značka uzavření týdne (TydenniInventuraPanel) — v náhledu vždycky prázdná.
  tydenni_uzaverky: [],
  // Obrazovky Sklepa (nahled/obrazovky.html).
  cellar_tank_cycles: vychozi.cellar_tank_cycles.map((r) => ({ ...r })),
  cellar_batches: vychozi.cellar_batches.map((r) => ({ ...r })),
  cellar_batch_mereni: vychozi.cellar_batch_mereni.map((r) => ({ ...r })),
  // Okno „Co stočit" na úvodní stránce.
  orders: [...vychozi.orders],
  order_items: [...vychozi.order_items],
  kegging_plan_checks: [...vychozi.kegging_plan_checks],
  // Úkoly stáčení („Potřeby stáčení" v Nastavení) — v náhledu se začíná
  // s prázdným týdnem, úkol si jde rovnou zkusit založit.
  bottling_plans: [],
};

/** Kopie z produkčního modulu — barva piva na tečku v seznamu. */
export function beerName(beer: { short_name?: string | null; name?: string | null } | null | undefined): string {
  return beer?.short_name?.trim() || beer?.name || '';
}
export function beerBg(beer: { beer_color?: string | null } | null | undefined): string {
  return beer?.beer_color ?? 'rgb(var(--bg-neutral-100))';
}
function beerJeTmave(beer: { beer_color?: string | null } | null | undefined): boolean {
  const hex = (beer?.beer_color ?? '').replace('#', '');
  if (hex.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55;
}
export function beerText(beer: { beer_color?: string | null } | null | undefined): string {
  return beerJeTmave(beer) ? 'text-white' : 'text-[#451f10]';
}
export function beerInk(beer: { beer_color?: string | null } | null | undefined): string {
  return beerJeTmave(beer) ? '#ffffff' : '#0f172a';
}

/**
 * Realtime v náhledu: po každém zápisu se zavolají odběratelé dotčené
 * tabulky — přesně to, co by v appce udělal Supabase kanál.
 */
const realtime = new Map<string, Set<() => void>>();

export function useRealtime(tables: string[], onChange: () => void) {
  const ref = useRef(onChange);
  ref.current = onChange;
  const klic = tables.join(',');
  useEffect(() => {
    const fn = () => ref.current();
    for (const t of tables) {
      const s = realtime.get(t) ?? new Set();
      s.add(fn);
      realtime.set(t, s);
    }
    return () => { for (const t of tables) realtime.get(t)?.delete(fn); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [klic]);
}

function ohlasZmenu(tabulka: string) {
  realtime.get(tabulka)?.forEach((fn) => fn());
}

/** Co se v náhledu zapsalo — vypisuje se v pravém panelu stránky. */
export type Zapis = { kdy: string; tabulka: string; operace: string; radku: number; popis: string };
export const zapisy: Zapis[] = [];
const posluchaci = new Set<() => void>();

export function sledujZapisy(fn: () => void): () => void {
  posluchaci.add(fn);
  return () => posluchaci.delete(fn);
}

function zaznamenej(tabulka: string, operace: string, radky: Radek[]) {
  const popis = radky
    .map((r) => {
      const pivo = vychozi.beers.find((b) => b.id === r.beer_id)?.name ?? r.beer_id ?? '';
      const obal = vychozi.packages.find((p) => p.id === r.package_id)?.label ?? r.package_id ?? '';
      const ks = r.quantity ?? r.napocitano ?? '';
      return [pivo, obal, ks !== '' ? `${ks} ks` : ''].filter(Boolean).join(' · ');
    })
    .filter(Boolean)
    .join(' | ');
  zapisy.unshift({
    kdy: new Date().toLocaleTimeString('cs-CZ'),
    tabulka,
    operace,
    radku: radky.length,
    popis: popis || '—',
  });
  posluchaci.forEach((fn) => fn());
  ohlasZmenu(tabulka);
}

/** Vrátí data do výchozího stavu — tlačítko „Začít znovu" na stránce. */
export function resetNahledu() {
  db.inventory = [...vychozi.inventory];
  db.kegging = [...vychozi.kegging];
  db.bottling = [...vychozi.bottling];
  db.fasovani = [...vychozi.fasovani];
  db.fasovani_private = [...vychozi.fasovani_private];
  db.writeoffs = [...vychozi.writeoffs];
  db.inventory_adjustments = [];
  db.zavoz_deductions = [...vychozi.zavoz_deductions];
  db.keg_prefuk = [...vychozi.keg_prefuk];
  db.cellar_tanks = vychozi.cellar_tanks.map((t) => ({ ...t }));
  db.tydenni_inventura = vychozi.tydenni_inventura.map((r) => ({ ...r }));
  zapisy.length = 0;
  posluchaci.forEach((fn) => fn());
}

type Filtr = { typ: 'eq' | 'in'; col: string; val: any };

function pouzijFiltry(radky: Radek[], filtry: Filtr[]): Radek[] {
  return radky.filter((r) =>
    filtry.every((f) => (f.typ === 'eq' ? r[f.col] === f.val : (f.val as any[]).includes(r[f.col]))),
  );
}

/** Řetěz `select().eq().order()`, na konci `await`. */
function dotaz(tabulka: string) {
  const filtry: Filtr[] = [];
  let radit: string | null = null;
  let sestupne = false;
  let pocet: number | null = null;

  const api: any = {
    eq(col: string, val: any) { filtry.push({ typ: 'eq', col, val }); return api; },
    in(col: string, val: any[]) { filtry.push({ typ: 'in', col, val }); return api; },
    order(col: string, opts?: { ascending?: boolean }) { radit = col; sestupne = opts?.ascending === false; return api; },
    limit(n: number) { pocet = n; return api; },
    maybeSingle() {
      return {
        then(splneno: (v: { data: Radek | null; error: null }) => any) {
          const data = pouzijFiltry(db[tabulka] ?? [], filtry);
          return Promise.resolve(splneno({ data: data[0] ?? null, error: null }));
        },
      };
    },
    then(splneno: (v: { data: Radek[]; error: null }) => any) {
      let data = pouzijFiltry(db[tabulka] ?? [], filtry);
      if (radit) {
        const k = radit;
        data = [...data].sort((a, z) => {
          const x = a[k] ?? 0;
          const y = z[k] ?? 0;
          const r = typeof x === 'string' || typeof y === 'string' ? String(x).localeCompare(String(y)) : x - y;
          return sestupne ? -r : r;
        });
      }
      if (pocet != null) data = data.slice(0, pocet);
      return Promise.resolve(splneno({ data, error: null }));
    },
  };
  return api;
}

export const supabase = {
  from(tabulka: string) {
    return {
      select: (_cols?: string) => dotaz(tabulka),

      delete() {
        const filtry: Filtr[] = [];
        const api: any = {
          eq(col: string, val: any) { filtry.push({ typ: 'eq', col, val }); return api; },
          in(col: string, val: any[]) { filtry.push({ typ: 'in', col, val }); return api; },
          then(splneno: (v: { data: null; error: null }) => any) {
            const pryc = pouzijFiltry(db[tabulka] ?? [], filtry);
            db[tabulka] = (db[tabulka] ?? []).filter((r) => !pryc.includes(r));
            // Cizí klíč ON DELETE CASCADE u měření várky — ať náhled nelže.
            if (tabulka === 'cellar_batches') {
              const idcka = new Set(pryc.map((r) => r.id));
              db.cellar_batch_mereni = db.cellar_batch_mereni.filter((m) => !idcka.has(m.batch_id));
              ohlasZmenu('cellar_batch_mereni');
            }
            zaznamenej(tabulka, 'delete', pryc);
            return Promise.resolve(splneno({ data: null, error: null }));
          },
        };
        return api;
      },

      insert(radky: Radek | Radek[]) {
        const pole = (Array.isArray(radky) ? radky : [radky]).map((r) => ({
          id: `nahled-${Math.random().toString(36).slice(2, 10)}`,
          created_at: new Date().toISOString(),
          ...r,
        }));
        db[tabulka] = [...(db[tabulka] ?? []), ...pole];
        zaznamenej(tabulka, 'insert', pole);
        // `.select('id')` za insertem: skutečná Supabase vrací vložené řádky
        // a appka podle jejich id staví „Vrátit zpět" (ProdejnaScreen). Bez
        // tohohle náhled na takové obrazovce spadl na `insert(...).select
        // is not a function` — a vypadalo to jako chyba appky, ne náhledu.
        const vysledek = { data: pole, error: null };
        const odpoved: any = Promise.resolve(vysledek);
        odpoved.select = () => Promise.resolve(vysledek);
        return odpoved;
      },

      upsert(radky: Radek | Radek[], opts?: { onConflict?: string }) {
        const pole = Array.isArray(radky) ? radky : [radky];
        const klice = (opts?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        const stav = [...(db[tabulka] ?? [])];
        for (const novy of pole) {
          const i = klice.length
            ? stav.findIndex((r) => klice.every((k) => r[k] === novy[k]))
            : -1;
          if (i >= 0) stav[i] = { ...stav[i], ...novy };
          else stav.push(novy);
        }
        db[tabulka] = stav;
        zaznamenej(tabulka, 'upsert', pole);
        return Promise.resolve({ data: pole, error: null });
      },

      update(zmeny: Radek) {
        const filtry: Filtr[] = [];
        const api: any = {
          eq(col: string, val: any) { filtry.push({ typ: 'eq', col, val }); return api; },
          in(col: string, val: any[]) { filtry.push({ typ: 'in', col, val }); return api; },
          then(splneno: (v: { data: null; error: null }) => any) {
            const zasazene = pouzijFiltry(db[tabulka] ?? [], filtry);
            zasazene.forEach((r) => Object.assign(r, zmeny));
            zaznamenej(tabulka, 'update', zasazene);
            return Promise.resolve(splneno({ data: null, error: null }));
          },
        };
        return api;
      },
    };
  },

  /** Jediné RPC, které panel potřebuje: relativní odečet objemu z tanku. */
  rpc(nazev: string, args: Record<string, any>) {
    if (nazev === 'adjust_tank_volume') {
      const tank = db.cellar_tanks.find((t) => t.id === args.p_tank_id);
      if (tank) {
        tank.current_volume_l = Number(tank.current_volume_l ?? 0) + Number(args.p_delta_l ?? 0);
        zaznamenej('cellar_tanks', `rpc ${nazev}`, [{ quantity: args.p_delta_l, package_id: tank.label }]);
      }
      return Promise.resolve({ data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
};

/** V náhledu není co stránkovat — tabulky jsou v paměti. */
export function fetchAllRows(tabulka: string, _select?: string) {
  const api: any = {
    then: (splneno: (v: { data: Radek[]; error: null }) => any) =>
      Promise.resolve(splneno({ data: db[tabulka] ?? [], error: null })),
  };
  for (const m of ['order', 'eq', 'gte', 'lte', 'neq', 'lt', 'gt', 'is', 'not', 'or', 'filter', 'in']) {
    api[m] = () => api;
  }
  return api;
}

/** Kopie z produkčního modulu — jen převod „50l" na „50 L". */
export function formatPackageLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/(\d+(?:[.,]\d+)?)(\s*)([lL])\b/gi, '$1 L');
}

/** Stav tanků pro výpis na stránce. */
export function stavTanku() {
  return db.cellar_tanks.map((t) => ({
    label: t.label,
    pivo: vychozi.beers.find((b) => b.id === t.current_beer_id)?.name ?? '—',
    objem: Number(t.current_volume_l ?? 0),
    stacise: !!t.kegging_active,
  }));
}
