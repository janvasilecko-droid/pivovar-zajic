// Domovská obrazovka appky — přizpůsobitelný dlaždicový launcher (styl
// Windows Phone / Nokia Lumia): pořadí, velikost a barva dlaždic i barevné
// pozadí jde v "Upravit rozložení" módu měnit a ukládá se per uživatel
// (profiles.home_layout), takže se to synchronizuje napříč zařízeními.
// Výjimka nad dlaždicemi: upozornění na STK/dálniční známku vozidel —
// zobrazuje se jen komu je nastaveno (Uživatelé → "Dostává upozornění na
// vozidla") a musí ho jednou potvrdit, pak zmizí (dokud se stav nezmění).
import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, MessageCircle, SlidersHorizontal, ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { NAV, EXTRA_NAV, type Page, type NavItem } from '../components/Layout';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import LauncherTile from '../components/LauncherTile';
import { QuickSearchModal } from '../components/QuickSearchModal';
import { Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase, Vehicle } from '../lib/supabase';
import { fetchPendingWhatsAppCount } from '../lib/whatsappApi';
import { getVehicleExpiryStatus } from './Catalogs';
import {
  getHomeLayout, saveHomeLayout, addPage, removePage, moveTileToPage, hideTile, addTile,
  mergeTiles, addToGroup, removeFromGroup, deleteGroup, isGroupId, ensurePositions, ensureTrailingEmptyPage, moveTileToCell, stepTileCell,
  addDockSlot, removeDockSlot,
  hexToRgba,
  SCENES, MIN_OPACITY, MAX_OPACITY, MIN_TILE_GAP, MAX_TILE_GAP, MIN_W, MAX_W, MIN_H, MAX_H, TILE_COLORS, COLOR_HEX,
  GRID_COLS_DESKTOP, GRID_COLS_MOBILE, MOBILE_BREAKPOINT_PX, ROW_HEIGHT_DESKTOP, ROW_HEIGHT_MOBILE, MIN_DOCK, MAX_DOCK,
  type HomeLayout, type TileColor, type TileId, type GroupId,
} from '../lib/homeLayout';
import { getKegTimerState, formatDurationMs } from '../lib/stopwatchTimers';
import './HomeScreen.css';

/** true = jméno přednastaveného odstínu (CSS třída c-*); false = vlastní hex barva (inline styl). */
function isPresetColor(c: string): c is TileColor {
  return (TILE_COLORS as readonly string[]).includes(c);
}
/** Hex hodnota pro nativní <input type="color"> — i když je aktuální hodnota jméno přednastavené barvy. */
function colorInputValue(c: string): string {
  return isPresetColor(c) ? COLOR_HEX[c] : c;
}

// Mapování stránka → modul oprávnění — zrcadlí stejnou mapu v Layout.tsx (sidebar),
// aby dlaždice ukazovaly přesně to, co uživatel vidí i v menu. Layout.tsx tuto mapu
// nemá exportovanou, proto je tu zkopírovaná; při úpravě oprávnění v Layout.tsx
// je potřeba upravit i tuto kopii.
const PAGE_TO_MODULE: Record<string, ModuleKey> = {
  dashboard: 'dashboard',
  kegging: 'entry',
  bottling: 'entry',
  bottling_entry: 'entry',
  bottling_overview: 'entry',
  orders_entry: 'entry',
  fasovani: 'entry',
  prodejna: 'entry',
  writeoffs: 'entry',
  orders: 'orders',
  zavoz: 'zavoz',
  kniha_jizd: 'kniha_jizd',
  stock: 'stock',
  inventory: 'inventory',
  srotovani: 'srotovani',
  checklists: 'haccp',
  concentration: 'cellar',
  cellar: 'cellar',
  history: 'cellar',
  haccp: 'haccp',
  sanitation_log: 'haccp',
  places: 'catalogs',
  beers: 'catalogs',
  packages: 'catalogs',
  vehicles: 'catalogs',
  depozitar: 'catalogs',
  bottling_needs: 'catalogs',
  pricelist: 'pricelist',
  sklo_promo: 'sklo_promo',
  vycepy: 'vycepy',
  app_settings: 'app_settings',
  exkurze: 'exkurze',
  akce: 'akce',
  calendar: 'reminders',
  feedback: 'catalogs',
  reminders: 'reminders',
};

type VehicleAlert = { vehicleName: string; label: string; status: 'warning' | 'expired' };

const SCENE_LABELS: Record<string, string> = {
  warm: 'Teplá', sunset: 'Západ', ocean: 'Oceán', forest: 'Les', night: 'Noc', custom: 'Vlastní',
};

export default function HomeScreen({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user, patchProfile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);
  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  const visible = useMemo(() => NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  }), [isAdmin, profile?.role, user?.id, userPerms]);

  const visibleIds = useMemo(() => visible.map((n) => n.id), [visible]);

  // Rozšiřující dlaždice (EXTRA_NAV, viz Layout.tsx) — stránky/záložky, co
  // dnes nejdou přidat jinak než ručně přes "+ Přidat dlaždici". Na rozdíl
  // od `visible` se nepřidávají do launcheru automaticky.
  const extraVisible = useMemo(() => EXTRA_NAV.filter((n) => {
    const modKey = PAGE_TO_MODULE[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  }), [profile?.role, user?.id, userPerms]);
  const extraVisibleIds = useMemo(() => extraVisible.map((n) => n.id), [extraVisible]);

  const navById = useMemo(() => new Map<Page, NavItem>([...visible, ...extraVisible].map((n) => [n.id, n])), [visible, extraVisible]);

  // Počet sloupců mřížky podle šířky obrazovky (viz HomeScreen.css media query
  // + homeLayout.ts GRID_COLS_*) — potřeba i v JS, ať jde spočítat cílovou
  // buňku z pozice myši/prstu při přetažení a ať se volné pozice dlaždic
  // ukládají v souřadnicích odpovídajících aktuálně zobrazené mřížce.
  const [cols, setCols] = useState(() => (typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT_PX ? GRID_COLS_MOBILE : GRID_COLS_DESKTOP));
  useEffect(() => {
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setCols(window.innerWidth <= MOBILE_BREAKPOINT_PX ? GRID_COLS_MOBILE : GRID_COLS_DESKTOP);
      }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (resizeTimer) clearTimeout(resizeTimer); };
  }, []);

  // ---- Launcher: stránky / velikost / barva / scéna, uložené v profilu ----
  const [layout, setLayout] = useState<HomeLayout>(() => getHomeLayout((profile as any)?.home_layout, visibleIds, extraVisibleIds, cols));
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  useEffect(() => {
    setLayout((prev) => getHomeLayout(prev, visibleIds, extraVisibleIds, cols));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(','), extraVisibleIds.join(','), cols]);
  useEffect(() => {
    const raw = (profile as any)?.home_layout;
    setLayout(getHomeLayout(raw, visibleIds, extraVisibleIds, cols));
    setHasCustomLayout(!!raw && Object.keys(raw).length > 0);
    // Reagujeme jen na skutečnou změnu uloženého layoutu z profilu (např. po
    // přihlášení na jiném zařízení) — visibleIds/extraVisibleIds/cols řeší efekt výše.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(profile as any)?.home_layout]);
  // Pokud se smazáním stránky (nebo na jiném zařízení) zmenší počet stránek
  // pod aktuální index, spadneme na poslední existující.
  useEffect(() => {
    setCurrentPageIndex((i) => Math.min(i, layout.pages.length - 1));
  }, [layout.pages.length]);
  // Označení dlaždice patří k jedné konkrétní stránce launcheru — při
  // přepnutí stránky by jinak zůstalo "viset" na neviditelné dlaždici jinde.
  useEffect(() => { setSelectedTileId(null); }, [currentPageIndex]);

  const [editMode, setEditMode] = useState(false);
  // Dlaždice právě označená klikem v edit módu — jen ona zobrazuje plovoucí
  // panel s ovládáním (šipky + ⚙), viz LauncherTile.tsx `selected`/`onSelect`.
  // Klik na jinou dlaždici označení přepne, klik na tu samou ho zruší.
  const [selectedTileId, setSelectedTileId] = useState<TileId | null>(null);
  const [draggingId, setDraggingId] = useState<TileId | null>(null);
  const [dragOverId, setDragOverId] = useState<TileId | null>(null);
  const [primingId, setPrimingId] = useState<TileId | null>(null);
  // Dlaždice, jejíž plný editor (velikost/barva/popisek/stránka/skrytí/skupina) je
  // teď otevřený v modálu — řešení cramování všech ovládacích prvků přímo
  // na dlaždici (nešly vidět všechny barvy, popisky byly nečitelné apod.).
  const [editingTileId, setEditingTileId] = useState<TileId | null>(null);
  // Skupinová dlaždice, jejíž "složka" je teď otevřená (mimo edit mód) —
  // seznam členů ke klepnutí.
  const [openGroupId, setOpenGroupId] = useState<GroupId | null>(null);
  // Modál "Přidat dlaždici" — schované dlaždice + EXTRA_NAV položky, co
  // ještě nejsou na žádné stránce (viz addableItems níže).
  const [showAddTileModal, setShowAddTileModal] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasCustomLayout, setHasCustomLayout] = useState(!!(profile as any)?.home_layout && Object.keys((profile as any).home_layout).length > 0);

  function persist(raw: HomeLayout) {
    // Doplní x/y pro dlaždice, co je ještě nemají (nově přidané/vzniklé
    // sloučením/vyjmuté ze skupiny) — samotné mutátory v homeLayout.ts o
    // aktuálním počtu sloupců nic nevědí, tohle je jediné místo, kudy
    // všechny změny layoutu procházejí.
    const next = ensureTrailingEmptyPage(ensurePositions(raw, cols));
    setLayout(next);
    setHasCustomLayout(true);
    // Okamžitě (bez čekání na uložení) promítnout do profilu v AuthContext —
    // Layout.tsx čte scénu pozadí ze stejného profilu, takže bez tohohle by
    // se barva pozadí v hlavičce/liště změnila až po znovunačtení profilu
    // (typicky až příštím přihlášením), ne hned po výběru.
    patchProfile({ home_layout: next as any });
    if (!user?.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveHomeLayout(user.id, next); }, 500);
  }

  // Přesun dlaždice: podržení prstu (long-press), stejně jako na Androidu —
  // ne okamžitý drag od prvního dotyku. Krátký dotek / rychlé přejetí (=
  // pokus o scroll) se zruší dřív, než se cokoliv začne přesouvat; teprve
  // po ~400ms bez pohybu se dlaždice "zvedne" a od tohoto momentu sledování
  // prstu přesouvá. Řeší se tu na window (ne jen na dlaždici), ať to funguje
  // i když prst při tažení sjede mimo původní element.
  //
  // Dlaždice jde pustit na LIBOVOLNOU volnou buňku (i s mezerou kolem) —
  // cílová buňka se počítá přímo z pozice ukazatele vůči `.hs-grid`, ne z
  // toho, "která dlaždice je zrovna pod prstem" (to dřív dovolovalo jen
  // prohodit pořadí, žádné skutečně volné rozmístění). Když je cílová buňka
  // obsazená, obě dlaždice si prostě vymění místo (viz homeLayout.ts
  // moveTileToCell) — jinak leze dlaždice přesně tam, kam ukazuješ.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const rowHeight = cols === GRID_COLS_MOBILE ? ROW_HEIGHT_MOBILE : ROW_HEIGHT_DESKTOP;
  function cellFromPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const gridEl = document.querySelector('.hs-grid') as HTMLElement | null;
    if (!gridEl) return null;
    const rect = gridEl.getBoundingClientRect();
    const cellW = rect.width / cols;
    const x = Math.floor((clientX - rect.left) / cellW);
    const y = Math.floor((clientY - rect.top) / rowHeight);
    if (x < 0 || x >= cols || y < 0) return null;
    return { x, y };
  }
  function findTileIdAtPoint(clientX: number, clientY: number): TileId | null {
    const el = document.elementFromPoint(clientX, clientY);
    const tileEl = el?.closest('[data-tile-id]') as HTMLElement | null;
    return (tileEl?.dataset.tileId as TileId | undefined) ?? null;
  }
  function handleTileDragPointerDown(id: TileId, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    longPressFired.current = false;

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      setPrimingId(null);
      setDraggingId(null);
      setDragOverId(null);
    }
    function onMove(ev: PointerEvent) {
      if (!longPressFired.current) {
        // Dokud se čeká na podržení, výraznější pohyb (přirozený třes prstu
        // je pár px) = uživatel chtěl scrollovat/přejet, ne přesouvat —
        // zrušit bez zásahu.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 18) cleanup();
        return;
      }
      // Vizuální zvýraznění: jen když by šlo o výměnu s existující dlaždicí,
      // ne prázdnou buňkou (tam se nemá co "vysvítit").
      const overId = findTileIdAtPoint(ev.clientX, ev.clientY);
      setDragOverId(overId && overId !== id ? overId : null);
    }
    function onUp(ev: PointerEvent) {
      if (longPressFired.current) {
        const cell = cellFromPoint(ev.clientX, ev.clientY);
        if (cell) persist(moveTileToCell(layout, id, cell.x, cell.y, cols));
      }
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // "Nabíjecí" vizuální stav hned od dotyku (viz LauncherTile — jemné
    // zvětšení, co roste po dobu čekání), ať je jasné, že se něco děje,
    // ne až po plných 400ms ticha.
    setPrimingId(id);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setPrimingId(null);
      setDraggingId(id);
      try { navigator.vibrate?.(15); } catch {}
    }, 400);
  }
  // Volná velikost — +/- krok šířky nebo výšky (žádné pevné předvolby),
  // ať si uživatel důležité dlaždice zvětší a nedůležité zmenší podle sebe.
  function handleResizeStep(id: TileId, dim: 'w' | 'h', delta: number) {
    const current = layout.overrides[id] ?? {};
    const w = dim === 'w' ? Math.min(MAX_W, Math.max(MIN_W, (current.w ?? 1) + delta)) : (current.w ?? 1);
    const h = dim === 'h' ? Math.min(MAX_H, Math.max(MIN_H, (current.h ?? 1) + delta)) : (current.h ?? 1);
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...current, w, h } } });
  }
  // Přejetí prstem doleva/doprava = přepnutí stránky (jako Android launcher),
  // jen mimo edit mód (tam má přednost podržení+tažení dlaždice, viz výš).
  // Sleduje se vodorovná vzdálenost od prvního dotyku; svislý posun (scroll
  // obsahu, pokud je stránka vyšší než displej) a krátký tap na dlaždici se
  // ignorují (< 50px, nebo víc svislý než vodorovný pohyb).
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  function handleSwipePointerDown(e: React.PointerEvent) {
    if (editMode) return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
  }
  function handleSwipePointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || editMode) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) setCurrentPageIndex((i) => Math.min(layout.pages.length - 1, i + 1));
    else setCurrentPageIndex((i) => Math.max(0, i - 1));
  }
  function handleRecolor(id: TileId, color: string) {
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], color } } });
  }
  // Vlastní barvy pevných utilitních dlaždic (Hledat, Objednávky k
  // parsování, Odhlásit se…) — dřív byly natvrdo přiřazené barvě bez
  // možnosti změny.
  function handleFixedColorChange(key: string, color: string) {
    persist({ ...layout, fixedColors: { ...layout.fixedColors, [key]: color } });
  }
  function fixedColor(key: string, fallback: TileColor): string {
    return layout.fixedColors[key] ?? fallback;
  }
  function handleSceneChange(scene: HomeLayout['scene']) {
    persist({ ...layout, scene });
  }
  function handleCustomAccentChange(hex: string) {
    persist({ ...layout, scene: 'custom', customAccent: hex });
  }
  function handleOpacityChange(tileOpacity: number) {
    persist({ ...layout, tileOpacity });
  }
  function handleTileGapChange(tileGap: number) {
    persist({ ...layout, tileGap });
  }
  // Záložní, garantovaně funkční přesun (čisté kliknutí, žádné gesto) —
  // dlouhé podržení je citlivé na zařízení/prohlížeč, tohle vždy funguje.
  // Posune dlaždici o jednu buňku daným směrem; obsazenou buňku prohodí
  // (stejná logika jako drag-and-drop, viz homeLayout.ts stepTileCell).
  function handleMoveTileStep(id: TileId, direction: 'left' | 'right' | 'up' | 'down') {
    persist(stepTileCell(layout, id, direction, cols));
  }
  function handleDockChange(slot: number, id: Page) {
    const dock = [...layout.dock];
    dock[slot] = id;
    persist({ ...layout, dock });
  }
  function handleAddDockSlot() {
    persist(addDockSlot(layout));
  }
  function handleRemoveDockSlot(slot: number) {
    persist(removeDockSlot(layout, slot));
  }
  function handleAddPage() {
    const next = addPage(layout);
    persist(next);
    setCurrentPageIndex(next.pages.length - 1);
  }
  function handleRemoveCurrentPage() {
    if (layout.pages.length <= 1) return;
    if (!window.confirm('Smazat tuhle stránku? Dlaždice se přesunou na předchozí stránku.')) return;
    const next = removePage(layout, currentPageIndex);
    persist(next);
    setCurrentPageIndex((i) => Math.max(0, Math.min(i, next.pages.length - 1)));
  }
  function handleMoveTileToPage(id: TileId, targetPageIndex: number) {
    persist(moveTileToPage(layout, id, targetPageIndex));
  }
  function handleHideTile(id: TileId) {
    persist(hideTile(layout, id));
    setEditingTileId(null);
  }
  function handleRenameTile(id: TileId, label: string) {
    const trimmed = label.trim();
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], label: trimmed || undefined } } });
  }
  // Dlaždice dosud nikde umístěná (schovaná, nebo z EXTRA_NAV registru) —
  // viz addableItems níže, otevírá se přes "+ Přidat dlaždici".
  function handleAddTile(id: Page) {
    persist(addTile(layout, id, currentPageIndex));
  }
  // Sloučení dlaždice `editingTileId` s jinou dlaždicí/skupinou na stejné
  // stránce — vybráno v editor-modálu (sekce "Sloučit s…").
  function handleMergeInto(targetId: string) {
    if (!editingTileId || isGroupId(editingTileId) || !targetId) return;
    const next = isGroupId(targetId)
      ? addToGroup(layout, targetId, editingTileId)
      : mergeTiles(layout, editingTileId, targetId as Page, currentPageIndex);
    persist(next);
    setEditingTileId(null);
    setMergeTarget('');
  }
  function handleRemoveFromGroup(groupId: GroupId, tileId: Page) {
    persist(removeFromGroup(layout, groupId, tileId));
  }
  function handleDeleteGroup(groupId: GroupId) {
    persist(deleteGroup(layout, groupId));
    setEditingTileId(null);
  }
  function handleReset() {
    const next = getHomeLayout(null, visibleIds, [], cols);
    setLayout(next);
    setHasCustomLayout(false);
    patchProfile({ home_layout: {} as any });
    if (user?.id) saveHomeLayout(user.id, {} as any);
  }

  // Klik na dlaždici v mřížce (nebo v otevřené skupině) — 'signout' není
  // skutečná routovaná stránka (viz Layout.tsx NAV), je to jen dlaždice,
  // co se dá stejně jako ostatní přesouvat/přebarvit/dát do skupiny; klik
  // na ni se tu zvlášť odchytí a spustí odhlášení místo setPage.
  function handleTileClick(id: Page) {
    if (id === 'signout') {
      if (window.confirm('Odhlásit se z appky?')) signOut();
      return;
    }
    setPage(id);
  }

  // ---- Živá dlaždice: počet nevyřízených objednávek PRO TENTO TÝDEN ----
  // Týden objednávky se (stejně jako v Objednávkách/Knize jízd) počítá z
  // delivery_date, a když ten není vyplněný, z order_date.
  const [pendingOrders, setPendingOrders] = useState<number | null>(null);
  useEffect(() => {
    if (!visibleIds.includes('orders')) return;
    const { start, end } = weekRange(isoWeekKey(new Date().toISOString().slice(0, 10)));
    const startIso = start.toISOString().slice(0, 10);
    const endIso = end.toISOString().slice(0, 10);
    supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('status', 'nova')
      .or(`and(delivery_date.gte.${startIso},delivery_date.lte.${endIso}),and(delivery_date.is.null,order_date.gte.${startIso},order_date.lte.${endIso})`)
      .then(({ count }) => setPendingOrders(count ?? 0));
  }, [visibleIds]);

  // ---- Hledat a WhatsApp — přesunuté z hlavičky (Layout.tsx) sem jako
  // dlaždice, ať jsou na Domů ve stejném stylu jako zbytek launcheru.
  // Hlavička je schovává jen na téhle stránce (viz Layout.tsx, isHome). ----
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [pendingWhatsApp, setPendingWhatsApp] = useState(0);
  useEffect(() => {
    fetchPendingWhatsAppCount().then(setPendingWhatsApp).catch(() => {});
  }, []);
  function openWhatsAppFromTile() {
    setPage('orders');
    window.dispatchEvent(new CustomEvent('pivovar:open-auto-import'));
  }

  // Upozornění na STK / dálniční známku vozidel — jen komu je to nastaveno
  // v Uživatelích (nebo admin), a jen dokud to ten člověk jednou nepotvrdí.
  const canSeeVehicleAlerts = profile?.role === 'admin' || !!(profile as any)?.receive_vehicle_alerts;
  const [vehicleAlerts, setVehicleAlerts] = useState<VehicleAlert[]>([]);
  useEffect(() => {
    if (!canSeeVehicleAlerts) { setVehicleAlerts([]); return; }
    supabase.from('vehicles').select('*').then(({ data }) => {
      const rows = (data as Vehicle[]) ?? [];
      const alerts: VehicleAlert[] = [];
      rows.forEach((v) => {
        const stk = getVehicleExpiryStatus(v.stk_valid_until);
        if (stk.status === 'warning' || stk.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `STK: ${stk.label}`, status: stk.status });
        }
        const toll = getVehicleExpiryStatus(v.highway_toll_valid_until);
        if (toll.status === 'warning' || toll.status === 'expired') {
          alerts.push({ vehicleName: v.name, label: `Dálniční známka: ${toll.label}`, status: toll.status });
        }
      });
      setVehicleAlerts(alerts);
    });
  }, [canSeeVehicleAlerts]);

  const editingGroup = editingTileId && isGroupId(editingTileId) ? layout.groups[editingTileId] : null;
  const editingItem = editingTileId && !isGroupId(editingTileId) ? navById.get(editingTileId) : null;
  const editingOverride = editingTileId ? (layout.overrides[editingTileId] ?? {}) : null;

  // Dlaždice, co jde přidat přes "+ Přidat dlaždici": schované (layout.hidden)
  // + EXTRA_NAV položky, co ještě nejsou na žádné stránce ani ve skupině.
  // Sjednocené v jednom seznamu — addTile() zvládne oba případy stejně
  // (odebere ze staré pozice, ať už to byla stránka nebo hidden).
  const placedSet = useMemo(() => {
    const s = new Set<Page>();
    layout.pages.flat().forEach((id) => { if (!isGroupId(id)) s.add(id as Page); });
    Object.values(layout.groups).forEach((g) => g.memberIds.forEach((m) => s.add(m)));
    return s;
  }, [layout.pages, layout.groups]);
  const addableItems = useMemo(
    () => [...visible, ...extraVisible].filter((n) => !placedSet.has(n.id)),
    [visible, extraVisible, placedSet]
  );

  // Poslední naměřená doba stočení sudu — rychlý přehled přímo na dlaždici
  // "Stočení sudu" (badge), bez nutnosti otevírat nástroj.
  const [kegLastDuration, setKegLastDuration] = useState<string | null>(null);
  useEffect(() => {
    const state = getKegTimerState();
    if (state.history.length > 0) setKegLastDuration(formatDurationMs(state.history[state.history.length - 1]));
  }, [layout]);

  const openGroup = openGroupId ? layout.groups[openGroupId] : null;

  return (
    <div className="flex flex-col gap-4 min-h-full">
      <div className="hs-launcher">
        {editMode && (
          <div className="hs-controls">
            {hasCustomLayout && (
              <div className="hs-controls-group">
                <button className="hs-reset-btn" onClick={handleReset}>Obnovit výchozí</button>
              </div>
            )}
            <div className="hs-controls-group">
              <span className="hs-controls-label">Pozadí</span>
              {SCENES.filter((s) => s !== 'custom').map((s) => (
                <button
                  key={s}
                  className={`hs-scene-swatch ${s} ${s === layout.scene ? 'active' : ''}`}
                  title={SCENE_LABELS[s]}
                  onClick={() => handleSceneChange(s)}
                />
              ))}
              <label className="hs-bg-custom" title="Vlastní barva pozadí">
                <input
                  type="color"
                  value={layout.customAccent}
                  onChange={(e) => handleCustomAccentChange(e.target.value)}
                />
              </label>
            </div>
            <div className="hs-controls-group">
              <span className="hs-controls-label">Průhlednost</span>
              <input
                type="range"
                className="hs-opacity-slider"
                min={MIN_OPACITY}
                max={MAX_OPACITY}
                step={0.02}
                value={layout.tileOpacity}
                onChange={(e) => handleOpacityChange(Number(e.target.value))}
              />
            </div>
            <div className="hs-controls-group">
              <span className="hs-controls-label">Mezery</span>
              <input
                type="range"
                className="hs-opacity-slider"
                min={MIN_TILE_GAP}
                max={MAX_TILE_GAP}
                step={1}
                value={layout.tileGap}
                onChange={(e) => handleTileGapChange(Number(e.target.value))}
              />
            </div>
            <div className="hs-controls-group hs-dock-group">
              <span className="hs-controls-label">Spodní lišta</span>
              {layout.dock.map((dockId, i) => (
                <span key={i} className="hs-dock-slot">
                  <select
                    className="hs-dock-select"
                    value={dockId}
                    onChange={(e) => handleDockChange(i, e.target.value as Page)}
                  >
                    <option value="home">Domů</option>
                    {visible.filter((n) => n.id !== 'signout').map((n) => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                  {layout.dock.length > MIN_DOCK && (
                    <button type="button" className="hs-dock-remove" title="Odebrat tenhle slot" onClick={() => handleRemoveDockSlot(i)}>✕</button>
                  )}
                </span>
              ))}
              {layout.dock.length < MAX_DOCK && (
                <button type="button" className="hs-dock-add" title="Přidat další slot do spodní lišty" onClick={handleAddDockSlot}>
                  <Plus size={13} /> Přidat
                </button>
              )}
            </div>
            <div className="hs-controls-group">
              <span className="hs-controls-label">Barvy tlačítek</span>
              <label className="hs-fixed-color" title="Hledat">
                <input type="color" value={colorInputValue(fixedColor('search', 'slate'))} onChange={(e) => handleFixedColorChange('search', e.target.value)} />
                <span>Hledat</span>
              </label>
              <label className="hs-fixed-color" title="Objednávky k parsování">
                <input type="color" value={colorInputValue(fixedColor('parse', 'mint'))} onChange={(e) => handleFixedColorChange('parse', e.target.value)} />
                <span>Parsování</span>
              </label>
            </div>
          </div>
        )}

        {(layout.pages.length > 1 || editMode) && (
          <div className="hs-pager">
            <button
              type="button"
              className="hs-pager-arrow"
              disabled={currentPageIndex === 0}
              onClick={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="hs-pager-dots">
              {layout.pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`hs-pager-dot ${i === currentPageIndex ? 'active' : ''}`}
                  onClick={() => setCurrentPageIndex(i)}
                  title={`Stránka ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              className="hs-pager-arrow"
              disabled={currentPageIndex === layout.pages.length - 1}
              onClick={() => setCurrentPageIndex((i) => Math.min(layout.pages.length - 1, i + 1))}
            >
              <ChevronRight size={18} />
            </button>
            {editMode && (
              <>
                <button type="button" className="hs-pager-manage hs-pager-manage-labeled" onClick={handleAddPage}>
                  <Plus size={15} /> Přidat stránku
                </button>
                {layout.pages.length > 1 && (
                  <button type="button" className="hs-pager-manage" title="Smazat tuhle stránku" onClick={handleRemoveCurrentPage}>
                    <Trash2 size={15} />
                  </button>
                )}
                {addableItems.length > 0 && (
                  <button type="button" className="hs-pager-manage hs-pager-manage-labeled" onClick={() => setShowAddTileModal(true)}>
                    <Plus size={15} /> Přidat dlaždici
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* Přejetí prstem kdekoliv nad dlaždicemi (mimo edit mód) přepíná
            stránku launcheru — viz handleSwipePointerDown/Up výš. */}
        <div
          key={currentPageIndex}
          className="hs-swipe-area hs-page-enter"
          onPointerDown={handleSwipePointerDown}
          onPointerUp={handleSwipePointerUp}
          onPointerCancel={() => { swipeStart.current = null; }}
        >
        {/* Pevné dlaždice — samostatná mřížka NAD .hs-grid (viz HomeScreen.css
            .hs-fixed-row), ať nesoupeří o volné buňky s přesouvatelnými
            dlaždicemi. Hledat a Objednávky k parsování přesunuté sem z
            hlavičky, jen na 1. stránce. Počet objednávek tohoto týdne je
            odznak přímo na běžné dlaždici Objednávky (layout.pages), ne
            samostatná dlaždice navíc. */}
        <div className="hs-fixed-row" style={{ ['--hs-tile-alpha' as any]: layout.tileOpacity, ['--hs-tile-gap' as any]: `${layout.tileGap}px` }}>
          {currentPageIndex === 0 && (
            <>
              <button
                type="button"
                className={isPresetColor(fixedColor('search', 'slate')) ? `hs-tile c-${fixedColor('search', 'slate')}` : 'hs-tile'}
                style={isPresetColor(fixedColor('search', 'slate')) ? undefined : { background: hexToRgba(fixedColor('search', 'slate'), layout.tileOpacity) }}
                onClick={() => setShowSearchModal(true)}
              >
                <Search />
                <div className="hs-lbl">Hledat</div>
              </button>
              <button
                type="button"
                className={isPresetColor(fixedColor('parse', 'mint')) ? `hs-tile c-${fixedColor('parse', 'mint')}` : 'hs-tile'}
                style={isPresetColor(fixedColor('parse', 'mint')) ? undefined : { background: hexToRgba(fixedColor('parse', 'mint'), layout.tileOpacity) }}
                onClick={openWhatsAppFromTile}
              >
                <MessageCircle />
                <div className="hs-lbl">Objednávky k parsování</div>
                {pendingWhatsApp > 0 && <span className="hs-badge">{pendingWhatsApp > 99 ? '99+' : pendingWhatsApp}</span>}
              </button>
              {vehicleAlerts.length > 0 && (
                // Tichý ukazatel místo dřívějšího banneru přes celou
                // obrazovku, co bylo nutné potvrdit — dlaždice prostě zmizí
                // sama, až se STK/známka skutečně vyřeší (aktualizuje datum).
                // Barva zůstává natvrdo červeno-žlutá (upozornění), aby si ji
                // nešlo přebarvit tak, že přestane jako upozornění vypadat.
                <button type="button" className="hs-tile hs-tile-alert" onClick={() => setPage('vehicles')}>
                  <TriangleAlert />
                  <div className="hs-lbl">Vozidla — STK/známka</div>
                  <span className="hs-badge">{vehicleAlerts.length}</span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            className={`hs-tile ${editMode ? 'c-indigo' : 'c-forest'}`}
            onClick={() => { setEditMode((v) => !v); setSelectedTileId(null); }}
          >
            <SlidersHorizontal />
            <div className="hs-lbl">{editMode ? 'Hotovo' : 'Upravit rozložení'}</div>
          </button>
        </div>

        <div className="hs-grid" style={{ ['--hs-tile-alpha' as any]: layout.tileOpacity, ['--hs-tile-gap' as any]: `${layout.tileGap}px` }}>
          {(layout.pages[currentPageIndex] ?? []).map((id) => {
            const override = layout.overrides[id] ?? {};
            if (isGroupId(id)) {
              const group = layout.groups[id];
              if (!group) return null;
              const groupItems = group.memberIds.map((mid) => navById.get(mid)).filter((n): n is NavItem => !!n);
              if (groupItems.length === 0) return null;
              return (
                <LauncherTile
                  key={id}
                  id={id}
                  item={null}
                  groupItems={groupItems}
                  override={override}
                  isPresetColor={isPresetColor(override.color ?? 'coral')}
                  editing={editMode}
                  selected={selectedTileId === id}
                  onSelect={() => setSelectedTileId((cur) => (cur === id ? null : id))}
                  tileOpacity={layout.tileOpacity}
                  onClick={() => setOpenGroupId(id)}
                  onDragPointerDown={(e) => handleTileDragPointerDown(id, e)}
                  isDragging={draggingId === id}
                  isPriming={primingId === id}
                  dragOver={dragOverId === id}
                  jiggling={editMode && draggingId !== null && draggingId !== id}
                  onMoveStep={(dir) => handleMoveTileStep(id, dir)}
                  onOpenEditor={() => setEditingTileId(id)}
                />
              );
            }
            const item = navById.get(id);
            if (!item) return null;
            const badge = id === 'orders' && pendingOrders ? pendingOrders : id === 'keg_timer' && kegLastDuration ? kegLastDuration : undefined;
            return (
              <LauncherTile
                key={id}
                id={id}
                item={item}
                override={override}
                isPresetColor={isPresetColor(override.color ?? 'coral')}
                editing={editMode}
                selected={selectedTileId === id}
                onSelect={() => setSelectedTileId((cur) => (cur === id ? null : id))}
                badge={badge}
                tileOpacity={layout.tileOpacity}
                onClick={() => handleTileClick(id)}
                onDragPointerDown={(e) => handleTileDragPointerDown(id, e)}
                isDragging={draggingId === id}
                isPriming={primingId === id}
                dragOver={dragOverId === id}
                jiggling={editMode && draggingId !== null && draggingId !== id}
                onMoveStep={(dir) => handleMoveTileStep(id, dir)}
                onOpenEditor={() => setEditingTileId(id)}
              />
            );
          })}
        </div>
        </div>
      </div>

      {(editingItem || editingGroup) && editingOverride && editingTileId && (
        <Modal open onClose={() => setEditingTileId(null)} title={editingOverride.label || editingItem?.label || 'Skupina'}>
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Popisek</label>
              <input
                type="text"
                className="w-full border border-neutral-300 rounded px-3 py-2 text-sm"
                value={editingOverride.label ?? ''}
                onChange={(e) => handleRenameTile(editingTileId, e.target.value)}
                placeholder={editingItem?.label ?? 'Skupina'}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Velikost</label>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">Šířka</span>
                  <button type="button" className="hs-modal-stepper-btn" disabled={(editingOverride.w ?? 1) <= MIN_W} onClick={() => handleResizeStep(editingTileId, 'w', -1)}>−</button>
                  <span className="w-5 text-center font-bold tabular-nums">{editingOverride.w ?? 1}</span>
                  <button type="button" className="hs-modal-stepper-btn" disabled={(editingOverride.w ?? 1) >= MAX_W} onClick={() => handleResizeStep(editingTileId, 'w', 1)}>+</button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-600">Výška</span>
                  <button type="button" className="hs-modal-stepper-btn" disabled={(editingOverride.h ?? 1) <= MIN_H} onClick={() => handleResizeStep(editingTileId, 'h', -1)}>−</button>
                  <span className="w-5 text-center font-bold tabular-nums">{editingOverride.h ?? 1}</span>
                  <button type="button" className="hs-modal-stepper-btn" disabled={(editingOverride.h ?? 1) >= MAX_H} onClick={() => handleResizeStep(editingTileId, 'h', 1)}>+</button>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Barva</label>
              <div className="flex flex-wrap gap-2.5">
                {TILE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    title={c}
                    className={`hs-modal-swatch ${editingOverride.color === c ? 'active' : ''}`}
                    style={{ background: COLOR_HEX[c] }}
                    onClick={() => handleRecolor(editingTileId, c)}
                  />
                ))}
                <label className="hs-modal-swatch hs-modal-swatch-custom" title="Vlastní barva">
                  <input type="color" value={colorInputValue(editingOverride.color ?? 'coral')} onChange={(e) => handleRecolor(editingTileId, e.target.value)} />
                </label>
              </div>
            </div>

            {layout.pages.length > 1 && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Přesunout na stránku</label>
                <select
                  className="border border-neutral-300 rounded px-3 py-2 text-sm"
                  value={currentPageIndex}
                  onChange={(e) => handleMoveTileToPage(editingTileId, Number(e.target.value))}
                >
                  {layout.pages.map((_, i) => (
                    <option key={i} value={i}>Stránka {i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            {editingGroup && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Dlaždice ve skupině</label>
                <div className="flex flex-col gap-1.5">
                  {editingGroup.memberIds.map((mid) => {
                    const memberItem = navById.get(mid);
                    if (!memberItem) return null;
                    return (
                      <div key={mid} className="flex items-center justify-between gap-2 bg-neutral-50 border border-neutral-200 rounded px-3 py-1.5">
                        <span className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
                          <memberItem.icon size={14} /> {memberItem.label}
                        </span>
                        <button
                          type="button"
                          className="text-xs font-bold text-neutral-500 hover:text-red-600"
                          onClick={() => handleRemoveFromGroup(editingTileId as GroupId, mid)}
                        >
                          Vyjmout
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {editingItem && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-neutral-500 mb-1.5">Sloučit s…</label>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 min-w-0 border border-neutral-300 rounded px-3 py-2 text-sm"
                    value={mergeTarget}
                    onChange={(e) => setMergeTarget(e.target.value)}
                  >
                    <option value="">Vyber dlaždici…</option>
                    {(layout.pages[currentPageIndex] ?? []).filter((id) => id !== editingTileId).map((id) => {
                      const label = isGroupId(id) ? (layout.overrides[id]?.label || 'Skupina') : navById.get(id)?.label;
                      if (!label) return null;
                      return <option key={id} value={id}>{label}</option>;
                    })}
                  </select>
                  <button
                    type="button"
                    className="shrink-0 text-sm font-bold bg-neutral-200 hover:bg-neutral-300 text-neutral-800 rounded px-3 py-2 disabled:opacity-40"
                    disabled={!mergeTarget}
                    onClick={() => handleMergeInto(mergeTarget)}
                  >
                    Sloučit
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-neutral-100">
              {editingGroup ? (
                <button type="button" className="text-sm font-semibold text-red-600" onClick={() => handleDeleteGroup(editingTileId as GroupId)}>Zrušit skupinu</button>
              ) : (
                <button type="button" className="text-sm font-semibold text-red-600" onClick={() => handleHideTile(editingTileId)}>Skrýt dlaždici</button>
              )}
              <button type="button" className="text-sm font-bold bg-neutral-900 text-white rounded px-4 py-2" onClick={() => setEditingTileId(null)}>Hotovo</button>
            </div>
          </div>
        </Modal>
      )}

      {openGroup && openGroupId && (
        <Modal open onClose={() => setOpenGroupId(null)} title={layout.overrides[openGroupId]?.label || 'Skupina'}>
          <div className="flex flex-col gap-2">
            {openGroup.memberIds.map((mid) => {
              const memberItem = navById.get(mid);
              if (!memberItem) return null;
              return (
                <button
                  key={mid}
                  type="button"
                  className="flex items-center gap-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded px-4 py-3 text-left"
                  onClick={() => { setOpenGroupId(null); handleTileClick(mid); }}
                >
                  <memberItem.icon size={18} className="text-neutral-600" />
                  <span className="font-bold text-sm text-neutral-800">{memberItem.label}</span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {showAddTileModal && (
        <Modal open onClose={() => setShowAddTileModal(false)} title="Přidat dlaždici">
          <div className="flex flex-col gap-4">
            {addableItems.length === 0 ? (
              <p className="text-sm text-neutral-500">Všechny dostupné dlaždice už jsou na ploše.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
                {addableItems.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="flex items-center justify-between gap-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded px-4 py-2.5 text-left"
                    onClick={() => handleAddTile(n.id)}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <n.icon size={17} className="text-neutral-600 shrink-0" />
                      <span className="font-bold text-sm text-neutral-800 truncate">{n.label}</span>
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-400 shrink-0">{n.group}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button type="button" className="text-sm font-bold bg-neutral-900 text-white rounded px-4 py-2" onClick={() => setShowAddTileModal(false)}>Hotovo</button>
            </div>
          </div>
        </Modal>
      )}

      <QuickSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectPage={setPage}
      />
    </div>
  );
}
