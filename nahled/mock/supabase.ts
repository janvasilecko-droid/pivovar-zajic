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
};

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

  const api: any = {
    eq(col: string, val: any) { filtry.push({ typ: 'eq', col, val }); return api; },
    in(col: string, val: any[]) { filtry.push({ typ: 'in', col, val }); return api; },
    order(col: string) { radit = col; return api; },
    then(splneno: (v: { data: Radek[]; error: null }) => any) {
      let data = pouzijFiltry(db[tabulka] ?? [], filtry);
      if (radit) data = [...data].sort((a, z) => (a[radit!] ?? 0) - (z[radit!] ?? 0));
      return Promise.resolve(splneno({ data, error: null }));
    },
  };
  return api;
}

export const supabase = {
  from(tabulka: string) {
    return {
      select: (_cols?: string) => dotaz(tabulka),

      insert(radky: Radek | Radek[]) {
        const pole = Array.isArray(radky) ? radky : [radky];
        db[tabulka] = [...(db[tabulka] ?? []), ...pole];
        zaznamenej(tabulka, 'insert', pole);
        return Promise.resolve({ data: pole, error: null });
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
