// Domovská obrazovka appky — přizpůsobitelný dlaždicový launcher (styl
// Windows Phone / Nokia Lumia): pořadí, velikost a barva dlaždic i barevné
// pozadí jde v "Upravit rozložení" módu měnit a ukládá se per uživatel
// (profiles.home_layout), takže se to synchronizuje napříč zařízeními.
// Výjimka nad dlaždicemi: upozornění na STK/dálniční známku vozidel —
// zobrazuje se jen komu je nastaveno (Uživatelé → "Dostává upozornění na
// vozidla") a musí ho jednou potvrdit, pak zmizí (dokud se stav nezmění).
import { useEffect, useMemo, useState, useRef } from 'react';
import { Search, MessageCircle, SlidersHorizontal, LogOut, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { NAV, type Page } from '../components/Layout';
import { isoWeekKey, weekRange } from '../components/WeeklyOrderSummaryCard';
import LauncherTile from '../components/LauncherTile';
import { QuickSearchModal } from '../components/QuickSearchModal';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase, Vehicle } from '../lib/supabase';
import { fetchPendingWhatsAppCount } from '../lib/whatsappApi';
import { getVehicleExpiryStatus } from './Catalogs';
import {
  getHomeLayout, saveHomeLayout, addPage, removePage, moveTileToPage,
  TILE_SIZES, SCENES, MIN_OPACITY, MAX_OPACITY,
  type HomeLayout,
} from '../lib/homeLayout';
import './HomeScreen.css';

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
  const navById = useMemo(() => new Map(visible.map((n) => [n.id, n])), [visible]);

  // ---- Launcher: stránky / velikost / barva / scéna, uložené v profilu ----
  const [layout, setLayout] = useState<HomeLayout>(() => getHomeLayout((profile as any)?.home_layout, visibleIds));
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  useEffect(() => {
    setLayout((prev) => getHomeLayout(prev, visibleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds.join(',')]);
  useEffect(() => {
    const raw = (profile as any)?.home_layout;
    setLayout(getHomeLayout(raw, visibleIds));
    setHasCustomLayout(!!raw && Object.keys(raw).length > 0);
    // Reagujeme jen na skutečnou změnu uloženého layoutu z profilu (např. po
    // přihlášení na jiném zařízení) — visibleIds řeší efekt výše.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(profile as any)?.home_layout]);
  // Pokud se smazáním stránky (nebo na jiném zařízení) zmenší počet stránek
  // pod aktuální index, spadneme na poslední existující.
  useEffect(() => {
    setCurrentPageIndex((i) => Math.min(i, layout.pages.length - 1));
  }, [layout.pages.length]);

  const [editMode, setEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<Page | null>(null);
  const [dragOverId, setDragOverId] = useState<Page | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasCustomLayout, setHasCustomLayout] = useState(!!(profile as any)?.home_layout && Object.keys((profile as any).home_layout).length > 0);

  function persist(next: HomeLayout) {
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

  // Přesun dlaždice: "klepni a klepni" (tap-to-swap), ne gesto přetažení.
  // Pointer-based drag (i s pointer capture a touch-action:none) se na
  // dotykových zařízeních nedařilo spolehlivě rozjet; klepnutí je jediná
  // interakce, co prokazatelně funguje všude. Klepneš na dlaždici → vybere
  // se; klepneš na jinou → prohodí se pozice v rámci aktuální stránky;
  // klepneš na tu samou znovu → zruší se výběr.
  // Přesun dlaždice: podržení prstu (long-press), stejně jako na Androidu —
  // ne okamžitý drag od prvního dotyku. Krátký dotek / rychlé přejetí (=
  // pokus o scroll) se zruší dřív, než se cokoliv začne přesouvat; teprve
  // po ~450ms bez pohybu se dlaždice "zvedne" a od tohoto momentu sledování
  // prstu přesouvá. Řeší se tu na window (ne jen na dlaždici), ať to funguje
  // i když prst při tažení sjede mimo původní element.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  function findTileIdAtPoint(clientX: number, clientY: number): Page | null {
    const el = document.elementFromPoint(clientX, clientY);
    const tileEl = el?.closest('[data-tile-id]') as HTMLElement | null;
    return (tileEl?.dataset.tileId as Page | undefined) ?? null;
  }
  function handleTileDragPointerDown(id: Page, e: React.PointerEvent) {
    const startX = e.clientX;
    const startY = e.clientY;
    longPressFired.current = false;

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      setDraggingId(null);
      setDragOverId(null);
    }
    function onMove(ev: PointerEvent) {
      if (!longPressFired.current) {
        // Dokud se čeká na podržení, pohyb nad ~10px = uživatel chtěl
        // scrollovat/přejet, ne přesouvat — zrušit bez zásahu.
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) cleanup();
        return;
      }
      const overId = findTileIdAtPoint(ev.clientX, ev.clientY);
      setDragOverId(overId && overId !== id ? overId : null);
    }
    function onUp(ev: PointerEvent) {
      if (longPressFired.current) {
        const overId = findTileIdAtPoint(ev.clientX, ev.clientY);
        if (overId && overId !== id) {
          setLayout((prevLayout) => {
            const pageTiles = [...prevLayout.pages[currentPageIndex]];
            const from = pageTiles.indexOf(id);
            const to = pageTiles.indexOf(overId);
            if (from < 0 || to < 0) return prevLayout;
            pageTiles.splice(to, 0, pageTiles.splice(from, 1)[0]);
            const pages = prevLayout.pages.map((p, i) => (i === currentPageIndex ? pageTiles : p));
            const next = { ...prevLayout, pages };
            persist(next);
            return next;
          });
        }
      }
      cleanup();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setDraggingId(id);
      try { navigator.vibrate?.(15); } catch {}
    }, 450);
  }
  function handleCycleSize(id: Page) {
    const current = layout.overrides[id]?.size ?? 'n';
    const next = TILE_SIZES[(TILE_SIZES.indexOf(current) + 1) % TILE_SIZES.length];
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], size: next } } });
  }
  function handleRecolor(id: Page, color: string) {
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], color } } });
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
  function handleDockChange(slot: number, id: Page) {
    const dock = [...layout.dock];
    dock[slot] = id;
    persist({ ...layout, dock });
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
  function handleMoveTileToPage(id: Page, targetPageIndex: number) {
    persist(moveTileToPage(layout, id, targetPageIndex));
  }
  function handleReset() {
    const next = getHomeLayout(null, visibleIds);
    setLayout(next);
    setHasCustomLayout(false);
    patchProfile({ home_layout: {} as any });
    if (user?.id) saveHomeLayout(user.id, {} as any);
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

  // Podpis aktuální sady upozornění — když se změní (nové vozidlo, jiné datum),
  // dřívější potvrzení už neplatí a banner se objeví znovu.
  const alertsSignature = vehicleAlerts.map((a) => `${a.vehicleName}|${a.label}`).sort().join(';');
  const ackKey = `vehicle_alerts_ack_${user?.id || 'guest'}`;
  const [ackSignature, setAckSignature] = useState<string>(() => {
    try { return localStorage.getItem(ackKey) || ''; } catch { return ''; }
  });
  const showVehicleBanner = vehicleAlerts.length > 0 && alertsSignature !== ackSignature;
  function acknowledgeVehicleAlerts() {
    try { localStorage.setItem(ackKey, alertsSignature); } catch {}
    setAckSignature(alertsSignature);
  }

  return (
    <div className="flex flex-col gap-4 min-h-full">
      {showVehicleBanner && (
        <div className="p-4 rounded-3xl bg-white border-2 border-amber-300 shadow-md space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white border-2 border-amber-300 text-amber-900 flex items-center justify-center text-xl font-black shrink-0">
              🚗
            </div>
            <div className="font-extrabold text-sm text-neutral-900">
              Upozornění vozového parku (STK / Dálniční známky)
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {vehicleAlerts.map((a, i) => (
              <span key={i} className={`text-xs font-bold px-3 py-1 rounded-xl ${a.status === 'expired' ? 'bg-rose-600 text-white font-black animate-pulse' : 'bg-amber-100 text-amber-950 border border-amber-300'}`}>
                <strong>{a.vehicleName}</strong> — {a.label}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2 flex-wrap">
            <button
              onClick={() => setPage('vehicles')}
              className="px-3.5 py-2 rounded-xl bg-white border border-amber-300 text-amber-900 font-black text-xs hover:bg-amber-50 transition"
            >
              Přejít do evidence aut →
            </button>
            <button
              onClick={acknowledgeVehicleAlerts}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-sm transition"
            >
              ✅ Ano, přečetl jsem si a vím o tom
            </button>
          </div>
        </div>
      )}

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
            <div className="hs-controls-group hs-dock-group">
              <span className="hs-controls-label">Spodní lišta</span>
              {layout.dock.map((dockId, i) => (
                <select
                  key={i}
                  className="hs-dock-select"
                  value={dockId}
                  onChange={(e) => handleDockChange(i, e.target.value as Page)}
                >
                  <option value="home">Domů</option>
                  {visible.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              ))}
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
              </>
            )}
          </div>
        )}

        <div className="hs-grid" style={{ ['--hs-tile-alpha' as any]: layout.tileOpacity }}>
          {/* Pevné dlaždice (nepřesouvají se/nemění velikost, nejsou
              součástí uloženého pořadí, jen na 1. stránce): Hledat a
              Objednávky k parsování přesunuté sem z hlavičky. Počet
              objednávek tohoto týdne je odznak přímo na běžné dlaždici
              Objednávky (layout.pages), ne samostatná dlaždice navíc. */}
          {currentPageIndex === 0 && (
            <>
              <button type="button" className="hs-tile c-slate" onClick={() => setShowSearchModal(true)}>
                <Search />
                <div className="hs-lbl">Hledat</div>
              </button>
              <button type="button" className="hs-tile c-mint" onClick={openWhatsAppFromTile}>
                <MessageCircle />
                <div className="hs-lbl">Objednávky k parsování</div>
                {pendingWhatsApp > 0 && <span className="hs-badge">{pendingWhatsApp > 99 ? '99+' : pendingWhatsApp}</span>}
              </button>
            </>
          )}
          <button
            type="button"
            className={`hs-tile ${editMode ? 'c-indigo' : 'c-forest'}`}
            onClick={() => setEditMode((v) => !v)}
          >
            <SlidersHorizontal />
            <div className="hs-lbl">{editMode ? 'Hotovo' : 'Upravit rozložení'}</div>
          </button>
          {currentPageIndex === 0 && (
            <button
              type="button"
              className="hs-tile c-crimson"
              onClick={() => { if (window.confirm('Odhlásit se z appky?')) signOut(); }}
            >
              <LogOut />
              <div className="hs-lbl">Odhlásit se</div>
            </button>
          )}

          {(layout.pages[currentPageIndex] ?? []).map((id) => {
            const item = navById.get(id);
            if (!item) return null;
            const badge = id === 'orders' && pendingOrders ? pendingOrders : undefined;
            return (
              <LauncherTile
                key={id}
                item={item}
                override={layout.overrides[id] ?? {}}
                editing={editMode}
                badge={badge}
                tileOpacity={layout.tileOpacity}
                pageCount={layout.pages.length}
                currentPage={currentPageIndex}
                onMoveToPage={(target) => handleMoveTileToPage(id, target)}
                onClick={() => setPage(id)}
                onDragPointerDown={(e) => handleTileDragPointerDown(id, e)}
                isDragging={draggingId === id}
                dragOver={dragOverId === id}
                onCycleSize={() => handleCycleSize(id)}
                onRecolor={(c) => handleRecolor(id, c)}
              />
            );
          })}
        </div>
      </div>

      <QuickSearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelectPage={setPage}
      />
    </div>
  );
}
