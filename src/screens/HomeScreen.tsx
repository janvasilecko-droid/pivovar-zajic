// Domovská obrazovka appky — přizpůsobitelný dlaždicový launcher (styl
// Windows Phone / Nokia Lumia): pořadí, velikost a barva dlaždic i barevné
// pozadí jde v "Upravit rozložení" módu měnit a ukládá se per uživatel
// (profiles.home_layout), takže se to synchronizuje napříč zařízeními.
// Výjimka nad dlaždicemi: upozornění na STK/dálniční známku vozidel —
// zobrazuje se jen komu je nastaveno (Uživatelé → "Dostává upozornění na
// vozidla") a musí ho jednou potvrdit, pak zmizí (dokud se stav nezmění).
import { useEffect, useMemo, useState, useRef } from 'react';
import {
  CalendarX2, Download, Check, ChevronLeft, ChevronRight, LogOut, Palette, Plus, Search, SlidersHorizontal, Trash2, TriangleAlert, X,
  Truck, ClipboardList, MessageCircle, PlusCircle, Snowflake, FlaskConical, CalendarDays, BarChart3, Package as PackageIcon, TrendingDown, GlassWater, BookOpen, Droplet, Car, FileText, ClipboardCheck, Shield, Store, Receipt, MapPin, Beer as BeerIcon, Tag, Sparkles, Compass, Wheat, Zap, ArrowLeftRight, StickyNote,
  AlarmClock, Play, Pause, RotateCcw, Pin, Radio, SkipForward, Flame, Sun,
} from 'lucide-react';
import { NAV, EXTRA_NAV, type Page, type NavItem } from '../components/Layout';
import LauncherTile, { tileGridStyle } from '../components/LauncherTile';
import { QuickSearchModal } from '../components/QuickSearchModal';
import { Modal } from '../components/ui';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, PAGE_TO_MODULE, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase, Vehicle, fetchAllRows } from '../lib/supabase';
import { getVehicleExpiryStatus } from '../lib/vozidla';
import { businessDateISO } from '../lib/businessDate';
import { IkonaSud, IkonaLahev, IkonaVycep } from '../components/ikony';
import { HomeNotesModal } from '../components/HomeNotesModal';
import { HomeChecklistModal } from '../components/HomeChecklistModal';
import { getHomeNotes, toggleHomeNote, toggleHomeNoteImportant, HOME_NOTES_CHANGED_EVENT, OPEN_HOME_NOTES_EVENT, consumeOpenHomeNotesRequest, type HomeNote } from '../lib/homeNotes';
import { getDailyTasks, DAILY_CHECKLIST_CHANGED_EVENT, type DailyTask } from '../lib/homeChecklist';
import {
  getRadioState, toggleRadio, nextStation, RADIO_STATIONS, RADIO_STATE_EVENT, type RadioState,
} from '../lib/breweryRadio';
import {
  getHomeLayout, saveHomeLayout, addPage, removePage, moveTileToPage, hideTile, addTile,
  mergeTiles, addToGroup, removeFromGroup, deleteGroup, isGroupId, isCountdownId, ensurePositions, ensureTrailingEmptyPage, unifyColorsByCategory, moveTileToCell, stepTileCell,
  addDockSlot, removeDockSlot,
  hexToRgba,
  PAGE_CATEGORY, CATEGORY_ORDER, CATEGORY_SHADES, type Category,
  moveTileToPageCell, okrajProPrepnuti, dalsiStranka, type OkrajTazeni,
  MIN_SVETLOST, MAX_SVETLOST,
  SCENES, MIN_OPACITY, MAX_OPACITY, MIN_TILE_GAP, MAX_TILE_GAP, MIN_W, MAX_W, MIN_H, MAX_H, TILE_COLORS, COLOR_HEX, defaultTileColor,
  GRID_COLS_DESKTOP, GRID_COLS_MOBILE, MOBILE_BREAKPOINT_PX, ROW_HEIGHT_DESKTOP, ROW_HEIGHT_MOBILE, MIN_DOCK, MAX_DOCK,
  type HomeLayout, type TileColor, type TileId, type GroupId, type CountdownTileId,
} from '../lib/homeLayout';
import {
  getKegTimerState, formatDurationMs, getCountdowns, saveCountdowns, countdownRemainingMs, toggleCountdown, resetCountdown,
  startAllCountdowns, pauseAllCountdowns, resetAllCountdowns, COUNTDOWN_CHANGED_EVENT, type CountdownTimer,
  getStopwatchState, saveStopwatchState, stopwatchElapsedMs, STOPWATCH_CHANGED_EVENT, type StopwatchState,
} from '../lib/stopwatchTimers';
import { onNewVersion, forceRefresh, type VersionInfo } from '../lib/versionCheck';
import { isMonthlyCleanupPending, MONTHLY_CLEANUP_CHANGED_EVENT } from '../lib/monthlyCleanup';
import { potvrd, oznam } from '../lib/toast';
import { requestOrdersAutoImport } from '../lib/ordersFilter';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { fetchLastWhatsAppAt, fetchPendingWhatsAppCount, subscribeToWhatsAppMessages } from '../lib/whatsappApi';
import { tichoWhatsApp, type TichoWhatsApp } from '../lib/whatsappTicho';
import { nactiRezervace } from '../lib/vycepyData';
import { stariInventury, type StariInventury } from '../lib/inventuraStari';
import { nazevMesice } from '../lib/inventoryFix';

/** Na odznak dlaždice se vejde jen krátký název měsíce. */
const MESICE_KRATCE = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen',
  'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'];
import { kauceVenku, vycepyVenku, type VycepVenku } from '../lib/vycepyVenku';
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
// Mapa obrazovka -> modul je sdilena v lib/permissions.ts (drive byla
// zkopirovana na tri mistech a kopie se rozesly).

type VehicleAlert = { vehicleName: string; label: string; status: 'warning' | 'expired' };

/** Zavřený pruh časovače na ploše — volba se pamatuje i po zavření appky. */
export const KLIC_PRUH_CASOVACE = 'pivovar_pruh_casovace_skryt';

const SCENE_LABELS: Record<string, string> = {
  warm: 'Teplá', sunset: 'Západ', ocean: 'Oceán', forest: 'Les', night: 'Noc',
  white: 'Bílá', sky: 'Modrá', mint: 'Máta', lavender: 'Levandule', slate: 'Šedá',
  custom: 'Vlastní',
};

export default function HomeScreen({ setPage }: { setPage: (p: Page, targetSection?: string, subTab?: string) => void }) {
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
  // Světlý/tmavý režim se přepíná i tady, v úpravě plochy (viz níž).
  const [tema, setTema] = useState<Theme>(() => getTheme());
  // Dlaždice právě označená klikem v edit módu — jen ona zobrazuje plovoucí
  // panel s ovládáním (šipky + ⚙), viz LauncherTile.tsx `selected`/`onSelect`.
  // Klik na jinou dlaždici označení přepne, klik na tu samou ho zruší.
  const [selectedTileId, setSelectedTileId] = useState<TileId | null>(null);
  const [draggingId, setDraggingId] = useState<TileId | null>(null);
  const [dragOverId, setDragOverId] = useState<TileId | null>(null);
  const [primingId, setPrimingId] = useState<TileId | null>(null);
  // 🪄 Živý náhled uhýbání: rozložení, jak by vypadalo, kdyby se dlaždice
  // pustila TEĎ. Ostatní se rozestoupí už během tažení, takže je vidět, kam
  // to sedne — ne až po puštění.
  //
  // Tažená dlaždice si v náhledu DRŽÍ PŮVODNÍ pozici. Pod prstem ji posouvá
  // `transform`, který se počítá vůči jejímu původnímu slotu; kdyby jí náhled
  // změnil i slot, sečetlo by se to a dlaždice by prstu poskočila pryč.
  const [nahledLayout, setNahledLayout] = useState<HomeLayout | null>(null);
  /** Buňka, na kterou dlaždice spadne, když prst pustíš — obrys pod ní. */
  const [dropCell, setDropCell] = useState<{ x: number; y: number } | null>(null);
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
  /**
   * O kolik se musí prst pohnout, aby to bylo tažení a ne klepnutí.
   * Pár pixelů je přirozený třes ruky; víc už je úmysl.
   */
  const PRAH_TAZENI = 6;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  // Tažení mezi stránkami: obsluha myši/prstu běží v closure, takže by jinak
  // viděla stránku a layout takové, jaké byly při stisku. Během tažení se
  // ale obojí mění (stránka se přetáčí), proto refy.
  const pageIndexRef = useRef(currentPageIndex);
  useEffect(() => { pageIndexRef.current = currentPageIndex; }, [currentPageIndex]);
  const layoutRef = useRef(layout);
  useEffect(() => { layoutRef.current = layout; }, [layout]);
  /** Časovač přetočení stránky, když se dlaždice drží u okraje. */
  const edgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeSide = useRef<OkrajTazeni>(null);
  const [edgeHint, setEdgeHint] = useState<OkrajTazeni>(null);
  function clearEdge() {
    if (edgeTimer.current) clearTimeout(edgeTimer.current);
    edgeTimer.current = null;
    edgeSide.current = null;
    setEdgeHint(null);
  }
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

    // Bez tohohle rozjede myš nativní výběr textu: prohlížeč táhne označený
    // popisek dlaždice a dlaždice sama zůstane stát. Popisky mají sice
    // `select-none`, ale výběr začatý na dlaždici se ochotně rozlije na text
    // okolo. Rušíme i výběr, který na obrazovce zůstal z dřívějška — jinak
    // se táhne on místo dlaždice.
    e.preventDefault();
    try { window.getSelection()?.removeAllRanges(); } catch {}

    // Posun dlaždice a hledání cílové buňky se sesypou do JEDNOHO snímku.
    // Prst pošle desítky `pointermove` za sekundu a každý z nich sahal na
    // `getBoundingClientRect` a `elementFromPoint` — to jsou vynucené
    // přepočty layoutu, tedy přesně ta práce, kvůli které dlaždice za prstem
    // kulhala. Na jeden snímek stačí poslední známá pozice.
    let radek: number | null = null;
    let poslednePozice: { x: number; y: number } | null = null;
    let nahledBunka: { x: number; y: number } | null = null;

    /** Zvedne dlaždici „do ruky" — pohybem přes práh, nebo podržením na místě. */
    function zvedni() {
      if (longPressFired.current) return;
      longPressFired.current = true;
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      setPrimingId(null);
      setDraggingId(id);
      try { navigator.vibrate?.(15); } catch {}
    }

    function zrusRadek() {
      if (radek !== null) cancelAnimationFrame(radek);
      radek = null;
      poslednePozice = null;
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      zrusRadek();
      clearEdge();
      // Posun se zapisoval PŘÍMO do DOM (kvůli plynulosti), takže ho React
      // při překreslení sám nesmaže — dlaždice by po puštění zůstala odsunutá
      // vedle své buňky. Musí se uklidit ručně.
      const el = document.querySelector(`.hs-grid [data-tile-id="${id}"]`) as HTMLElement | null;
      if (el) el.style.transform = '';
      setPrimingId(null);
      setDraggingId(null);
      setDragOverId(null);
      setDropCell(null);
      setNahledLayout(null);
    }
    // Držení u kraje = přetočit stránku a nechat dlaždici „v ruce". Po
    // přetočení se časovač nasadí znovu, takže držením u kraje se dá projít
    // přes několik stránek za sebou — jako na ploše Androidu.
    function sledujOkraj(clientX: number) {
      const gridEl = document.querySelector('.hs-grid') as HTMLElement | null;
      if (!gridEl) return;
      const strana = okrajProPrepnuti(clientX, gridEl.getBoundingClientRect());
      if (!strana) { clearEdge(); return; }
      // Na krajní stránce se dál přetáčet nedá — ať se nesvítí nápověda,
      // která nic neudělá.
      const cil = dalsiStranka(pageIndexRef.current, strana, layoutRef.current.pages.length);
      if (cil === pageIndexRef.current) { clearEdge(); return; }
      if (edgeSide.current === strana) return; // časovač už běží pro tuhle stranu
      clearEdge();
      edgeSide.current = strana;
      setEdgeHint(strana);
      edgeTimer.current = setTimeout(function pretoc() {
        const dalsi = dalsiStranka(pageIndexRef.current, strana, layoutRef.current.pages.length);
        if (dalsi === pageIndexRef.current) { clearEdge(); return; }
        setCurrentPageIndex(dalsi);
        pageIndexRef.current = dalsi;
        try { navigator.vibrate?.(10); } catch {}
        edgeTimer.current = setTimeout(pretoc, 700);
      }, 500);
    }
    function onMove(ev: PointerEvent) {
      if (!longPressFired.current) {
        // TAŽENÍ ZAČÍNÁ POHYBEM, ne čekáním. Dřív se muselo 400 ms držet
        // bez hnutí a pohyb přes 18 px do té doby tažení ZRUŠIL — takže kdo
        // dlaždici chytil a rovnou s ní jel (což je to, co člověk udělá),
        // nedosáhl ničeho: dlaždice zůstala stát a nedalo se poznat proč.
        //
        // Práh je jen tak velký, aby se klepnutí (výběr dlaždice) neproměnilo
        // v přesun o pixel — přirozený třes prstu je pár px.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > PRAH_TAZENI) zvedni();
        else return;
      }
      // Dlaždice jde PLYNULE ZA PRSTEM, přesně jako ikona na ploše Androidu.
      // Mřížka se uplatní až při puštění a průběžně ji ukazuje obrys cílové
      // buňky — dlaždice sama po buňkách neskáče. Chytání na buňky jsem
      // zkoušel a je to horší: prst a dlaždice se rozejdou a člověk pak
      // netrefí, kam chce.
      //
      // Zapamatuj pozici a zbytek nech na snímku. Události chodí častěji, než
      // se stihne kreslit; počítat je všechny je práce, kterou nikdo neuvidí.
      poslednePozice = { x: ev.clientX, y: ev.clientY };
      if (radek !== null) return;
      radek = requestAnimationFrame(() => {
        radek = null;
        const p = poslednePozice;
        if (!p || !longPressFired.current) return;

        // Posun se zapisuje PŘÍMO DO DOM, ne přes stav Reactu — překreslovat
        // kvůli pohybu prstu všech ~26 dlaždic znamenalo, že dlaždice za
        // prstem viditelně kulhala.
        const el = document.querySelector(`.hs-grid [data-tile-id="${id}"]`) as HTMLElement | null;
        if (el) {
          el.style.transform = `translate(${p.x - startX}px, ${p.y - startY}px) scale(1.08)`;
        }

        // Do stavu Reactu jde jen to, co se MĚNÍ SKOKEM — cílová buňka a
        // zvýraznění dlaždice pod prstem. Díky tomu se překresluje jen při
        // přechodu mezi buňkami, ne při každém pixelu.
        const cell = cellFromPoint(p.x, p.y);
        setDropCell((prev) =>
          prev?.x === cell?.x && prev?.y === cell?.y ? prev : cell,
        );

        // Přepočítává se jen při přechodu mezi buňkami, ne při každém pixelu.
        if (cell && (cell.x !== nahledBunka?.x || cell.y !== nahledBunka?.y)) {
          nahledBunka = cell;
          const puvodni = layoutRef.current.overrides[id];
          const navrh = moveTileToPageCell(
            layoutRef.current, id, pageIndexRef.current, cell.x, cell.y, cols,
          );
          setNahledLayout({
            ...navrh,
            overrides: { ...navrh.overrides, [id]: { ...navrh.overrides[id], x: puvodni?.x, y: puvodni?.y } },
          });
        }
        const overId = findTileIdAtPoint(p.x, p.y);
        const novyOver = overId && overId !== id ? overId : null;
        setDragOverId((prev) => (prev === novyOver ? prev : novyOver));
        sledujOkraj(p.x);
      });
    }
    function onUp(ev: PointerEvent) {
      if (longPressFired.current) {
        const cell = cellFromPoint(ev.clientX, ev.clientY);
        // Layout i stránka se braly z refů — během tažení se stránka mohla
        // přetočit (viz sledujOkraj) a hodnoty z closure by byly zastaralé.
        if (cell) {
          persist(moveTileToPageCell(layoutRef.current, id, pageIndexRef.current, cell.x, cell.y, cols));
        }
      }
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    // "Nabíjecí" vizuální stav hned od dotyku (viz LauncherTile — jemné
    // zvětšení), ať je jasné, že dlaždice reaguje.
    setPrimingId(id);
    // Podržení na místě zvedne dlaždici i bez pohybu — je to druhá cesta,
    // ne jediná. Hodí se, když si člověk chce dlaždici „vzít do ruky" a teprve
    // pak se rozhodnout kam; bez toho by musel hned jet prstem.
    longPressTimer.current = setTimeout(zvedni, 400);
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
  async function handleRemoveCurrentPage() {
    if (layout.pages.length <= 1) return;
    if (!(await potvrd('Smazat tuhle stránku? Dlaždice se přesunou na předchozí stránku.'))) return;
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
  // Dlaždice dosud nikde umístěná (schovaná, z EXTRA_NAV registru nebo vlastní odpočet) —
  // viz addableItems níže, otevírá se přes "+ Přidat dlaždici".
  function handleAddTile(id: TileId) {
    persist(addTile(layout, id, currentPageIndex));
  }
  // Sloučení dlaždice `editingTileId` s jinou dlaždicí/skupinou na stejné
  // stránce — vybráno v editor-modálu (sekce "Sloučit s…").
  function handleMergeInto(targetId: string) {
    if (!editingTileId || isGroupId(editingTileId) || isCountdownId(editingTileId) || !targetId) return;
    const next = isGroupId(targetId)
      ? addToGroup(layout, targetId, editingTileId as Page)
      : mergeTiles(layout, editingTileId as Page, targetId as Page, currentPageIndex);
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
  function handleUnifyColors() {
    persist(unifyColorsByCategory(layout));
  }

  // Klik na dlaždici v mřížce (nebo v otevřené skupině) — 'signout' není
  // skutečná routovaná stránka (viz Layout.tsx NAV), je to jen dlaždice,
  // co se dá stejně jako ostatní přesouvat/přebarvit/dát do skupiny; klik
  // na ni se tu zvlášť odchytí a spustí odhlášení místo setPage.
  async function handleTileClick(id: TileId) {
    if (isCountdownId(id)) {
      const timerId = id.slice(3);
      const timer = countdowns.find((c) => c.id === timerId);
      const isDone = timer && timer.targetAt !== null && countdownRemainingMs(timer) === 0;
      if (isDone) {
        resetCountdown(timerId);
      } else {
        toggleCountdown(timerId);
      }
      return;
    }
    if (id === 'radio') {
      toggleRadio();
      return;
    }
    if (id === 'signout') {
      if ((await potvrd('Odhlásit se z appky?'))) signOut();
      return;
    }
    if (id === 'notes') {
      setShowNotesModal(true);
      return;
    }
    if (id === 'checklists') {
      setShowChecklistModal(true);
      return;
    }
    setPage(id as Page);
  }

  // Modály pro rychlé poznámky a denní checklist
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);

  // 🔀 Kdokoli zavolá setPage('notes') (vyhledávání, menu, záložky —
  // App.tsx to přesměruje sem, viz lib/homeNotes.ts), skončí tady s otevřeným
  // oknem poznámek. Mount efekt pokrývá "Domů se teprve montuje", event
  // pokrývá "na Domů už jsem" (stejný dvojitý vzorec jako
  // requestOrdersAutoImport/ORDERS_AUTO_IMPORT_EVENT v ordersFilter.ts).
  useEffect(() => {
    if (consumeOpenHomeNotesRequest()) setShowNotesModal(true);
    const otevri = () => { if (consumeOpenHomeNotesRequest()) setShowNotesModal(true); };
    window.addEventListener(OPEN_HOME_NOTES_EVENT, otevri);
    return () => window.removeEventListener(OPEN_HOME_NOTES_EVENT, otevri);
  }, []);

  // 💬 Kolik WhatsApp zpráv čeká na převod na objednávku. Hlásí to dlaždice
  // v horní řadě (viz níž) — dřív odznak v hlavičce, ta je pryč.
  const [pendingWhatsApp, setPendingWhatsApp] = useState(0);
  // 📵 Kdy naposledy něco dorazilo z telefonu. Když Tasker přestane posílat,
  // odznak jen zamrzne na starém čísle a vypadá to úplně normálně — stalo se
  // to 1. 9. 2026 a přišlo se na to až tím, že odeslané objednávky nikde
  // nebyly. Viz lib/whatsappTicho.ts.
  const [ticho, setTicho] = useState<TichoWhatsApp | null>(null);
  useEffect(() => {
    const nacti = () => {
      void fetchPendingWhatsAppCount().then(setPendingWhatsApp).catch(() => {});
      void fetchLastWhatsAppAt()
        .then((kdy) => setTicho(tichoWhatsApp(kdy, new Date())))
        .catch(() => {});
    };
    nacti();
    // Zpráva může přijít kdykoli — realtime na tabulku příchozích zpráv.
    // Funkce vrací rovnou odhlašovací callback, ne kanál.
    const odhlas = subscribeToWhatsAppMessages(() => nacti());
    return odhlas;
  }, []);

  // 🍺 Výčepy po termínu, které se ještě nevrátily (viz lib/vycepyVenku.ts).
  const [vycepyPoTerminu, setVycepyPoTerminu] = useState<VycepVenku[]>([]);
  useEffect(() => {
    void nactiRezervace()
      .then((r) => setVycepyPoTerminu(vycepyVenku(r, businessDateISO())))
      .catch(() => {});
  }, []);

  // 📅 Jak dávno se dělala napočítaná inventura (viz lib/inventuraStari.ts).
  // Patří to sem, ne na obrazovku skladu: schodek roste tichem, a upozornění,
  // které je vidět jen když si na sklad vzpomenu, přesně tuhle díru nezacpe.
  const [stariInv, setStariInv] = useState<StariInventury | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const { data } = await fetchAllRows('inventory', 'entry_date,note');
        setStariInv(stariInventury((data as any[]) ?? [], businessDateISO()));
      } catch { /* upozornění není kritické — radši mlčet než rozbít plochu */ }
    })();
  }, []);

  // ---- Pivovarské Rádio na ploše ----
  const [radioState, setRadioState] = useState<RadioState>(() => getRadioState());
  useEffect(() => {
    const handleRadio = () => setRadioState(getRadioState());
    window.addEventListener(RADIO_STATE_EVENT, handleRadio);
    return () => window.removeEventListener(RADIO_STATE_EVENT, handleRadio);
  }, []);

  // ---- Vlastní odpočty & časovače na ploše ----
  const [, forceTick] = useState(0);
  const [countdowns, setCountdowns] = useState<CountdownTimer[]>(() => getCountdowns());
  useEffect(() => {
    const handleUpdate = () => setCountdowns(getCountdowns());
    window.addEventListener(COUNTDOWN_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(COUNTDOWN_CHANGED_EVENT, handleUpdate);
  }, []);

  // ---- Stopky na ploše ----
  const [stopwatchState, setStopwatchState] = useState<StopwatchState>(() => getStopwatchState());
  useEffect(() => {
    const handleUpdate = () => setStopwatchState(getStopwatchState());
    window.addEventListener(STOPWATCH_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(STOPWATCH_CHANGED_EVENT, handleUpdate);
  }, []);

  const hasRunningCountdowns = countdowns.some((c) => c.targetAt !== null);
  const isAnyTimerRunning = hasRunningCountdowns || stopwatchState.running;
  useEffect(() => {
    if (!isAnyTimerRunning) return;
    const id = setInterval(() => forceTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [isAnyTimerRunning]);

  function isCountdownPinned(timerId: string) {
    const cid: CountdownTileId = `cd_${timerId}`;
    return layout.pages.some((page) => page.includes(cid));
  }

  function toggleCountdownPin(t: CountdownTimer) {
    const cid: CountdownTileId = `cd_${t.id}`;
    let nextLayout: ReturnType<typeof addTile>;
    if (isCountdownPinned(t.id)) {
      nextLayout = hideTile(layout, cid);
      oznam(`Odpočet "${t.label}" byl odebrán z plochy`);
    } else {
      nextLayout = addTile(layout, cid, 0);
      oznam(`Odpočet "${t.label}" byl připnut na plochu`);
    }
    setLayout(nextLayout);
    patchProfile({ home_layout: nextLayout as any });
    if (user?.id) saveHomeLayout(user.id, nextLayout);
  }

  function quickCreateCountdown(label: string, minutes: number, autoStart = true, pin = false) {
    const durationMs = Math.round(minutes * 60000);
    const newId = `t_${Math.random().toString(36).slice(2, 9)}`;
    const t: CountdownTimer = {
      id: newId,
      label: label.trim() || `${minutes} min`,
      durationMs: autoStart ? 0 : durationMs,
      initialDurationMs: durationMs,
      targetAt: autoStart ? Date.now() + durationMs : null,
      notifiedAt: null,
    };
    const nextList = [...countdowns, t];
    saveCountdowns(nextList);
    setCountdowns(nextList);

    if (pin) {
      const cid: CountdownTileId = `cd_${newId}`;
      const nextLayout = addTile(layout, cid, 0);
      setLayout(nextLayout);
      patchProfile({ home_layout: nextLayout as any });
      if (user?.id) saveHomeLayout(user.id, nextLayout);
      oznam(`⏱️ „${t.label}" ${autoStart ? 'spuštěn a ' : ''}přidán na plochu`);
    } else {
      oznam(`⏱️ „${t.label}" ${autoStart ? 'spuštěn' : 'vytvořen'}`);
    }
  }

  const [qaNewTimerLabel, setQaNewTimerLabel] = useState('');
  const [qaNewTimerMin, setQaNewTimerMin] = useState('2');
  const [qaShowAddForm, setQaShowAddForm] = useState(false);

  // ---- Rychlé poznámky & Nástěnka na ploše ----
  const [homeNotes, setHomeNotes] = useState<HomeNote[]>(() => getHomeNotes());
  useEffect(() => {
    const handleUpdate = () => setHomeNotes(getHomeNotes());
    window.addEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(HOME_NOTES_CHANGED_EVENT, handleUpdate);
  }, []);

  // ---- Denní checklist na ploše ----
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>(() => getDailyTasks().tasks);
  useEffect(() => {
    const handleUpdate = () => setDailyTasks(getDailyTasks().tasks);
    window.addEventListener(DAILY_CHECKLIST_CHANGED_EVENT, handleUpdate);
    return () => window.removeEventListener(DAILY_CHECKLIST_CHANGED_EVENT, handleUpdate);
  }, []);

  // ---- Živá dlaždice: Sklep (objem ležícího piva v hl a plné tanky) ----
  const [cellarLiveStats, setCellarLiveStats] = useState<{ activeTanks: number; totalHl: number } | null>(null);
  useEffect(() => {
    if (!visibleIds.includes('cellar')) return;
    supabase.from('cellar_tanks').select('status,current_volume_l').then(({ data }) => {
      const rows = data ?? [];
      const active = rows.filter((t: any) => t.status !== 'empty' && (t.current_volume_l || 0) > 0);
      const sumL = active.reduce((acc: number, t: any) => acc + (t.current_volume_l || 0), 0);
      if (active.length > 0) {
        setCellarLiveStats({ activeTanks: active.length, totalHl: Math.round(sumL / 100) });
      }
    });
  }, [visibleIds]);


  // ---- Živá dlaždice: Dnešní plánované stáčení lahví ----
  const [bottlingTodayCount, setBottlingTodayCount] = useState<number | null>(null);
  useEffect(() => {
    if (!visibleIds.includes('bottling') && !visibleIds.includes('bottling_needs')) return;
    const dnes = businessDateISO();
    supabase.from('bottling_plans').select('id', { count: 'exact', head: true })
      .eq('planned_date', dnes)
      .eq('status', 'planned')
      .then(({ count }) => setBottlingTodayCount(count && count > 0 ? count : null));
  }, [visibleIds]);

  // Modál rychlých akcí (Quick Actions)
  const [quickActionsTile, setQuickActionsTile] = useState<TileId | null>(null);

  const QUICK_ACTIONS: Partial<Record<Page, { id: string; label: string; sublabel?: string; icon: any; onClick: () => void }[]>> = useMemo(() => ({
    kegging: [
      { id: 'zapis', label: 'Nové stočení sudů', sublabel: 'Zápis stočení KEG piva', icon: IkonaSud, onClick: () => setPage('kegging', undefined, 'zapis') },
      { id: 'prehled', label: 'Přehled stočení', sublabel: 'Historie a statistika stočených sudů', icon: BarChart3, onClick: () => setPage('kegging', undefined, 'prehled') },
      { id: 'potreba', label: 'Potřeba sudů na závoz', sublabel: 'Výpočet chybějících sudů pro závozy', icon: TrendingDown, onClick: () => setPage('kegging', undefined, 'potreba') },
      { id: 'prefuk', label: 'Přefukování sudů', sublabel: 'Zápis a evidence přefuků', icon: ArrowLeftRight, onClick: () => setPage('kegging', undefined, 'prefuk') },
    ],
    bottling: [
      { id: 'zapis', label: 'Nové lahvování', sublabel: 'Zápis stočených lahví do skladu', icon: IkonaLahev, onClick: () => setPage('bottling', undefined, 'zapis') },
      { id: 'prehled', label: 'Přehled stočených lahví', sublabel: 'Historie a šarže lahvování', icon: BarChart3, onClick: () => setPage('bottling', undefined, 'prehled') },
      { id: 'potreby', label: 'Potřeby a plánování', sublabel: 'Plán stáčení lahví a materiál', icon: CalendarDays, onClick: () => setPage('bottling_needs') },
    ],
    orders: [
      { id: 'vse', label: 'Seznam objednávek', sublabel: 'Přehled všech aktivních objednávek', icon: ClipboardList, onClick: () => setPage('orders') },
      { id: 'zavoz', label: 'Rozvoz & Závozový list', sublabel: 'Plánování tras a závozů odběratelům', icon: Truck, onClick: () => setPage('orders_zavoz') },
      { id: 'whatsapp', label: 'Importovat WhatsApp zprávy', sublabel: 'Automatický převod zpráv na objednávky', icon: MessageCircle, onClick: () => { requestOrdersAutoImport(); setPage('orders'); } },
    ],
    orders_zavoz: [
      { id: 'zavoz', label: 'Závozový plánovač', sublabel: 'Rozvoz objednávek a plán tras', icon: Truck, onClick: () => setPage('orders_zavoz') },
      { id: 'objednavky', label: 'Všechny objednávky', sublabel: 'Přehled objednávek', icon: ClipboardList, onClick: () => setPage('orders') },
    ],
    cellar: [
      { id: 'lezacke', label: 'Ležácké tanky', sublabel: 'Stav tanků, stupňovitost, objemy a ležení', icon: Snowflake, onClick: () => setPage('cellar', undefined, 'lezacke') },
      { id: 'spilka', label: 'Spilka (hlavní kvašení)', sublabel: 'Kvasné tanky, mladina a kvašení', icon: FlaskConical, onClick: () => setPage('cellar', undefined, 'spilka') },
      { id: 'planovac', label: 'Plánovač obsazenosti', sublabel: 'Přehled obsazení sklepa v čase', icon: CalendarDays, onClick: () => setPage('cellar', undefined, 'planovac') },
    ],
    dashboard: [
      { id: 'sklad', label: 'Přehled skladu', sublabel: 'Kompletní stav piv a zásob', icon: BarChart3, onClick: () => setPage('dashboard') },
      { id: 'vratky', label: 'Evidence vratek sudů', sublabel: 'Příjem a evidence prázdných kegů', icon: IkonaSud, onClick: () => setPage('stock') },
      { id: 'odpis', label: 'Odpis ze skladu', sublabel: 'Zápis vadných nebo vylitých zásob', icon: TrendingDown, onClick: () => setPage('writeoffs') },
      { id: 'sklo', label: 'Sklo, etikety, podtáčky', sublabel: 'Materiály a promo předměty', icon: GlassWater, onClick: () => setPage('sklo_promo') },
    ],
    stock: [
      { id: 'vratky', label: 'Vratky sudů', sublabel: 'Příjem a vracení kegů od odběratelů', icon: IkonaSud, onClick: () => setPage('stock') },
      { id: 'sklad', label: 'Stav skladu piva', sublabel: 'Přehled naskladněných sudů a lahví', icon: BarChart3, onClick: () => setPage('dashboard') },
    ],
    vehicles: [
      { id: 'jizdy', label: 'Kniha jízd — nová jízda', sublabel: 'Záznam trasy a ujetých kilometrů', icon: BookOpen, onClick: () => setPage('kniha_jizd', undefined, 'jizdy') },
      { id: 'tankovani', label: 'Zapsat tankování PHM', sublabel: 'Litrů, cena a účtenky za naftu/benzín', icon: Droplet, onClick: () => setPage('kniha_jizd', undefined, 'tankovani') },
      { id: 'auta', label: 'Správa aut & STK', sublabel: 'Platnosti STK a dálničních známek', icon: Car, onClick: () => setPage('vehicles') },
    ],
    kniha_jizd: [
      { id: 'jizda', label: 'Zapsat novou jízdu', sublabel: 'Cíl cesty, řidič a kilometry', icon: BookOpen, onClick: () => setPage('kniha_jizd', undefined, 'jizdy') },
      { id: 'tank', label: 'Zapsat tankování PHM', sublabel: 'Účtenka a stav nádrže', icon: Droplet, onClick: () => setPage('kniha_jizd', undefined, 'tankovani') },
      { id: 'auta', label: 'Přehled vozidel', sublabel: 'Seznam aut v pivovaru', icon: Car, onClick: () => setPage('vehicles') },
    ],
    haccp: [
      { id: 'denik', label: 'Sanitační deník', sublabel: 'Zápis a protokoly sanitací', icon: FileText, onClick: () => setPage('sanitation_log') },
      { id: 'checklists', label: 'Kontrolní checklisty', sublabel: 'Denní a týdenní kontrolní seznamy', icon: ClipboardCheck, onClick: () => setPage('checklists') },
      { id: 'haccp', label: 'Sanitace výčepů a kegů', sublabel: 'HACCP evidence sanitačních cyklů', icon: Shield, onClick: () => setPage('haccp') },
    ],
    sanitation_log: [
      { id: 'denik', label: 'Nový zápis sanitace', sublabel: 'Záznam provedené sanitace', icon: FileText, onClick: () => setPage('sanitation_log') },
      { id: 'checklists', label: 'Checklisty', sublabel: 'Kontroly v pivovaru', icon: ClipboardCheck, onClick: () => setPage('checklists') },
    ],
    prodejna: [
      { id: 'pokladna', label: 'Nový prodej na prodejně', sublabel: 'Přímý nákup zákazníka', icon: Store, onClick: () => setPage('prodejna') },
      { id: 'historie', label: 'Přehled tržeb a historie', sublabel: 'Uzávěrky a souhrny prodeje', icon: Receipt, onClick: () => setPage('prodejna', undefined, 'historie') },
    ],
    depozitar: [
      { id: 'odberatele', label: 'Odběratelé', sublabel: 'Adresy, kontakty a závozy hospod', icon: MapPin, onClick: () => setPage('places') },
      { id: 'piva', label: 'Katalog piv', sublabel: 'Druhy piv, EPM, IBU a barvy', icon: BeerIcon, onClick: () => setPage('beers') },
      { id: 'obaly', label: 'Číselník obalů', sublabel: 'Sudy, lahve, přepravky a zálohy', icon: Tag, onClick: () => setPage('packages') },
      { id: 'cenik', label: 'Ceník piva a obalů', sublabel: 'Aktuální ceny a sazby', icon: Receipt, onClick: () => setPage('pricelist') },
    ],
    places: [
      { id: 'odberatele', label: 'Seznam odběratelů', sublabel: 'Správa hospod a kontaktů', icon: MapPin, onClick: () => setPage('places') },
      { id: 'cenik', label: 'Ceník', sublabel: 'Ceník pro odběratele', icon: Receipt, onClick: () => setPage('pricelist') },
    ],
    akce: [
      { id: 'akce', label: 'Pivní akce a festivaly', sublabel: 'Zapůjčené výčepy, piva a stánky', icon: Sparkles, onClick: () => setPage('akce') },
      { id: 'exkurze', label: 'Exkurze pivovaru', sublabel: 'Prohlídky a degustace', icon: Compass, onClick: () => setPage('exkurze') },
      { id: 'vycepy', label: 'Půjčovna výčepů', sublabel: 'Evidence zapůjčených chlazení', icon: IkonaVycep, onClick: () => setPage('vycepy') },
    ],
    concentration: [
      { id: 'kalkulacka', label: 'Kalkulačka ředění & koncentrace', sublabel: 'Výpočty pro mladinu a sanitaci', icon: FlaskConical, onClick: () => setPage('concentration') },
      { id: 'srotovani', label: 'Šrotování sladu', sublabel: 'Sypání a poměry sladů', icon: Wheat, onClick: () => setPage('srotovani') },
    ],
    radio: [
      { id: 'toggle', label: radioState.playing ? 'Pozastavit rádio' : 'Spustit rádio', sublabel: 'Přehrávání hudby na pozadí', icon: radioState.playing ? Pause : Play, onClick: () => toggleRadio() },
      { id: 'next', label: 'Další stanice', sublabel: 'Přepnout na další stanici', icon: SkipForward, onClick: () => nextStation() },
      { id: 'modal', label: 'Vybrat stanici', sublabel: 'Otevřít seznam stanic a nastavení', icon: Radio, onClick: () => window.dispatchEvent(new CustomEvent('pivovar:open-radio')) },
    ],
  }), [setPage, radioState.playing]);

  // ---- Hledat a WhatsApp — přesunuté z hlavičky (Layout.tsx) sem jako
  // dlaždice, ať jsou na Domů ve stejném stylu jako zbytek launcheru.
  // Hlavička je schovává jen na téhle stránce (viz Layout.tsx, isHome). ----
  const [showSearchModal, setShowSearchModal] = useState(false);

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

  // Nová verze appky — dřív automaticky vyskakující modál, teď jen tichá
  // dlaždice na Domů (stejný princip jako "Vozidla — STK/známka" níže):
  // uživatel si aktualizaci spustí sám kliknutím, kdy se mu to hodí, appka
  // ho k tomu nenutí uprostřed rozdělané práce.
  const [newVersionInfo, setNewVersionInfo] = useState<VersionInfo | null>(null);
  useEffect(() => onNewVersion((info) => setNewVersionInfo(info)), []);

  // Připomínková dlaždice na měsíční úklid — zůstává vidět, dokud ho uživatel
  // buď neudělá (tlačítko "Už je to provedeno" v modálu MonthlyCleanupWarning,
  // App.tsx), nebo měsíc neskončí. Modál žije mimo Domů, proto se poslouchá
  // vlastní event místo přímého sdílení reactu stavu (viz monthlyCleanup.ts).
  const [monthlyCleanupPending, setMonthlyCleanupPending] = useState(() => isMonthlyCleanupPending());
  useEffect(() => {
    const recheck = () => setMonthlyCleanupPending(isMonthlyCleanupPending());
    recheck();
    window.addEventListener(MONTHLY_CLEANUP_CHANGED_EVENT, recheck);
    return () => window.removeEventListener(MONTHLY_CLEANUP_CHANGED_EVENT, recheck);
  }, []);

  const editingGroup = editingTileId && isGroupId(editingTileId) ? layout.groups[editingTileId] : null;
  const editingItem = editingTileId && !isGroupId(editingTileId)
    ? (navById.get(editingTileId as Page) ?? (isCountdownId(editingTileId) ? ({ id: editingTileId as any, label: countdowns.find((c) => c.id === editingTileId.slice(3))?.label ?? 'Odpočet', icon: AlarmClock, group: 'Nástroje' as const } as NavItem) : null))
    : null;
  const editingOverride = editingTileId ? (layout.overrides[editingTileId] ?? {}) : null;

  // Dlaždice, co jde přidat přes "+ Přidat dlaždici": schované (layout.hidden)
  // + EXTRA_NAV položky, co ještě nejsou na žádné stránce ani ve skupině
  // + vlastní odpočty (countdowns).
  // Sjednocené v jednom seznamu — addTile() zvládne oba případy stejně
  // (odebere ze staré pozice, ať už to byla stránka nebo hidden).
  const placedSet = useMemo(() => {
    const s = new Set<TileId>();
    layout.pages.flat().forEach((id) => { s.add(id); });
    Object.values(layout.groups).forEach((g) => g.memberIds.forEach((m) => s.add(m)));
    return s;
  }, [layout.pages, layout.groups]);

  // Dlaždice, co jsou už na TÉTO stránce, se v seznamu nenabízí (nedává
  // smysl přidávat je znovu) — ale dlaždice umístěné na JINÉ stránce se
  // nabízí taky (výběr ji sem PŘESUNE, viz addTile), jen se zeleně
  // odznakují jako "už někde je", ať je jasné, co se stane.
  const currentPageSet = useMemo(() => new Set(layout.pages[currentPageIndex] ?? []), [layout.pages, currentPageIndex]);

  const addableCountdowns = useMemo(
    () => countdowns
      .filter((c) => !currentPageSet.has(`cd_${c.id}`))
      .map((c) => ({
        item: {
          id: `cd_${c.id}` as any,
          label: `${c.label} (${formatDurationMs(c.initialDurationMs || c.durationMs)})`,
          icon: AlarmClock,
          group: 'Nástroje' as const,
        } as NavItem,
        alreadyPlaced: placedSet.has(`cd_${c.id}`),
        category: 'Odpočty' as const,
      })),
    [countdowns, currentPageSet, placedSet]
  );

  const addableItems = useMemo(
    () => [
      ...[...visible, ...extraVisible]
        .filter((n) => !currentPageSet.has(n.id))
        .map((n) => ({ item: n, alreadyPlaced: placedSet.has(n.id), category: (PAGE_CATEGORY[n.id] ?? 'Ostatní') as Category | 'Ostatní' | 'Odpočty' })),
      ...addableCountdowns,
    ],
    [visible, extraVisible, currentPageSet, placedSet, addableCountdowns]
  );

  // Seskupené podle kategorie (stejné pořadí a rodina barev jako hlavní
  // mřížka, viz CATEGORY_ORDER/CATEGORY_SHADES) — v každé kategorii má
  // položka vlastní odstín (jen pro rozlišení v seznamu), ne nutně stejnou
  // barvu jako její skutečná dlaždice v mřížce.
  const addableGroups = useMemo(() => {
    const byCategory = new Map<Category | 'Ostatní' | 'Odpočty', typeof addableItems>();
    addableItems.forEach((entry) => {
      const cat = entry.category;
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(entry);
    });
    const order: (Category | 'Ostatní' | 'Odpočty')[] = [...CATEGORY_ORDER, 'Odpočty', 'Ostatní'];
    return order
      .filter((cat) => byCategory.has(cat))
      .map((cat) => ({ category: cat, items: byCategory.get(cat)! }));
  }, [addableItems]);

  function shadeFor(cat: Category | 'Ostatní' | 'Odpočty', indexInCategory: number): string {
    if (cat === 'Odpočty') return COLOR_HEX.violet;
    if (cat === 'Ostatní') return COLOR_HEX.slate;
    const shades = CATEGORY_SHADES[cat];
    return COLOR_HEX[shades[indexInCategory % shades.length]];
  }

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
      {/* Živý pruh varny / stopky / odpočet — zobrazí se nahoře jen když běží stopky nebo odpočet */}
      <BrewKettleTopBanner
        stopwatchState={stopwatchState}
        countdowns={countdowns}
        setPage={setPage}
      />

      <div className="hs-launcher">
        {editMode && (
          <div className="hs-controls">
            {hasCustomLayout && (
              <div className="hs-controls-group">
                <button className="hs-reset-btn" onClick={handleReset}>Obnovit výchozí</button>
              </div>
            )}
            <div className="hs-controls-group">
              <button className="hs-reset-btn" onClick={handleUnifyColors} title="Přebarví dlaždice tak, aby všechny ve stejné kategorii (Výroba/Pivovar/Nástroje/Číselníky/Nastavení) měly stejnou barvu">
                <Palette className="ikona-text" /> Sjednotit barvy dle kategorie
              </button>
            </div>
            {/* 🌗 Světlý / tmavý režim. Dřív byl jen v „Aplikace & Nastavení",
                kde ho při úpravě vzhledu plochy nikdo nehledal — patří sem,
                mezi ostatní volby vzhledu. */}
            <div className="hs-controls-group">
              <span className="hs-controls-label">Režim</span>
              {([
                ['light', 'Světlý'],
                ['dark', 'Tmavý'],
                ['system', 'Podle systému'],
              ] as const).map(([hodnota, popis]) => (
                <button
                  key={hodnota}
                  type="button"
                  className={`hs-tema-btn ${tema === hodnota ? 'active' : ''}`}
                  onClick={() => { setTheme(hodnota); setTema(hodnota); }}
                >
                  {popis}
                </button>
              ))}
            </div>

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
              {/* Zesvětlení pozadí — přes scénu se položí bílý závoj. Dřív se
                  barevné pozadí dalo ztlumit jen tím, že se přepnulo na bílou
                  scénu, čímž se ztratil odstín, který si člověk vybral. */}
              <label className="hs-svetlost" title="Zesvětlit pozadí">
                <Sun size={13} />
                <input
                  type="range"
                  min={MIN_SVETLOST}
                  max={MAX_SVETLOST}
                  step={0.05}
                  value={layout.bgSvetlost}
                  onChange={(e) => persist({ ...layout, bgSvetlost: Number(e.target.value) })}
                  className="hs-opacity-slider"
                  aria-label="Zesvětlit pozadí"
                />
              </label>
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
                    <button type="button" className="hs-dock-remove" title="Odebrat tenhle slot" onClick={() => handleRemoveDockSlot(i)}><X size={13} /></button>
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
            </div>
          </div>
        )}

        <div className="hs-pager">
            {(layout.pages.length > 1 || editMode) && (
            <>
            <button
              type="button"
              className="hs-pager-arrow vlastni-vyska"
              disabled={currentPageIndex === 0}
              onClick={() => setCurrentPageIndex((i) => Math.max(0, i - 1))}
              title="Předchozí stránka"
              aria-label="Předchozí stránka"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="hs-pager-dots">
              {layout.pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  className={`hs-pager-dot vlastni-vyska ${i === currentPageIndex ? 'active' : ''}`}
                  onClick={() => setCurrentPageIndex(i)}
                  title={`Stránka ${i + 1}`}
                />
              ))}
            </div>
            <button
              type="button"
              className="hs-pager-arrow vlastni-vyska"
              disabled={currentPageIndex === layout.pages.length - 1}
              onClick={() => setCurrentPageIndex((i) => Math.min(layout.pages.length - 1, i + 1))}
              title="Další stránka"
              aria-label="Další stránka"
            >
              <ChevronRight size={18} />
            </button>
            </>
            )}
            {/* Ovládání launcheru — malé ikony místo velkých dlaždic. */}
            <button
              type="button"
              className="hs-pager-manage vlastni-vyska"
              title="Hledat"
              aria-label="Hledat"
              onClick={() => setShowSearchModal(true)}
            >
              <Search size={17} />
            </button>
            <button
              type="button"
              className={`hs-pager-manage vlastni-vyska ${editMode ? 'hs-pager-manage-on' : ''}`}
              title={editMode ? 'Hotovo' : 'Upravit rozložení'}
              aria-label={editMode ? 'Hotovo' : 'Upravit rozložení'}
              onClick={() => { setEditMode((v) => !v); setSelectedTileId(null); }}
            >
              {editMode ? <Check size={17} /> : <SlidersHorizontal size={17} />}
            </button>
            <button
              type="button"
              className="hs-pager-manage vlastni-vyska"
              title="Odhlásit se"
              aria-label="Odhlásit se"
              onClick={async () => { if (await potvrd('Odhlásit se z aplikace?', { potvrdit: 'Odhlásit' })) signOut(); }}
            >
              <LogOut size={17} />
            </button>
            {editMode && (
              <>
                <button type="button" className="hs-pager-manage hs-pager-manage-labeled vlastni-vyska" onClick={handleAddPage}>
                  <Plus size={16} /> Přidat stránku
                </button>
                {layout.pages.length > 1 && (
                  <button type="button" className="hs-pager-manage vlastni-vyska" title="Smazat tuhle stránku" onClick={handleRemoveCurrentPage}>
                    <Trash2 size={16} />
                  </button>
                )}
                {addableItems.length > 0 && (
                  <button type="button" className="hs-pager-manage hs-pager-manage-labeled vlastni-vyska" onClick={() => setShowAddTileModal(true)}>
                    <Plus size={16} /> Přidat dlaždici
                  </button>
                )}
              </>
            )}
          </div>

        {/* Přejetí prstem kdekoliv nad dlaždicemi (mimo edit mód) přepíná
            stránku launcheru — viz handleSwipePointerDown/Up výš. */}
        {/* Nápověda při tažení dlaždice k okraji — svislý pruh, který ukáže,
            že se za okamžik přetočí stránka. Bez něj vypadá první přetočení
            jako by appka „ujela sama". */}
        {edgeHint && <div className={`hs-edge-hint ${edgeHint === 'vlevo' ? 'vlevo' : 'vpravo'}`} aria-hidden="true" />}

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
              {/* 💬 Nové WhatsApp zprávy čekající na parsování. Dřív to hlásil
                  odznak v hlavičce na každé obrazovce; hlavička je pryč, a
                  tohle je jediná věc z ní, která se opravdu hodí vidět —
                  objednávka, která přišla a ještě není zpracovaná. Ukáže se
                  jen když nějaká čeká, jinak nezabírá místo. */}
              {pendingWhatsApp > 0 && (
                <button
                  type="button"
                  className="hs-tile hs-tile-whatsapp vlastni-vyska"
                  onClick={() => { requestOrdersAutoImport(); setPage('orders'); }}
                  title={ticho?.posledni
                    ? `Nové zprávy k převodu na objednávky\nPoslední zpráva dorazila: ${new Date(ticho.posledni).toLocaleString('cs-CZ')}`
                    : 'Nové zprávy k převodu na objednávky'}
                >
                  <div className="hs-tile-icon-box">
                    <MessageCircle />
                  </div>
                  <div className="hs-lbl">WhatsApp — k parsování</div>
                  <span className="hs-badge">{pendingWhatsApp > 99 ? '99+' : pendingWhatsApp}</span>
                </button>
              )}
              {/* 📵 Z telefonu dlouho nic nedorazilo. Odznak výš zamrzne na
                  starém čísle a tváří se normálně, takže výpadek příjmu se
                  jinak pozná až tím, že objednávka někde chybí. */}
              {ticho?.varovat && (
                <button
                  type="button"
                  className="hs-tile hs-tile-alert vlastni-vyska"
                  onClick={() => setPage('orders')}
                  // Rada „zkontroluj Tasker" je z doby, kdy zprávy posílal
                  // Tasker z telefonu. Ten je pryč od verze 1.8xx, zprávy
                  // vozí WhatsApp most na Renderu — a jeho typická porucha
                  // je jiná: session zůstane přihlášená (most hlásí
                  // „připojeno"), ale WhatsApp na zařízení přestane
                  // doručovat. Sám se z toho nedostane, protože nikdy
                  // nepřijde `loggedOut`; spraví to jen nové spárování.
                  title={`Poslední zpráva dorazila ${new Date(ticho.posledni!).toLocaleString('cs-CZ')}.\nWhatsApp most nejspíš ztratil spárování — otevři https://whatsapp-bridge-g1v0.onrender.com/qr a načti QR ve WhatsAppu (Nastavení → Propojená zařízení).`}
                >
                  <div className="hs-tile-icon-box">
                    <MessageCircle />
                  </div>
                  <div className="hs-lbl">WhatsApp nechodí</div>
                  <span className="hs-badge">
                    {new Date(ticho.posledni!).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
                  </span>
                </button>
              )}
              {/* 🍺 Výčepy, které jsou pořád u zákazníka po skončení rezervace.
                  Leží u nich kauce i vybavení a dosud to nikde nesvítilo —
                  přišlo se na to, až když výčep někdo potřeboval. */}
              {vycepyPoTerminu.length > 0 && (
                <button
                  type="button"
                  className="hs-tile hs-tile-alert vlastni-vyska"
                  onClick={() => setPage('vycepy')}
                  title={vycepyPoTerminu
                    .map((v) => `${v.rezervace.tap_name || 'Výčep'} — ${v.rezervace.customer_name}, ${v.dniPoTerminu} dní`)
                    .join('\n')}
                >
                  <div className="hs-tile-icon-box">
                    <IkonaVycep />
                  </div>
                  <div className="hs-lbl">
                    Výčep u zákazníka
                    {kauceVenku(vycepyPoTerminu) > 0 && ` · ${kauceVenku(vycepyPoTerminu).toLocaleString('cs-CZ')} Kč`}
                  </div>
                  <span className="hs-badge">{vycepyPoTerminu[0].dniPoTerminu} dní</span>
                </button>
              )}
              {/* 📅 Dlouho se nedělala inventura. Ukáže se až po 40 dnech,
                  takže při běžném měsíčním rytmu mlčí. */}
              {stariInv?.pripomenout && (
                <button
                  type="button"
                  className={`hs-tile ${stariInv.naléhavé ? 'hs-tile-alert' : 'hs-tile-warn'} vlastni-vyska`}
                  onClick={() => setPage('inventory')}
                  title={stariInv.posledniMesic
                    ? `Chybí inventura za: ${stariInv.chybejiciMesice.map(nazevMesice).join(', ')}\nPoslední napočítaná: ${nazevMesice(stariInv.posledniMesic)}`
                    : 'Zatím není žádná napočítaná inventura'}
                >
                  <div className="hs-tile-icon-box">
                    <ClipboardCheck />
                  </div>
                  {/* Popisek krátký schválně — na téhle šířce se delší ořízne
                      (viz „Vozidla — STK/známka"). Odznak nese chybějící měsíc:
                      „srpen" řekne víc než počet dní a je to i pokyn, co udělat. */}
                  <div className="hs-lbl">Inventura</div>
                  <span className="hs-badge">
                    {stariInv.chybejiciMesice.length === 0
                      ? 'chybí'
                      : stariInv.chybejiciMesice.length === 1
                        ? MESICE_KRATCE[Number(stariInv.chybejiciMesice[0].slice(5, 7)) - 1]
                        : `${stariInv.chybejiciMesice.length} měs.`}
                  </span>
                </button>
              )}
              {vehicleAlerts.length > 0 && (
                <button type="button" className="hs-tile hs-tile-alert vlastni-vyska" onClick={() => setPage('vehicles')}>
                  <div className="hs-tile-icon-box">
                    <TriangleAlert />
                  </div>
                  <div className="hs-lbl">Vozidla — STK/známka</div>
                  <span className="hs-badge">{vehicleAlerts.length}</span>
                </button>
              )}
              {newVersionInfo && (
                <button
                  type="button"
                  className="hs-tile hs-tile-alert vlastni-vyska"
                  onClick={() => { void forceRefresh(); }}
                  title={`Nová verze v${newVersionInfo.version} (${newVersionInfo.date}) — klikni pro aktualizaci`}
                >
                  <div className="hs-tile-icon-box">
                    <Download />
                  </div>
                  <div className="hs-lbl">Nová aktualizace v{newVersionInfo.version}</div>
                </button>
              )}
              {monthlyCleanupPending && (
                <button type="button" className="hs-tile hs-tile-alert vlastni-vyska" onClick={() => setPage('bottling')}>
                  <div className="hs-tile-icon-box">
                    <CalendarX2 />
                  </div>
                  <div className="hs-lbl">Měsíční úklid — checklist</div>
                </button>
              )}
            </>
          )}
        </div>

        <div className={`hs-grid ${draggingId ? 'hs-mrizka-viditelna' : ''}`} style={{ ['--hs-tile-alpha' as any]: layout.tileOpacity, ['--hs-tile-gap' as any]: `${layout.tileGap}px`, ['--hs-sloupcu' as any]: cols, ['--hs-radek' as any]: `${rowHeight}px` }}>
          {/* Obrys buňky, kam dlaždice spadne. Kreslí se ve stejné velikosti
              jako přesouvaná dlaždice, aby bylo předem vidět, jestli se tam
              vejde — ne jen „někam sem". */}
          {draggingId && dropCell && (
            <div
              className="hs-drop-ghost"
              aria-hidden="true"
              style={tileGridStyle(
                dropCell.x,
                dropCell.y,
                layout.overrides[draggingId]?.w ?? 1,
                layout.overrides[draggingId]?.h ?? 1,
              )}
            />
          )}
          {/* Během tažení se kreslí z náhledu — ostatní dlaždice v něm už
              uhnuly. Mimo tažení je `nahledLayout` null a platí uložený stav. */}
          {/* 'signout' se nevykresluje — odhlášení je nahoře u šipek jako
              ikona. V uloženém rozložení zůstává, ať jde vrátit beze ztráty. */}
          {((nahledLayout ?? layout).pages[currentPageIndex] ?? []).filter((id) => id !== 'signout').map((id) => {
            const override = (nahledLayout ?? layout).overrides[id] ?? {};
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
                  isPresetColor={isPresetColor(override.color ?? defaultTileColor(id))}
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
            const item = navById.get(id as Page) ?? (isCountdownId(id) ? ({ id: id as any, label: countdowns.find((c) => c.id === id.slice(3))?.label ?? 'Odpočet', icon: AlarmClock, group: 'Nástroje' as const } as NavItem) : null);
            if (!item) return null;

            const activeNotesList = homeNotes.filter((n) => !n.completed).sort((a, b) => (b.important ? 1 : 0) - (a.important ? 1 : 0));
            // Na lístečku jsou i čerstvě odškrtnuté — přeškrtnuté, ať je vidět,
            // že se odškrtnutí povedlo, a dá se vzít zpět. Sama zmizí do 24 h
            // (viz uklidStareOdskrtnute), takže se lísteček nezanese.
            const notesTileList = [...activeNotesList, ...homeNotes.filter((n) => n.completed)];
            const doneTasksCount = dailyTasks.filter((t) => t.completed).length;
            const runningTimers = countdowns.filter((c) => c.targetAt !== null && countdownRemainingMs(c) > 0);
            const doneTimers = countdowns.filter((c) => c.targetAt !== null && countdownRemainingMs(c) === 0);
            const shortestRunning = runningTimers.length > 0
              ? runningTimers.reduce((min, cur) => (countdownRemainingMs(cur) < countdownRemainingMs(min) ? cur : min))
              : null;

            const badge =
              id === 'cellar' && cellarLiveStats ? `${cellarLiveStats.totalHl} hl`
              : (id === 'bottling' || id === 'bottling_needs') && bottlingTodayCount ? `${bottlingTodayCount} plán`
              : id === 'vehicles' && vehicleAlerts.length > 0 ? `${vehicleAlerts.length} STK`
              : id === 'notes' && activeNotesList.length > 0 ? `${activeNotesList.length} vzkazů`
              : id === 'checklists' && dailyTasks.length > 0 ? `${doneTasksCount}/${dailyTasks.length}`
              : (id === 'timer' || id === 'stopwatch') && doneTimers.length > 0 ? '⏰ Hotovo!'
              : (id === 'timer' || id === 'stopwatch') && runningTimers.length === 1 ? `⏱️ ${formatDurationMs(countdownRemainingMs(runningTimers[0]))}`
              : (id === 'timer' || id === 'stopwatch') && runningTimers.length > 1 ? `⏱️ ${runningTimers.length} běží (${formatDurationMs(countdownRemainingMs(shortestRunning!))})`
              : id === 'radio' && radioState.playing ? `📻 ${RADIO_STATIONS.find((s) => s.id === radioState.stationId)?.name || 'Hraje'}`
              : id === 'keg_timer' && kegLastDuration ? kegLastDuration
              : undefined;

            let customContent: React.ReactNode = undefined;

            // Vlastní widget Odpočtu (cd_*):
            if (isCountdownId(id)) {
              const timerId = id.slice(3);
              const timer = countdowns.find((c) => c.id === timerId);
              const remaining = timer ? countdownRemainingMs(timer) : 0;
              const running = timer?.targetAt !== null;
              const done = running && remaining === 0;
              const totalMs = timer?.initialDurationMs || timer?.durationMs || 1;
              const progress = running && !done ? Math.max(0, Math.min(1, 1 - remaining / totalMs)) : done ? 1 : 0;

              const timerLabel = timer?.label || 'Odpočet';
              const displayTime = formatDurationMs(remaining);

              customContent = (
                <div className="w-full h-full flex flex-col items-center justify-between p-1.5 py-2 text-center select-none overflow-hidden relative">
                  {/* Progress bar na spodním okraji dlaždice */}
                  {running && !done && (
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-black/15 overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-1000 ease-linear" style={{ width: `${progress * 100}%` }} />
                    </div>
                  )}
                  {done && (
                    <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-black shadow-xs animate-bounce">
                      🔔 Hotovo (reset)
                    </span>
                  )}
                  {done && <div className="absolute inset-0 bg-rose-500/15 animate-pulse rounded-xl pointer-events-none" />}

                  {/* Horní titulek odpočtu */}
                  <div className="flex items-center justify-center gap-1 opacity-85 text-[11px] font-black uppercase tracking-wider max-w-full px-1 truncate leading-tight">
                    <AlarmClock size={11} className={`shrink-0 ${running && !done ? 'text-emerald-700' : done ? 'text-rose-600' : ''}`} />
                    <span className="truncate">{timerLabel}</span>
                  </div>

                  {/* Velký digitální čas */}
                  <div className={`text-xl sm:text-2xl font-mono font-black tabular-nums tracking-tight leading-none my-0.5 ${done ? 'text-rose-600 animate-pulse' : running ? 'text-emerald-800' : ''}`}>
                    {displayTime}
                  </div>

                  {/* Spodní akční tlačítko / stav */}
                  <div className="flex items-center justify-center max-w-full">
                    {done ? (
                      <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white text-[11px] font-black shadow-xs animate-bounce">🔔 Hotovo</span>


                    ) : running ? (
                      <span className="inline-flex items-center justify-center gap-1 px-2 py-0.5 rounded-full bg-emerald-700 text-white text-[11px] font-black shadow-xs">
                        <Pause size={9} className="shrink-0" /> Pauza
                      </span>
                    ) : (
                      <span className="inline-flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-black shadow-xs active:scale-95">
                        <Play size={10} className="fill-current shrink-0 ml-0.5" /> Spustit
                      </span>
                    )}
                  </div>
                </div>
              );
            }

            // Widget Stopky & Časovač (timer):
            if ((id === 'timer' || id === 'stopwatch') && ((override.w ?? 1) >= 2 || (override.h ?? 1) >= 2)) {
              customContent = (
                <div className="w-full h-full flex flex-col justify-between p-3 text-left select-none overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-1">
                    <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                      <AlarmClock size={14} /> Časovače & Stopky
                    </span>
                    <span className="text-[11px] font-bold opacity-75">
                      {runningTimers.length > 0 ? `${runningTimers.length} běží` : `${countdowns.length} nastaveno`}
                    </span>
                  </div>
                  <div className="my-auto py-1 space-y-1">
                    {countdowns.length === 0 ? (
                      <p className="text-xs font-semibold opacity-70 italic">Klepnutím nastavíte časovač</p>
                    ) : (
                      countdowns.slice(0, 2).map((c) => {
                        const rem = countdownRemainingMs(c);
                        const isRun = c.targetAt !== null;
                        const isDone = isRun && rem === 0;
                        return (
                          <div key={c.id} className="flex items-center justify-between gap-2 text-xs font-bold">
                            <span className="truncate flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${isDone ? 'bg-rose-500 animate-ping' : isRun ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
                              {c.label}
                            </span>
                            <span className={`tabular-nums font-black ${isDone ? 'text-rose-700' : ''}`}>
                              {formatDurationMs(rem)}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="text-[11px] font-bold opacity-60 flex items-center justify-between pt-1 border-t border-black/10">
                    <span>{runningTimers.length > 0 ? 'Aktivní odpočty' : 'Časovač'}</span>
                    <span>Otevřít ➔</span>
                  </div>
                </div>
              );
            }

            // Widget Pivovarské Rádio (radio):
            if (id === 'radio') {
              const st = RADIO_STATIONS.find((s) => s.id === radioState.stationId) || RADIO_STATIONS[0];
              if ((override.w ?? 1) >= 2 || (override.h ?? 1) >= 2) {
                customContent = (
                  <div className="w-full h-full flex flex-col justify-between p-3 text-left select-none overflow-hidden">
                    <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-1">
                      <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                        <Radio size={14} /> Pivovarské Rádio
                      </span>
                      <span className="text-[11px] font-bold opacity-75">{radioState.playing ? 'Hraje na pozadí' : 'Vypnuto'}</span>
                    </div>
                    <div className="my-auto py-1 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl shrink-0">{st.icon}</span>
                        <div className="min-w-0">
                          <div className="font-black text-sm truncate">{st.name}</div>
                          <div className="text-[11px] opacity-75 font-semibold truncate">{st.genre}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRadio(); }}
                          className="p-2 rounded-full bg-black/15 hover:bg-black/25 active:scale-95 transition"
                          title={radioState.playing ? 'Pozastavit' : 'Přehrát'}
                        >
                          {radioState.playing ? <Pause size={15} className="fill-current" /> : <Play size={15} className="fill-current ml-0.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); nextStation(); }}
                          className="p-2 rounded-full bg-black/15 hover:bg-black/25 active:scale-95 transition"
                          title="Další stanice"
                        >
                          <SkipForward size={15} />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] font-bold opacity-60 flex items-center justify-between pt-1 border-t border-black/10">
                      <span>{radioState.playing ? 'Přehrává se' : 'Klepnutím spustit'}</span>
                      <span onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('pivovar:open-radio')); }}>Změnit stanici ➔</span>
                    </div>
                  </div>
                );
              }
            }

            // Widget Poznámky (notes):
            //
            // Lísteček ZÁMĚRNĚ neukazuje seznam poznámek ani jejich text.
            // Dřív ho ukazoval, ale jen na zvětšené dlaždici — na běžné
            // velikosti 1×1 se zadaná poznámka nezobrazila vůbec a vypadalo
            // to jako by se neuložila. Místo dvou různých podob podle
            // velikosti je tu jedna: lísteček je vstup do poznámek, číst a
            // odškrtávat se dá v okně. Kolik jich čeká, říká odznak na
            // dlaždici (proměnná `badge` výš).
            if (id === 'notes') {
              // Kolik se jich vejde — roste s plochou dlaždice, ať zvětšení
              // něco přineslo. Na nejmenší se vejde jedna, ale ta se ukáže
              // VŽDYCKY: dřív se na velikosti 1×1 nezobrazila žádná a
              // vypadalo to, jako by se poznámka neuložila.
              const kolikSeVejde = Math.max(1, (override.w ?? 1) * (override.h ?? 1) * 2);
              const kZobrazeni = notesTileList.slice(0, kolikSeVejde);
              customContent = (
                <div className="w-full h-full flex flex-col p-2 gap-1 text-left select-none overflow-hidden">
                  <div className="flex items-center gap-1 shrink-0 opacity-80">
                    <StickyNote size={11} className="shrink-0" />
                    <span className="text-[11px] font-black uppercase tracking-wider truncate">Poznámky</span>
                  </div>

                  {kZobrazeni.length === 0 ? (
                    <div className="flex-1 grid place-items-center text-[11px] font-bold opacity-70 leading-tight px-1 text-center">
                      Klepnutím přidáte poznámku
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                      {kZobrazeni.map((note) => (
                        <div key={note.id} className="flex items-start gap-1.5 min-w-0">
                          {/* Odškrtnutí přímo z plochy — kvůli tomu se nesmí
                              probublat klepnutí na dlaždici, které otevírá okno. */}
                          {/* Vlastní třídy místo velikostí z Tailwindu: v
                              HomeScreen.css je globální `.hs-tile svg { width:
                              24px; height: 24px }`, které nafoukne každou
                              ikonu v dlaždici — fajfka pak leze mimo rámeček. */}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); toggleHomeNote(note.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="hs-note-check"
                            title={note.completed ? 'Vrátit jako nesplněné' : 'Odškrtnout'}
                            aria-label={note.completed ? 'Vrátit jako nesplněné' : 'Odškrtnout'}
                          >
                            {note.completed && <Check />}
                          </button>
                          {note.important && !note.completed && (
                            <TriangleAlert className="hs-note-vykricnik" />
                          )}
                          <span className={`text-[11px] font-bold leading-tight line-clamp-2 min-w-0 ${note.completed ? 'line-through opacity-45' : ''}`}>
                            {note.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Widget Checklist (checklists):
            if (id === 'checklists' && ((override.w ?? 1) >= 2 || (override.h ?? 1) >= 2)) {
              const allDone = dailyTasks.length > 0 && doneTasksCount === dailyTasks.length;
              customContent = (
                <div className="w-full h-full flex flex-col justify-between p-3 text-left select-none overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-1">
                    <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                      <ClipboardCheck size={14} /> Denní úkoly
                    </span>
                    <span className={`text-[11px] font-bold ${allDone ? 'text-emerald-950 font-black' : 'opacity-80'}`}>
                      {doneTasksCount}/{dailyTasks.length} {allDone && '✓'}
                    </span>
                  </div>
                  <div className="my-auto py-1 space-y-1">
                    {dailyTasks.slice(0, 2).map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-xs font-bold truncate">
                        <span className={`w-3.5 h-3.5 rounded-xs border border-current grid place-items-center shrink-0 ${t.completed ? 'bg-current text-white font-black' : ''}`}>
                          {t.completed && <Check size={10} className="stroke-[3]" />}
                        </span>
                        <span className={`truncate ${t.completed ? 'line-through opacity-60' : ''}`}>{t.title}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[11px] font-bold opacity-60 flex items-center justify-between pt-1 border-t border-black/10">
                    <span>{allDone ? 'Vše splněno 🎉' : 'Dnešní rutina'}</span>
                    <span>Odškrtnout ➔</span>
                  </div>
                </div>
              );
            }

            // Widget Kalendář (calendar):
            if (id === 'calendar' && ((override.w ?? 1) >= 2 || (override.h ?? 1) >= 2)) {
              const now = new Date();
              const dayNum = now.getDate();
              const dayName = now.toLocaleDateString('cs-CZ', { weekday: 'long' });
              const monthName = now.toLocaleDateString('cs-CZ', { month: 'short' });
              customContent = (
                <div className="w-full h-full flex flex-col justify-between p-3 text-left select-none overflow-hidden">
                  <div className="flex items-center justify-between gap-2 border-b border-black/10 pb-1">
                    <span className="font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5 opacity-90">
                      <CalendarDays size={14} /> {dayName}
                    </span>
                    <span className="text-[11px] font-bold opacity-80">{dayNum}. {monthName}</span>
                  </div>
                  <div className="my-auto py-1 text-xs font-bold leading-snug">
                    {bottlingTodayCount ? (
                      <span className="flex items-center gap-1.5">
                        <IkonaLahev className="shrink-0" /> Dnes: {bottlingTodayCount} šarže stáčení
                      </span>
                    ) : (
                      <span className="opacity-80">Plánovač & události</span>
                    )}
                  </div>
                  <div className="text-[11px] font-bold opacity-60 flex items-center justify-between pt-1 border-t border-black/10">
                    <span>Plánovač</span>
                    <span>Kalendář ➔</span>
                  </div>
                </div>
              );
            }

            return (
              <LauncherTile
                key={id}
                id={id}
                item={item}
                override={override}
                isPresetColor={isPresetColor(override.color ?? defaultTileColor(id))}
                editing={editMode}
                selected={selectedTileId === id}
                onSelect={() => setSelectedTileId((cur) => (cur === id ? null : id))}
                badge={badge}
                customContent={customContent}
                tileOpacity={layout.tileOpacity}
                onClick={() => handleTileClick(id)}
                onDragPointerDown={(e) => handleTileDragPointerDown(id, e)}
                isDragging={draggingId === id}
                isPriming={primingId === id}
                dragOver={dragOverId === id}
                jiggling={editMode && draggingId !== null && draggingId !== id}
                onMoveStep={(dir) => handleMoveTileStep(id, dir)}
                onOpenEditor={() => setEditingTileId(id)}
                onOpenQuickActions={() => setQuickActionsTile(id)}
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
                  <input type="color" value={colorInputValue(editingOverride.color ?? defaultTileColor(editingTileId))} onChange={(e) => handleRecolor(editingTileId, e.target.value)} />
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
                          className="text-xs font-bold text-neutral-500 hover:text-rose-600"
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
                    {(layout.pages[currentPageIndex] ?? []).filter((id) => id !== editingTileId && !isCountdownId(id)).map((id) => {
                      const label = isGroupId(id) ? (layout.overrides[id]?.label || 'Skupina') : navById.get(id as Page)?.label;
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
                <button type="button" className="text-sm font-semibold text-rose-600" onClick={() => handleDeleteGroup(editingTileId as GroupId)}>Zrušit skupinu</button>
              ) : (
                <button type="button" className="text-sm font-semibold text-rose-600" onClick={() => handleHideTile(editingTileId)}>Skrýt dlaždici</button>
              )}
              <button type="button" className="text-sm font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded px-4 py-2" onClick={() => setEditingTileId(null)}>Hotovo</button>
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
              <p className="text-sm text-neutral-500">Všechny dostupné dlaždice už jsou na téhle stránce.</p>
            ) : (
              <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
                {addableGroups.map(({ category, items }) => (
                  <div key={category} className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-black uppercase tracking-wide text-neutral-500 px-1">{category}</span>
                    {items.map(({ item: n, alreadyPlaced }, i) => (
                      <button
                        key={n.id}
                        type="button"
                        className="flex items-center justify-between gap-3 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded px-4 py-2.5 text-left"
                        onClick={() => handleAddTile(n.id)}
                        title={alreadyPlaced ? 'Už je na jiné stránce — výběr ji sem přesune' : undefined}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: shadeFor(category, i) }} />
                          <n.icon size={17} className="text-neutral-600 shrink-0" />
                          <span className="font-bold text-sm text-neutral-800 truncate">{n.label}</span>
                        </span>
                        {alreadyPlaced && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Už je umístěná na jiné stránce" />
                        )}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-neutral-100">
              <button type="button" className="text-sm font-bold bg-amber-500 hover:bg-amber-400 text-neutral-950 rounded px-4 py-2" onClick={() => setShowAddTileModal(false)}>Hotovo</button>
            </div>
          </div>
        </Modal>
      )}

      {quickActionsTile && (
        <Modal
          open
          onClose={() => {
            setQuickActionsTile(null);
            setQaShowAddForm(false);
          }}
          title={
            isCountdownId(quickActionsTile)
              ? `Odpočet — ${countdowns.find((c) => c.id === quickActionsTile.slice(3))?.label ?? 'Odpočet'}`
              : quickActionsTile === 'timer' || quickActionsTile === 'stopwatch'
              ? '⏱️ Moje odpočty & Časovač'
              : `Rychlé akce — ${navById.get(quickActionsTile as Page)?.label ?? 'Modul'}`
          }
        >
          {quickActionsTile === 'timer' || quickActionsTile === 'stopwatch' ? (
            <div className="space-y-4 pt-1 pb-1">
              {/* Rychlý start předvolby */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-black uppercase tracking-wider text-neutral-500 flex items-center justify-between">
                  <span>⚡ Rychlý start odpočtu</span>
                  <button
                    type="button"
                    onClick={() => setQaShowAddForm(!qaShowAddForm)}
                    className="text-amber-700 hover:text-amber-800 font-bold"
                  >
                    {qaShowAddForm ? '✕ Zavřít' : '＋ Vlastní'}
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {[
                    { label: 'Kotel', min: 2 },
                    { label: 'Chmelení', min: 15 },
                    { label: 'Chmelovar', min: 60 },
                    { label: 'Máčení kvasnic', min: 10 },
                    { label: 'Pauza', min: 5 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        quickCreateCountdown(p.label, p.min, true, false);
                      }}
                      className="flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-950 font-bold text-xs shadow-xs transition active:scale-95 text-left"
                    >
                      <span className="truncate">{p.label}</span>
                      <span className="text-[11px] font-black text-amber-700 bg-amber-200/70 px-1.5 py-0.5 rounded">{p.min}′</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Formulář pro rychlé vytvoření nového odpočtu */}
              {qaShowAddForm && (
                <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200 space-y-2">
                  <div className="text-xs font-bold text-neutral-800">＋ Nový vlastní odpočet</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Název (např. Varna)"
                      value={qaNewTimerLabel}
                      onChange={(e) => setQaNewTimerLabel(e.target.value)}
                      className="flex-1 min-w-0 border border-neutral-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                    />
                    <input
                      type="number"
                      min="1"
                      max="300"
                      value={qaNewTimerMin}
                      onChange={(e) => setQaNewTimerMin(e.target.value)}
                      className="w-16 border border-neutral-300 rounded-lg px-2 py-1.5 text-xs text-center font-bold bg-white"
                      title="Minuty"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const m = Number(qaNewTimerMin);
                        if (!m || m <= 0) return;
                        quickCreateCountdown(qaNewTimerLabel || `${m} min`, m, true, false);
                        setQaNewTimerLabel('');
                        setQaNewTimerMin('2');
                        setQaShowAddForm(false);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-black shrink-0"
                    >
                      Spustit
                    </button>
                  </div>
                </div>
              )}

              {/* Seznam nastavených odpočtů */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-neutral-500">
                  <span>Moje aktivní a nastavené odpočty ({countdowns.length})</span>
                  {countdowns.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          startAllCountdowns();
                          setCountdowns(getCountdowns());
                          oznam('Všechny odpočty spuštěny');
                        }}
                        className="text-[11px] text-emerald-700 hover:underline font-black"
                      >
                        Spustit vše
                      </button>
                      <span>•</span>
                      <button
                        type="button"
                        onClick={() => {
                          pauseAllCountdowns();
                          setCountdowns(getCountdowns());
                          oznam('Všechny odpočty pozastaveny');
                        }}
                        className="text-[11px] text-amber-700 hover:underline font-black"
                      >
                        Pauza vše
                      </button>
                    </div>
                  )}
                </div>

                {countdowns.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-neutral-300 text-center text-xs text-neutral-500 bg-neutral-50">
                    Zatím nemáš vytvořený žádný odpočet. Vyber si nahoře rychlý start nebo klepni na <strong>＋ Vlastní</strong>.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[45vh] overflow-y-auto pr-0.5">
                    {countdowns.map((t) => {
                      const rem = countdownRemainingMs(t);
                      const isRun = t.targetAt !== null;
                      const isDone = isRun && rem === 0;
                      const pinned = isCountdownPinned(t.id);

                      return (
                        <div
                          key={t.id}
                          className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition ${
                            isDone
                              ? 'bg-rose-50 border-rose-300 shadow-xs'
                              : isRun
                              ? 'bg-amber-50/80 border-amber-300 shadow-xs'
                              : 'bg-white border-neutral-200'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-black text-xs text-neutral-900 truncate flex items-center gap-1.5">
                              <AlarmClock size={14} className={isRun && !isDone ? 'text-amber-600 animate-pulse' : 'text-neutral-500'} />
                              <span className="truncate">{t.label}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  toggleCountdown(t.id);
                                  setCountdowns(getCountdowns());
                                }}
                                className={`inline-flex items-center justify-center gap-1 rounded-full text-[11px] font-black shadow-xs transition ${
                                  isDone
                                    ? 'px-2 py-0.5 bg-rose-600 text-white animate-bounce hover:bg-rose-500'
                                    : isRun
                                    ? 'px-2 py-0.5 bg-amber-500 text-neutral-950 hover:bg-amber-400'
                                    : 'px-2.5 py-0.5 bg-emerald-600 text-white hover:bg-emerald-500'
                                }`}
                              >
                                {isDone ? '🔔 Spustit znovu' : isRun ? 'Pauza' : 'Start'}
                              </button>
                              <span className={`text-sm font-mono font-black tabular-nums ${isDone ? 'text-rose-600 animate-pulse' : isRun ? 'text-amber-700' : 'text-neutral-600'}`}>
                                {formatDurationMs(rem)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                resetCountdown(t.id);
                                setCountdowns(getCountdowns());
                              }}
                              title="Resetovat čas"
                              className="p-1.5 text-neutral-500 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-lg"
                            >
                              <RotateCcw size={13} />
                            </button>

                            <button
                              type="button"
                              onClick={() => toggleCountdownPin(t)}
                              title={pinned ? 'Odebrat z domovské plochy' : 'Připnout na domovskou plochu jako dlaždici'}
                              className={`p-1.5 rounded-lg border text-xs font-bold transition ${
                                pinned ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-neutral-50 text-neutral-400 border-neutral-200 hover:bg-neutral-100'
                              }`}
                            >
                              <Pin size={13} className={pinned ? 'rotate-45 fill-current text-amber-700' : ''} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Odkaz do celé obrazovky */}
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setQuickActionsTile(null);
                    setPage('timer');
                  }}
                  className="text-xs font-bold text-neutral-700 hover:text-neutral-950 flex items-center gap-1.5"
                >
                  <AlarmClock size={15} /> Otevřít celé nastavení časovačů ➔
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 pt-1 pb-1">
              {(isCountdownId(quickActionsTile)
                ? (() => {
                    const timerId = quickActionsTile.slice(3);
                    const timer = countdowns.find((c) => c.id === timerId);
                    const running = timer?.targetAt !== null;
                    return [
                      {
                        id: 'toggle',
                        label: running ? 'Pozastavit odpočet' : 'Spustit odpočet',
                        sublabel: running ? 'Zastaví běžící čas' : 'Spustí zbývající čas',
                        icon: running ? Pause : Play,
                        onClick: () => {
                          toggleCountdown(timerId);
                          setCountdowns(getCountdowns());
                        },
                      },
                      {
                        id: 'reset',
                        label: 'Resetovat odpočet',
                        sublabel: 'Nastaví původní čas',
                        icon: RotateCcw,
                        onClick: () => {
                          resetCountdown(timerId);
                          setCountdowns(getCountdowns());
                        },
                      },
                      {
                        id: 'open_timers',
                        label: 'Otevřít Časovač',
                        sublabel: 'Všechny stopky a odpočty',
                        icon: AlarmClock,
                        onClick: () => setPage('timer'),
                      },
                      {
                        id: 'remove',
                        label: 'Odebrat z plochy',
                        sublabel: 'Schová dlaždici z domovské obrazovky',
                        icon: Trash2,
                        onClick: () => handleHideTile(quickActionsTile),
                      },
                    ];
                  })()
                : QUICK_ACTIONS[quickActionsTile as Page] ?? [
                    {
                      id: 'open',
                      label: `Otevřít ${navById.get(quickActionsTile as Page)?.label ?? ''}`,
                      sublabel: 'Přejít na hlavní stránku modulu',
                      icon: navById.get(quickActionsTile as Page)?.icon ?? PlusCircle,
                      onClick: () => setPage(quickActionsTile as Page),
                    },
                  ]
              ).map((qa) => {
                const QAIcon = qa.icon;
                return (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={() => {
                      setQuickActionsTile(null);
                      qa.onClick();
                    }}
                    className="w-full flex items-center gap-3.5 p-3 rounded-xl border border-neutral-200/80 bg-neutral-50/70 hover:bg-white hover:border-amber-400/80 hover:shadow-sm active:scale-[0.99] transition text-left"
                  >
                    <span className="w-10 h-10 shrink-0 grid place-items-center rounded-xl bg-amber-50 text-amber-900 border border-amber-200/60 shadow-xs">
                      <QAIcon size={20} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-bold text-sm text-neutral-900 leading-snug">{qa.label}</span>
                      {qa.sublabel && <span className="block text-xs text-neutral-500 font-medium mt-0.5 leading-tight">{qa.sublabel}</span>}
                    </span>
                    <ChevronRight size={18} className="text-neutral-400 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </Modal>
      )}

      <HomeNotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
      />

      <HomeChecklistModal
        isOpen={showChecklistModal}
        onClose={() => setShowChecklistModal(false)}
      />

      <QuickSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectPage={setPage}
      />
    </div>
  );
}

/**
 * Živý pruh varny / kotel a odpočet na domovské obrazovce:
 * Zobrazuje se nahoře pouze tehdy, když běží stopky nebo odpočet.
 * Obsahuje ikonu pivovarského kotle s animací páry/plamene,
 * velký digitální čas, progress bar a přímá tlačítka Pauza/Start.
 */
function BrewKettleTopBanner({
  stopwatchState,
  countdowns,
  setPage,
}: {
  stopwatchState: StopwatchState;
  countdowns: CountdownTimer[];
  setPage: (p: Page) => void;
}) {
  const isStopwatchActive = stopwatchState.running || stopwatchState.elapsedBeforeMs > 0;
  const runningCountdown = countdowns.find((c) => c.targetAt !== null);
  const doneCountdown = countdowns.find((c) => c.targetAt !== null && countdownRemainingMs(c) === 0);

  const [pruhCasovaceSkryt, setPruhCasovaceSkryt] = useState(
    () => { try { return localStorage.getItem(KLIC_PRUH_CASOVACE) === '1'; } catch { return false; } },
  );
  function skryjPruh() {
    try { localStorage.setItem(KLIC_PRUH_CASOVACE, '1'); } catch { /* plná paměť */ }
    setPruhCasovaceSkryt(true);
    try { navigator.vibrate?.(10); } catch {}
  }

  // Jednou zavřený pruh se už nevrací. Časovač patří na svou dlaždici — ta
  // ukazuje odpočet i stav — a ne přes celou šířku plochy na každé otevření.
  // Volba se pamatuje (localStorage), takže platí i po zavření appky.
  if (pruhCasovaceSkryt) return null;
  if (!isStopwatchActive && !runningCountdown && !doneCountdown) return null;

  return (
    <div
      onClick={() => setPage(runningCountdown || doneCountdown ? 'timer' : 'stopwatch')}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-amber-950/90 via-neutral-900/95 to-amber-950/90 border-2 border-amber-500/50 p-3.5 shadow-xl backdrop-blur-md cursor-pointer hover:border-amber-400 transition group select-none text-white animate-in fade-in duration-300"
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-500/15 via-transparent to-transparent pointer-events-none" />
      <div className="relative flex items-center justify-between gap-3">
        {/* Kotel ikona a animace plamene/pary */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/50 shrink-0 shadow-inner group-hover:scale-105 transition-transform">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 text-amber-400 fill-amber-400/20"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3c0 1.5-1 2-1 3" className="animate-pulse opacity-80" />
              <path d="M12 2c0 1.5-1 2-1 3" className="animate-bounce opacity-100 text-amber-300" />
              <path d="M16 3c0 1.5-1 2-1 3" className="animate-pulse opacity-80" />
              <path d="M5 8h14" />
              <path d="M10 8V6a2 2 0 0 1 4 0v2" />
              <path d="M5 8v6a6 6 0 0 0 6 6h2a6 6 0 0 0 6-6V8" />
              <path d="M3 10h2" />
              <path d="M19 10h2" />
            </svg>
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
            </span>
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-amber-300">
              <Flame size={14} className="text-primary-400 animate-pulse shrink-0" />
              <span className="truncate">
                {doneCountdown
                  ? `⏰ ${doneCountdown.label} — HOTOVO!`
                  : runningCountdown
                  ? `Varna / Kotel: ${runningCountdown.label}`
                  : stopwatchState.running
                  ? 'Varna / Kotel: Stopky běží'
                  : 'Stopky pozastaveny'}
              </span>
            </div>
            <div className="text-[11px] text-neutral-300 font-semibold truncate">
              {doneCountdown
                ? 'Čas vypršel, klepnutím otevřít'
                : runningCountdown
                ? 'Živý odpočet na pozadí'
                : 'Měření času varny na pozadí'}
            </div>
          </div>
        </div>

        {/* Velký digitální čas a rychlé akce */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className={`font-mono font-black text-xl sm:text-2xl tracking-tight tabular-nums ${doneCountdown ? 'text-rose-400 animate-pulse' : 'text-amber-200'}`}>
              {doneCountdown
                ? '00:00'
                : runningCountdown
                ? formatDurationMs(countdownRemainingMs(runningCountdown))
                : formatDurationMs(stopwatchElapsedMs(stopwatchState))}
            </div>
            {runningCountdown && (runningCountdown.initialDurationMs || runningCountdown.durationMs) && (
              <div className="w-24 sm:w-32 bg-white/20 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                  className="bg-amber-400 h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.max(0, Math.min(100, (1 - countdownRemainingMs(runningCountdown) / (runningCountdown.initialDurationMs || runningCountdown.durationMs)) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {runningCountdown ? (
              <button
                type="button"
                onClick={() => toggleCountdown(runningCountdown.id)}
                className="p-2 rounded-xl bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 border border-amber-500/40 transition active:scale-95"
                title="Pozastavit / Spustit odpočet"
              >
                <Pause size={16} />
              </button>
            ) : isStopwatchActive ? (
              <button
                type="button"
                onClick={() => {
                  if (stopwatchState.running) {
                    saveStopwatchState({
                      ...stopwatchState,
                      running: false,
                      elapsedBeforeMs: stopwatchElapsedMs(stopwatchState),
                      startedAt: null,
                    });
                  } else {
                    saveStopwatchState({
                      ...stopwatchState,
                      running: true,
                      startedAt: Date.now(),
                    });
                  }
                }}
                className="p-2 rounded-xl bg-amber-500/30 hover:bg-amber-500/50 text-amber-200 border border-amber-500/40 transition active:scale-95"
                title={stopwatchState.running ? 'Pozastavit' : 'Pokračovat'}
              >
                {stopwatchState.running ? <Pause size={16} /> : <Play size={16} />}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => setPage(runningCountdown || doneCountdown ? 'timer' : 'stopwatch')}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition active:scale-95"
              title="Otevřít stopky / časovač"
            >
              <ChevronRight size={16} />
            </button>

            {/* Zavření pruhu — NATRVALO. Časovač patří na svou dlaždici, ta
                ukazuje odpočet i to, že doběhl; pruh přes celou šířku plochy
                jen zabíral místo. Doběhnutý odpočet se u toho vrátí na
                výchozí dobu (resetCountdown ho NEMAŽE), ať pruh nezmizí a
                nenechá po sobě viset „HOTOVO!" ve stavu.
                Zpátky se pruh dá zapnout v nastavení plochy. */}
            <button
              type="button"
              onClick={() => {
                if (doneCountdown) resetCountdown(doneCountdown.id);
                skryjPruh();
              }}
              className="p-2 rounded-xl bg-white/10 hover:bg-rose-500/40 text-white transition active:scale-95"
              title="Skrýt pruh — časovač zůstane na dlaždici"
              aria-label="Skrýt pruh časovače"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
