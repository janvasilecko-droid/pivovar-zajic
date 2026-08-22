import { ReactNode, useState, useEffect, useRef } from 'react';
import {
  FilePlus, ClipboardList, Wine, Cylinder, Sparkles, TrendingDown, Store, FileText,
  ClipboardCheck, BarChart3, History as HistoryIcon, Snowflake,
  CalendarDays, Car, Tag, ShieldCheck, PlusCircle, Settings, Calculator,
  LogOut, Menu, Download, Wheat, FlaskConical, Shield, Bell, BellOff, X, ArrowRight, Search, Smartphone, MessageCircle, Users, GlassWater, Home, type LucideIcon,
} from 'lucide-react';

import { useAuth } from '../lib/auth';
import { Modal } from './ui';
import { onNewVersion, forceRefresh, type VersionInfo } from '../lib/versionCheck';
import { supabase, Beer, Package, Place } from '../lib/supabase';
import { EditOrderModal } from './EditOrderModal';
import { autoReserveTapIfNeeded } from '../lib/tapReservations';
import { requestNotificationPermission, getNotificationPermission, notifyNewOrder, notifyNewWhatsAppMessage, NewOrderNotifyData } from '../lib/notifications';
import { subscribeToWhatsAppMessages, fetchWhatsAppSenders, fetchPendingWhatsAppCount, isSenderAllowed, triggerAutoParse, type WhatsAppSender, type WhatsAppIncoming } from '../lib/whatsappApi';
import { getDensity, setDensity, DensityMode } from '../lib/density';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { QuickSearchModal } from './QuickSearchModal';
import { isAdminEmail } from '../lib/config';
import { BugReportModal } from './BugReportModal';
import { APP_VERSION, APP_VERSION_DATE } from '../lib/version';
import { SCENES, DEFAULT_DOCK, type Scene } from '../lib/homeLayout';

const DOCK_COLORS = ['n-coral', 'n-mint', 'n-sky', 'n-indigo'];
import '../screens/HomeScreen.css';

export type NavItem = { id: Page; label: string; icon: LucideIcon; group: string };

export type Page = 'home' | 'sanitace' | 'marketing' | 'planning' | 'depozitar' | 'dashboard' | 'concentration' | 'srotovani' | 'checklists' | 'haccp' | 'sanitation_log' | 'sanitace_lahve' | 'sanitace_kegy' | 'sanitace_vycepy' | 'history' | 'orders_entry' | 'orders' | 'orders_detail' | 'orders_zavoz' | 'zavoz' | 'kniha_jizd' | 'stock' | 'bottling' | 'bottling_entry' | 'bottling_overview' | 'kegging' | 'fasovani' | 'prodejna' | 'akce' | 'sklo_promo' | 'vycepy' | 'exkurze' | 'reminders' | 'notes' | 'writeoffs' | 'inventory' | 'calendar' | 'feedback' | 'places' | 'beers' | 'packages' | 'pricelist' | 'vehicles' | 'cellar' | 'users' | 'app_settings' | 'app_versions' | 'bottling_needs';

export const NAV: NavItem[] = [
  // --- VÝROBA ---
  { id: 'kegging', label: 'KEG', icon: Cylinder, group: 'Výroba' },
  { id: 'bottling', label: 'Lahve (Stáčení)', icon: Wine, group: 'Výroba' },
  { id: 'orders', label: 'Objednávky', icon: ClipboardList, group: 'Výroba' },
  { id: 'fasovani', label: 'Personál', icon: Users, group: 'Výroba' },
  { id: 'prodejna', label: 'Prodejna', icon: Store, group: 'Výroba' },
  { id: 'writeoffs', label: 'Odpis', icon: TrendingDown, group: 'Výroba' },
  { id: 'akce', label: 'Akce, Exkurze', icon: Sparkles, group: 'Výroba' },

  // --- PIVOVAR ---
  { id: 'dashboard', label: 'Sklad', icon: BarChart3, group: 'Pivovar' },
  { id: 'sklo_promo', label: 'Sklo, Etikety, Podtáčky', icon: GlassWater, group: 'Pivovar' },
  { id: 'cellar', label: 'Sklep', icon: Snowflake, group: 'Pivovar' },
  { id: 'bottling_needs', label: 'Potřeby stáčení', icon: Wine, group: 'Pivovar' },
  { id: 'inventory', label: 'Inventura', icon: ClipboardCheck, group: 'Pivovar' },
  { id: 'history', label: 'Statistika', icon: HistoryIcon, group: 'Pivovar' },

  // --- NÁSTROJE ---
  { id: 'concentration', label: 'Kalkulačky', icon: FlaskConical, group: 'Nástroje' },
  { id: 'calendar', label: 'Kalendář & Upozornění', icon: CalendarDays, group: 'Nástroje' },
  { id: 'haccp', label: 'Sanitační deníky', icon: Shield, group: 'Nástroje' },
  { id: 'vehicles', label: 'Auta', icon: Car, group: 'Nástroje' },

  // --- ČÍSELNÍKY ---
  { id: 'depozitar', label: 'Odběratelé, Piva, Obaly, Ceník', icon: Tag, group: 'Číselníky' },

  // --- NASTAVENÍ ---
  { id: 'users', label: 'Uživatelé', icon: ShieldCheck, group: 'Nastavení' },

  { id: 'app_settings', label: 'Aplikace & Nastavení', icon: Settings, group: 'Nastavení' },
];

const GROUPS = ['Výroba', 'Pivovar', 'Nástroje', 'Číselníky', 'Nastavení'];

// Interní záložky uvnitř "Tabbed" obrazovek (viz App.tsx) mají vlastní Page
// hodnotu, aby zapisovaly do historie (tlačítko Zpět vrací záložku, ne celé
// menu) — v menu/hlavičce se ale mají pořád tvářit jako svoje nadřazená
// položka NAV. Tahle mapa říká, pod kterou položku NAV daná dílčí záložka patří.
const PAGE_GROUP_PARENT: Partial<Record<Page, Page>> = {
  sanitation_log: 'haccp',
  checklists: 'haccp',
  sanitace: 'haccp',
  sanitace_lahve: 'haccp',
  sanitace_kegy: 'haccp',
  sanitace_vycepy: 'haccp',
  orders_entry: 'orders',
  orders_detail: 'orders',
  orders_zavoz: 'orders',
  vycepy: 'orders',
  places: 'depozitar',
  beers: 'depozitar',
  packages: 'depozitar',
  pricelist: 'depozitar',
  kniha_jizd: 'vehicles',
  feedback: 'calendar',
  planning: 'calendar',
  reminders: 'calendar',
  notes: 'calendar',
  exkurze: 'akce',
  marketing: 'akce',
  bottling_entry: 'bottling',
  bottling_overview: 'bottling',
};

/** Vrátí Page, pod kterou se má daná stránka zvýraznit/pojmenovat v menu. */
function navPageFor(page: Page): Page {
  return PAGE_GROUP_PARENT[page] ?? page;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function Layout({ page, setPage, children }: { page: Page; setPage: (p: Page, sec?: string) => void; children: ReactNode }) {
  const { profile, user, signOut } = useAuth();
  // Domovská stránka (launcher) je jediná, kde appka přebírá celou obrazovku
  // barevnou scénou (viz HomeScreen.css) — hlavička a spodní lišta se na ní
  // stanou poloprůhledným "sklem", jinde v appce zůstávají beze změny.
  const isHome = page === 'home';
  const homeSceneRaw = (profile as any)?.home_layout?.scene;
  const homeScene: Scene = SCENES.includes(homeSceneRaw) ? homeSceneRaw : 'warm';
  const homeCustomAccent: string = (profile as any)?.home_layout?.customAccent || '#ff6b6b';
  const savedDock = (profile as any)?.home_layout?.dock;
  const dockPages: Page[] = Array.isArray(savedDock) && savedDock.length === DEFAULT_DOCK.length ? savedDock : DEFAULT_DOCK;
  const [open, setOpen] = useState(false);
  const [densityState, setDensityState] = useState<DensityMode>(getDensity());
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  // Banner "offline → zobrazená data nemusí být aktuální" (událost z supabase.ts serveCached).
  const [showStaleBanner, setShowStaleBanner] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showQuickAddOrder, setShowQuickAddOrder] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [pendingWhatsAppCount, setPendingWhatsAppCount] = useState(0);
  // WhatsApp z horní hlavičky — přepne na Objednávky a otevře seznam
  // příchozích WhatsApp objednávek (hromadné zpracování).
  const openWhatsApp = () => {
    setPage('orders');
    window.dispatchEvent(new CustomEvent('pivovar:open-auto-import'));
  };
  // Horní hlavička ukazuje jen upozornění, ne trvalou lištu tlačítek — počet
  // nových (ještě nezpracovaných) objednávek, ať se ikona objeví jen když je
  // co řešit.
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [beers, setBeers] = useState<Beer[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);

  useEffect(() => {
    supabase.from('beers').select('*').eq('is_active', true).order('sort_order').then(({ data }) => setBeers(data || []));
    supabase.from('packages').select('*').order('sort_order').then(({ data }) => setPackages(data || []));
    supabase.from('places').select('*').order('name').then(({ data }) => setPlaces(data || []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshNewOrders = () => {
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'nova').then(({ count }) => {
        if (!cancelled) setNewOrdersCount(count ?? 0);
      });
    };
    refreshNewOrders();
    const channel = supabase
      .channel('realtime_new_orders_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refreshNewOrders)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
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
  type BannerData = NewOrderNotifyData & { kind?: 'order' | 'whatsapp'; sender_name?: string; message_text?: string; autoHideSeconds?: number };
  const [activeNewOrderBanner, setActiveNewOrderBanner] = useState<BannerData | null>(null);

  // New version check
  const [newVersionInfo, setNewVersionInfo] = useState<VersionInfo | null>(null);

  useEffect(() => {
    // main.tsx vlastní jediný časovač kontroly; Layout pouze spravuje UI listener.
    return onNewVersion((info) => setNewVersionInfo(info));
  }, []);

  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);

  const pageToModuleMap: Record<string, ModuleKey> = {
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

  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);

  const [hiddenModules, setHiddenModules] = useState<string[]>(() => {
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  function saveHiddenModules(newHidden: string[]) {
    setHiddenModules(newHidden);
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      localStorage.setItem(key, JSON.stringify(newHidden));
    } catch {}
  }

  const permittedNav = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
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
    const handleInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', handleInstalled);
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleInstalled);
    };
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

    const handleWhatsAppEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ id: string; sender_name: string; message_text: string; status?: string; autoHideSeconds?: number }>;
      if (customEvent.detail) {
        setActiveNewOrderBanner({ ...customEvent.detail, kind: 'whatsapp' });
        if (autoHideTimer) clearTimeout(autoHideTimer);
        const secs = customEvent.detail.autoHideSeconds ?? 10;
        if (secs > 0) {
          autoHideTimer = setTimeout(() => setActiveNewOrderBanner(null), secs * 1000);
        }
      }
    };

    const handleGoOrders = () => setPage('orders');

    window.addEventListener('whatsapp-message-arrived', handleWhatsAppEvent);
    window.addEventListener('pivovar:go-orders', handleGoOrders);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('new-order-arrived', handleCustomEvent);
      window.removeEventListener('whatsapp-message-arrived', handleWhatsAppEvent);
      window.removeEventListener('pivovar:go-orders', handleGoOrders);
      if (autoHideTimer) clearTimeout(autoHideTimer);
    };
  }, []);

  // Real-time listener pro nové WhatsApp zprávy → globální notifikace k ověření.
  // Dřív běžel jen v Orders.tsx (mountuje se jen na stránce Objednávky), takže
  // na ostatních obrazovkách žádná notifikace neletěla.
  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);
  const allowedSendersRef = useRef<WhatsAppSender[]>([]);
  useEffect(() => {
    fetchWhatsAppSenders().then((s) => { allowedSendersRef.current = s; }).catch(() => {});
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const notifiedIds = new Set<string>();
    // ⚠ zprávy, na které už jednou přišla notifikace „pozor na čtení" (po rozparsování).
    const mismatchAlerted = new Set<string>();
    let countTimer: ReturnType<typeof setTimeout> | undefined;
    // Počet zpráv čekajících na schválení — aktualizuje se při každé změně
    // whatsapp_incoming (INSERT i UPDATE), s krátkým zpožděním (sráží víc událostí).
    const refreshPendingCount = () => {
      clearTimeout(countTimer);
      countTimer = setTimeout(() => {
        fetchPendingWhatsAppCount().then(setPendingWhatsAppCount).catch(() => {});
      }, 300);
    };
    refreshPendingCount();
    try {
      unsubscribe = subscribeToWhatsAppMessages((message: WhatsAppIncoming) => {
        refreshPendingCount();
        if (message.status !== 'pending' && message.status !== 'processing' && message.status !== 'parsed') return;
        // Whitelist — prázdný seznam = vše; jinak jen zprávy od povolených odesílatelů.
        if (!isSenderAllowed(allowedSendersRef.current, message.sender_name)) return;

        // Čerstvě přijatá zpráva (pending/processing) — webhook ukládá JEN zprávy
        // ze skupiny „Objednávky pivovar" (whitelist odesílatelů), takže každá
        // uložená zpráva je potenciální objednávka. Necháme ji rozparsovat a
        // notifikaci pošleme až ve stavu 'parsed'.
        if (message.status === 'pending' || message.status === 'processing') {
          triggerAutoParse().catch(() => {});
          return;
        }

        // status === 'parsed' — AI zprávu přečetla. Všechny zprávy ze skupiny
        // jsou objednávky, takže se notifikuje každá (včetně zpráv bez položek,
        // které se doobjednají ručně v kontrolním modálu).

        // Na stránce Objednávky otevírá Orders.tsx sám kontrolní modál — banner potlačíme,
        // ale zvuk a systémovou notifikaci necháme (funguje i když je aplikace na pozadí).
        const onOrdersVisible = pageRef.current === 'orders' && typeof document !== 'undefined' && document.visibilityState === 'visible';
        const mismatch = Number(message.readback_unmatched_count) || 0;

        // ⚠ Druhá notifikace po rozparsování, když AI nemá jisté čtení.
        if (mismatch > 0) {
          if (mismatchAlerted.has(message.id)) return;
          mismatchAlerted.add(message.id);
          notifiedIds.add(message.id);
          notifyNewWhatsAppMessage(
            {
              id: message.id,
              sender_name: message.sender_name,
              message_text: message.message_text,
              status: message.status,
              created_at: message.created_at,
              readbackUnmatchedCount: mismatch,
            },
            { banner: !onOrdersVisible }
          );
          return;
        }

        // Standardní notifikace o nové objednávce (jen jednou na zprávu).
        if (notifiedIds.has(message.id)) return;
        notifiedIds.add(message.id);
        notifyNewWhatsAppMessage(
          {
            id: message.id,
            sender_name: message.sender_name,
            message_text: message.message_text,
            status: message.status,
            created_at: message.created_at,
            readbackUnmatchedCount: 0,
          },
          { banner: !onOrdersVisible }
        );
      });
    } catch (error) {
      console.error('Chyba při připojení k WhatsApp notifikacím:', error);
    }
    return () => { if (unsubscribe) unsubscribe(); clearTimeout(countTimer); };
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

  // Banner "offline → zastaralá data": supabase.ts dispatches 'pivovar:offline-stale'
  // vždy, když GET odpověď byla vyrobena z mezipaměti/prázdná kvůli offline stavu.
  // Ukážeme banner na ~6 s (nebo dokud uživatel nezavře X).
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const onStale = () => {
      setShowStaleBanner(true);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setShowStaleBanner(false), 6000);
    };
    window.addEventListener('pivovar:offline-stale', onStale);
    return () => {
      window.removeEventListener('pivovar:offline-stale', onStale);
      if (hideTimer) clearTimeout(hideTimer);
    };
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
    <div className="flex h-screen bg-neutral-50 text-neutral-900 font-sans antialiased overflow-hidden selection:bg-amber-500 selection:text-neutral-950">
      {/* Floating Mobile/Desktop New Order Banner Alert */}
      {activeNewOrderBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-neutral-900 border-2 border-amber-400 text-white rounded-3xl p-4 sm:p-5 shadow-2xl shadow-amber-500/20 animate-bounce-short flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-2xl text-neutral-950 font-black text-2xl flex items-center justify-center animate-pulse ${activeNewOrderBanner.kind === 'whatsapp' ? 'bg-[#25D366]' : 'bg-amber-500'}`}>
                {activeNewOrderBanner.kind === 'whatsapp' ? '💬' : '🍺'}
              </div>
              <div>
                <div className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                  {activeNewOrderBanner.kind === 'whatsapp' ? 'NOVÁ WHATSAPP OBJEDNÁVKA K OVĚŘENÍ!' : 'NOVÁ OBJEDNÁVKA PŘIJATA!'}
                </div>
                <h4 className="text-base font-extrabold font-display text-white">
                  {activeNewOrderBanner.kind === 'whatsapp'
                    ? (activeNewOrderBanner.sender_name || 'Neznámý odesílatel')
                    : (activeNewOrderBanner.place_name || 'Neznámý odběratel')}
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

          {activeNewOrderBanner.kind === 'whatsapp' ? (
            activeNewOrderBanner.message_text ? (
              <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800">
                {activeNewOrderBanner.message_text.length > 200 ? activeNewOrderBanner.message_text.slice(0, 200) + '…' : activeNewOrderBanner.message_text}
              </p>
            ) : null
          ) : (
            activeNewOrderBanner.note && (
              <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded-xl border border-neutral-800 italic">
                "{activeNewOrderBanner.note}"
              </p>
            )
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
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r-2 border-amber-200 flex flex-col justify-between transition-transform duration-300 ease-out sm:relative sm:translate-x-0 sm:shrink-0 shadow-lg ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="relative flex flex-col h-full overflow-hidden">
          {/* Plovoucí zavírací tlačítko — bez bílého pruhu, menu sahá až nahoru */}
          <button
            onClick={() => setOpen(false)}
            aria-label="Zavřít menu"
            className="sm:hidden absolute top-1.5 right-1.5 z-10 w-8 h-8 grid place-items-center rounded-full text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition"
          >
            ✕
          </button>

          {/* App Header in Sidebar */}
          <div className="p-3 border-b border-neutral-200 flex items-center justify-between bg-white">
            <button
              onClick={() => { setPage('app_settings'); setOpen(false); }}
              className="flex items-center gap-1.5 text-xs font-black text-neutral-900 hover:text-amber-700 transition"
            >
              <Settings size={14} className="text-neutral-400" />
              <span>Nastavení</span>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto p-4 pr-10 sm:pr-4 space-y-6 scrollbar-thin">
            {GROUPS.map((group) => {
              const groupItems = visibleNav.filter((n) => n.group === group);
              if (groupItems.length === 0) return null;
              return (
                <div key={group} className="space-y-1">
                  <div className="px-3 text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-1.5">{group}</div>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = navPageFor(page) === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setPage(item.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl font-black text-xs transition-all ${
                          isActive
                            ? 'bg-white text-amber-900 shadow-xs ring-2 ring-amber-300'
                            : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                        }`}
                      >
                        <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-amber-600' : 'text-neutral-400'} />
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
        <div className="p-4 border-t border-neutral-200 space-y-2 bg-white">
          <div className="flex items-center justify-between text-xs text-neutral-700 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold truncate max-w-[110px] text-neutral-900">{profile?.display_name || user?.email}</span>
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
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] px-1">
            <button
              onClick={() => { setPage('app_settings'); setOpen(false); }}
              className="text-neutral-400 hover:text-neutral-700 font-bold transition"
              title={`Verze v${APP_VERSION} (${APP_VERSION_DATE}) — klikněte pro nastavení`}
            >
              v{APP_VERSION}
            </button>
            <span className="text-neutral-300 font-bold truncate max-w-[110px]">{user?.email}</span>
          </div>
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

      {/* Banner: offline → zobrazená data nemusí být aktuální (z mezipaměti). */}
      {showStaleBanner && (
        <div className="fixed top-4 right-4 z-40 max-w-xs sm:max-w-sm flex items-center gap-2 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-xl px-3.5 py-2.5 animate-fade-in">
          <span className="text-base shrink-0">⚠️</span>
          <p className="text-[11px] font-bold leading-snug flex-1">
            Jste offline - zobrazená data nemusí být aktuální (z mezipaměti).
          </p>
          <button
            onClick={() => setShowStaleBanner(false)}
            aria-label="Zavřít upozornění"
            className="p-1 rounded-lg hover:bg-amber-200/70 text-amber-900/70 hover:text-amber-950 transition shrink-0"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className={`flex-1 min-w-0 flex flex-col h-screen overflow-hidden text-neutral-900 ${isHome ? '' : 'bg-neutral-100'}`}>
        {isHome && (
          <div className="hs-fullscreen-scene" data-scene={homeScene} style={{ ['--hs-custom' as any]: homeCustomAccent }}>
            <i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" />
          </div>
        )}
        {/* Top Header - Desktop & Mobile */}
        <header
          {...(isHome ? { 'data-home-chrome': true } : {})}
          className={`flex items-center justify-between px-2 sm:px-8 py-2 ${isHome ? '' : 'bg-white/95'} backdrop-blur-md border-b border-neutral-200 shadow-2xs z-20 gap-2 shrink-0`}
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
            <span className="sm:hidden font-display font-black text-base text-neutral-900 truncate">
              {NAV.find((n) => n.id === navPageFor(page))?.label ?? ''}
            </span>
          </div>

          {/* Pravá strana hlavičky — jen upozornění, nic trvalého. WhatsApp a
              nové objednávky se objeví jen když je opravdu co řešit. Na
              domovské stránce jsou Hledat a WhatsApp dlaždice v launcheru
              místo tlačítek tady (viz HomeScreen.tsx). */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
            {!isHome && (
              <button
                type="button"
                onClick={() => setShowSearchModal(true)}
                title="Hledat (Ctrl+K)"
                className="w-9 h-9 sm:w-auto sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border border-neutral-200 bg-neutral-100/80 hover:bg-neutral-200 text-neutral-700 active:scale-95"
              >
                <Search size={15} />
                <span className="hidden sm:inline">Hledat</span>
                <kbd className="hidden sm:inline-block text-[10px] bg-white px-1.5 py-0.5 rounded border border-neutral-300 text-neutral-500 font-mono">⌘K</kbd>
              </button>
            )}

            {!isHome && newOrdersCount > 0 && (
              <button
                type="button"
                onClick={() => setPage('orders')}
                title="Nové objednávky k vyřízení"
                className="relative w-9 h-9 grid place-items-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm border border-emerald-700 active:scale-95 transition"
              >
                <ClipboardList size={16} />
                <span className="absolute -top-1.5 -right-1.5 bg-white text-emerald-700 text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow border border-emerald-200">
                  {newOrdersCount > 99 ? '99+' : newOrdersCount}
                </span>
              </button>
            )}

            {!isHome && pendingWhatsAppCount > 0 && (
              <button
                type="button"
                onClick={openWhatsApp}
                title="WhatsApp — zkontroluje příchozí objednávky"
                className="relative w-9 h-9 grid place-items-center rounded-xl bg-[#25D366] hover:bg-[#1da851] text-white shadow-sm border border-[#1da851] active:scale-95 transition"
              >
                <MessageCircle size={16} />
                <span className="absolute -top-1.5 -right-1.5 bg-red-600 text-white text-[10px] font-black rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center shadow animate-pulse" title="Zpráv čeká na schválení">
                  {pendingWhatsAppCount > 99 ? '99+' : pendingWhatsAppCount}
                </span>
              </button>
            )}

            {/* Bug report button */}
            <button
              type="button"
              onClick={() => setShowBugModal(true)}
              title="Nahlásit chybu nebo nápad"
              className="hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-black transition items-center gap-1.5 shadow-sm border border-rose-300 bg-rose-600 hover:bg-rose-500 text-white shrink-0 active:scale-95"
            >
              ⚠️ Chyby
            </button>
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

        <BugReportModal
          isOpen={showBugModal}
          onClose={() => setShowBugModal(false)}
        />

        {/* Dynamic Page Content with bottom safe padding for Mobile Navigation Dock */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-8 pb-24 sm:pb-8">
          {children}
        </div>

        {/* Mobile Bottom Navigation Dock — thumb-friendly bottom bar. Obsah
            (4 zástupci) je uživatelsky volitelný — viz "Spodní lišta" v edit
            módu launcheru (HomeScreen.tsx), uložen v home_layout.dock. Na
            domovské stránce jsou tlačítka malé barevné dlaždice (hs-nav-tile),
            ať lišta ladí se stylem launcheru; jinde v appce beze změny. */}
        <nav
          {...(isHome ? { 'data-home-chrome': true } : {})}
          className={`sm:hidden fixed bottom-0 left-0 right-0 z-30 ${isHome ? '' : 'bg-white/95'} backdrop-blur-lg border-t border-neutral-200 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-1 py-1.5 pb-safe flex items-center justify-around gap-1`}
        >
          {dockPages.map((dockId, i) => {
            const isActive = dockId === 'home' ? navPageFor(page) === 'home' : navPageFor(page) === dockId;
            const info = dockId === 'home'
              ? { label: 'Domů', icon: Home }
              : NAV.find((n) => n.id === dockId);
            if (!info) return null;
            const DockIcon = info.icon;
            const homeColor = DOCK_COLORS[i % DOCK_COLORS.length];
            return (
              <button
                key={`${dockId}-${i}`}
                onClick={() => setPage(dockId)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all relative ${isHome ? `hs-nav-tile ${homeColor} flex-1` :
                  isActive
                    ? 'text-amber-950 font-black scale-105 bg-amber-100/90 ring-1 ring-amber-300'
                    : 'text-neutral-500 hover:text-neutral-800 font-bold'
                }`}
              >
                <div className="relative">
                  <DockIcon size={20} strokeWidth={isActive ? 2.5 : 2} className={!isHome && isActive ? 'text-amber-700' : ''} />
                  {dockId === 'orders' && pendingWhatsAppCount > 0 && (
                    <span className="absolute -top-1 -right-2 bg-red-600 text-white text-[9px] font-black rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center shadow">
                      {pendingWhatsAppCount > 9 ? '9+' : pendingWhatsAppCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[64px]">{info.label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setOpen(true)}
            className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all active:scale-95 ${isHome ? 'hs-nav-tile n-slate flex-1' : 'text-neutral-500 hover:text-neutral-800 font-bold'}`}
          >
            <Menu size={20} strokeWidth={2} />
            <span className="text-[10px] mt-0.5 tracking-tight">Více</span>
          </button>
        </nav>
      </main>

      {/* Nová verze — modální okno */}
      {newVersionInfo && (
        <Modal open={true} onClose={() => setNewVersionInfo(null)} title="📱 Nová verze aplikace">
          <div className="space-y-5 text-sm">
            <div className="bg-sky-50 rounded-2xl border-2 border-sky-300 p-5 text-center">
              <div className="text-4xl mb-3">📱</div>
              <div className="font-black text-sky-950 text-lg mb-1">Nová verze v{newVersionInfo.version}</div>
              <div className="text-sky-700 font-semibold text-xs">{newVersionInfo.date}</div>
            </div>

            <p className="text-neutral-700 font-medium text-xs leading-relaxed">
              Je dostupná nová verze aplikace. Pro aktualizaci klikni na tlačítko níže.
              Stránka se obnoví a načte nejnovější verzi.
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => { void forceRefresh(); }}
                className="w-full py-3 rounded-xl text-sm font-black transition shadow-lg bg-sky-500 hover:bg-sky-400 text-white border border-sky-400"
              >
                🔄 Aktualizovat na v{newVersionInfo.version}
              </button>
              <button
                onClick={() => setNewVersionInfo(null)}
                className="w-full py-2.5 rounded-xl text-xs font-bold transition bg-neutral-100 hover:bg-neutral-200 text-neutral-700 border border-neutral-200"
              >
                ✕ Zavřít
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function OfflineStatus({ online, pending, syncing, syncMsg, onSync }: { online: boolean; pending: number; syncing: boolean; syncMsg: string | null; onSync: () => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const [queueItems, setQueueItems] = useState<{ id: string; table: string; op: string; ts: number }[]>([]);
  const [failures, setFailures] = useState<{ id: string; table: string; op: string; error: string }[]>([]);

  async function refreshQueueDetail() {
    const { getQueue, getLastSyncFailures } = await import('../lib/offline');
    setQueueItems(getQueue().map((o) => ({ id: o.id, table: o.table, op: o.op, ts: o.ts })));
    setFailures(getLastSyncFailures());
  }

  useEffect(() => {
    if (showInfo) refreshQueueDetail();
  }, [showInfo, pending, syncing]);

  async function discardOp(id: string) {
    const { removeOp } = await import('../lib/offline');
    removeOp(id);
    setFailures((prev) => prev.filter((f) => f.id !== id));
    refreshQueueDetail();
  }

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

            {queueItems.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {queueItems.map((item) => {
                  const failure = failures.find((f) => f.id === item.id);
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${failure ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-neutral-100 border-neutral-200 text-neutral-700'}`}>
                      <div className="min-w-0">
                        <div className="truncate">{item.table} · {item.op} · {new Date(item.ts).toLocaleString('cs-CZ')}</div>
                        {failure && <div className="text-[10px] font-semibold text-rose-700 truncate" title={failure.error}>❌ {failure.error}</div>}
                      </div>
                      {failure && (
                        <button
                          onClick={() => discardOp(item.id)}
                          title="Zahodit tento zápis natrvalo (nepovede se uložit)"
                          className="shrink-0 px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black"
                        >
                          Zahodit
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

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
      <button
        onClick={() => setShowInfo(true)}
        title={online ? 'Jste online — klikněte pro stav synchronizace' : 'Jste offline — klikněte pro více informací'}
        className={`w-3.5 h-3.5 rounded-full shrink-0 border-2 transition hover:scale-125 ${online ? 'bg-emerald-500 border-emerald-300' : 'bg-rose-500 border-rose-300'}`}
      />
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
