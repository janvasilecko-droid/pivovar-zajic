// Přizpůsobitelný launcher (domovská obrazovka) — pořadí, velikost, barva
// dlaždic a zvolená barevná scéna pozadí, uložené v profiles.home_layout
// (jsonb, per uživatel, synchronizuje se napříč zařízeními).
import { supabase } from './supabase';
import type { Page } from '../components/Layout';

export type TileSize = 'n' | 'w2' | 'h2' | 'w2h2' | 'sm';
export type TileColor =
  | 'coral' | 'amber2' | 'citrus' | 'mint' | 'sky' | 'indigo' | 'orchid' | 'forest' | 'plum'
  | 'rose' | 'teal' | 'lime' | 'slate' | 'gold' | 'crimson';
export type Scene = 'warm' | 'sunset' | 'ocean' | 'forest' | 'night';

export type TileOverride = { size?: TileSize; color?: TileColor };

export type HomeLayout = {
  order: Page[];
  overrides: Partial<Record<Page, TileOverride>>;
  scene: Scene;
  /** Průhlednost skleněných dlaždic (viz MIN/MAX_OPACITY) — jako "Full Screen Picture" efekt na WP */
  tileOpacity: number;
};

export const TILE_SIZES: TileSize[] = ['n', 'w2', 'h2', 'w2h2', 'sm'];
export const TILE_COLORS: TileColor[] = [
  'coral', 'amber2', 'citrus', 'mint', 'sky', 'indigo', 'orchid', 'forest', 'plum',
  'rose', 'teal', 'lime', 'slate', 'gold', 'crimson',
];
export const SCENES: Scene[] = ['warm', 'sunset', 'ocean', 'forest', 'night'];

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
const DEFAULT_SIZE: Partial<Record<Page, TileSize>> = {
  orders: 'w2',
  kegging: 'h2',
  dashboard: 'w2',
  app_settings: 'sm',
  users: 'sm',
  calendar: 'sm',
};

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
 * Slučuje uloženou vrstvu (pořadí/velikost/barva/scéna) se seznamem aktuálně
 * viditelných dlaždic (po filtraci právy). Nově přidané/nově povolené moduly
 * se připojí na konec; moduly, na které uživatel ztratil právo nebo které
 * zmizely, se z pořadí vypustí.
 */
export function getHomeLayout(raw: unknown, visibleIds: Page[]): HomeLayout {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<HomeLayout>;
  const savedOrder = Array.isArray(saved.order) ? (saved.order as Page[]) : [];
  const visibleSet = new Set(visibleIds);

  const order: Page[] = savedOrder.filter((id) => visibleSet.has(id));
  const already = new Set(order);
  visibleIds.forEach((id) => { if (!already.has(id)) order.push(id); });

  const overrides = (saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {}) as Partial<Record<Page, TileOverride>>;

  let fallbackIdx = 0;
  const filledOverrides: Partial<Record<Page, TileOverride>> = {};
  order.forEach((id) => {
    const existing = overrides[id];
    const color = existing?.color ?? defaultColorFor(id, fallbackIdx);
    if (!existing?.color) fallbackIdx += 1;
    const size = existing?.size ?? DEFAULT_SIZE[id];
    filledOverrides[id] = { ...(size ? { size } : {}), color };
  });

  const scene: Scene = SCENES.includes(saved.scene as Scene) ? (saved.scene as Scene) : DEFAULT_SCENE;
  const rawOpacity = typeof saved.tileOpacity === 'number' ? saved.tileOpacity : DEFAULT_OPACITY;
  const tileOpacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, rawOpacity));

  return { order, overrides: filledOverrides, scene, tileOpacity };
}

export async function saveHomeLayout(userId: string, layout: HomeLayout): Promise<void> {
  await supabase.from('profiles').update({ home_layout: layout as any }).eq('id', userId);
}
