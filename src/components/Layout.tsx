import { ReactNode, useState, useEffect } from 'react';
import {
  FilePlus, ClipboardList, Wine, Cylinder, Sparkles, TrendingDown, Store, PackageCheck, FileText,
  ClipboardCheck, BarChart3, History as HistoryIcon, Snowflake, Navigation,
  CalendarDays, StickyNote, Building, Beer as BeerIcon, Boxes, Car, Tag, ShieldCheck, Flame, PlusCircle, Settings, Calculator,
  LogOut, Menu, Download, Wheat, CheckSquare, FlaskConical, Shield, Bell, BellOff, X, ArrowRight, Search, type LucideIcon,
} from 'lucide-react';

import { useAuth } from '../lib/auth';
import { APP_VERSION, APP_VERSION_DATE } from '../lib/version';
import { Modal } from './ui';
import { onNewVersion, startVersionCheck, stopVersionCheck, forceRefresh, type VersionInfo } from '../lib/versionCheck';
import { supabase, Beer, Package, Place } from '../lib/supabase';
import { EditOrderModal } from './EditOrderModal';
import { requestNotificationPermission, getNotificationPermission, notifyNewOrder, NewOrderNotifyData } from '../lib/notifications';
import { getDensity, setDensity, DensityMode } from '../lib/density';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { MenuCustomizeModal } from './MenuCustomizeModal';
import { QuickSearchModal } from './QuickSearchModal';
import { getQuickActions, QuickAction } from '../lib/quickActions';

export type NavItem = { id: Page; label: string; icon: LucideIcon; group: string };

export type Page = 'dashboard' | 'varni_listy' | 'concentration' | 'srotovani' | 'checklists' | 'haccp' | 'sanitation_log' | 'history' | 'orders_entry' | 'orders' | 'zavoz' | 'kniha_jizd' | 'stock' | 'bottling' | 'bottling_entry' | 'bottling_overview' | 'kegging' | 'kegging_entry' | 'kegging_overview' | 'fasovani' | 'prodejna' | 'akce' | 'sklo_promo' | 'vycepy' | 'exkurze' | 'reminders' | 'writeoffs' | 'inventory' | 'calendar' | 'feedback' | 'places' | 'beers' | 'packages' | 'pricelist' | 'vehicles' | 'cellar' | 'users' | 'app_settings';

export const NAV: NavItem[] = [
  // --- VÝROBA ---
  { id: 'kegging_entry', label: 'KEG (Stáčení)', icon: Cylinder, group: 'Výroba' },
  { id: 'kegging_overview', label: 'KEG (Přehled)', icon: ClipboardList, group: 'Výroba' },
  { id: 'bottling_entry', label: 'Lahve (Stáčení)', icon: Wine, group: 'Výroba' },
  { id: 'bottling_overview', label: 'Lahve (Přehled)', icon: HistoryIcon, group: 'Výroba' },
  { id: 'orders_entry', label: 'Zadávání objednávek', icon: FilePlus, group: 'Výroba' },
  { id: 'orders', label: 'Objednávky (Přehled)', icon: ClipboardList, group: 'Výroba' },
  { id: 'fasovani', label: 'Fasování', icon: PackageCheck, group: 'Výroba' },
  { id: 'prodejna', label: 'Prodejna', icon: Store, group: 'Výroba' },
  { id: 'writeoffs', label: 'Odpis', icon: TrendingDown, group: 'Výroba' },
  { id: 'akce', label: 'Akce', icon: Sparkles, group: 'Výroba' },

  // --- PIVOVAR ---
  { id: 'dashboard', label: 'Sklad', icon: BarChart3, group: 'Pivovar' },
  { id: 'cellar', label: 'Sklep', icon: Snowflake, group: 'Pivovar' },
  { id: 'vycepy', label: 'Výčepy', icon: Flame, group: 'Pivovar' },
  { id: 'inventory', label: 'Inventura', icon: ClipboardCheck, group: 'Pivovar' },
  { id: 'exkurze', label: 'Exkurze', icon: Building, group: 'Pivovar' },
  { id: 'sklo_promo', label: 'Lahve, Etikety, Podtácky', icon: Wine, group: 'Pivovar' },
  { id: 'history', label: 'Statistika', icon: HistoryIcon, group: 'Pivovar' },

  // --- NÁSTROJE ---
  { id: 'concentration', label: 'Kalkulačky', icon: FlaskConical, group: 'Nástroje' },
  { id: 'calendar', label: 'Kalendář', icon: CalendarDays, group: 'Nástroje' },
  { id: 'feedback', label: 'Poznámky', icon: StickyNote, group: 'Nástroje' },
  { id: 'haccp', label: 'Sanitační postupy', icon: Shield, group: 'Nástroje' },
  { id: 'sanitation_log', label: 'Sanitační deník', icon: FlaskConical, group: 'Nástroje' },
  { id: 'checklists', label: 'Check-listy & Návody', icon: CheckSquare, group: 'Nástroje' },
  { id: 'reminders', label: 'Upomínky', icon: Bell, group: 'Nástroje' },

  // --- ČÍSELNÍKY ---
  { id: 'places', label: 'Odběratelé', icon: Building, group: 'Číselníky' },
  { id: 'beers', label: 'Piva', icon: BeerIcon, group: 'Číselníky' },
  { id: 'packages', label: 'Obaly (Lahve, Podtácky…)', icon: Boxes, group: 'Číselníky' },
  { id: 'vehicles', label: 'Auta', icon: Car, group: 'Číselníky' },
  { id: 'kniha_jizd', label: 'Kniha jízd', icon: Navigation, group: 'Číselníky' },
  { id: 'pricelist', label: 'Ceník', icon: Tag, group: 'Číselníky' },

  // --- NASTAVENÍ ---
  { id: 'users', label: 'Uživatelé', icon: ShieldCheck, group: 'Nastavení' },
  { id: 'app_settings', label: 'Aplikace & Nastavení', icon: Settings, group: 'Nastavení' },
];

const GROUPS = ['Výroba', 'Pivovar', 'Nástroje', 'Číselníky', 'Nastavení'];

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Layout({ page, setPage, children }: { page: Page; setPage: (p: Page, sec?: string) => void; children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [densityState, setDensityState] = useState<DensityMode>(getDensity());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showQuickAddOrder, setShowQuickAddOrder] = useState(false);
  const [quickActions, setQuickActions] = useState<QuickAction[]>(() => getQuickActions(user?.id || 'guest'));
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    supabase.from('beers').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setBeers(data || []));
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => setPackages(data || []));
    supabase.from('places').select('*').order('name').then(({ data }) => setPlaces(data || []));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearchModal((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Notification States
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(getNotificationPermission());
  const [activeNewOrderBanner, setActiveNewOrderBanner] = useState<NewOrderNotifyData | null>(null);

  // New version check
  const [newVersionInfo, setNewVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    startVersionCheck();
    const unsub = onNewVersion((info) => setNewVersionInfo(info));
    return () => { unsub(); stopVersionCheck(); };
  }, []);

  const isAdmin = profile?.role === 'admin' || user?.email?.toLowerCase().trim() === 'vasilecko@seznam.cz';

  const pageToModuleMap: Record<string, ModuleKey> = {
    dashboard: 'dashboard',
    kegging: 'entry',
    kegging_entry: 'entry',
    kegging_overview: 'entry',
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
    varni_listy: 'cellar',
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
    pricelist: 'pricelist',
    sklo_promo: 'sklo_promo',
    vycepy: 'vycepy',
    app_settings: 'app_settings',
    exkurze: 'exkurze',
    akce: 'akce',
    calendar: 'catalogs',
    feedback: 'catalogs',
  };

  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  const [hiddenModules, setHiddenModules] = useState<string[]>(() => {
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showMenuCustomizeModal, setShowMenuCustomizeModal] = useState(false);

  function saveHiddenModules(newHidden: string[]) {
    setHiddenModules(newHidden);
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      localStorage.setItem(key, JSON.stringify(newHidden));
    } catch {}
  }

  const permittedNav = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    const modKey = pageToModuleMap[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  const visibleNav = permittedNav.filter((n) => !hiddenModules.includes(n.id));

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Real-time listener for incoming orders
  useEffect(() => {
    let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel('realtime_orders_alert')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        const newO = payload.new as any;
        const notifyData: NewOrderNotifyData = {
          id: newO.id,
          place_name: newO.place_name,
          note: newO.note,
          created_at: newO.created_at,
        };
        notifyNewOrder(notifyData);
      })
      .subscribe();

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<NewOrderNotifyData & { autoHideSeconds?: number }>;
      if (customEvent.detail) {
        setActiveNewOrderBanner(customEvent.detail);
        if (autoHideTimer) clearTimeout(autoHideTimer);
        const secs = customEvent.detail.autoHideSeconds ?? 10;
        if (secs > 0) {
          autoHideTimer = setTimeout(() => setActiveNewOrderBanner(null), secs * 1000);
        }
      }
    };

    window.addEventListener('new-order-arrived', handleCustomEvent);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('new-order-arrived', handleCustomEvent);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
  }, []);

  // Offline queue + connectivity
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { queueLength, onQueueChange, onConnectivityChange, syncQueue } = await import('../lib/offline');
      if (!mounted) return;
      setPending(queueLength());
      const offQ = onQueueChange((n) => setPending(n));
      const offC = onConnectivityChange((o) => {
        setOnline(o);
        if (o) {
          window.dispatchEvent(new CustomEvent('pivovar:online-refetch'));
          if (queueLength() > 0) {
            setSyncing(true);
            syncQueue().then((r) => {
              setSyncing(false);
              setSyncMsg(r.remaining === 0 ? `Synchronizováno ${r.ok} změn` : `OK ${r.ok}, selhalo ${r.failed}`);
              window.dispatchEvent(new CustomEvent('pivovar:online-refetch'));
              setTimeout(() => setSyncMsg(null), 4000);
            });
          }
        }
      });
      if (navigator.onLine && queueLength() > 0) {
        setSyncing(true);
        syncQueue().then((r) => {
          setSyncing(false);
          if (r.remaining === 0 && r.ok > 0) setSyncMsg(`Synchronizováno ${r.ok} změn`);
          window.dispatchEvent(new CustomEvent('pivovar:online-refetch'));
          setTimeout(() => setSyncMsg(null), 4000);
        });
      }
      return () => { offQ(); offC(); };
    })();
    return () => { mounted = false; };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
      setInstallPrompt(null);
    } else {
      setShowInstallModal(true);
    }
  };

  const isStandalone = installed || (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);

  const handleToggleNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotifPermission(getNotificationPermission());
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans antialiased overflow-hidden selection:bg-amber-500 selection:text-neutral-950">
      {/* Floating Mobile/Desktop New Order Banner Alert */}
      {activeNewOrderBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-neutral-900 border-2 border-amber-400 text-white rounded-3xl p-4 sm:p-5 shadow-2xl shadow-amber-500/20 animate-bounce-short flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500 text-neutral-950 font-black text-2xl flex items-center justify-center animate-pulse">
                🍺
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-amber-400">NOVÁ OBJEDNÁVKA PŘIJATA!</div>
                <h4 className="text-base font-extrabold font-display text-white">
                  {activeNewOrderBanner.place_name || 'Neznámý odběratel'}
                </h4>
              </div>
            </div>
            <button
              onClick={() => setActiveNewOrderBanner(null)}
              className="p-1 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            >
              <X size={18} />
            </button>
          </div>

          {activeNewOrderBanner.note && (
            <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 italic">
              "{activeNewOrderBanner.note}"
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-800/80">
            <button
              onClick={() => setActiveNewOrderBanner(null)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold text-neutral-400 hover:text-white"
            >
              Zavřít
            </button>
            <button
              onClick={() => {
                setActiveNewOrderBanner(null);
                setPage('orders');
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
            >
              <span>Zobrazit v Objednávkách</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Sidebar - Desktop & Mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-gradient-to-b from-amber-100/90 via-amber-50/70 to-white border-r border-amber-200/90 flex flex-col justify-between transition-transform duration-300 ease-out sm:relative sm:translate-x-0 sm:shrink-0 shadow-lg ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Logo & Header - Prominent Logo Container */}
          <div className="p-4 sm:p-5 border-b border-amber-200/80 flex items-center justify-between bg-white/60 backdrop-blur-xs">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 flex items-center justify-center shrink-0">
                <img src="/logo.png" alt="Pivovar Zajíc" className="w-full h-full object-contain filter drop-shadow-sm" />
              </div>
              <div>
                <h2 className="font-display font-black text-base tracking-tight text-amber-950 leading-none">Pivovar Zajíc</h2>
                <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest mt-1 block">Kynšperk nad Ohří</span>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="sm:hidden text-amber-800 hover:text-amber-950 p-1 font-bold">
              ✕
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
            {GROUPS.map((group) => {
              const groupItems = visibleNav.filter((n) => n.group === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="space-y-1">
                  <div className="px-3 text-[10px] font-black uppercase tracking-widest text-amber-900/60 mb-1.5">{group}</div>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = page === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setPage(item.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-black text-xs transition-all ${
                          isActive
                            ? 'bg-amber-500 text-neutral-950 shadow-md shadow-amber-500/20 scale-[1.02] ring-1 ring-amber-400'
                            : 'text-neutral-700 hover:bg-amber-100/70 hover:text-amber-950'
                        }`}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-neutral-950' : 'text-amber-700'} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer User Info */}
        <div className="p-4 border-t border-amber-200/80 space-y-2 bg-white/70 backdrop-blur-xs">
          <div className="flex items-center justify-between text-xs text-neutral-700 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-2 h-2 rounded-full shrink-0 ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <span className="font-bold truncate max-w-[110px] text-amber-950">{profile?.display_name || user?.email}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <OfflineStatus online={online} pending={pending} syncing={syncing} syncMsg={syncMsg} onSync={async () => { const { syncQueue, queueLength } = await import('../lib/offline'); if (queueLength() === 0) { setSyncMsg('Fronta je prázdná — nic k synchronizaci'); setTimeout(() => setSyncMsg(null), 3000); return; } setSyncing(true); const r = await syncQueue(); setSyncing(false); setSyncMsg(r.remaining === 0 ? `Synchronizováno ${r.ok} změn` : `OK ${r.ok}, selhalo ${r.failed}`); setTimeout(() => setSyncMsg(null), 4000); }} />
              <button
                onClick={() => { setPage('app_settings'); setOpen(false); }}
                title="Nastavení upozornění"
                className={`w-7 h-7 rounded-lg grid place-items-center transition border ${
                  notifPermission === 'granted'
                    ? 'bg-amber-100 text-amber-950 border-amber-300'
                    : 'bg-neutral-100 text-neutral-700 border-neutral-300'
                }`}
              >
                <Bell size={14} className={notifPermission === 'granted' ? 'text-amber-600 fill-amber-500' : 'text-neutral-500'} />
              </button>
              <span className="text-[10px] font-mono font-black bg-amber-200/80 px-1.5 py-0.5 rounded-lg text-amber-950 border border-amber-300">v{APP_VERSION}</span>
            </div>
          </div>
          <button
            onClick={() => setShowMenuCustomizeModal(true)}
            className="w-full py-2 px-3 rounded-xl bg-amber-100/90 hover:bg-amber-200 text-amber-950 text-xs font-black flex items-center justify-center gap-1.5 transition-all border border-amber-300 shadow-2xs"
          >
            👁️ Přizpůsobit mé menu
          </button>
          <button
            onClick={() => setShowPasswordModal(true)}
            className="w-full py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-black flex items-center justify-center gap-1.5 transition-all border border-amber-200 shadow-2xs"
          >
            🔒 Změnit moje heslo
          </button>
          <button
            onClick={signOut}
            className="w-full py-2 px-3 rounded-xl bg-white hover:bg-rose-50 text-neutral-700 hover:text-rose-700 text-xs font-black flex items-center justify-center gap-2 transition-all border border-neutral-200 hover:border-rose-300 shadow-2xs"
          >
            <LogOut size={15} strokeWidth={2} className="text-rose-600" />
            Odhlásit se
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-md z-30 sm:hidden" onClick={() => setOpen(false)} />}

      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden bg-neutral-100 text-neutral-900">
        {/* Top Header - Desktop & Mobile */}
        <header className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between px-4 sm:px-8 py-3.5 bg-white/95 backdrop-blur-md border-b border-amber-200/70 shadow-2xs z-20 gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOpen(true)}
                className="sm:hidden w-9 h-9 grid place-items-center rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 transition border border-amber-300"
              >
                <Menu size={20} strokeWidth={2.5} />
              </button>
              <span className="text-base font-black text-amber-950 sm:hidden truncate max-w-[120px]">{profile?.display_name?.split(' ')[0] || ''}</span>
            </div>

            <div className="flex items-center gap-1.5 sm:hidden">
              {quickActions.map((a, i) => (
                <button
                  key={a.pageId}
                  onClick={() => setPage(a.pageId as any)}
                  className={`px-3 py-2 rounded-xl font-black text-xs shadow-md border flex items-center gap-1.5 active:scale-95 transition ${
                    i === 0
                      ? 'bg-amber-500 text-neutral-950 border-amber-400'
                      : 'bg-neutral-800 text-white border-neutral-700'
                  }`}
                >
                  <span>{a.icon}</span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            {newVersionInfo && (
              <button
                onClick={forceRefresh}
                className="px-4 py-2 rounded-xl text-xs font-black transition items-center gap-2 shadow-md border shrink-0 flex bg-sky-500 hover:bg-sky-400 text-white border-sky-400 animate-pulse"
                title={`Nová verze v${newVersionInfo.version} (${newVersionInfo.date}) — klikni pro aktualizaci`}
              >
                <span>📱</span>
                <span>NOVÁ VERZE v{newVersionInfo.version}</span>
              </button>
            )}
            {quickActions.map((a, i) => (
              <button
                key={a.pageId}
                onClick={() => setPage(a.pageId as any)}
                className={`hidden sm:flex px-4 py-2 rounded-xl text-xs font-black transition items-center gap-2 shadow-md border shrink-0 ${
                  i === 0
                    ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 border-amber-400'
                    : 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-700'
                }`}
              >
                <span>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </header>

        <QuickSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectPage={setPage}
        />

        {showQuickAddOrder && (
          <EditOrderModal
            order={{
              id: '', order_date: new Date().toISOString().slice(0, 10), place_id: null, place_name: null,
              source: 'rucne', status: 'nova', note: null, created_at: '', delivery_day: null, delivery_date: null,
              is_prepared: false, is_packaged: false, is_delivered: false, delivered_at: null
            }}
            items={[]}
            beers={beers}
            packages={packages}
            places={places}
            onClose={() => setShowQuickAddOrder(false)}
            onSaved={() => {
              setShowQuickAddOrder(false);
              window.dispatchEvent(new CustomEvent('pivovar:online-refetch'));
              setPage('orders');
            }}
          />
        )}

        {showInstallModal && (
          <InstallModal
            installPrompt={installPrompt}
            setInstallPrompt={setInstallPrompt}
            setInstalled={setInstalled}
            setShowInstallModal={setShowInstallModal}
          />
        )}

        {/* Change Password Modal */}
        <Modal open={showPasswordModal} onClose={() => { setShowPasswordModal(false); setNewPassword(''); setPasswordMsg(null); setPasswordErr(null); }} title="🔒 Změna vašeho hesla">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newPassword || newPassword.length < 6) {
                setPasswordErr('Heslo musí mít alespoň 6 znaků.');
                return;
              }
              setPasswordErr(null);
              setPasswordBusy(true);
              const { error } = await supabase.auth.updateUser({ password: newPassword });
              setPasswordBusy(false);
              if (error) {
                setPasswordErr(error.message);
              } else {
                setPasswordMsg('Vaše heslo bylo úspěšně změněno!');
                setNewPassword('');
                setTimeout(() => {
                  setShowPasswordModal(false);
                  setPasswordMsg(null);
                }, 2000);
              }
            }}
            className="space-y-4"
          >
            {passwordMsg && <div className="p-3 bg-emerald-100 text-emerald-900 font-bold text-xs rounded-xl">{passwordMsg}</div>}
            {passwordErr && <div className="p-3 bg-rose-100 text-rose-900 font-bold text-xs rounded-xl">{passwordErr}</div>}

            <div>
              <label className="label">Nové heslo</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Zadejte nové heslo (min. 6 znaků)"
                className="input w-full"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowPasswordModal(false)} className="btn-ghost text-xs">Zrušit</button>
              <button type="submit" disabled={passwordBusy} className="btn-primary text-xs font-black">
                {passwordBusy ? 'Ukládám…' : '✅ Uložit nové heslo'}
              </button>
            </div>
          </form>
        </Modal>

        <MenuCustomizeModal
          open={showMenuCustomizeModal}
          permittedNav={permittedNav}
          hiddenModules={hiddenModules}
          onSave={saveHiddenModules}
          onClose={() => setShowMenuCustomizeModal(false)}
        />

        {/* Dynamic Page Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function OfflineStatus({ online, pending, syncing, syncMsg, onSync }: { online: boolean; pending: number; syncing: boolean; syncMsg: string | null; onSync: () => void }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {showInfo && (
        <Modal open={true} onClose={() => setShowInfo(false)} title="📡 Offline Režim & Synchronizace">
          <div className="space-y-4 text-xs text-neutral-800 font-medium">
            <div className={`p-4 rounded-2xl border-2 flex items-center gap-3 ${online ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
              <div className="text-2xl">{online ? '🟢' : '⚠️'}</div>
              <div>
                <div className="font-black text-sm">{online ? 'Jste ONLINE (Připojeno k internetu)' : 'Jste OFFLINE (Bez připojení k síti)'}</div>
                <p className="text-[11px] mt-0.5 font-bold">
                  {online
                    ? 'Veškeré zápisy se okamžitě ukládají do databáze.'
                    : 'Aplikace v pivovaru plně funguje bez signálu! Zápisy ze sklepa se bezpečně ukládají do telefonu a po připojení se samy synchronizují.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-900 text-white space-y-2 font-mono text-xs">
              <div className="flex justify-between border-b border-neutral-700 pb-2">
                <span className="text-neutral-400">Čekající offline zápisy ve frontě:</span>
                <span className="font-black text-amber-400">{pending} operací</span>
              </div>
              <p className="text-[11px] text-neutral-300 pt-1 font-sans">
                Po obnovení internetového připojení v pivovaru stiskněte tlačítko pro ruční odeslání všech zápisů ze sklepa.
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSync}
                disabled={syncing || pending === 0}
                className="px-4 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center gap-2"
              >
                <span>{syncing ? '⏳ Odesílám zápisy…' : `🔄 Ručně synchronizovat (${pending})`}</span>
              </button>
              <button onClick={() => setShowInfo(false)} className="btn-amber text-xs font-black">
                Zavřít
              </button>
            </div>
          </div>
        </Modal>
      )}

      {syncMsg && (
        <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-xl border border-emerald-300 animate-fade-in">
          {syncMsg}
        </span>
      )}
      {!online ? (
        <button
          onClick={() => setShowInfo(true)}
          className="px-2.5 py-1 rounded-xl bg-amber-500 text-neutral-950 font-black text-[11px] border border-amber-400 shadow-xs flex items-center gap-1 hover:bg-amber-400 transition"
        >
          <span>⚠️ OFFLINE REŽIM</span>
        </button>
      ) : (
        <button
          onClick={() => setShowInfo(true)}
          className="px-2 py-1 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 font-extrabold text-[10px] border border-emerald-300 transition flex items-center gap-1"
        >
          <span>🟢 ONLINE</span>
        </button>
      )}
      {pending > 0 && (
        <button
          onClick={onSync}
          disabled={syncing}
          className="px-2.5 py-1 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-black text-[11px] border border-sky-400 transition flex items-center gap-1 shadow-xs animate-pulse"
        >
          <span>{syncing ? '⏳ Sync…' : `🔄 Čeká ${pending} změn`}</span>
        </button>
      )}
    </div>
  );
}

function InstallModal({ installPrompt, setInstallPrompt, setInstalled, setShowInstallModal }: any) {
  return (
    <Modal open={true} onClose={() => setShowInstallModal(false)} title="📱 Instalace aplikace Pivovar Zajíc">
      <div className="space-y-4 text-xs font-medium text-neutral-800">
        <p className="text-sm">Nainstalujte si aplikaci Pivovar Zajíc přímo na plochu mobilu nebo počítače pro okamžitá upozornění a rychlé offline zadávání.</p>
        
        {installPrompt && (
          <div className="p-4 bg-amber-50 rounded-2xl border-2 border-amber-300 flex flex-col gap-2">
            <div className="font-extrabold text-amber-950 text-sm">Váš prohlížeč podporuje přímou instalaci na 1 kliknutí!</div>
            <button
              onClick={async () => {
                await installPrompt.prompt();
                const { outcome } = await installPrompt.userChoice;
                if (outcome === 'accepted') setInstalled(true);
                setInstallPrompt(null);
                setShowInstallModal(false);
              }}
              className="btn-primary w-full !py-3 text-sm font-black shadow-lg"
            >
              📲 Spustit přímou instalaci na plochu
            </button>
          </div>
        )}

        <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900">Postup pro Android (Chrome / Edge):</div>
          <p>1. Klepněte na <strong>tři tečky</strong> vpravo nahoře v prohlížeči.</p>
          <p>2. Zvolte <strong>Nainstalovat aplikaci</strong> nebo <strong>Přidat na plochu</strong>.</p>
        </div>

        <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900">Postup pro iOS (Safari na iPhone):</div>
          <p>1. Klepněte na tlačítko <strong>Sdílet</strong> (čtvereček s šipkou dole na liště).</p>
          <p>2. Zvolte <strong>Přidat na plochu</strong>.</p>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={() => setShowInstallModal(false)} className="btn-ghost text-xs font-bold">
            Zavřít
          </button>
        </div>
      </div>
    </Modal>
  );
}
