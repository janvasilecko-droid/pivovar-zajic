// Domovská obrazovka appky — přizpůsobitelný dlaždicový launcher (styl
// Windows Phone / Nokia Lumia): pořadí, velikost a barva dlaždic i barevné
// pozadí jde v "Upravit rozložení" módu měnit a ukládá se per uživatel
// (profiles.home_layout), takže se to synchronizuje napříč zařízeními.
// Výjimka nad dlaždicemi: upozornění na STK/dálniční známku vozidel —
// zobrazuje se jen komu je nastaveno (Uživatelé → "Dostává upozornění na
// vozidla") a musí ho jednou potvrdit, pak zmizí (dokud se stav nezmění).
import { useEffect, useMemo, useState, useRef } from 'react';
import { NAV, type Page } from '../components/Layout';
import LauncherTile from '../components/LauncherTile';
import { useAuth } from '../lib/auth';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { isAdminEmail } from '../lib/config';
import { supabase, Vehicle } from '../lib/supabase';
import { getVehicleExpiryStatus } from './Catalogs';
import {
  getHomeLayout, saveHomeLayout, TILE_SIZES, SCENES, MIN_OPACITY, MAX_OPACITY,
  type HomeLayout, type TileColor,
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
  warm: 'Teplá', sunset: 'Západ', ocean: 'Oceán', forest: 'Les', night: 'Noc',
};

export default function HomeScreen({ setPage }: { setPage: (p: Page) => void }) {
  const { profile, user, reloadProfile } = useAuth();
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

  // ---- Launcher: pořadí / velikost / barva / scéna, uložené v profilu ----
  const [layout, setLayout] = useState<HomeLayout>(() => getHomeLayout((profile as any)?.home_layout, visibleIds));
  useEffect(() => {
    setLayout((prev) => getHomeLayout({ order: prev.order, overrides: prev.overrides, scene: prev.scene, tileOpacity: prev.tileOpacity }, visibleIds));
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

  const [editMode, setEditMode] = useState(false);
  const [dragOverId, setDragOverId] = useState<Page | null>(null);
  const dragId = useRef<Page | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasCustomLayout, setHasCustomLayout] = useState(!!(profile as any)?.home_layout && Object.keys((profile as any).home_layout).length > 0);

  function persist(next: HomeLayout) {
    setLayout(next);
    setHasCustomLayout(true);
    if (!user?.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { saveHomeLayout(user.id, next); }, 500);
  }

  function handleDrop(targetId: Page) {
    const fromId = dragId.current;
    setDragOverId(null);
    if (!fromId || fromId === targetId) return;
    const order = [...layout.order];
    const from = order.indexOf(fromId);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    persist({ ...layout, order });
  }
  function handleCycleSize(id: Page) {
    const current = layout.overrides[id]?.size ?? 'n';
    const next = TILE_SIZES[(TILE_SIZES.indexOf(current) + 1) % TILE_SIZES.length];
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], size: next } } });
  }
  function handleRecolor(id: Page, color: TileColor) {
    persist({ ...layout, overrides: { ...layout.overrides, [id]: { ...layout.overrides[id], color } } });
  }
  function handleSceneChange(scene: HomeLayout['scene']) {
    persist({ ...layout, scene });
  }
  function handleOpacityChange(tileOpacity: number) {
    persist({ ...layout, tileOpacity });
  }
  function handleReset() {
    const next = getHomeLayout(null, visibleIds);
    setLayout(next);
    setHasCustomLayout(false);
    if (user?.id) saveHomeLayout(user.id, {} as any);
  }

  // ---- Živá dlaždice: reálný počet nevyřízených objednávek ----
  const [pendingOrders, setPendingOrders] = useState<number | null>(null);
  useEffect(() => {
    if (!visibleIds.includes('orders')) return;
    supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'nova')
      .then(({ count }) => setPendingOrders(count ?? 0));
  }, [visibleIds]);

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
    <div className="space-y-4">
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
        <div className="hs-scene" data-scene={layout.scene}><i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" /></div>

        <div className="hs-toolbar">
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hasCustomLayout && <button className="hs-reset-btn" onClick={handleReset}>Obnovit výchozí</button>}
            <button
              className={`hs-edit-btn ${editMode ? 'on' : ''}`}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? 'Hotovo' : 'Upravit rozložení'}
            </button>
          </div>
        </div>

        {editMode && (
          <div className="hs-controls">
            <div className="hs-controls-group">
              <span className="hs-controls-label">Pozadí</span>
              {SCENES.map((s) => (
                <button
                  key={s}
                  className={`hs-scene-swatch ${s} ${s === layout.scene ? 'active' : ''}`}
                  title={SCENE_LABELS[s]}
                  onClick={() => handleSceneChange(s)}
                />
              ))}
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
          </div>
        )}

        <div className="hs-grid" style={{ ['--hs-tile-alpha' as any]: layout.tileOpacity }}>
          {layout.order.map((id) => {
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
                onClick={() => setPage(id)}
                onDragStart={() => { dragId.current = id; }}
                onDragOver={() => setDragOverId(id)}
                onDrop={() => handleDrop(id)}
                dragOver={dragOverId === id}
                onCycleSize={() => handleCycleSize(id)}
                onRecolor={(c) => handleRecolor(id, c)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
