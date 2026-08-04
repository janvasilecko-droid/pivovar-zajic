import { useState, useEffect } from 'react';
import { Download, Eye, Palette, Smartphone, Sun, Moon, Monitor, Bell, BellOff, Volume2, VolumeX, MessageSquare, Timer, RefreshCw, CloudDownload, CheckCircle2, AlertCircle, GripVertical, Plus, Trash2, Eraser } from 'lucide-react';

import { DENSITY_OPTIONS, DensityMode, getDensity, setDensity } from '../lib/density';
import { MenuCustomizeModal } from '../components/MenuCustomizeModal';
import { useAuth } from '../lib/auth';
import { NAV, NavItem } from '../components/Layout';
import { canUserView, getUserPermissions, ModuleKey } from '../lib/permissions';
import { Theme, getTheme, setTheme } from '../lib/theme';
import { getNotificationPermission, requestNotificationPermission, getNotificationSettings, saveNotificationSettings, NotificationSettings } from '../lib/notifications';
import { APP_VERSION, APP_VERSION_DATE, APP_CHANGELOG } from '../lib/version';
import { getQuickActions, saveQuickActions, QuickAction } from '../lib/quickActions';
import { isAdminEmail } from '../lib/config';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function AppSettingsScreen() {
  const { profile, user } = useAuth();
  const [density, setDensityState] = useState<DensityMode>(getDensity());
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [showMenuCustomize, setShowMenuCustomize] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>(() => {
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsStandalone(true);
      }
      setInstallPrompt(null);
    }
  };

  async function handleToggleNotifications() {
    if (notifPermission === 'granted') {
      alert('Upozornění jsou povolena. Pro jejich zakázání je nutné to udělat v nastavení prohlížeče.');
      return;
    }
    await requestNotificationPermission();
    setNotifPermission(getNotificationPermission());
  }

  const pageToModuleMap: Record<string, ModuleKey> = {
    dashboard: 'dashboard', kegging: 'entry', kegging_entry: 'entry', kegging_overview: 'entry',
    bottling: 'entry', bottling_entry: 'entry', bottling_overview: 'entry', orders_entry: 'entry',
    fasovani: 'entry', prodejna: 'entry', writeoffs: 'entry', orders: 'orders', zavoz: 'zavoz',
    kniha_jizd: 'kniha_jizd', stock: 'stock', inventory: 'inventory', srotovani: 'entry',
    checklists: 'haccp', concentration: 'entry',
    cellar: 'cellar', history: 'cellar', haccp: 'haccp', sanitation_log: 'haccp',
    places: 'catalogs', beers: 'catalogs', packages: 'catalogs', vehicles: 'catalogs',
    pricelist: 'pricelist', sklo_promo: 'sklo_promo', vycepy: 'vycepy', app_settings: 'app_settings',
    exkurze: 'exkurze', akce: 'akce', calendar: 'catalogs', feedback: 'catalogs',
  };

  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);

  const permittedNav = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    const modKey = pageToModuleMap[n.id];
    if (!modKey) return true;
    return canUserView(profile?.role, user?.id, modKey, userPerms);
  });

  function saveHiddenModules(newHidden: string[]) {
    setHiddenModules(newHidden);
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      localStorage.setItem(key, JSON.stringify(newHidden));
    } catch {}
  }

  function handleNotifSettingsChange(patch: Partial<NotificationSettings>) {
    const next = { ...notifSettings, ...patch };
    setNotifSettings(next);
    saveNotificationSettings(next);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <MenuCustomizeModal
        open={showMenuCustomize}
        permittedNav={permittedNav as NavItem[]}
        hiddenModules={hiddenModules}
        onSave={saveHiddenModules}
        onClose={() => setShowMenuCustomize(false)}
      />

      <div className="bg-neutral-900 text-white p-5 sm:p-6 rounded-3xl border border-amber-500/30 shadow-xl">
        <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
          <span>⚙️ Aplikace & Nastavení</span>
        </h1>
        <p className="text-xs text-neutral-400 font-medium mt-1">Přizpůsobte si vzhled, chování a upozornění aplikace.</p>
      </div>

      {/* Instalace */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Smartphone size={20} /> Instalace aplikace</h2>
        {isStandalone ? (
          <p className="text-sm text-emerald-700 font-bold mt-2">Aplikace je již nainstalována na vašem zařízení.</p>
        ) : installPrompt ? (
          <>
            <p className="text-sm text-neutral-600 mt-2">Nainstalujte si aplikaci na plochu pro rychlejší přístup a offline funkčnost.</p>
            <button onClick={handleInstall} className="btn-primary mt-3 text-sm font-black flex items-center gap-2"><Download size={16} /> Nainstalovat aplikaci</button>
          </>
        ) : (
          <p className="text-sm text-neutral-600 mt-2">Váš prohlížeč nepodporuje přímou instalaci, nebo již byla nabídnuta. Můžete ji přidat na plochu ručně přes menu prohlížeče.</p>
        )}
      </div>

      {/* Menu */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Eye size={20} /> Přizpůsobení menu</h2>
        <p className="text-sm text-neutral-600 mt-2">Vyberte si, které položky chcete vidět v hlavním menu pro rychlejší navigaci.</p>
        <button onClick={() => setShowMenuCustomize(true)} className="btn-ghost mt-3 text-sm font-black">Upravit viditelnost menu</button>
      </div>

      {/* Rychlá tlačítka nahoře */}
      <QuickActionsSection userId={user?.id || 'guest'} permittedNav={permittedNav} />

      {/* Hustota / Velikost */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Palette size={20} /> Hustota zobrazení</h2>
        <p className="text-sm text-neutral-600 mt-2">Zvolte velikost prvků a písma. XS = nejhustší, XL = největší.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {DENSITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setDensity(opt.value); setDensityState(opt.value); }}
              className={`flex flex-col items-center px-4 py-2.5 rounded-2xl border-2 font-black text-sm transition-all min-w-[56px] ${
                density === opt.value
                  ? 'bg-amber-500 border-amber-400 text-neutral-950 shadow-md scale-105'
                  : 'bg-white border-neutral-200 text-neutral-700 hover:border-amber-300 hover:bg-amber-50'
              }`}
            >
              <span className="text-base">{opt.label}</span>
              <span className="text-[10px] font-medium mt-0.5 opacity-70">{opt.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Upozornění */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Bell size={20} /> Upozornění (notifikace)</h2>
        <p className="text-sm text-neutral-600 mt-2">Nastavte si chování upozornění na nové objednávky.</p>

        <div className="mt-5 space-y-4">
          {/* Povolení systémových notifikací */}
          <button
            onClick={handleToggleNotifications}
            className={`w-full text-left p-4 rounded-2xl border-2 font-bold flex items-center gap-3 transition ${
              notifPermission === 'granted'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            {notifPermission === 'granted' ? <Bell size={20} /> : <BellOff size={20} />}
            <span>
              {notifPermission === 'granted' ? 'Systémová upozornění jsou POVOLENA' : 'Systémová upozornění jsou ZAKÁZÁNA'}
              <span className="block text-xs font-medium opacity-75 mt-0.5">
                {notifPermission === 'granted'
                  ? 'Kliknutím otevřete nastavení prohlížeče pro odebrání.'
                  : 'Kliknutím požádáte o povolení zobrazovat systémová upozornění.'}
              </span>
            </span>
          </button>

          {/* In-app banner */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-neutral-600" />
                <span className="text-sm font-black text-neutral-800">In-app banner</span>
              </div>
              <button
                onClick={() => handleNotifSettingsChange({ showInAppBanner: !notifSettings.showInAppBanner })}
                className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.showInAppBanner ? 'bg-amber-500' : 'bg-neutral-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.showInAppBanner ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-neutral-500">Zobrazit plovoucí banner v aplikaci při nové objednávce.</p>
          </div>

          {/* Zvukové upozornění */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {notifSettings.playSound ? <Volume2 size={16} className="text-neutral-600" /> : <VolumeX size={16} className="text-neutral-500" />}
                <span className="text-sm font-black text-neutral-800">Zvukové upozornění</span>
              </div>
              <button
                onClick={() => handleNotifSettingsChange({ playSound: !notifSettings.playSound })}
                className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.playSound ? 'bg-amber-500' : 'bg-neutral-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.playSound ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-neutral-500">Přehrát zvukový signál při příchodu nové objednávky.</p>
          </div>

          {/* Vyžadovat kliknutí */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-neutral-600" />
                <span className="text-sm font-black text-neutral-800">Vyžadovat potvrzení (systémová notif.)</span>
              </div>
              <button
                onClick={() => handleNotifSettingsChange({ requireInteraction: !notifSettings.requireInteraction })}
                className={`relative w-11 h-6 rounded-full transition-colors ${notifSettings.requireInteraction ? 'bg-amber-500' : 'bg-neutral-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${notifSettings.requireInteraction ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            <p className="text-xs text-neutral-500">Systémová push notifikace zůstane viditelná dokud ji nekliknete. Pokud vypnete, automaticky zmizí.</p>
          </div>
 
          {/* Auto-hide čas */}
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
            <div className="flex items-center gap-2 mb-2">
              <Timer size={16} className="text-neutral-600" />
              <span className="text-sm font-black text-neutral-800">Automaticky skrýt banner po:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([5, 10, 30, 60, 0] as const).map(secs => (
                <button
                  key={secs}
                  onClick={() => handleNotifSettingsChange({ autoHideSeconds: secs })}
                  className={`px-3 py-1.5 rounded-xl border-2 font-bold text-sm transition-all ${
                    notifSettings.autoHideSeconds === secs
                      ? 'bg-amber-500 border-amber-400 text-neutral-950 shadow-sm'
                      : 'bg-white border-neutral-200 text-neutral-700 hover:border-amber-300'
                  }`}
                >
                  {secs === 0 ? '🔒 Nikdy (ručně)' : `${secs} s`}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500 mt-2">
              Platí pro in-app banner. Systémové notifikace se řídí nastavením &quot;Vyžadovat potvrzení&quot; výše.
            </p>
          </div>
        </div>
      </div>

      {/* Vzhled */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Palette size={20} /> Vzhled (Světlý/Tmavý)</h2>
        <p className="text-sm text-neutral-600 mt-2">Vyberte si preferovaný barevný režim.</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => { setTheme('light'); setThemeState('light'); }} className={`btn ${theme === 'light' ? 'btn-primary' : 'btn-ghost'} flex items-center gap-2`}>
            <Sun size={16} /> Světlý
          </button>
          <button onClick={() => { setTheme('dark'); setThemeState('dark'); }} className={`btn ${theme === 'dark' ? 'btn-primary' : 'btn-ghost'} flex items-center gap-2`}>
            <Moon size={16} /> Tmavý
          </button>
          <button onClick={() => { setTheme('system'); setThemeState('system'); }} className={`btn ${theme === 'system' ? 'btn-primary' : 'btn-ghost'} flex items-center gap-2`}>
            <Monitor size={16} /> Podle systému
          </button>
        </div>
      </div>

      {/* 🔄 ADMIN: Verze & Synchronizace dat */}
      {isAdmin && (
        <AdminVersionSyncSection />
      )}
    </div>
  );
}

function QuickActionsSection({ userId, permittedNav }: { userId: string; permittedNav: NavItem[] }) {
  const [actions, setActions] = useState<QuickAction[]>(() => getQuickActions(userId));

  function save(newActions: QuickAction[]) {
    setActions(newActions);
    saveQuickActions(userId, newActions);
  }

  function addAction() {
    if (actions.length >= 4) return;
    const firstUnused = permittedNav.find((n) => !actions.some((a) => a.pageId === n.id));
    if (!firstUnused) return;
    save([...actions, { pageId: firstUnused.id, label: firstUnused.label, icon: '🔗' }]);
  }

  function removeAction(idx: number) {
    save(actions.filter((_, i) => i !== idx));
  }

  function changeAction(idx: number, pageId: string) {
    const navItem = permittedNav.find((n) => n.id === pageId);
    if (!navItem) return;
    const newActions = actions.map((a, i) => i === idx ? { ...a, pageId: navItem.id, label: navItem.label } : a);
    save(newActions);
  }

  return (
    <div className="card p-6">
      <h2 className="font-display font-bold text-lg flex items-center gap-2">
        <GripVertical size={20} /> Rychlá tlačítka nahoře
      </h2>
      <p className="text-sm text-neutral-600 mt-2">
        Nastavte si až 4 tlačítka, která se zobrazí nahoře v hlavičce (vedle "Nové objednávky" a "Fasování").
        První tlačítko bude zvýrazněné.
      </p>

      <div className="mt-4 space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="flex items-center gap-2 p-3 rounded-2xl bg-neutral-50 border border-neutral-200">
            <span className="text-lg shrink-0">{a.icon}</span>
            <select
              className="input flex-1 !py-2 text-sm font-bold"
              value={a.pageId}
              onChange={(e) => changeAction(i, e.target.value)}
            >
              {permittedNav.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
            <button
              onClick={() => removeAction(i)}
              className="p-2 rounded-xl hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition"
              title="Odebrat tlačítko"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {actions.length < 4 && (
        <button
          onClick={addAction}
          className="btn-ghost mt-3 text-sm font-black flex items-center gap-2"
        >
          <Plus size={16} /> Přidat tlačítko ({actions.length}/4)
        </button>
      )}

      {actions.length === 0 && (
        <p className="text-xs text-neutral-500 mt-2 italic">Žádná rychlá tlačítka — na mobilu se nezobrazí nic.</p>
      )}

      <div className="mt-4 p-3 rounded-2xl bg-amber-50 border border-amber-200">
        <div className="text-xs font-bold text-amber-950">Náhled:</div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {actions.map((a, i) => (
            <span
              key={i}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
                i === 0
                  ? 'bg-amber-500 text-neutral-950 border-amber-400'
                  : 'bg-neutral-800 text-white border-neutral-700'
              }`}
            >
              {a.icon} {a.label}
            </span>
          ))}
          {actions.length === 0 && <span className="text-xs text-neutral-500 italic">(prázdné)</span>}
        </div>
      </div>
    </div>
  );
}

function AdminVersionSyncSection() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [refreshOk, setRefreshOk] = useState<boolean | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const [cleanOk, setCleanOk] = useState<boolean | null>(null);

  async function handleClearData() {
    const confirmed = window.confirm(
      '⚠️ VYČIŠTĚNÍ VŠECH DAT\n\n' +
      'Tato akce SMAŽE VŠECHNA uživatelská data z databáze:\n' +
      '• Objednávky, stáčení, inventury, odpisy, fasování\n' +
      '• Akce, kalendář, připomínky, sanitace, vozidla\n' +
      '• Odběratele, ceník, audit, feedback, rezervace výčepů\n\n' +
      'Referenční číselníky (piva, obaly, tanky) se resetují na výchozí stav.\n\n' +
      'Tuto akci nelze vrátit zpět!'
    );
    if (!confirmed) return;

    setCleaning(true);
    setCleanMsg(null);
    setCleanOk(null);
    try {
      // 1) Vymažeme lokální data (vždy, i kdyby databáze selhala)
      const { clearLocalUserData } = await import('../lib/clearLocalData');
      const removedLocal = clearLocalUserData();

      // 2) Vyčistíme offline frontu
      try {
        const { clearQueue } = await import('../lib/offline');
        clearQueue();
      } catch {}

      // 3) Vymažeme data v databázi
      const { clearDatabaseData } = await import('../lib/clearLocalData');
      const result = await clearDatabaseData();

      const failedCount = result.failed.length;
      setCleanOk(failedCount === 0);
      setCleanMsg(
        failedCount === 0
          ? `✅ Všechna data byla úspěšně vymazána (${result.ok.length} tabulek + ${removedLocal.length} lokálních klíčů). Stránka se nyní znovu načte…`
          : `⚠️ Vymazáno ${result.ok.length} tabulek, ${failedCount} selhalo. Stránka se nyní znovu načte…`
      );
      setCleaning(false);

      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setCleanOk(false);
      setCleanMsg(`❌ Chyba při čištění: ${err instanceof Error ? err.message : 'neznámá chyba'}`);
      setCleaning(false);
    }
  }


  async function handleRefreshData() {

    setRefreshing(true);
    setRefreshMsg(null);
    setRefreshOk(null);
    try {
      // Vyčistíme všechny lokální cache a vynutíme nové načtení dat
      // 1. Vyčistíme localStorage cache klíče
      const cacheKeys = [
        'offline_queue', 'user_hidden_modules_', 'history_saved_filters',
        'density', 'theme', 'notification_settings',
      ];
      cacheKeys.forEach((k) => {
        // Smažeme jen specifické cache, ne vše
        if (k.endsWith('_')) {
          // Smažeme všechny klíče začínající na tento prefix
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(k)) {
              localStorage.removeItem(key);
            }
          }
        }
      });

      // 2. Vynutíme refresh service worker cache
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      }

      // 3. Vyčistíme offline frontu
      try {
        const { clearQueue } = await import('../lib/offline');
        clearQueue();
      } catch {}

      // 4. Dispatchneme událost pro refresh všech komponent
      window.dispatchEvent(new CustomEvent('pivovar:online-refetch'));

      // 5. Znovu načteme stránku pro kompletní refresh
      setRefreshOk(true);
      setRefreshMsg('✅ Data byla úspěšně obnovena! Stránka se nyní znovu načte…');
      setRefreshing(false);

      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      setRefreshOk(false);
      setRefreshMsg(`❌ Chyba při obnově: ${err instanceof Error ? err.message : 'neznámá chyba'}`);
      setRefreshing(false);
    }
  }

  return (
    <div className="card p-6 border-2 border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-white rounded-3xl shadow-md">
      <h2 className="font-display font-bold text-lg flex items-center gap-2">
        <RefreshCw size={20} className="text-amber-600" />
        <span>🔄 Verze & Synchronizace dat</span>
        <span className="ml-auto px-2.5 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-[10px] uppercase tracking-wider">
          ADMIN
        </span>
      </h2>
      <p className="text-sm text-neutral-600 mt-2">Přehled o aktuální verzi kódu a nástroj pro vynucené obnovení všech dat z databáze.</p>

      {/* Verze a datum */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-neutral-900 text-white border border-neutral-700 shadow-inner">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">Verze kódu</div>
          <div className="text-2xl font-display font-black mt-1">v{APP_VERSION}</div>
        </div>
        <div className="p-4 rounded-2xl bg-neutral-900 text-white border border-neutral-700 shadow-inner">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">Poslední změna kódu</div>
          <div className="text-lg font-display font-black mt-1">{APP_VERSION_DATE}</div>
        </div>
      </div>

      {/* Co je nového v této verzi */}
      {APP_CHANGELOG.length > 0 && (
        <div className="mt-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm">✨</span>
            <span className="text-xs font-black uppercase tracking-wider text-emerald-800">Co je nového ve verzi v{APP_VERSION}</span>
          </div>
          <ul className="space-y-1">
            {APP_CHANGELOG.map((line, i) => (
              <li key={i} className="text-xs font-medium text-emerald-900 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tlačítko pro refresh */}
      <div className="mt-5 p-4 rounded-2xl bg-amber-100/70 border border-amber-300 space-y-3">
        <div className="flex items-start gap-3">
          <CloudDownload size={20} className="text-amber-700 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-black text-amber-950">Vynutit obnovení všech dat ze serveru</div>
            <p className="text-xs text-amber-800 font-medium mt-0.5">
              Tato akce vymaže lokální cache, vyčistí offline frontu a znovu načte všechna data z databáze.
              Aplikace se poté automaticky restartuje.
            </p>
          </div>
        </div>

        <button
          onClick={handleRefreshData}
          disabled={refreshing}
          className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-neutral-950 font-black text-sm shadow-md transition flex items-center justify-center gap-2"
        >
          {refreshing ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Obnovuji data…</span>
            </>
          ) : (
            <>
              <CloudDownload size={18} />
              <span>📥 Stáhnout nejnovější data ze serveru</span>
            </>
          )}
        </button>

        {refreshMsg && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            refreshOk ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}>
            {refreshOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{refreshMsg}</span>
          </div>
        )}
      </div>

      {/* 🧹 VYČIŠTĚNÍ DAT */}
      <div className="mt-5 p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 space-y-3">
        <div className="flex items-start gap-3">
          <Eraser size={20} className="text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-black text-rose-900">🧹 Vyčistit všechna data (příprava na ostrý provoz)</div>
            <p className="text-xs text-rose-800 font-medium mt-0.5">
              Tato akce SMAŽE všechna uživatelská data z databáze i z prohlížeče
              (objednávky, stáčení, inventury, akce, kalendář, odběratele, ceník, audit, rezervace výčepů…).
              Referenční číselníky (piva, obaly, tanky) se resetují na výchozí stav.
              <span className="font-black"> Akci nelze vrátit zpět!</span>
            </p>
          </div>
        </div>

        <button
          onClick={handleClearData}
          disabled={cleaning}
          className="w-full py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2"
        >
          {cleaning ? (
            <>
              <RefreshCw size={18} className="animate-spin" />
              <span>Mažu data…</span>
            </>
          ) : (
            <>
              <Eraser size={18} />
              <span>🗑️ Vymazat všechna data</span>
            </>
          )}
        </button>

        {cleanMsg && (
          <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            cleanOk ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}>
            {cleanOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{cleanMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
}

