// Přizpůsobitelný launcher (domovská obrazovka) — pořadí, velikost, barva
// dlaždic a zvolená barevná scéna pozadí, uložené v profiles.home_layout
// (jsonb, per uživatel, synchronizuje se napříč zařízeními).
import { supabase } from './supabase';
import type { Page } from '../components/Layout';

export type TileColor =
  | 'coral' | 'amber2' | 'citrus' | 'mint' | 'sky' | 'indigo' | 'orchid' | 'forest' | 'plum'
  | 'rose' | 'teal' | 'lime' | 'slate' | 'gold' | 'crimson';
export type Scene = 'warm' | 'sunset' | 'ocean' | 'forest' | 'night' | 'custom';

// Barva dlaždice může být buď jméno přednastaveného odstínu (TileColor), nebo
// libovolný hex ("#rrggbb") z vlastního výběru barvy — proto plain string.
// w/h = libovolná velikost dlaždice (ne pár pevných předvoleb): w je šířka v
// jednotkách po UNIT_COLS sloupcích mřížky (0 = "mini" dlaždice, viz MAX_W),
// h je výška v řádcích mřížky (viz MAX_H) — uživatel si tak důležité dlaždice
// může zvětšit a nedůležité zmenšit prakticky libovolně.
export type TileOverride = { w?: number; h?: number; color?: string; label?: string };

export type HomeLayout = {
  /** Víc stránek launcheru (jako Android home screen) — každá je pole id dlaždic. */
  pages: Page[][];
  overrides: Partial<Record<Page, TileOverride>>;
  scene: Scene;
  /** Vlastní barva pozadí (hex), použije se jen když scene === 'custom'. */
  customAccent: string;
  /** Průhlednost skleněných dlaždic (viz MIN/MAX_OPACITY) — jako "Full Screen Picture" efekt na WP */
  tileOpacity: number;
  /** 4 zástupci ve spodní mobilní liště (Layout.tsx) — 'home' je vždy platná volba. */
  dock: Page[];
  /** Dlaždice schované z mřížky (modul zůstává dostupný, jen nezabírá místo). */
  hidden: Page[];
  /** Vlastní barvy pevných utilitních dlaždic (Hledat, Odhlásit se...), klíč = FixedTileKey. */
  fixedColors: Partial<Record<string, string>>;
};

/** Převede "#rrggbb" (nebo "#rgb") na "rgba(r, g, b, alpha)". Neplatný vstup spadne na šedou. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(120,120,120,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Volná velikost dlaždice: w v jednotkách po UNIT_COLS sloupcích 18sloupcové
// mřížky (0 = kompaktní "mini" dlaždice o 1 sloupci, viz HomeScreen.css
// .hs-tile.xs), h v řádcích. Horní mez w=4 (12 sloupců) je schválně stejná
// jako celkový počet sloupců mobilní mřížky (viz media query), aby ani
// nejširší dlaždice nepřetekla přes okraj na malém displeji.
export const MIN_W = 0;
export const MAX_W = 4;
export const DEFAULT_W = 1;
export const MIN_H = 1;
export const MAX_H = 3;
export const DEFAULT_H = 1;
export const UNIT_COLS = 3;

// Zpětná kompatibilita se starým formátem override.size (pár pevných
// předvoleb) — dřív uložené hodnoty se při načtení převedou na w/h.
const LEGACY_SIZE_TO_WH: Record<string, { w: number; h: number }> = {
  sm: { w: 0, h: 1 }, n: { w: 1, h: 1 }, w2: { w: 2, h: 1 }, h2: { w: 1, h: 2 }, w2h2: { w: 2, h: 2 },
};

export const TILE_COLORS: TileColor[] = [
  'coral', 'amber2', 'citrus', 'mint', 'sky', 'indigo', 'orchid', 'forest', 'plum',
  'rose', 'teal', 'lime', 'slate', 'gold', 'crimson',
];
export const SCENES: Scene[] = ['warm', 'sunset', 'ocean', 'forest', 'night', 'custom'];
const DEFAULT_CUSTOM_ACCENT = '#ff6b6b';

// Plné (neprůhledné) odstíny pro barevné tečky ve výběru — samotná dlaždice
// pak stejnou barvu použije poloprůhledně (viz HomeScreen.css .hs-tile.c-*).
export const COLOR_HEX: Record<TileColor, string> = {
  coral: '#ff6b6b', amber2: '#ffa94d', citrus: '#ffd43b', mint: '#38d9a9',
  sky: '#4dabf7', indigo: '#7c5cff', orchid: '#e066b0', forest: '#2f9e64', plum: '#6a3fa0',
  rose: '#f5487f', teal: '#0ca5b0', lime: '#82c91e', slate: '#495464', gold: '#d4a017', crimson: '#c1121f',
};

// Výchozí velikost pro pár dlaždic, aby mřížka hned po zapnutí launcheru
// ukázala rozmanitost velikostí (ne samé stejné čtverce) — uživatel si to
// pak stejně může v edit módu přeskládat/zvětšit/zmenšit podle sebe.
const DEFAULT_SIZE: Partial<Record<Page, { w: number; h: number }>> = {
  orders: { w: 2, h: 1 },
  kegging: { w: 1, h: 2 },
  dashboard: { w: 2, h: 1 },
  app_settings: { w: 0, h: 1 },
  users: { w: 0, h: 1 },
  calendar: { w: 0, h: 1 },
};

export const DEFAULT_DOCK: Page[] = ['orders', 'kegging', 'bottling', 'home'];
export const DOCK_SIZE = DEFAULT_DOCK.length;

const DEFAULT_SCENE: Scene = 'warm';
const DEFAULT_OPACITY = 0.62;
export const MIN_OPACITY = 0.3;
export const MAX_OPACITY = 0.9;

// Odvození výchozí barvy dlaždice ze starého ITEM_COLOR schématu (HomeScreen.tsx),
// aby appka po zapnutí launcheru vypadala stejně, dokud si uživatel barvu sám
// nezmění. Klíče beze zmínky tady dostanou barvu podle indexu (cyklicky), ať
// mřížka není jednobarevná.
const LEGACY_COLOR: Partial<Record<Page, TileColor>> = {
  kegging: 'amber2', bottling: 'amber2', fasovani: 'amber2', prodejna: 'amber2', akce: 'amber2',
  orders: 'mint',
  writeoffs: 'coral',
  dashboard: 'sky', cellar: 'sky', sklo_promo: 'sky', inventory: 'sky', history: 'sky', bottling_needs: 'sky',
};
const FALLBACK_CYCLE: TileColor[] = ['indigo', 'orchid', 'forest', 'plum', 'citrus'];

function defaultColorFor(id: Page, indexInFallback: number): TileColor {
  return LEGACY_COLOR[id] ?? FALLBACK_CYCLE[indexInFallback % FALLBACK_CYCLE.length];
}

/**
 * Slučuje uloženou vrstvu (stránky/velikost/barva/scéna) se seznamem aktuálně
 * viditelných dlaždic (po filtraci právy). Nově přidané/nově povolené moduly
 * se připojí na konec poslední stránky; moduly, na které uživatel ztratil
 * právo nebo které zmizely, se ze stránek vypustí. Čte i starý formát
 * (plochý `order`) pro zpětnou kompatibilitu s dřívějším jednostránkovým
 * layoutem.
 */
export function getHomeLayout(raw: unknown, visibleIds: Page[]): HomeLayout {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<HomeLayout> & { order?: Page[] };
  const visibleSet = new Set(visibleIds);

  const rawPages: Page[][] = Array.isArray(saved.pages) && saved.pages.every((p) => Array.isArray(p))
    ? (saved.pages as Page[][])
    : Array.isArray(saved.order) // zpětná kompatibilita se starým plochým "order"
      ? [saved.order as Page[]]
      : [];

  // Schované dlaždice (odstraněné z mřížky, ale modul zůstává dostupný) —
  // nesmí se znovu automaticky připojit mezi "nové" jen proto, že nejsou
  // zrovna na žádné stránce.
  const hidden: Page[] = (Array.isArray(saved.hidden) ? (saved.hidden as Page[]) : []).filter((id) => visibleSet.has(id));
  const hiddenSet = new Set(hidden);

  const seen = new Set<Page>(hidden);
  const pages: Page[][] = rawPages.map((p) => p.filter((id) => {
    if (!visibleSet.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }));

  const newIds = visibleIds.filter((id) => !seen.has(id) && !hiddenSet.has(id));
  if (pages.length === 0) pages.push([]);
  if (newIds.length > 0) pages[pages.length - 1] = [...pages[pages.length - 1], ...newIds];

  const overrides = (saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {}) as Partial<Record<Page, TileOverride>>;

  let fallbackIdx = 0;
  const filledOverrides: Partial<Record<Page, TileOverride>> = {};
  pages.flat().forEach((id) => {
    const existing = overrides[id] as (TileOverride & { size?: string }) | undefined;
    const color = existing?.color ?? defaultColorFor(id, fallbackIdx);
    if (!existing?.color) fallbackIdx += 1;
    const legacy = typeof existing?.size === 'string' ? LEGACY_SIZE_TO_WH[existing.size] : undefined;
    const wRaw = existing?.w ?? legacy?.w ?? DEFAULT_SIZE[id]?.w ?? DEFAULT_W;
    const hRaw = existing?.h ?? legacy?.h ?? DEFAULT_SIZE[id]?.h ?? DEFAULT_H;
    const w = Math.min(MAX_W, Math.max(MIN_W, Math.round(wRaw)));
    const h = Math.min(MAX_H, Math.max(MIN_H, Math.round(hRaw)));
    filledOverrides[id] = { w, h, color, ...(existing?.label ? { label: existing.label } : {}) };
  });

  const scene: Scene = SCENES.includes(saved.scene as Scene) ? (saved.scene as Scene) : DEFAULT_SCENE;
  const rawOpacity = typeof saved.tileOpacity === 'number' ? saved.tileOpacity : DEFAULT_OPACITY;
  const tileOpacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, rawOpacity));
  const customAccent = typeof saved.customAccent === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(saved.customAccent)
    ? saved.customAccent
    : DEFAULT_CUSTOM_ACCENT;

  // Spodní lišta: každý slot musí být buď 'home' (vždy platné), nebo modul,
  // na který má uživatel právo — jinak spadne na výchozí volbu pro ten slot.
  const savedDock = Array.isArray(saved.dock) ? (saved.dock as Page[]) : [];
  const dock: Page[] = DEFAULT_DOCK.map((fallback, i) => {
    const candidate = savedDock[i];
    if (candidate === 'home' || (candidate && visibleSet.has(candidate))) return candidate;
    return fallback;
  });

  const fixedColors = (saved.fixedColors && typeof saved.fixedColors === 'object' ? saved.fixedColors : {}) as Partial<Record<string, string>>;

  return { pages, overrides: filledOverrides, scene, tileOpacity, customAccent, dock, hidden, fixedColors };
}

export async function saveHomeLayout(userId: string, layout: HomeLayout): Promise<void> {
  await supabase.from('profiles').update({ home_layout: layout as any }).eq('id', userId);
}

/** Přidá prázdnou stránku na konec. */
export function addPage(layout: HomeLayout): HomeLayout {
  return { ...layout, pages: [...layout.pages, []] };
}

/** Smaže stránku a její dlaždice přesune do předchozí (nebo první, pokud mazaná je 0.). Poslední stránka nejde smazat. */
export function removePage(layout: HomeLayout, pageIndex: number): HomeLayout {
  if (layout.pages.length <= 1) return layout;
  const pages = layout.pages.map((p) => [...p]);
  const [removed] = pages.splice(pageIndex, 1);
  const mergeInto = Math.max(0, pageIndex - 1);
  pages[mergeInto] = [...pages[mergeInto], ...removed];
  return { ...layout, pages };
}

/** Přesune dlaždici na jinou stránku (na konec cílové stránky). */
export function moveTileToPage(layout: HomeLayout, tileId: Page, targetPageIndex: number): HomeLayout {
  if (!layout.pages[targetPageIndex]) return layout;
  const pages = layout.pages.map((p) => p.filter((id) => id !== tileId));
  pages[targetPageIndex] = [...pages[targetPageIndex], tileId];
  return { ...layout, pages };
}

/** Schová dlaždici z mřížky (modul zůstává dostupný jinde, jen nezabírá místo v launcheru). */
export function hideTile(layout: HomeLayout, tileId: Page): HomeLayout {
  const pages = layout.pages.map((p) => p.filter((id) => id !== tileId));
  return { ...layout, pages, hidden: [...layout.hidden, tileId] };
}

/** Vrátí schovanou dlaždici zpátky na konec první stránky. */
export function unhideTile(layout: HomeLayout, tileId: Page): HomeLayout {
  const pages = layout.pages.map((p, i) => (i === 0 ? [...p, tileId] : p));
  return { ...layout, pages, hidden: layout.hidden.filter((id) => id !== tileId) };
}
