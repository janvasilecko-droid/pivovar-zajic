// Přizpůsobitelný launcher (domovská obrazovka) — pořadí, velikost, barva
// dlaždic a zvolená barevná scéna pozadí, uložené v profiles.home_layout
// (jsonb, per uživatel, synchronizuje se napříč zařízeními).
import type { Page } from '../components/Layout';
import { getCountdowns, saveCountdowns, type CountdownTimer } from './stopwatchTimers';
import { getHomeNotes, saveHomeNotes, type HomeNote } from './homeNotes';
import { queueHomeLayoutPatch } from './profileSync';

// Víc odstínů na barvu (modré/zelené/červené/oranžové/fialové po 6-8), ať jde
// tematicky odlišit skupiny dlaždic barvou (např. "vše z pivovaru" modře,
// "odběry" zeleně…), ne jen jeden pevný odstín na barvu.
export type TileColor =
  | 'coral' | 'amber2' | 'citrus' | 'mint' | 'sky' | 'indigo' | 'orchid' | 'forest' | 'plum'
  | 'rose' | 'teal' | 'lime' | 'slate' | 'gold' | 'crimson'
  | 'azure' | 'cobalt' | 'navy' | 'periwinkle'
  | 'emerald' | 'sage' | 'olive' | 'jade'
  | 'salmon' | 'ruby' | 'maroon' | 'blush'
  | 'tangerine' | 'honey' | 'peach' | 'mustard'
  | 'lavender' | 'violet' | 'grape' | 'magenta'
  | 'charcoal';
export type Scene = 'warm' | 'sunset' | 'ocean' | 'forest' | 'night' | 'white' | 'sky' | 'mint' | 'lavender' | 'slate' | 'custom';

// Barva dlaždice může být buď jméno přednastaveného odstínu (TileColor), nebo
// libovolný hex ("#rrggbb") z vlastního výběru barvy — proto plain string.
// w/h = libovolná velikost dlaždice (ne pár pevných předvoleb): w je šířka v
// jednotkách po UNIT_COLS sloupcích mřížky (0 = "mini" dlaždice, viz MAX_W),
// h je výška v řádcích mřížky (viz MAX_H) — uživatel si tak důležité dlaždice
// může zvětšit a nedůležité zmenšit prakticky libovolně.
// x/y = VOLNÁ pozice dlaždice v mřížce (sloupec/řádek, 0-indexováno, x v
// SUROVÝCH sloupcích, ne v UNIT_COLS jednotkách) — dlaždici jde přetáhnout na
// libovolnou volnou buňku, i s mezerou kolem (žádné automatické "husté"
// slepování jako dřív). Chybí-li x/y (starý layout, nebo nová dlaždice), určí
// je `ensurePositions` při načtení/uložení — viz níže.
export type TileOverride = { w?: number; h?: number; color?: string; label?: string; x?: number; y?: number };

/** Syntetické id skupinové dlaždice (viz `groups`) — jinak normální dlaždice má id = Page. */
export type GroupId = `grp_${string}`;
/** Syntetické id dlaždice vlastního odpočtu (např. cd_t_123) */
export type CountdownTileId = `cd_${string}`;
/** Cokoliv, co může sedět jako jeden prvek v `pages[i]`: reálná stránka, skupina, nebo vlastní odpočet. */
export type TileId = Page | GroupId | CountdownTileId;

export function isGroupId(id: string): id is GroupId {
  return id.startsWith('grp_');
}

export function isCountdownId(id: string): id is CountdownTileId {
  return id.startsWith('cd_');
}

/** Skupina víc dlaždic sloučených do jedné ("složka", styl Windows Phone/iOS). Vzhled
 *  (label/barva/velikost) skupiny se řeší přes stávající `overrides[groupId]` — žádný
 *  nový typ navíc. */
export type TileGroup = { memberIds: Page[] };

export type HomeLayout = {
  /** Víc stránek launcheru (jako Android home screen) — každá je pole id dlaždic
   *  (reálná stránka, nebo `grp_*` skupina, viz TileId). */
  pages: TileId[][];
  overrides: Partial<Record<TileId, TileOverride>>;
  /** Skupinové dlaždice (id → seznam členů), viz mergeTiles/addToGroup/removeFromGroup. */
  groups: Record<GroupId, TileGroup>;
  scene: Scene;
  /** Vlastní barva pozadí (hex), použije se jen když scene === 'custom'. */
  customAccent: string;
  /** Průhlednost skleněných dlaždic (viz MIN/MAX_OPACITY) — jako "Full Screen Picture" efekt na WP */
  tileOpacity: number;
  /** Mezera mezi dlaždicemi v px (viz MIN/MAX_TILE_GAP). */
  tileGap: number;
  /** 4 zástupci ve spodní mobilní liště (Layout.tsx) — 'home' je vždy platná volba. */
  dock: Page[];
  /** Dlaždice schované z mřížky (modul zůstává dostupný, jen nezabírá místo). */
  hidden: TileId[];
  /** Vlastní barvy pevných utilitních dlaždic (Hledat, Odhlásit se...), klíč = FixedTileKey. */
  fixedColors: Partial<Record<string, string>>;
  /** Synchronizované odpočty/časovače mezi zařízeními. */
  countdowns?: CountdownTimer[];
  /** Synchronizované rychlé poznámky mezi zařízeními. */
  notes?: HomeNote[];
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

/** Barva popisku/ikony dlaždice podle jasu jejího podkladu — stejný vzorec
 *  jako beerText() v lib/supabase.ts. Natvrdo bílý text (dřív .hs-tile color:
 *  #fff bez ohledu na barvu) byl na světlých odstínech (citrus, honey, peach,
 *  mustard, blush, lime, sage, lavender...) špatně čitelný, zvlášť nad
 *  taky světlejšími scénami pozadí (bílá/modrá/máta/levandule/šedá). */
export function tileTextColor(hex: string): string {
  const h = (hex || '').replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#fff';
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 0.55 ? '#fff' : '#2b2438';
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

// Počet sloupců mřížky podle šířky obrazovky — musí odpovídat HomeScreen.css
// (.hs-grid / .hs-fixed-row grid-template-columns + media query) a
// HomeScreen.tsx (výpočet cílové buňky při přetažení). MOBILE_BREAKPOINT_PX
// je stejná hranice jako v CSS `@media (max-width: 640px)`.
export const GRID_COLS_DESKTOP = 18;
export const GRID_COLS_MOBILE = 12;
export const MOBILE_BREAKPOINT_PX = 640;
// Výška jednoho řádku mřížky v px — musí odpovídat HomeScreen.css
// (.hs-grid grid-auto-rows), potřeba v HomeScreen.tsx pro přepočet
// souřadnice myši/prstu na buňku při přetažení.
export const ROW_HEIGHT_DESKTOP = 84;
export const ROW_HEIGHT_MOBILE = 74;

// Zpětná kompatibilita se starým formátem override.size (pár pevných
// předvoleb) — dřív uložené hodnoty se při načtení převedou na w/h.
const LEGACY_SIZE_TO_WH: Record<string, { w: number; h: number }> = {
  sm: { w: 0, h: 1 }, n: { w: 1, h: 1 }, w2: { w: 2, h: 1 }, h2: { w: 1, h: 2 }, w2h2: { w: 2, h: 2 },
};

// Seskupené podle barevné rodiny (modré, zelené, červené/růžové,
// oranžové/žluté, fialové, neutrální) — ve výběru pak jdou "varianty jedné
// barvy" najít vedle sebe, ne rozházené náhodně.
export const TILE_COLORS: TileColor[] = [
  'sky', 'azure', 'cobalt', 'navy', 'indigo', 'periwinkle',
  'mint', 'forest', 'lime', 'emerald', 'sage', 'olive', 'jade', 'teal',
  'coral', 'rose', 'crimson', 'salmon', 'ruby', 'maroon', 'blush',
  'amber2', 'citrus', 'gold', 'tangerine', 'honey', 'peach', 'mustard',
  'orchid', 'plum', 'lavender', 'violet', 'grape', 'magenta',
  'slate', 'charcoal',
];
export const SCENES: Scene[] = ['warm', 'sunset', 'ocean', 'forest', 'night', 'white', 'sky', 'mint', 'lavender', 'slate', 'custom'];
const DEFAULT_CUSTOM_ACCENT = '#ff6b6b';

// Plné (neprůhledné) odstíny pro barevné tečky ve výběru — samotná dlaždice
// pak stejnou barvu použije poloprůhledně (viz HomeScreen.css .hs-tile.c-*).
export const COLOR_HEX: Record<TileColor, string> = {
  coral: '#ff6b6b', amber2: '#ffa94d', citrus: '#ffd43b', mint: '#38d9a9',
  sky: '#4dabf7', indigo: '#7c5cff', orchid: '#e066b0', forest: '#2f9e64', plum: '#6a3fa0',
  rose: '#f5487f', teal: '#0ca5b0', lime: '#82c91e', slate: '#495464', gold: '#d4a017', crimson: '#c1121f',
  azure: '#339af0', cobalt: '#1c7ed6', navy: '#1864ab', periwinkle: '#748ffc',
  emerald: '#0ca678', sage: '#69db7c', olive: '#5c940d', jade: '#12b886',
  salmon: '#ff8787', ruby: '#e03131', maroon: '#a61e4d', blush: '#faa2c1',
  tangerine: '#fd7e14', honey: '#f59f00', peach: '#ffc078', mustard: '#e8a53a',
  lavender: '#9775fa', violet: '#7048e8', grape: '#ae3ec9', magenta: '#d6336c',
  charcoal: '#343a40',
};

// Výchozí barva dlaždice, dokud si ji uživatel sám nepřebarví — dlaždice
// časovačů/odpočtů (Časovač, Stopky, Stočení sudu i vlastní připnuté
// odpočty cd_*) dostanou jinou barvu než zbytek launcheru, ať jsou na
// první pohled odlišitelné od běžných dlaždic.
export function defaultTileColor(id: string): TileColor {
  if (id === 'timer' || id === 'stopwatch' || id === 'keg_timer' || isCountdownId(id)) return 'indigo';
  return 'coral';
}

// Výchozí velikost pro dlaždice — standardně jednotné čtvercové dlaždice 1x1,
// které tvoří čistou, zarovnanou a přehlednou mřížku. Uživatel si je v edit módu
// může dle potřeby libovolně zvětšit nebo zmenšit.
const DEFAULT_SIZE: Partial<Record<Page, { w: number; h: number }>> = {};

export const DEFAULT_DOCK: Page[] = ['orders', 'kegging', 'bottling', 'home'];
export const DOCK_SIZE = DEFAULT_DOCK.length;
// Počet slotů spodní lišty jde měnit (viz addDockSlot/removeDockSlot) — MIN,
// ať lišta nikdy nezůstane prázdná/zbytečná, MAX, ať se na mobilu nenacpe
// tolik zástupců, že by byli nečitelně malí.
export const MIN_DOCK = 2;
export const MAX_DOCK = 6;

const DEFAULT_SCENE: Scene = 'warm';
const DEFAULT_OPACITY = 0.62;
export const MIN_OPACITY = 0.3;
export const MAX_OPACITY = 0.9;

const DEFAULT_TILE_GAP = 4;
export const MIN_TILE_GAP = 0;
export const MAX_TILE_GAP = 16;

// Výchozí barva dlaždice podle KATEGORIE (skupiny z NAV/EXTRA_NAV v
// Layout.tsx: Výroba/Pivovar/Nástroje/Číselníky/Nastavení) — dlaždice ze
// stejné kategorie mají stejnou barvu, ať se v launcheru na první pohled
// pozná, co kam patří. Platí jen dokud si uživatel barvu dané dlaždice sám
// nezmění (viz getHomeLayout — `existing?.color ?? defaultColorFor(...)`).
// Duplikuje přiřazení kategorie z Layout.tsx NAV/EXTRA_NAV (group), protože
// homeLayout.ts je importováno DO Layout.tsx — opačný import by byl cyklický.
export type Category = 'Výroba' | 'Pivovar' | 'Nástroje' | 'Číselníky' | 'Nastavení';
export const CATEGORY_ORDER: Category[] = ['Výroba', 'Pivovar', 'Nástroje', 'Číselníky', 'Nastavení'];
export const CATEGORY_COLOR: Record<Category, TileColor> = {
  'Výroba': 'amber2',
  'Pivovar': 'teal',
  'Nástroje': 'indigo',
  'Číselníky': 'forest',
  'Nastavení': 'slate',
};
// Víc odstínů stejné barevné rodiny na kategorii (viz TILE_COLORS výš) — pro
// seznam "Přidat dlaždici" (QuickSearchModal), kde má každá položka vlastní
// odstín, ale barevná rodina hned prozradí kategorii; první odstín v každém
// poli odpovídá CATEGORY_COLOR, ať je to konzistentní s hlavní mřížkou.
export const CATEGORY_SHADES: Record<Category, TileColor[]> = {
  'Výroba': ['amber2', 'citrus', 'gold', 'tangerine', 'honey', 'peach', 'mustard'],
  'Pivovar': ['teal', 'mint', 'emerald', 'jade', 'sky', 'azure'],
  'Nástroje': ['indigo', 'cobalt', 'navy', 'periwinkle', 'violet', 'plum'],
  'Číselníky': ['forest', 'sage', 'olive', 'lime'],
  'Nastavení': ['slate', 'charcoal'],
};
export const PAGE_CATEGORY: Partial<Record<Page, Category>> = {
  // Výroba
  kegging: 'Výroba', bottling: 'Výroba', orders: 'Výroba', fasovani: 'Výroba', prodejna: 'Výroba',
  writeoffs: 'Výroba', akce: 'Výroba', vycepy: 'Výroba', orders_zavoz: 'Výroba', zavoz: 'Výroba',
  exkurze: 'Výroba', bottling_entry: 'Výroba', bottling_overview: 'Výroba', orders_entry: 'Výroba', orders_detail: 'Výroba', orders_celkem: 'Výroba',
  // Pivovar
  dashboard: 'Pivovar', sklo_promo: 'Pivovar', cellar: 'Pivovar', bottling_needs: 'Pivovar', inventory: 'Pivovar', history: 'Pivovar', stock: 'Pivovar',
  // Nástroje
  concentration: 'Nástroje', calendar: 'Nástroje', haccp: 'Nástroje', vehicles: 'Nástroje', kniha_jizd: 'Nástroje',
  sanitace_lahve: 'Nástroje', sanitace_kegy: 'Nástroje', sanitace_vycepy: 'Nástroje', sanitace: 'Nástroje',
  checklists: 'Nástroje', sanitation_log: 'Nástroje', reminders: 'Nástroje', notes: 'Nástroje', feedback: 'Nástroje',
  stopwatch: 'Nástroje', timer: 'Nástroje', keg_timer: 'Nástroje', srotovani: 'Nástroje', radio: 'Nástroje',
  // Číselníky
  depozitar: 'Číselníky', places: 'Číselníky', beers: 'Číselníky', packages: 'Číselníky', pricelist: 'Číselníky',
  // Nastavení
  users: 'Nastavení', app_settings: 'Nastavení', app_versions: 'Nastavení', signout: 'Nastavení',
};
const FALLBACK_CYCLE: TileColor[] = ['indigo', 'orchid', 'forest', 'plum', 'citrus'];

function defaultColorFor(id: TileId, indexInFallback: number): TileColor {
  const category = PAGE_CATEGORY[id as Page];
  if (category) return CATEGORY_COLOR[category];
  return FALLBACK_CYCLE[indexInFallback % FALLBACK_CYCLE.length];
}

/**
 * Ověří/vyřeší jedno id z uloženého `pages`/`hidden` pole proti aktuální
 * množině povolených stránek (`fullVisibleSet`). Skupina (grp_*) se ověří
 * podle svých členů: chybějící/nepovolené členy vypustí, skupinu s 0 členy
 * zahodí úplně, s 1 členem rozpustí (vrátí se jen ten člen jako obyčejná
 * dlaždice — stejně jako složka s jednou ikonou na iOS/WP nedává smysl).
 * `seen` zajišťuje, že dlaždice (nebo člen skupiny) se v layoutu nikdy
 * neobjeví na dvou místech zároveň (hidden i pages, nebo ve dvou skupinách).
 */
function resolveTileId(
  id: string,
  rawGroups: Record<string, { memberIds?: unknown }>,
  fullVisibleSet: Set<Page>,
  seen: Set<string>,
  resolvedGroups: Record<GroupId, TileGroup>,
): TileId | null {
  if (seen.has(id)) return null;
  if (isGroupId(id)) {
    const raw = rawGroups[id];
    const members = (Array.isArray(raw?.memberIds) ? (raw!.memberIds as unknown[]) : [])
      .filter((m): m is Page => typeof m === 'string' && (fullVisibleSet.size === 0 || fullVisibleSet.has(m as Page)) && !seen.has(m));
    seen.add(id);
    if (members.length === 0) return null;
    members.forEach((m) => seen.add(m));
    if (members.length === 1) return members[0];
    resolvedGroups[id] = { memberIds: members };
    return id;
  }
  if (isCountdownId(id)) {
    seen.add(id);
    return id;
  }
  if (fullVisibleSet.size > 0 && !fullVisibleSet.has(id as Page)) return null;
  seen.add(id);
  return id as Page;
}

/** Šířka dlaždice v surových sloupcích mřížky (w=0 "mini" dlaždice = 1 sloupec). */
function widthCols(w: number): number {
  return w === 0 ? 1 : w * UNIT_COLS;
}

/**
 * Najde první volnou buňku (řádkově, jako dřívější "husté" balení), kam se
 * vejde obdélník `w`×`h` sloupců/řádků, aniž by přesahoval `cols` a aniž by
 * kolidoval s `occupied`. Používá se jak pro počáteční umístění dlaždic bez
 * uložené pozice (viz ensurePositions), tak při přesunu do obsazené buňky.
 */
function findFreeCell(occupied: Set<string>, w: number, h: number, cols: number, startY = 0): { x: number; y: number } {
  const width = Math.max(1, Math.min(w, cols));
  for (let y = startY; y < startY + 2000; y++) {
    for (let x = 0; x <= cols - width; x++) {
      let free = true;
      for (let dx = 0; dx < width && free; dx++) {
        for (let dy = 0; dy < h && free; dy++) {
          if (occupied.has(`${x + dx},${y + dy}`)) free = false;
        }
      }
      if (free) return { x, y };
    }
  }
  return { x: 0, y: startY };
}

function occupyCell(occupied: Set<string>, x: number, y: number, w: number, h: number) {
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) occupied.add(`${x + dx},${y + dy}`);
}

function rectOverlapsOccupied(occupied: Set<string>, x: number, y: number, w: number, h: number): boolean {
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) {
    if (occupied.has(`${x + dx},${y + dy}`)) return true;
  }
  return false;
}

/**
 * Doplní chybějící/neplatné x,y souřadnice dlaždic na každé stránce — dřív
 * (nebo na jiném zařízení s jiným počtem sloupců) neumístěné dlaždice se
 * "husle" zabalí za ty, co už platnou pozici mají (pořadí podle `pages[i]`,
 * stejně jako se dřív celá mřížka balila automaticky). Jakmile má dlaždice
 * jednou platné x,y, `ensurePositions` ji tam nechává — přesune se jen
 * výslovně přes moveTileToCell/stepTileCell (drag, šipky). Tak jde dlaždici
 * nechat stát na místě i s prázdnými buňkami kolem ("vložit kamkoliv po
 * ploše"), místo aby ji husté balení vždycky přitáhlo zpátky k ostatním.
 */
export function ensurePositions(layout: HomeLayout, cols: number): HomeLayout {
  const overrides = { ...layout.overrides };
  const pages = layout.pages.map((pageTiles) => {
    const occupied = new Set<string>();
    const missing: TileId[] = [];
    // 1. kolo — zabrat buňky dlaždic, co už mají platnou pozici (v mezích
    // mřížky A bez kolize s dřív zpracovanou dlaždicí stejné stránky —
    // kolidující se přebalí, aby nikdy nevznikl reálný překryv).
    pageTiles.forEach((id) => {
      const o = overrides[id];
      const w = widthCols(o?.w ?? DEFAULT_W);
      const h = o?.h ?? DEFAULT_H;
      const inBounds = typeof o?.x === 'number' && typeof o?.y === 'number' && o.x >= 0 && o.y >= 0 && o.x + w <= cols;
      if (inBounds && !rectOverlapsOccupied(occupied, o!.x!, o!.y!, w, h)) occupyCell(occupied, o!.x!, o!.y!, w, h);
      else missing.push(id);
    });
    // 2. kolo — dobalit ty bez platné pozice do první volné díry.
    missing.forEach((id) => {
      const o = overrides[id] ?? {};
      const w = widthCols(o.w ?? DEFAULT_W);
      const h = o.h ?? DEFAULT_H;
      const cell = findFreeCell(occupied, w, h, cols);
      occupyCell(occupied, cell.x, cell.y, w, h);
      overrides[id] = { ...o, x: cell.x, y: cell.y };
    });
    return pageTiles;
  });
  return { ...layout, pages, overrides };
}

/**
 * Přesune dlaždici na konkrétní buňku (drag-and-drop i šipky). Cíl se ořízne
 * do mezí mřížky. Pokud je cílová buňka obsazená jinou dlaždicí, obě si
 * jednoduše vymění pozice (žádné přeskupování zbytku mřížky) — jinak se
 * dlaždice přesune přesně tam, kam ukazuješ, klidně s prázdnem kolem.
 */
export function moveTileToCell(layout: HomeLayout, id: TileId, targetX: number, targetY: number, cols: number): HomeLayout {
  const pageIndex = layout.pages.findIndex((p) => p.includes(id));
  if (pageIndex < 0) return layout;
  const current = layout.overrides[id];
  const w = widthCols(current?.w ?? DEFAULT_W);
  const h = current?.h ?? DEFAULT_H;
  const x = Math.max(0, Math.min(targetX, cols - w));
  const y = Math.max(0, targetY);
  if (current?.x === x && current?.y === y) return layout;

  const pageTiles = layout.pages[pageIndex];
  const overrides = { ...layout.overrides };
  // Najde dlaždici, jejíž obdélník s cílem koliduje (nejvýš jedna smysluplná — v editu se vždy staví z bezkolizního stavu).
  const collidingId = pageTiles.find((otherId) => {
    if (otherId === id) return false;
    const o = overrides[otherId];
    if (!o || typeof o.x !== 'number' || typeof o.y !== 'number') return false;
    const ow = widthCols(o.w ?? DEFAULT_W);
    const oh = o.h ?? DEFAULT_H;
    return x < o.x + ow && x + w > o.x && y < o.y + oh && y + h > o.y;
  });

  if (collidingId) {
    const collidingOverride = overrides[collidingId] ?? {};
    overrides[collidingId] = { ...collidingOverride, x: current?.x ?? 0, y: current?.y ?? 0 };
  }
  overrides[id] = { ...current, x, y };
  return { ...layout, overrides };
}

/** Posune dlaždici o jednu buňku daným směrem (záložní šipky v edit módu) — stejná logika (výměna při kolizi) jako moveTileToCell. */
export function stepTileCell(layout: HomeLayout, id: TileId, direction: 'left' | 'right' | 'up' | 'down', cols: number): HomeLayout {
  const current = layout.overrides[id];
  const x = current?.x ?? 0;
  const y = current?.y ?? 0;
  const targetX = direction === 'left' ? x - 1 : direction === 'right' ? x + 1 : x;
  const targetY = direction === 'up' ? y - 1 : direction === 'down' ? y + 1 : y;
  if (targetX < 0 || targetY < 0) return layout;
  return moveTileToCell(layout, id, targetX, targetY, cols);
}

/**
 * Slučuje uloženou vrstvu (stránky/velikost/barva/scéna) se seznamem aktuálně
 * viditelných dlaždic (po filtraci právy). Nově přidané/nově povolené moduly
 * (`visibleIds`) se připojí na konec poslední stránky; moduly, na které
 * uživatel ztratil právo nebo které zmizely, se ze stránek vypustí. `extraIds`
 * jsou dlaždice, které jsou taky platné/dostupné, ale NEpřidávají se
 * automaticky — musí je uživatel ručně přidat (viz `addTile`), typicky
 * záložky uvnitř jiných obrazovek (Kniha jízd, Ceník…). Čte i starý formát
 * (plochý `order`) pro zpětnou kompatibilitu s dřívějším jednostránkovým
 * layoutem.
 */
export function getHomeLayout(raw: unknown, visibleIds: Page[], extraIds: Page[] = [], cols: number = GRID_COLS_DESKTOP): HomeLayout {
  const saved = (raw && typeof raw === 'object' ? raw : {}) as Partial<HomeLayout> & { order?: Page[] };
  const fullVisibleSet = new Set<Page>([...visibleIds, ...extraIds]);
  const rawGroups = (saved.groups && typeof saved.groups === 'object' ? saved.groups : {}) as Record<string, { memberIds?: unknown }>;
  const resolvedGroups: Record<GroupId, TileGroup> = {};
  const seen = new Set<string>();

  // Schované dlaždice (odstraněné z mřížky, ale modul zůstává dostupný) —
  // nesmí se znovu automaticky připojit mezi "nové" jen proto, že nejsou
  // zrovna na žádné stránce. Zpracovává se první, ať má přednost před
  // případným duplicitním výskytem téhož id ve `pages`.
  const rawHidden: string[] = Array.isArray(saved.hidden) ? (saved.hidden as string[]) : [];
  const hidden: TileId[] = rawHidden
    .map((id) => resolveTileId(id, rawGroups, fullVisibleSet, seen, resolvedGroups))
    .filter((id): id is TileId => id !== null);
  const hiddenSet = new Set(hidden);

  const rawPages: string[][] = Array.isArray(saved.pages) && saved.pages.every((p) => Array.isArray(p))
    ? (saved.pages as string[][])
    : Array.isArray(saved.order) // zpětná kompatibilita se starým plochým "order"
      ? [saved.order as string[]]
      : [];

  const pages: TileId[][] = rawPages.map((p) => p
    .map((id) => resolveTileId(id, rawGroups, fullVisibleSet, seen, resolvedGroups))
    .filter((id): id is TileId => id !== null));

  const newIds = visibleIds.filter((id) => !seen.has(id) && !hiddenSet.has(id));
  if (pages.length === 0) pages.push([]);
  if (newIds.length > 0) pages[pages.length - 1] = [...pages[pages.length - 1], ...newIds];

  const overrides = (saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {}) as Partial<Record<TileId, TileOverride>>;

  let fallbackIdx = 0;
  const filledOverrides: Partial<Record<TileId, TileOverride>> = {};
  pages.flat().forEach((id) => {
    const existing = overrides[id] as (TileOverride & { size?: string }) | undefined;
    const color = existing?.color ?? defaultColorFor(id, fallbackIdx);
    if (!existing?.color) fallbackIdx += 1;
    const legacy = typeof existing?.size === 'string' ? LEGACY_SIZE_TO_WH[existing.size] : undefined;
    const wRaw = existing?.w ?? legacy?.w ?? DEFAULT_SIZE[id as Page]?.w ?? DEFAULT_W;
    const hRaw = existing?.h ?? legacy?.h ?? DEFAULT_SIZE[id as Page]?.h ?? DEFAULT_H;
    const w = Math.min(MAX_W, Math.max(MIN_W, Math.round(wRaw)));
    const h = Math.min(MAX_H, Math.max(MIN_H, Math.round(hRaw)));
    const hasPos = typeof existing?.x === 'number' && typeof existing?.y === 'number';
    filledOverrides[id] = {
      w, h, color,
      ...(existing?.label ? { label: existing.label } : {}),
      ...(hasPos ? { x: existing!.x, y: existing!.y } : {}),
    };
  });

  const scene: Scene = SCENES.includes(saved.scene as Scene) ? (saved.scene as Scene) : DEFAULT_SCENE;
  const rawOpacity = typeof saved.tileOpacity === 'number' ? saved.tileOpacity : DEFAULT_OPACITY;
  const tileOpacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, rawOpacity));
  const rawGap = typeof saved.tileGap === 'number' ? saved.tileGap : DEFAULT_TILE_GAP;
  const tileGap = Math.min(MAX_TILE_GAP, Math.max(MIN_TILE_GAP, rawGap));
  const customAccent = typeof saved.customAccent === 'string' && /^#[0-9a-fA-F]{3,6}$/.test(saved.customAccent)
    ? saved.customAccent
    : DEFAULT_CUSTOM_ACCENT;

  // Spodní lišta: počet slotů je teď volitelný (MIN_DOCK–MAX_DOCK, ne napevno
  // 4) — viz addDockSlot/removeDockSlot. Každý slot musí být buď 'home' (vždy
  // platné), nebo modul, na který má uživatel právo — jinak spadne na 'home'.
  const rawSavedDock = Array.isArray(saved.dock) && saved.dock.length > 0 ? (saved.dock as Page[]) : DEFAULT_DOCK;
  // Auto-oprava: pokud se dříve poškozením do profilu uložily samé 'home' ikony, obnovíme výchozí lištu.
  const isAllHome = rawSavedDock.length > 1 && rawSavedDock.every((d) => d === 'home');
  const savedDock = isAllHome ? DEFAULT_DOCK : rawSavedDock;
  const dockLen = Math.min(MAX_DOCK, Math.max(MIN_DOCK, savedDock.length));
  const dock: Page[] = Array.from({ length: dockLen }, (_, i) => {
    const candidate = savedDock[i] ?? DEFAULT_DOCK[i % DEFAULT_DOCK.length];
    return candidate === 'home' || fullVisibleSet.size === 0 || fullVisibleSet.has(candidate) ? candidate : 'home';
  });

  const fixedColors = (saved.fixedColors && typeof saved.fixedColors === 'object' ? saved.fixedColors : {}) as Partial<Record<string, string>>;

  // Synchronizace odpočtů a poznámek z profilu do lokálního stavu
  if (Array.isArray(saved.countdowns) && saved.countdowns.length > 0) {
    try {
      const local = getCountdowns();
      if (JSON.stringify(local) !== JSON.stringify(saved.countdowns)) {
        saveCountdowns(saved.countdowns);
      }
    } catch {}
  }
  if (Array.isArray(saved.notes) && saved.notes.length > 0) {
    try {
      const local = getHomeNotes();
      if (JSON.stringify(local) !== JSON.stringify(saved.notes)) {
        saveHomeNotes(saved.notes);
      }
    } catch {}
  }

  const layout: HomeLayout = {
    pages,
    overrides: filledOverrides,
    groups: resolvedGroups,
    scene,
    tileOpacity,
    tileGap,
    customAccent,
    dock,
    hidden,
    fixedColors,
    countdowns: saved.countdowns || getCountdowns(),
    notes: saved.notes || getHomeNotes(),
  };
  return ensureTrailingEmptyPage(ensurePositions(layout, cols));
}

export async function saveHomeLayout(userId: string, layout: HomeLayout): Promise<void> {
  // `userId` se dřív používalo přímo pro dotaz — teď ho za appku zjišťuje
  // queueHomeLayoutPatch (vždy podle AKTUÁLNĚ přihlášeného uživatele), ale
  // parametr zůstává v signatuře, ať volající kód nemusí měnit (a ať volání
  // nejde omylem použít bez přihlášení).
  void userId;
  queueHomeLayoutPatch({
    ...layout,
    countdowns: getCountdowns(),
    notes: getHomeNotes(),
  });
}

/** Přidá další slot do spodní lišty (výchozí 'home', uživatel si ho pak přenastaví). */
export function addDockSlot(layout: HomeLayout): HomeLayout {
  if (layout.dock.length >= MAX_DOCK) return layout;
  return { ...layout, dock: [...layout.dock, 'home'] };
}

/** Odebere slot spodní lišty — lišta musí mít vždy aspoň MIN_DOCK slotů. */
export function removeDockSlot(layout: HomeLayout, index: number): HomeLayout {
  if (layout.dock.length <= MIN_DOCK) return layout;
  return { ...layout, dock: layout.dock.filter((_, i) => i !== index) };
}

/**
 * Přebarví všechny dlaždice s definovanou kategorií (viz PAGE_CATEGORY) na
 * barvu jejich kategorie — i ty, co už mají uloženou VLASTNÍ barvu (na
 * rozdíl od `defaultColorFor`, která se použije jen když barva chybí úplně).
 * Spouští se ručně tlačítkem v edit módu ("Sjednotit barvy"), ne
 * automaticky — jinak by přepisovala barvu i tomu, kdo si dlaždici schválně
 * přebarvil jinak. Skupinové dlaždice (grp_*) se nechávají beze změny,
 * protože můžou mít členy z různých kategorií. Dlaždice bez kategorie
 * (FALLBACK_CYCLE) se taky nechávají beze změny.
 */
export function unifyColorsByCategory(layout: HomeLayout): HomeLayout {
  const overrides = { ...layout.overrides };
  let changed = false;
  layout.pages.flat().forEach((id) => {
    if (isGroupId(id)) return;
    const category = PAGE_CATEGORY[id as Page];
    if (!category) return;
    const color = CATEGORY_COLOR[category];
    if (overrides[id]?.color === color) return;
    overrides[id] = { ...overrides[id], color };
    changed = true;
  });
  return changed ? { ...layout, overrides } : layout;
}

/** Přidá prázdnou stránku na konec. */
export function addPage(layout: HomeLayout): HomeLayout {
  return { ...layout, pages: [...layout.pages, []] };
}

/**
 * Garantuje, že poslední stránka je vždy prázdná (styl Android launcheru) —
 * kamkoliv doděláš dlaždici, hned za ní čeká další volná plocha k zaplnění.
 * Jen PŘIDÁVÁ prázdnou stránku, když se ta poslední zaplní — nikdy žádnou
 * neruší/neslučuje (i ručně přidaná stránka přes "Přidat stránku" má zůstat,
 * jinak by ji `persist` o zlomek vteřiny později zase smazal). Volá se v
 * `getHomeLayout` (při načtení) i v `persist` po každé změně (HomeScreen.tsx).
 */
export function ensureTrailingEmptyPage(layout: HomeLayout): HomeLayout {
  let pages = layout.pages;
  if (pages.length === 0) pages = [[]];
  if (pages[pages.length - 1].length > 0) pages = [...pages, []];
  return pages === layout.pages ? layout : { ...layout, pages };
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

/** Přesune dlaždici (nebo skupinu) na jinou stránku (na konec cílové stránky). */
export function moveTileToPage(layout: HomeLayout, tileId: TileId, targetPageIndex: number): HomeLayout {
  if (!layout.pages[targetPageIndex]) return layout;
  const pages = layout.pages.map((p) => p.filter((id) => id !== tileId));
  pages[targetPageIndex] = [...pages[targetPageIndex], tileId];
  return { ...layout, pages };
}

/**
 * Přesun dlaždice na JINOU STRÁNKU a rovnou na konkrétní buňku — pro tažení
 * přes okraj obrazovky (viz HomeScreen.tsx). Musí to být jeden krok: kdyby se
 * volalo moveTileToPage a moveTileToCell zvlášť, druhé volání by dostalo
 * layout bez té první změny a dlaždice by skončila na staré pozici.
 *
 * Pozice se z původní stránky nepřenáší — na nové stránce může být obsazená,
 * a padnout „někam pod sebe" je horší než padnout tam, kam ukazuje prst.
 */
export function moveTileToPageCell(
  layout: HomeLayout,
  id: TileId,
  targetPageIndex: number,
  targetX: number,
  targetY: number,
  cols: number,
): HomeLayout {
  if (!layout.pages[targetPageIndex]) return layout;
  const soucasnaStranka = layout.pages.findIndex((p) => p.includes(id));
  if (soucasnaStranka < 0) return layout;
  const naStrance = soucasnaStranka === targetPageIndex
    ? layout
    : moveTileToPage(layout, id, targetPageIndex);
  return moveTileToCell(naStrance, id, targetX, targetY, cols);
}

/** Strana, ke které se dlaždice při tažení dostala. */
export type OkrajTazeni = 'vlevo' | 'vpravo' | null;

/** Jak široký je u okraje pruh, který spustí přepnutí stránky (px). */
export const SIRKA_OKRAJE_PX = 56;

/**
 * U kterého okraje mřížky prst právě je? Tohle je celý vzorec pro přesun
 * dlaždice mezi stránkami tažením — držíš ji u kraje a stránky se přetáčejí,
 * jako na ploše Androidu.
 */
export function okrajProPrepnuti(
  clientX: number,
  rect: { left: number; right: number },
  sirkaZony: number = SIRKA_OKRAJE_PX,
): OkrajTazeni {
  if (clientX <= rect.left + sirkaZony) return 'vlevo';
  if (clientX >= rect.right - sirkaZony) return 'vpravo';
  return null;
}

/**
 * Index stránky po přetočení. Na koncích se zastaví — dokola to schválně
 * nejde: při tažení by se dlaždice po dosažení poslední stránky vrátila na
 * první a člověk by ztratil přehled, kde vlastně je.
 */
export function dalsiStranka(soucasny: number, smer: OkrajTazeni, pocetStranek: number): number {
  if (!smer) return soucasny;
  const posun = smer === 'vpravo' ? 1 : -1;
  return Math.max(0, Math.min(pocetStranek - 1, soucasny + posun));
}

/** Schová dlaždici (nebo skupinu vč. všech členů) z mřížky — modul zůstává dostupný jinde, jen nezabírá místo v launcheru. */
export function hideTile(layout: HomeLayout, tileId: TileId): HomeLayout {
  const pages = layout.pages.map((p) => p.filter((id) => id !== tileId));
  return { ...layout, pages, hidden: [...layout.hidden, tileId] };
}

/** Vrátí schovanou dlaždici zpátky na konec první stránky. */
export function unhideTile(layout: HomeLayout, tileId: TileId): HomeLayout {
  const pages = layout.pages.map((p, i) => (i === 0 ? [...p, tileId] : p));
  return { ...layout, pages, hidden: layout.hidden.filter((id) => id !== tileId) };
}

/** Přidá dosud neumístěnou dlaždici (schovanou, z EXTRA_NAV registru nebo vlastní odpočet) na danou stránku. */
export function addTile(layout: HomeLayout, tileId: TileId, pageIndex: number): HomeLayout {
  if (!layout.pages[pageIndex]) return layout;
  const pages = layout.pages
    .map((p) => p.filter((id) => id !== tileId))
    .map((p, i) => (i === pageIndex ? [...p, tileId] : p));
  return { ...layout, pages, hidden: layout.hidden.filter((id) => id !== tileId) };
}

/** Sloučí dvě samostatné dlaždice do nové skupiny na místě `bId`; skupina zdědí barvu/velikost `bId`. */
export function mergeTiles(layout: HomeLayout, aId: Page, bId: Page, pageIndex: number): HomeLayout {
  if (aId === bId || !layout.pages[pageIndex]) return layout;
  const groupId: GroupId = `grp_${Math.random().toString(36).slice(2, 10)}`;
  const pages = layout.pages.map((p, i) => {
    const withoutA = p.filter((id) => id !== aId);
    if (i !== pageIndex) return withoutA;
    return withoutA.map((id) => (id === bId ? groupId : id));
  });
  const bOverride = layout.overrides[bId];
  return {
    ...layout,
    pages,
    groups: { ...layout.groups, [groupId]: { memberIds: [aId, bId] } },
    overrides: {
      ...layout.overrides,
      [groupId]: {
        label: 'Skupina', color: bOverride?.color ?? 'coral', w: bOverride?.w ?? 1, h: bOverride?.h ?? 1,
        ...(typeof bOverride?.x === 'number' && typeof bOverride?.y === 'number' ? { x: bOverride.x, y: bOverride.y } : {}),
      },
    },
  };
}

/** Přidá další samostatnou dlaždici do už existující skupiny. */
export function addToGroup(layout: HomeLayout, groupId: GroupId, tileId: Page): HomeLayout {
  const group = layout.groups[groupId];
  if (!group || group.memberIds.includes(tileId)) return layout;
  const pages = layout.pages.map((p) => p.filter((id) => id !== tileId));
  return { ...layout, pages, groups: { ...layout.groups, [groupId]: { memberIds: [...group.memberIds, tileId] } } };
}

/** Vyjme jednu dlaždici ze skupiny zpátky na stránku, kde skupina sedí. Skupina se 2 → 1 členem se sama zruší. */
export function removeFromGroup(layout: HomeLayout, groupId: GroupId, tileId: Page): HomeLayout {
  const group = layout.groups[groupId];
  if (!group) return layout;
  const remaining = group.memberIds.filter((id) => id !== tileId);
  if (remaining.length === group.memberIds.length) return layout;
  if (remaining.length <= 1) return deleteGroup(layout, groupId);
  const pageIndex = layout.pages.findIndex((p) => p.includes(groupId));
  if (pageIndex < 0) return layout;
  const pages = layout.pages.map((p, i) => (i === pageIndex ? [...p, tileId] : p));
  return { ...layout, pages, groups: { ...layout.groups, [groupId]: { memberIds: remaining } } };
}

/** Zruší skupinu úplně — všichni členi se vrátí na stránku, kde skupina sedí. */
export function deleteGroup(layout: HomeLayout, groupId: GroupId): HomeLayout {
  const group = layout.groups[groupId];
  if (!group) return layout;
  const pages = layout.pages.map((p) => p.flatMap((id) => (id === groupId ? group.memberIds : [id])));
  const groups = { ...layout.groups };
  delete groups[groupId];
  const overrides = { ...layout.overrides };
  delete overrides[groupId];
  return { ...layout, pages, groups, overrides };
}
