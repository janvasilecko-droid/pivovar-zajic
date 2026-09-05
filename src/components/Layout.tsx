import { ReactNode, useState, useEffect, useRef, lazy, Suspense } from 'react';
import { AlarmClock, AlertTriangle, ArrowRight, BarChart3, Beer as BeerIcon, Bell, BellOff, BookOpen, Calculator, CalendarDays, Car, ClipboardCheck, ClipboardList, Compass, Cylinder, Download, FilePlus, FileSpreadsheet, FileText, FlaskConical, GlassWater, History as HistoryIcon, Home, Hourglass, LogOut, MapPin, MessageCircle, Package as PackageIcon, PlusCircle, Radio, Receipt, Search, Settings, Shield, ShieldCheck, Smartphone, Snowflake, Sparkles, StickyNote, Store, Tag, Timer, TrendingDown, Truck, Users, Wheat, Wifi, WifiOff, Wine, X, XCircle, type LucideIcon } from 'lucide-react';
import { BreweryRadioBar } from './BreweryRadioBar';
import { BreweryRadioModal } from './BreweryRadioModal';

import { useAuth } from '../lib/auth';
import { potvrd } from '../lib/toast';
import { Modal } from './ui';
import { supabase, Beer, Package, Place } from '../lib/supabase';
import { autoReserveTapIfNeeded } from '../lib/tapReservations';

// Načte se až při otevření — viz komentář u <EditOrderModal /> níž.
const EditOrderModal = lazy(() => import('./EditOrderModal').then((m) => ({ default: m.EditOrderModal })));
import { requestNotificationPermission, getNotificationPermission, notifyNewOrder, notifyNewWhatsAppMessage, NewOrderNotifyData } from '../lib/notifications';
import { subscribeToWhatsAppMessages, fetchWhatsAppSenders, fetchPendingWhatsAppCount, isSenderAllowed, triggerAutoParse, type WhatsAppSender, type WhatsAppIncoming } from '../lib/whatsappApi';
import { requestOrdersAutoImport } from '../lib/ordersFilter';
import { getDensity, setDensity, DensityMode } from '../lib/density';
import { canUserView, getUserPermissions, PAGE_TO_MODULE, ModuleKey } from '../lib/permissions';
import { QuickSearchModal } from './QuickSearchModal';
import { isAdminEmail } from '../lib/config';
import { BugReportModal } from './BugReportModal';
import { APP_VERSION, APP_VERSION_DATE } from '../lib/version';
import { onNewVersion, forceRefresh, type VersionInfo } from '../lib/versionCheck';
import { nastavObrazovkuProChyby } from '../lib/chybyHlaseni';
// Staticky, ne přes `await import(…)`. Fronta offline zápisů sedí v hlavním
// kusu tak jako tak — `lib/supabase.ts` si ji importuje staticky a ten
// importuje každá obrazovka — takže dynamický import nic nešetřil a build
// to hlásil: „dynamic import will not move module into another chunk".
// Jediné, co přinášel, byla asynchronní obsluha tam, kde stačí volání.
import {
  queueLength, onQueueChange, onConnectivityChange, syncQueue, clearQueue,
  getQueue, getLastSyncFailures, popisOperace, removeOp,
} from '../lib/offline';
import { SCENES, DEFAULT_DOCK, hexToRgba, COLOR_HEX, type Scene, type TileColor } from '../lib/homeLayout';
import { zavibruj } from '../lib/haptika';
import { IkonaSud, IkonaLahev, IkonaVycep } from './ikony';
import '../screens/HomeScreen.css';
import { zalogujANahlas } from '../lib/chybyHlaseni';

export type NavItem = { id: Page; label: string; icon: LucideIcon; group: string };

export type Page = 'export_excel' | 'home' | 'sanitace' | 'marketing' | 'planning' | 'depozitar' | 'dashboard' | 'concentration' | 'srotovani' | 'checklists' | 'haccp' | 'sanitation_log' | 'sanitace_lahve' | 'sanitace_kegy' | 'sanitace_vycepy' | 'history' | 'orders_entry' | 'orders' | 'orders_detail' | 'orders_celkem' | 'orders_zavoz' | 'zavoz' | 'kniha_jizd' | 'stock' | 'bottling' | 'kegging' | 'fasovani' | 'prodejna' | 'akce' | 'sklo_promo' | 'vycepy' | 'exkurze' | 'reminders' | 'notes' | 'writeoffs' | 'inventory' | 'calendar' | 'feedback' | 'places' | 'beers' | 'packages' | 'pricelist' | 'vehicles' | 'cellar' | 'users' | 'app_settings' | 'app_versions' | 'bottling_needs' | 'stopwatch' | 'timer' | 'keg_timer' | 'radio' | 'zaloha' | 'signout';

export const NAV: NavItem[] = [
  // --- VÝROBA ---
  { id: 'kegging', label: 'KEG', icon: IkonaSud, group: 'Výroba' },
  { id: 'bottling', label: 'Lahve', icon: IkonaLahev, group: 'Výroba' },
  { id: 'orders', label: 'Objednávky', icon: ClipboardList, group: 'Výroba' },
  { id: 'fasovani', label: 'Fasování', icon: Users, group: 'Výroba' },
  { id: 'prodejna', label: 'Prodejna', icon: Store, group: 'Výroba' },
  { id: 'writeoffs', label: 'Odpis', icon: TrendingDown, group: 'Výroba' },
  { id: 'akce', label: 'Akce, Exkurze', icon: Sparkles, group: 'Výroba' },

  // --- PIVOVAR ---
  { id: 'dashboard', label: 'Sklad', icon: BarChart3, group: 'Pivovar' },
  { id: 'sklo_promo', label: 'Sklo, Etikety, Podtáčky', icon: GlassWater, group: 'Pivovar' },
  { id: 'cellar', label: 'Sklep', icon: Snowflake, group: 'Pivovar' },
  { id: 'bottling_needs', label: 'Potřeby stáčení', icon: IkonaLahev, group: 'Pivovar' },
  { id: 'inventory', label: 'Inventura', icon: ClipboardCheck, group: 'Pivovar' },
  { id: 'history', label: 'Statistika', icon: HistoryIcon, group: 'Pivovar' },
  { id: 'export_excel', label: 'Export do Excelu', icon: FileSpreadsheet, group: 'Pivovar' },

  // --- NÁSTROJE ---
  { id: 'concentration', label: 'Kalkulačky', icon: FlaskConical, group: 'Nástroje' },
  { id: 'calendar', label: 'Kalendář & Upozornění', icon: CalendarDays, group: 'Nástroje' },
  { id: 'timer', label: 'Časovač', icon: AlarmClock, group: 'Nástroje' },
  { id: 'haccp', label: 'Sanitační deníky', icon: Shield, group: 'Nástroje' },
  { id: 'vehicles', label: 'Auta', icon: Car, group: 'Nástroje' },

  // --- ČÍSELNÍKY ---
  { id: 'depozitar', label: 'Odběratelé, Piva, Obaly, Ceník', icon: Tag, group: 'Číselníky' },

  // --- NASTAVENÍ ---
  { id: 'users', label: 'Uživatelé', icon: ShieldCheck, group: 'Nastavení' },

  { id: 'app_settings', label: 'Aplikace & Nastavení', icon: Settings, group: 'Nastavení' },

  // Stažení zálohy jako běžná dlaždice (dřív jen štítek upozornění na ploše).
  // Otevírá obrazovku Uživatelé, kde jsou tlačítka zálohy hned nahoře.
  { id: 'zaloha', label: 'Stáhnout zálohu', icon: Download, group: 'Nastavení' },

  // 'signout' není skutečná routovaná stránka (App.tsx pro ni nemá větev) —
  // je to jen dlaždice v NAV, ať se dá přesouvat/měnit barvu/velikost stejně
  // jako ostatní; klik na ni HomeScreen.tsx zvlášť odchytává a spustí
  // odhlášení místo setPage('signout').
  { id: 'signout', label: 'Odhlásit se', icon: LogOut, group: 'Nastavení' },
];

// Rozšiřující dlaždice pro domovskou plochu (HomeScreen.tsx) — stránky, které
// dnes existují jen jako vnitřní záložka jiné obrazovky (viz PAGE_GROUP_PARENT
// níže), takže nejdou přidat jako vlastní dlaždice. Na rozdíl od NAV se
// NEpřidávají automaticky do launcheru — uživatel si je musí ručně přidat
// přes "+ Přidat dlaždici" (viz homeLayout.ts getHomeLayout extraIds).
export const EXTRA_NAV: NavItem[] = [
  { id: 'kniha_jizd', label: 'Kniha jízd', icon: BookOpen, group: 'Nástroje' },
  { id: 'vycepy', label: 'Výčepy', icon: IkonaVycep, group: 'Výroba' },
  { id: 'orders_zavoz', label: 'Rozvoz objednávek', icon: Truck, group: 'Výroba' },
  { id: 'places', label: 'Odběratelé', icon: MapPin, group: 'Číselníky' },
  { id: 'beers', label: 'Piva', icon: BeerIcon, group: 'Číselníky' },
  { id: 'packages', label: 'Obaly', icon: PackageIcon, group: 'Číselníky' },
  { id: 'pricelist', label: 'Ceník', icon: Receipt, group: 'Číselníky' },
  { id: 'sanitace_lahve', label: 'Sanitace lahví', icon: IkonaLahev, group: 'Nástroje' },
  { id: 'sanitace_kegy', label: 'Sanitace kegů', icon: IkonaSud, group: 'Nástroje' },
  { id: 'sanitace_vycepy', label: 'Sanitace výčepů', icon: IkonaVycep, group: 'Nástroje' },
  { id: 'checklists', label: 'Checklisty', icon: ClipboardCheck, group: 'Nástroje' },
  { id: 'sanitation_log', label: 'Sanitační deník', icon: FileText, group: 'Nástroje' },
  { id: 'reminders', label: 'Připomínky', icon: Bell, group: 'Nástroje' },
  { id: 'notes', label: 'Poznámky', icon: StickyNote, group: 'Nástroje' },
  { id: 'feedback', label: 'Zpětná vazba', icon: MessageCircle, group: 'Nástroje' },
  { id: 'exkurze', label: 'Exkurze', icon: Compass, group: 'Výroba' },
  { id: 'stopwatch', label: 'Stopky', icon: Timer, group: 'Nástroje' },
  { id: 'keg_timer', label: 'Stočení sudu', icon: Hourglass, group: 'Nástroje' },
  { id: 'radio', label: 'Pivovarské Rádio', icon: Radio, group: 'Nástroje' },
];

// Interní záložky uvnitř "Tabbed" obrazovek (viz App.tsx) mají vlastní Page
// hodnotu, aby zapisovaly do historie (tlačítko Zpět vrací záložku, ne celé
// menu) — v menu/hlavičce se ale mají pořád tvářit jako svoje nadřazená
// položka NAV. Tahle mapa říká, pod kterou položku NAV daná dílčí záložka patří.
// Exportovaná, ať jde v testech doložit, že se na plochu nedostane dlaždice,
// která je jen vnitřní záložkou jiné (viz homeLayout.stranky.test.ts) — přesně
// tak tam skončily „Lahve — zápis" a „Lahve — přehled" vedle „Lahve".
export const PAGE_GROUP_PARENT: Partial<Record<Page, Page>> = {
  sanitation_log: 'haccp',
  checklists: 'haccp',
  sanitace: 'haccp',
  sanitace_lahve: 'haccp',
  sanitace_kegy: 'haccp',
  sanitace_vycepy: 'haccp',
  orders_entry: 'orders',
  orders_detail: 'orders',
  orders_celkem: 'orders',
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
};

/** Vrátí Page, pod kterou se má daná stránka zvýraznit/pojmenovat v menu. */
function navPageFor(page: Page): Page {
  return PAGE_GROUP_PARENT[page] ?? page;
}

// Top-level stránky, co mají vlastní TabBar (viz src/components/TabBar.tsx) —
// ta záložka nahoře už jméno sekce ukazuje, takže mobilní hlavička ho
// nezobrazuje znovu (viz její render níže).
const TABBED_PAGES = new Set<Page>(['orders', 'akce', 'haccp', 'vehicles', 'depozitar', 'calendar']);

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
  // Stránky se svojí TabBar (viz TABBED_PAGES níže) nemají mít nad záložkami
  // žádnou lištu — záložka má být úplně nahoře, stejně jako dlaždice na Domů.
  const isTabbed = TABBED_PAGES.has(navPageFor(page));
  const hideHeader = isHome || isTabbed;
  const homeSceneRaw = (profile as any)?.home_layout?.scene;
  const homeScene: Scene = SCENES.includes(homeSceneRaw) ? homeSceneRaw : 'warm';
  const homeCustomAccent: string = (profile as any)?.home_layout?.customAccent || '#ff6b6b';
  // Sytější "umytí" barvou pro celoobrazovkovou scénu 'custom' — samotný hex
  // by na bílém podkladu vypadal jako plná barva přes celou obrazovku, ne
  // jako jemné pozadí; průhledná verze dá stejný efekt jako přednastavené
  // scény (viz HomeScreen.css .hs-fullscreen-scene[data-scene]).
  const homeCustomWash = hexToRgba(homeCustomAccent, 0.55);
  // Zesvětlení pozadí — bílý závoj přes scénu. Nastavuje se v úpravě
  // rozložení plochy (HomeScreen.tsx) a platí i mimo Domů, protože scéna je
  // celoobrazovková.
  const homeBgSvetlost: number = Number((profile as any)?.home_layout?.bgSvetlost) || 0;
  const savedDock = (profile as any)?.home_layout?.dock;
  const dockPages: Page[] = Array.isArray(savedDock) && savedDock.length > 0 ? savedDock : DEFAULT_DOCK;
  // Barva ikony+popisku spodní lišty na Domů = stejná barva, jakou má
  // zástupcova dlaždice v launcheru (ne libovolný cyklus 4 barev nesouvisející
  // s dlaždicemi) — override.color je buď jméno přednastaveného odstínu
  // (TileColor), nebo vlastní hex, stejně jako u dlaždic (viz homeLayout.ts).
  const homeOverrides = ((profile as any)?.home_layout?.overrides ?? {}) as Record<string, { color?: string }>;
  function dockAccentColor(dockId: Page): string {
    if (dockId === 'home') return COLOR_HEX.indigo;
    const raw = homeOverrides[dockId]?.color;
    if (!raw) return COLOR_HEX.slate;
    return (raw in COLOR_HEX) ? COLOR_HEX[raw as TileColor] : raw;
  }
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
  // Nová verze appky — lišta nad obsahem na každé obrazovce (viz níže).
  // `zavrenaVerze` si pamatuje, kterou verzi uživatel odklepl: až přijde
  // další, lišta se ozve znovu.
  const [novaVerze, setNovaVerze] = useState<VersionInfo | null>(null);
  const [zavrenaVerze, setZavrenaVerze] = useState<string | null>(null);
  useEffect(() => onNewVersion((info) => setNovaVerze(info)), []);
  // Předchozí navštívená obrazovka — dlouhý stisk na spodní liště se na ni
  // vrátí. Přeskakování mezi dvěma místy (třeba Závoz ↔ Objednávky) je
  // v provozu nejčastější pohyb a přes menu je to pokaždé tři klepnutí.
  const predchoziStranka = useRef<Page | null>(null);
  const aktualniStranka = useRef<Page>(page);
  const dlouhyStiskRef = useRef(false);
  const casovacStiskuRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (aktualniStranka.current !== page) {
      predchoziStranka.current = aktualniStranka.current;
      aktualniStranka.current = page;
    }
  }, [page]);
  // Do hlášení chyb (lib/chybyHlaseni.ts) patří i to, na které obrazovce se
  // chyba stala — jinak je „TypeError: undefined" nedohledatelný.
  useEffect(() => { nastavObrazovkuProChyby(page); }, [page]);
  const zacniStisk = () => {
    dlouhyStiskRef.current = false;
    casovacStiskuRef.current = setTimeout(() => {
      const kam = predchoziStranka.current;
      if (!kam || kam === page) return;
      dlouhyStiskRef.current = true;
      zavibruj('hotovo');
      setPage(kam);
    }, 500);
  };
  const ukonciStisk = () => {
    if (casovacStiskuRef.current) clearTimeout(casovacStiskuRef.current);
    casovacStiskuRef.current = null;
  };
  const [showQuickAddOrder, setShowQuickAddOrder] = useState(false);
  const [showBugModal, setShowBugModal] = useState(false);
  const [pendingWhatsAppCount, setPendingWhatsAppCount] = useState(0);
  // WhatsApp z horní hlavičky — přepne na Objednávky a otevře seznam
  // příchozích WhatsApp objednávek (hromadné zpracování).
  const openWhatsApp = () => {
    requestOrdersAutoImport();
    setPage('orders');
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
        return;
      }
      // Samotné „/" otevře hledání — na klávesnici je to jedna klávesa místo
      // dvou a na české klávesnici se Ctrl+K mačká přes Shift+7… zkrátka
      // rychleji. Nesmí to ale střílet, když člověk zrovna píše: ve
      // vstupních polích, v textarea ani v editovatelném prvku ne.
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const cil = e.target as HTMLElement | null;
        const tag = cil?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || cil?.isContentEditable) return;
        e.preventDefault();
        setShowSearchModal(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Notification States
  const [notifPermission, setNotifPermission] = useState<'granted' | 'denied' | 'default' | 'unsupported'>(getNotificationPermission());
  type BannerData = NewOrderNotifyData & { kind?: 'order' | 'whatsapp'; sender_name?: string; message_text?: string; autoHideSeconds?: number };
  const [activeNewOrderBanner, setActiveNewOrderBanner] = useState<BannerData | null>(null);

  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);

  // Mapa obrazovka → modul je sdílená v lib/permissions.ts. Dřív byla
  // zkopírovaná na třech místech a kopie se rozešly (viz komentář tam).
  const pageToModuleMap = PAGE_TO_MODULE;

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
    if (n.id === 'zaloha') return isAdmin;
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
      zalogujANahlas('Chyba při připojení k WhatsApp notifikacím', error);
    }
    return () => { if (unsubscribe) unsubscribe(); clearTimeout(countTimer); };
  }, []);

  // Offline queue + connectivity
  useEffect(() => {
    let mounted = true;
    (async () => {
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

  // Modál pro pivovarské rádio a hudbu na pozadí
  const [showRadioModal, setShowRadioModal] = useState(false);
  useEffect(() => {
    const onOpenRadio = () => setShowRadioModal(true);
    window.addEventListener('pivovar:open-radio', onOpenRadio);
    return () => window.removeEventListener('pivovar:open-radio', onOpenRadio);
  }, []);

  // Bez neprůhledného pozadí (dřív bg-neutral-50) — jinak tenhle wrapper, i
  // když je position:static, svým vlastním pozadím vždycky přemaloval
  // barevnou scénu (.hs-fullscreen-scene, position:fixed, z-index:-1) přes
  // celou obrazovku, takže výběr scény/barvy v "Upravit rozložení" neměl
  // VŮBEC žádný viditelný efekt (scéna se sice správně přepočítala a
  // aplikovala, jen ji nikdy nebylo vidět). Scéna sama vždy nastaví nějaké
  // pozadí (fallback 'warm'), takže tu žádná díra nehrozí.
  return (
    <div className="flex h-screen text-neutral-900 font-sans antialiased overflow-hidden selection:bg-amber-500 selection:text-neutral-950">
      {/* Floating Mobile/Desktop New Order Banner Alert */}
      {activeNewOrderBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg bg-neutral-900 border-2 border-amber-400 text-white rounded p-4 sm:p-5 shadow-2xl shadow-amber-500/20 animate-bounce-short flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded text-[#0f172a] font-black text-2xl flex items-center justify-center animate-pulse ${activeNewOrderBanner.kind === 'whatsapp' ? 'bg-[#25D366]' : 'bg-amber-500'}`}>
                {activeNewOrderBanner.kind === 'whatsapp' ? <MessageCircle className="ikona-text" /> : <BeerIcon className="ikona-text" />}
              </div>
              <div>
                <div className="text-udaj font-black uppercase tracking-wider text-amber-400">
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
              className="p-1 rounded hover:bg-neutral-800 text-neutral-400 hover:text-white transition tap"
            >
              <X size={18} />
            </button>
          </div>

          {activeNewOrderBanner.kind === 'whatsapp' ? (
            activeNewOrderBanner.message_text ? (
              <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800">
                {activeNewOrderBanner.message_text.length > 200 ? activeNewOrderBanner.message_text.slice(0, 200) + '…' : activeNewOrderBanner.message_text}
              </p>
            ) : null
          ) : (
            activeNewOrderBanner.note && (
              <p className="text-xs text-neutral-300 bg-neutral-950 p-2.5 rounded border border-neutral-800 italic">
                "{activeNewOrderBanner.note}"
              </p>
            )
          )}

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-neutral-800/80">
            <button
              onClick={() => setActiveNewOrderBanner(null)}
              className="px-3 py-1.5 rounded text-xs font-bold text-neutral-400 hover:text-white tap"
            >
              Zavřít
            </button>
            <button
              onClick={() => {
                // U WhatsApp objednávky se má otevřít rovnou okno „objednávky
                // ke kontrole" (hromadné zpracování příchozích zpráv), ne
                // obyčejný seznam objednávek — z upozornění „NOVÁ WHATSAPP
                // OBJEDNÁVKA K OVĚŘENÍ" je to jediný krok, který dává smysl.
                // Dřív se jen přepnula stránka, takže se muselo ke kontrole
                // proklikat ručně. Stejná cesta jako ikona WhatsApp
                // v hlavičce a dlaždice na Domů (viz requestOrdersAutoImport).
                if (activeNewOrderBanner.kind === 'whatsapp') requestOrdersAutoImport();
                setActiveNewOrderBanner(null);
                setPage('orders');
              }}
              className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition flex items-center gap-1.5"
            >
              <span>{activeNewOrderBanner.kind === 'whatsapp' ? 'Zkontrolovat objednávku' : 'Zobrazit v Objednávkách'}</span>
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Stará postranní nabídka (aside) je pryč — appka je teď navigovaná
          čistě přes dlaždicový launcher (HomeScreen.tsx). Odhlášení je
          dlaždice na Domů; stav offline fronty a upozornění jsou v hlavičce
          níže (vidět na každé stránce, ne jen na Domů). */}

      {/* Banner: offline → zobrazená data nemusí být aktuální (z mezipaměti). */}
      {showStaleBanner && (
        <div className="fixed top-4 right-4 z-toast max-w-xs sm:max-w-sm flex items-center gap-2 rounded bg-amber-50 border-2 border-amber-300 text-amber-950 shadow-xl px-3.5 py-2.5 animate-fade-in">
          <span className="text-base shrink-0"><AlertTriangle className="ikona-text" /></span>
          <p className="text-udaj font-bold leading-snug flex-1">
            Jste offline - zobrazená data nemusí být aktuální (z mezipaměti).
          </p>
          <button
            onClick={() => setShowStaleBanner(false)}
            aria-label="Zavřít upozornění"
            className="p-1 rounded hover:bg-amber-200/70 text-amber-900/70 hover:text-amber-950 transition shrink-0 tap"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden text-neutral-900">
        {/* Nová verze — LIŠTA NA KAŽDÉ OBRAZOVCE, ne jen dlaždice na Domů.
            Dlaždice tam zůstává, ale kdo pracuje v Objednávkách nebo ve
            Stáčení, na Domů se za celou směnu nedostane a o aktualizaci se
            nedozví — projevilo se to tím, že „appka nechce aktualizovat",
            přitom nová verze čekala. Lišta je záměrně MIMO hlavičku
            (hlavička se na Domů a na záložkových stránkách vůbec nekreslí)
            a nechá se zavřít; do příštího spuštění nebo příští verze pak
            mlčí. Aktualizace je vždy klik uživatele — nikdy se sama
            nereloaduje rozdělaná obrazovka (viz versionCheck.ts). */}
        {novaVerze && novaVerze.version !== zavrenaVerze && (
          <div className="shrink-0 flex items-center gap-2 px-3 sm:px-8 py-1.5 bg-amber-100 border-b border-amber-300 text-amber-950">
            <Download size={16} className="shrink-0" />
            <p className="text-[12px] font-bold leading-snug flex-1 min-w-0 truncate">
              Nová verze v{novaVerze.version} je k dispozici
            </p>
            <button
              type="button"
              onClick={() => { void forceRefresh(); }}
              className="shrink-0 px-3 py-1 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-[12px] transition tap"
            >
              Aktualizovat
            </button>
            <button
              type="button"
              onClick={() => setZavrenaVerze(novaVerze.version)}
              aria-label="Zavřít upozornění na novou verzi"
              className="shrink-0 p-1 rounded hover:bg-amber-200/70 text-amber-900/80 hover:text-amber-950 transition tap"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {/* Barevné pozadí (scéna) — dřív jen na Domů, teď na všech
            stránkách, ať appka vypadá jednotně (viz homeScene/customAccent
            výše, nastavuje se v HomeScreen.tsx "Upravit rozložení" → POZADÍ). */}
        <div className="hs-fullscreen-scene" data-scene={homeScene} style={{ ['--hs-custom' as any]: homeCustomAccent, ['--hs-custom-wash' as any]: homeCustomWash, ['--hs-svetlost' as any]: homeBgSvetlost }}>
          <i className="b1" /><i className="b2" /><i className="b3" /><i className="b4" />
        </div>
        {/* Top Header - Desktop & Mobile. Na Domů a na stránkách s vlastní
            TabBar (viz TABBED_PAGES) úplně schovaná — dlaždice/záložky mají
            být úplně nahoře, žádný rámeček/lišta nad nimi. Jinde skleněná/
            poloprůhledná (stejný vzhled jako na Domů), ať skrz ni prosvítá
            barevná scéna. */}
        {!hideHeader && (
        <header
          className="hs-glass-chrome flex items-center justify-between px-2 sm:px-8 py-2 border-b shadow-2xs z-20 gap-2 shrink-0"
        >
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink-0">
            {/* Název stránky v hlavičce — na mobilu (viz níže) je to JEDINÝ
                obsah hlavičky, ať zbytečně nezabírá místo na malém displeji;
                vynechá se na stránkách, co mají vlastní TabBar (viz
                TABBED_PAGES níže): záložka nahoře už jméno sekce ukazuje,
                duplicitní popisek by byl zbytečný (viz Objednávky —
                "Objednávky" v kartě + tahle hlavička + záložka = 3× to samé). */}
            {!TABBED_PAGES.has(navPageFor(page)) && (
              <span className="font-display font-black text-sm sm:text-base text-neutral-900 truncate">
                {(NAV.find((n) => n.id === navPageFor(page)) ?? EXTRA_NAV.find((n) => n.id === navPageFor(page)))?.label ?? ''}
              </span>
            )}
          </div>

          {/* Hledání na telefonu — jediné tlačítko vpravo, ať hlavička
              nezabírá místo. Ctrl+K se na telefonu zmáčknout nedá. */}
          <button
            type="button"
            onClick={() => setShowSearchModal(true)}
            aria-label="Hledat"
            className="sm:hidden ml-auto shrink-0 w-11 h-11 grid place-items-center rounded-xl border border-neutral-200 bg-neutral-100/80 text-neutral-700 active:scale-95 transition"
          >
            <Search size={18} />
          </button>

          {/* Hlavička je ZÁMĚRNĚ prázdná až na název stránky a stav
              synchronizace. Dřív tu na každé obrazovce sedělo Hledat,
              odznaky objednávek a WhatsAppu, Rádio a Chyby — pruh tlačítek,
              který zabíral místo a s prací na dané stránce nesouvisel.
              Hledat je dlaždice na Domů (a Ctrl+K funguje dál), Rádio i
              hlášení chyb taky; nové WhatsApp zprávy k parsování ohlásí
              ikona na ploše (viz HomeScreen.tsx).

              Stav synchronizace zůstává: je to jen tečka a jako jediný
              ukazuje, že něco ještě neodešlo do cloudu. Bez něj by se
              neodeslaná data ztratila potichu. */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <OfflineStatus online={online} pending={pending} syncing={syncing} syncMsg={syncMsg} onSync={async () => { if (queueLength() === 0) { setSyncMsg('Fronta je prázdná — nic k synchronizaci'); setTimeout(() => setSyncMsg(null), 3000); return; } setSyncing(true); const r = await syncQueue(); setSyncing(false); setSyncMsg(r.remaining === 0 ? `Synchronizováno ${r.ok} změn` : `OK ${r.ok}, selhalo ${r.failed}`); setTimeout(() => setSyncMsg(null), 4000); }} />
          </div>
        </header>
        )}

        <QuickSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectPage={setPage}
        />

        <BreweryRadioBar onOpenModal={() => setShowRadioModal(true)} />
        <BreweryRadioModal open={showRadioModal} onClose={() => setShowRadioModal(false)} />

        {showQuickAddOrder && (
          <Suspense fallback={null}>
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
          </Suspense>
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

        {/* Dynamic Page Content with bottom safe padding for Mobile Navigation Dock.
            Na Domů a na stránkách s vlastní TabBar bez horního odsazení, ať
            dlaždice/záložky začínají úplně nahoře (hlavička tam navíc není
            vůbec vykreslená). */}
        <div className={`flex-1 overflow-y-auto px-3.5 sm:px-8 pb-24 ${hideHeader ? 'pt-2' : 'pt-3.5 sm:pt-8'}`}>
          {children}
        </div>

        {/* Mobile Bottom Navigation Dock — thumb-friendly bottom bar. Obsah
            (4 zástupci) je uživatelsky volitelný — viz "Spodní lišta" v edit
            módu launcheru (HomeScreen.tsx), uložen v home_layout.dock.
            Skleněná (stejný vzhled na všech stránkách, ne jen na Domů) —
            žádné vyplněné barevné bloky, jen ikona+popisek aktivní položky
            obarvené stejnou barvou, jakou má daná dlaždice v launcheru. */}
        {/* 📴 Stav připojení a fronta neodeslaných zápisů.
            Dřív byl tenhle ukazatel jen v horní liště s třídou "hidden sm:flex",
            takže na telefonu nebyl vidět NIKDY — a na počítači mizel na Domů
            i na všech záložkových stránkách. Zápis provedený offline přitom
            vypadá stejně jako uložený (zelené „Uloženo"), takže ve sklepě
            s kolísavým signálem lidé zapisovali stáčení s tím, že je hotovo.
            Sem nad dok je to vidět na každé stránce včetně mobilu. */}
        {(!online || pending > 0) && (
          <div className="fixed bottom-[64px] left-0 right-0 z-lista px-2 pointer-events-none sm:max-w-lg sm:mx-auto">
            <button
              type="button"
              onClick={async () => {
                if (queueLength() === 0) return;
                setSyncing(true);
                const r = await syncQueue();
                setSyncing(false);
                setSyncMsg(r.remaining === 0 ? `Odesláno ${r.ok} změn` : `OK ${r.ok}, selhalo ${r.failed}`);
                setTimeout(() => setSyncMsg(null), 4000);
              }}
              disabled={syncing || pending === 0}
              className={`pointer-events-auto w-full rounded-lg px-3 py-2 text-xs font-black shadow-lg border flex items-center justify-center gap-2 transition ${
                !online
                  ? 'bg-amber-500 border-amber-600 text-neutral-950'
                  : 'bg-sky-700 border-sky-700 text-white hover:bg-sky-800'
              }`}
            >
              {!online ? (
                <>
                  <span><WifiOff className="ikona-text" /> Jste offline</span>
                  {pending > 0 && <span className="opacity-90">— {pending} zápisů čeká v telefonu</span>}
                </>
              ) : (
                <span>{syncing ? 'Odesílám zápisy…' : `${pending} zápisů čeká na odeslání — klepněte pro odeslání`}</span>
              )}
            </button>
          </div>
        )}
        <nav
          className="hs-glass-chrome fixed bottom-0 left-0 right-0 z-lista border-t shadow-[0_-4px_24px_rgba(0,0,0,0.08)] px-1 py-1.5 pb-safe flex items-center justify-around gap-1 sm:max-w-lg sm:mx-auto sm:rounded-t-2xl sm:border-x"
        >
          {dockPages.map((dockId, i) => {
            const isActive = dockId === 'home' ? navPageFor(page) === 'home' : navPageFor(page) === dockId;
            const info = dockId === 'home'
              ? { label: 'Domů', icon: Home }
              : NAV.find((n) => n.id === dockId);
            if (!info) return null;
            const DockIcon = info.icon;
            const accent = dockAccentColor(dockId);
            return (
              <button
                key={`${dockId}-${i}`}
                onClick={() => { if (dlouhyStiskRef.current) { dlouhyStiskRef.current = false; return; } setPage(dockId); }}
                onPointerDown={zacniStisk}
                onPointerUp={ukonciStisk}
                onPointerLeave={ukonciStisk}
                onContextMenu={(e) => e.preventDefault()}
                title={predchoziStranka.current ? 'Podržením se vrátíte na předchozí obrazovku' : undefined}
                style={isActive ? { color: accent } : undefined}
                className={`tap flex flex-col items-center justify-center py-1 px-1 sm:px-2.5 rounded transition-all relative flex-1 font-bold ${
                  isActive ? 'bg-white/60 shadow-sm scale-105' : 'text-neutral-700 hover:text-neutral-900'
                }`}
              >
                <div className="relative">
                  <DockIcon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {dockId === 'orders' && pendingWhatsAppCount > 0 && (
                    <span className="absolute -top-1 -right-2 bg-rose-600 text-white text-udaj font-black rounded-full min-w-[14px] h-3.5 px-0.5 flex items-center justify-center shadow">
                      {pendingWhatsAppCount > 9 ? '9+' : pendingWhatsAppCount}
                    </span>
                  )}
                </div>
                {/* `max-w-[64px]` byla pevná hodnota z doby čtyř slotů na
                    úzkém displeji — jenže slot je široký 89 px, takže si
                    popisek sám ořezával 25 px, které měl k dispozici
                    („Lahve (Stá…" místo „Lahve (Stáčení)"). `w-full`
                    respektuje skutečnou šířku slotu, ať jsou v liště dva
                    zástupci nebo šest. */}
                <span className="text-udaj mt-0.5 tracking-tight truncate w-full text-center">{info.label}</span>
              </button>
            );
          })}
        </nav>
      </main>

    </div>
  );
}

function OfflineStatus({ online, pending, syncing, syncMsg, onSync }: { online: boolean; pending: number; syncing: boolean; syncMsg: string | null; onSync: () => void }) {
  const [showInfo, setShowInfo] = useState(false);
  const [queueItems, setQueueItems] = useState<{ id: string; popis: string; ts: number }[]>([]);
  const [failures, setFailures] = useState<{ id: string; table: string; op: string; error: string }[]>([]);

  async function refreshQueueDetail() {
    setQueueItems(getQueue().map((o) => ({ id: o.id, popis: popisOperace(o), ts: o.ts })));
    setFailures(getLastSyncFailures());
  }

  useEffect(() => {
    if (showInfo) refreshQueueDetail();
  }, [showInfo, pending, syncing]);

  async function discardOp(id: string) {
    removeOp(id);
    setFailures((prev) => prev.filter((f) => f.id !== id));
    refreshQueueDetail();
  }

  return (
    <div className="flex items-center gap-2">
      {showInfo && (
        <Modal open={true} onClose={() => setShowInfo(false)} title="Offline Režim & Synchronizace">
          <div className="space-y-4 text-xs text-neutral-800 font-medium">
            <div className={`p-4 rounded border-2 flex items-center gap-3 ${online ? 'bg-emerald-50 border-emerald-300 text-emerald-950' : 'bg-amber-50 border-amber-300 text-amber-950'}`}>
              <div className="text-2xl">{online ? <Wifi className="ikona-text" /> : <AlertTriangle className="ikona-text" />}</div>
              <div>
                <div className="font-black text-sm">{online ? 'Jste ONLINE (Připojeno k internetu)' : 'Jste OFFLINE (Bez připojení k síti)'}</div>
                <p className="text-udaj mt-0.5 font-bold">
                  {online
                    ? 'Veškeré zápisy se okamžitě ukládají do databáze.'
                    : 'Aplikace v pivovaru plně funguje bez signálu! Zápisy ze sklepa se bezpečně ukládají do telefonu a po připojení se samy synchronizují.'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded bg-neutral-900 text-white space-y-2 font-mono text-xs">
              <div className="flex justify-between border-b border-neutral-700 pb-2">
                <span className="text-neutral-400">Čekající offline zápisy ve frontě:</span>
                <span className="font-black text-amber-400">{pending} operací</span>
              </div>
              <p className="text-udaj text-neutral-300 pt-1 font-sans">
                Po obnovení internetového připojení v pivovaru stiskněte tlačítko pro ruční odeslání všech zápisů ze sklepa.
              </p>
            </div>

            {queueItems.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {queueItems.map((item) => {
                  const failure = failures.find((f) => f.id === item.id);
                  return (
                    <div key={item.id} className={`flex items-center justify-between gap-2 px-3 py-2 rounded border text-udaj font-bold ${failure ? 'bg-rose-50 border-rose-300 text-rose-950' : 'bg-neutral-100 border-neutral-200 text-neutral-700'}`}>
                      <div className="min-w-0">
                        <div className="truncate" title={item.popis}>{item.popis}</div>
                        <div className="text-udaj font-semibold text-neutral-500">{new Date(item.ts).toLocaleString('cs-CZ')}</div>
                        {failure && <div className="text-udaj font-semibold text-rose-700 truncate" title={failure.error}><XCircle className="ikona-text" /> {failure.error}</div>}
                      </div>
                      <button
                        onClick={async () => {
                          if (await potvrd(`Zahodit tento zápis?

${item.popis}

Do databáze se už neuloží.`)) discardOp(item.id);
                        }}
                        title="Zahodit tento zápis natrvalo — do databáze se neuloží" aria-label="Zahodit tento zápis natrvalo — do databáze se neuloží"
                        className={`shrink-0 min-h-[44px] px-3 rounded font-black ${failure ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'}`}
                      >
                        Zahodit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSync}
                disabled={syncing || pending === 0}
                className="px-4 py-2.5 rounded bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white font-black text-xs shadow-md transition flex items-center gap-2"
              >
                <span>{syncing ? 'Odesílám zápisy…' : `Ručně synchronizovat (${pending})`}</span>
              </button>
              <button onClick={() => setShowInfo(false)} className="btn-amber !rounded text-xs font-black">
                Zavřít
              </button>
            </div>
          </div>
        </Modal>
      )}

      {syncMsg && (
        <span className="text-udaj font-extrabold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded border border-emerald-300 animate-fade-in">
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
          className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-800 text-white font-black text-udaj border border-sky-400 transition flex items-center gap-1 shadow-xs animate-pulse tap"
        >
          <span>{syncing ? 'Sync…' : `Čeká ${pending} změn`}</span>
        </button>
      )}
    </div>
  );
}

function InstallModal({ installPrompt, setInstallPrompt, setInstalled, setShowInstallModal }: any) {
  return (
    <Modal open={true} onClose={() => setShowInstallModal(false)} title="Instalace aplikace Pivovar Zajíc">
      <div className="space-y-4 text-xs font-medium text-neutral-800">
        <p className="text-sm">Nainstalujte si aplikaci Pivovar Zajíc přímo na plochu mobilu nebo počítače pro okamžitá upozornění a rychlé offline zadávání.</p>
        
        {installPrompt && (
          <div className="p-4 bg-amber-50 rounded border-2 border-amber-300 flex flex-col gap-2">
            <div className="font-extrabold text-amber-950 text-sm">Váš prohlížeč podporuje přímou instalaci na 1 kliknutí!</div>
            <button
              onClick={async () => {
                await installPrompt.prompt();
                const { outcome } = await installPrompt.userChoice;
                if (outcome === 'accepted') setInstalled(true);
                setInstallPrompt(null);
                setShowInstallModal(false);
              }}
              className="btn-primary !rounded w-full !py-3 text-sm font-black shadow-lg"
            >
              <Smartphone className="ikona-text" /> Spustit přímou instalaci na plochu
            </button>
          </div>
        )}

        <div className="bg-neutral-50 p-4 rounded border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900">Postup pro Android (Chrome / Edge):</div>
          <p>1. Klepněte na <strong>tři tečky</strong> vpravo nahoře v prohlížeči.</p>
          <p>2. Zvolte <strong>Nainstalovat aplikaci</strong> nebo <strong>Přidat na plochu</strong>.</p>
        </div>

        <div className="bg-neutral-50 p-4 rounded border border-neutral-200 space-y-2">
          <div className="font-bold text-neutral-900">Postup pro iOS (Safari na iPhone):</div>
          <p>1. Klepněte na tlačítko <strong>Sdílet</strong> (čtvereček s šipkou dole na liště).</p>
          <p>2. Zvolte <strong>Přidat na plochu</strong>.</p>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={() => setShowInstallModal(false)} className="btn-ghost !rounded text-xs font-bold">
            Zavřít
          </button>
        </div>
      </div>
    </Modal>
  );
}
