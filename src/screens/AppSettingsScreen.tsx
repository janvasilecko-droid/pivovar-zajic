import { useState, useEffect, type FormEvent } from 'react';
import { Download, Eye, Palette, Smartphone, Sun, Moon, Monitor, Bell, BellOff, Volume2, VolumeX, MessageSquare, Timer, RefreshCw, CloudDownload, CheckCircle2, AlertCircle, Plus, Trash2, Eraser, Lock, Users, Vibrate } from 'lucide-react';

import { DENSITY_OPTIONS, DensityMode, getDensity, setDensity } from '../lib/density';
import { haptikaZapnuta, nastavHaptiku, zavibruj } from '../lib/haptika';
import { MenuCustomizeModal } from '../components/MenuCustomizeModal';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { NAV, NavItem } from '../components/Layout';
import { canUserView, getUserPermissions, PAGE_TO_MODULE, ModuleKey } from '../lib/permissions';
import { Theme, getTheme, setTheme } from '../lib/theme';
import { getNotificationPermission, requestNotificationPermission, getNotificationSettings, saveNotificationSettings, NotificationSettings } from '../lib/notifications';
import { APP_VERSION, APP_VERSION_DATE, APP_CHANGELOG } from '../lib/version';
import { forceRefresh } from '../lib/versionCheck';
import { isAdminEmail } from '../lib/config';
import { fetchWhatsAppSenders, addWhatsAppSender, removeWhatsAppSender, type WhatsAppSender } from '../lib/whatsappApi';
import { oznam } from '../lib/toast';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function AppSettingsScreen() {
  const { profile, user, reloadProfile } = useAuth();
  const [density, setDensityState] = useState<DensityMode>(getDensity());
  const [haptika, setHaptika] = useState(haptikaZapnuta());
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [notifPermission, setNotifPermission] = useState(getNotificationPermission());
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [showMenuCustomize, setShowMenuCustomize] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<string[]>(() => {
    try {
      const key = `user_hidden_modules_${user?.id || 'guest'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // WhatsApp — povolení odesílatelé (whitelist)
  const [whatsappSenders, setWhatsappSenders] = useState<WhatsAppSender[]>([]);
  const [newSenderName, setNewSenderName] = useState('');
  const [newSenderNumber, setNewSenderNumber] = useState('');
  const [senderMsg, setSenderMsg] = useState<string | null>(null);
  const [senderErr, setSenderErr] = useState<string | null>(null);

  // Změna hesla
  const [newPassword, setNewPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<string | null>(null);
  const [passwordErr, setPasswordErr] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Změna jména (zobrazované jméno pro zápisy, např. fašování)
  const [newName, setNewName] = useState(profile?.display_name ?? '');
  const [nameMsg, setNameMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);

  async function handleChangeName(e: FormEvent) {
    e.preventDefault();
    const value = newName.trim();
    if (!value) {
      setNameErr('Zadejte své jméno.');
      setNameMsg(null);
      return;
    }
    if (!user) return;
    setNameErr(null);
    setNameMsg(null);
    setNameBusy(true);
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: value })
      .eq('id', user.id);
    setNameBusy(false);
    if (error) {
      setNameErr(error.message);
      setNameMsg(null);
    } else {
      setNameMsg('Jméno bylo úspěšně změněno!');
      await reloadProfile();
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordErr('Heslo musí mít alespoň 6 znaků.');
      setPasswordMsg(null);
      return;
    }
    setPasswordErr(null);
    setPasswordBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordBusy(false);
    if (error) {
      setPasswordErr(error.message);
      setPasswordMsg(null);
    } else {
      setPasswordMsg('Vaše heslo bylo úspěšně změněno!');
      setPasswordErr(null);
      setNewPassword('');
    }
  }

  useEffect(() => {
    fetchWhatsAppSenders().then(setWhatsappSenders).catch(() => {});
  }, []);

  async function handleAddSender() {
    try {
      await addWhatsAppSender(newSenderName, newSenderNumber);
      setNewSenderName('');
      setNewSenderNumber('');
      setSenderErr(null);
      setSenderMsg('Odesílatel byl přidán.');
      setWhatsappSenders(await fetchWhatsAppSenders());
    } catch (e) {
      setSenderMsg(null);
      setSenderErr(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRemoveSender(id: string) {
    try {
      await removeWhatsAppSender(id);
      setSenderMsg(null);
      setSenderErr(null);
      setWhatsappSenders(await fetchWhatsAppSenders());
    } catch (e) {
      setSenderErr(e instanceof Error ? e.message : String(e));
    }
  }

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
      oznam('Upozornění jsou povolena. Pro jejich zakázání je nutné to udělat v nastavení prohlížeče.');
      return;
    }
    await requestNotificationPermission();
    setNotifPermission(getNotificationPermission());
  }

  // Mapa obrazovka -> modul je sdilena v lib/permissions.ts (drive byla
  // zkopirovana na tri mistech a kopie se rozesly).

  const userPerms = getUserPermissions(user?.id ?? '', (profile as any)?.permissions);
  const isAdmin = profile?.role === 'admin' || isAdminEmail(user?.email);

  const permittedNav = NAV.filter((n) => {
    if (n.id === 'users') return isAdmin;
    if (n.id === 'bottling_needs') return isAdmin;
    const modKey = PAGE_TO_MODULE[n.id];
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

      <div className="bg-neutral-900 text-white p-5 sm:p-6 rounded border border-amber-500/30 shadow-xl">
        <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-white flex items-center gap-2">
          <span>⚙️ Aplikace & Nastavení</span>
        </h1>
        <p className="text-xs text-neutral-400 font-medium mt-1">Přizpůsobte si vzhled, chování a upozornění aplikace.</p>
      </div>

      {/* Návod k použití */}
      <div className="card p-6 border-2 border-amber-400/60 bg-gradient-to-br from-amber-50/50 to-white rounded shadow-sm">
        <div className="flex items-center justify-between cursor-pointer" onClick={() => setShowGuide(!showGuide)}>
          <h2 className="font-display font-black text-lg text-amber-950 flex items-center gap-2">
            <span>📖</span> Návod k použití & Přehled funkcí
          </h2>
          <button className="text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded transition">
            {showGuide ? 'Skrýt návod ▲' : 'Zobrazit návod ▼'}
          </button>
        </div>

        {showGuide && (
          <div className="mt-5 space-y-6 text-sm text-neutral-700 leading-relaxed border-t border-amber-200 pt-5">
            <div>
              <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
                <span>🏭</span> Výroba
              </h3>
              <ul className="list-disc list-inside space-y-1.5 pl-2">
                <li><strong>KEG:</strong> Zápis stočených sudů. Stabilní řazení podle data stáčení a času vytvoření.</li>
                <li><strong>Lahve (Stáčení):</strong> Zápis stočených lahví, bilance zásob piva a přehled <em>Potřeby stočit</em> (sklad vs. objednávky). Obsahuje také záložku <strong>Sklo, Etikety, Podtácky</strong> pro správu obalového materiálu.</li>
                <li><strong>Objednávky:</strong> Evidence objednávek s možností nahrávání hlasem, kopírování textu z WhatsApp či importu z Excelu. Nyní obsahuje záložku <strong>Výčepy (Zápůjčky)</strong> pro zapůjčenou techniku.</li>
                <li><strong>Fasování, Prodejna, Odpis:</strong> Záznamy prodejů na prodejně, fasování piva pro akce a zápisy poškozeného či prošlého piva k odpisu.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
                <span>🍺</span> Pivovar
              </h3>
              <ul className="list-disc list-inside space-y-1.5 pl-2">
                <li><strong>Sklad:</strong> Rychlý přehled aktuálních disponibilních zásob sudů, lahví a reklamních předmětů.</li>
                <li><strong>Sklep:</strong> Evidence ležáckých tanků, průběhu kvašení, vaření piva a kompletní varné listy.</li>
                <li><strong>Inventura:</strong> Měsíční uzávěrka skladu. Na začátku měsíce je prázdná, zadává se na konci měsíce. Tlačítkem <em>Schválit & převést</em> se stavy uzamknou a přenesou do počátečního stavu dalšího měsíce.</li>
                <li><strong>Sanitace:</strong> Sjednocené místo pro čistotu pivovaru. Obsahuje <em>Sanitační deník</em> pro zápis čištění, <em>Sanitační postupy & Řád</em> (HACCP) a <em>Check-listy & Návody</em> k obsluze strojů.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
                <span>⚙️</span> Nástroje
              </h3>
              <ul className="list-disc list-inside space-y-1.5 pl-2">
                <li><strong>Kalkulačky:</strong> Rychlé výpočty koncentrací, alkoholu, ředění mladiny a obsahu cukru.</li>
                <li><strong>Plánování:</strong> Sjednocený plánovací panel zobrazující na jedné obrazovce interaktivní <strong>Kalendář</strong>, <strong>Úkoly/Upomínky</strong> a <strong>Poznámkový blok</strong>.</li>
              </ul>
            </div>

            <div>
              <h3 className="font-display font-extrabold text-neutral-900 flex items-center gap-1.5 text-sm uppercase tracking-wider mb-2">
                <span>🗂️</span> Číselníky (Depozitář)
              </h3>
              <ul className="list-disc list-inside space-y-1.5 pl-2">
                <li><strong>Depozitář:</strong> Správa <em>Odběratelů</em>, <em>Piv</em>, <em>Obalů</em> a hlavního <em>Ceníku</em> na jednom místě pod záložkami.</li>
                <li><strong>Auta:</strong> Vozový park s platnostmi STK a dálničních známek, sloučený s přehlednou <strong>Knihou jízd</strong>.</li>
              </ul>
            </div>

            <div className="bg-amber-100/50 p-3.5 rounded border border-amber-200 text-xs text-amber-900 font-bold">
              💡 Tento návod budeme průběžně doplňovat a aktualizovat s každou novou funkcí, kterou do aplikace Zajíc přidáme.
            </div>
          </div>
        )}
      </div>

      {/* Instalace */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Smartphone size={20} /> Instalace aplikace</h2>
        {isStandalone ? (
          <p className="text-sm text-emerald-700 font-bold mt-2">Aplikace je již nainstalována na vašem zařízení.</p>
        ) : installPrompt ? (
          <>
            <p className="text-sm text-neutral-600 mt-2">Nainstalujte si aplikaci na plochu pro rychlejší přístup a offline funkčnost.</p>
            <button onClick={handleInstall} className="btn-primary !rounded mt-3 text-sm font-black flex items-center gap-2"><Download size={16} /> Nainstalovat aplikaci</button>
          </>
        ) : (
          <p className="text-sm text-neutral-600 mt-2">Váš prohlížeč nepodporuje přímou instalaci, nebo již byla nabídnuta. Můžete ji přidat na plochu ručně přes menu prohlížeče.</p>
        )}
      </div>

      {/* Menu */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Eye size={20} /> Přizpůsobení menu</h2>
        <p className="text-sm text-neutral-600 mt-2">Vyberte si, které položky chcete vidět v hlavním menu pro rychlejší navigaci.</p>
        <button onClick={() => setShowMenuCustomize(true)} className="btn-ghost !rounded mt-3 text-sm font-black">Upravit viditelnost menu</button>
      </div>

      {/* Hustota / Velikost */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Palette size={20} /> Hustota zobrazení</h2>
        <p className="text-sm text-neutral-600 mt-2">Zvolte velikost prvků a písma. XS = nejhustší, XL = největší.</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {DENSITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setDensity(opt.value); setDensityState(opt.value); }}
              className={`flex flex-col items-center px-4 py-2.5 rounded border-2 font-black text-sm transition-all min-w-[56px] ${
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

      {/* Odezva do prstu */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Vibrate size={20} /> Odezva při dotyku</h2>
        <p className="text-sm text-neutral-600 mt-2">
          Krátké zavibrování při odškrtnutí položky nebo zápisu. Na telefonu se
          díky tomu nemusí kontrolovat očima, jestli klepnutí prošlo.
        </p>
        <button
          onClick={() => { const n = !haptika; nastavHaptiku(n); setHaptika(n); if (n) zavibruj('hotovo'); }}
          className={`w-full text-left p-4 rounded-xl border-2 font-bold flex items-center gap-3 transition mt-4 min-h-[56px] ${
            haptika ? 'bg-emerald-50 border-emerald-300 text-emerald-900' : 'bg-neutral-50 border-neutral-200 text-neutral-600'
          }`}
        >
          <Vibrate size={20} />
          <span className="flex-1">{haptika ? 'Zapnuto' : 'Vypnuto'}</span>
          <span className={`w-12 h-7 rounded-full transition relative ${haptika ? 'bg-emerald-500' : 'bg-neutral-300'}`}>
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${haptika ? 'left-6' : 'left-1'}`} />
          </span>
        </button>
      </div>

      {/* Upozornění */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Bell size={20} /> Upozornění (notifikace)</h2>
        <p className="text-sm text-neutral-600 mt-2">Nastavte si chování upozornění na nové objednávky.</p>

        <div className="mt-5 space-y-4">
          {/* Povolení systémových notifikací */}
          <button
            onClick={handleToggleNotifications}
            className={`w-full text-left p-4 rounded border-2 font-bold flex items-center gap-3 transition ${
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
          <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
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
          <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
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
          <div className="p-4 rounded bg-neutral-50 border border-neutral-200 space-y-1">
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
          <div className="p-4 rounded bg-neutral-50 border border-neutral-200">
            <div className="flex items-center gap-2 mb-2">
              <Timer size={16} className="text-neutral-600" />
              <span className="text-sm font-black text-neutral-800">Automaticky skrýt banner po:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {([5, 10, 30, 60, 0] as const).map(secs => (
                <button
                  key={secs}
                  onClick={() => handleNotifSettingsChange({ autoHideSeconds: secs })}
                  className={`px-3 py-1.5 rounded border-2 font-bold text-sm transition-all ${
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
      {/* WhatsApp — povolení odesílatelé */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><MessageSquare size={20} /> WhatsApp — povolení odesílatelé</h2>
        <p className="text-sm text-neutral-600 mt-2">
          Zprávy se načítají automaticky jen od povolených kontaktů.
          {whatsappSenders.length === 0
            ? ' Seznam je prázdný — načítají se zprávy od VŠECH odesílatelů.'
            : ' Zprávy od ostatních zůstanou v seznamu pro ruční zpracování.'}
        </p>

        <div className="mt-4 space-y-2">
          {whatsappSenders.map((s) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded bg-neutral-50 border border-neutral-200">
              <div>
                <div className="text-sm font-black text-neutral-800">{s.sender_name}</div>
                {s.sender_number && <div className="text-xs text-neutral-500">{s.sender_number}</div>}
              </div>
              <button
                onClick={() => handleRemoveSender(s.id)}
                className="p-2 rounded hover:bg-rose-100 text-rose-500 hover:text-rose-700 transition"
                title="Odebrat odesílatele"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {whatsappSenders.length === 0 && (
            <div className="text-sm text-neutral-400 py-2 italic">Zatím žádný povolený odesílatel.</div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input
            type="text"
            value={newSenderName}
            onChange={(e) => setNewSenderName(e.target.value)}
            placeholder="Jméno kontaktu (např. Hospoda U Zajíce)"
            className="input flex-1"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSender(); } }}
          />
          <input
            type="text"
            value={newSenderNumber}
            onChange={(e) => setNewSenderNumber(e.target.value)}
            placeholder="Telefon (volitelné)"
            className="input w-full sm:w-44"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSender(); } }}
          />
          <button
            onClick={handleAddSender}
            className="btn-primary !rounded text-sm font-black flex items-center justify-center gap-1.5 shrink-0"
          >
            <Plus size={16} /> Přidat
          </button>
        </div>

        {senderErr && <div className="mt-2 p-2 rounded bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">{senderErr}</div>}
        {senderMsg && <div className="mt-2 p-2 rounded bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">{senderMsg}</div>}
      </div>

      {/* 👤 Změna jména */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Users size={20} /> Změna jména</h2>
        <p className="text-sm text-neutral-600 mt-2">Jméno se používá pro zápisy (např. fašování, stáčení, sanitace). Změní se i v menu u vašeho profilu.</p>
        <form onSubmit={handleChangeName} className="mt-4 space-y-3">
          <div>
            <label className="label">Vaše jméno</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Jak se máte zobrazovat v zápisech"
              className="input w-full"
            />
          </div>
          {nameMsg && <div className="p-3 bg-emerald-100 text-emerald-900 font-bold text-xs rounded">{nameMsg}</div>}
          {nameErr && <div className="p-3 bg-rose-100 text-rose-900 font-bold text-xs rounded">{nameErr}</div>}
          <button
            type="submit"
            disabled={nameBusy}
            className="btn-primary !rounded text-sm font-black flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            {nameBusy ? 'Ukládám…' : '✅ Uložit jméno'}
          </button>
        </form>
      </div>

      {/* 🔒 Změna hesla */}
      <div className="card p-6">
        <h2 className="font-display font-bold text-lg flex items-center gap-2"><Lock size={20} /> Změna hesla</h2>
        <p className="text-sm text-neutral-600 mt-2">Zadejte nové heslo pro přihlášení do aplikace (min. 6 znaků).</p>
        <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
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
          {passwordMsg && <div className="p-3 bg-emerald-100 text-emerald-900 font-bold text-xs rounded">{passwordMsg}</div>}
          {passwordErr && <div className="p-3 bg-rose-100 text-rose-900 font-bold text-xs rounded">{passwordErr}</div>}
          <button
            type="submit"
            disabled={passwordBusy}
            className="btn-primary !rounded text-sm font-black flex items-center justify-center gap-1.5 w-full sm:w-auto"
          >
            {passwordBusy ? 'Ukládám…' : '✅ Uložit nové heslo'}
          </button>
        </form>
      </div>

      {isAdmin && (
        <>
          <AdminVersionSyncSection />
        </>
      )}
    </div>
  );
}


/** Text, který musí uživatel zadat pro potvrzení vyčištění všech dat. */
const CLEAN_CONFIRM_TEXT = 'SMAZAT';

function AdminVersionSyncSection() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [refreshOk, setRefreshOk] = useState<boolean | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);
  const [cleanOk, setCleanOk] = useState<boolean | null>(null);
  const [confirmingClean, setConfirmingClean] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function handleClearData() {
    // Pojistka: destruktivní akce se spustí jen při přesné shodě textu.
    if (confirmText !== CLEAN_CONFIRM_TEXT) return;

    setConfirmingClean(false);
    setConfirmText('');
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
    <div className="card p-6 border-2 border-amber-400/60 bg-gradient-to-br from-amber-50/80 to-white rounded shadow-md">
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
        <div className="p-4 rounded bg-neutral-900 text-white border border-neutral-700 shadow-inner">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">Verze kódu</div>
          <div className="text-2xl font-display font-black mt-1">v{APP_VERSION}</div>
        </div>
        <div className="p-4 rounded bg-neutral-900 text-white border border-neutral-700 shadow-inner">
          <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">Poslední změna kódu</div>
          <div className="text-lg font-display font-black mt-1">{APP_VERSION_DATE}</div>
        </div>
      </div>

      <div className="mt-3">
        <button
          onClick={forceRefresh}
          className="w-full py-3 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 hover:text-amber-800 font-black text-xs border border-amber-300 transition flex items-center justify-center gap-1.5"
        >
          🔄 Vynutit stažení nejnovější verze aplikace (vyčistit cache)
        </button>
      </div>

      {/* Co je nového v této verzi */}
      {APP_CHANGELOG.length > 0 && (
        <div className="mt-5 p-4 rounded bg-emerald-50 border border-emerald-200 space-y-2">
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
      <div className="mt-5 p-4 rounded bg-amber-100/70 border border-amber-300 space-y-3">
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
          className="w-full py-3 rounded bg-amber-500 hover:bg-amber-400 disabled:opacity-60 disabled:cursor-not-allowed text-neutral-950 font-black text-sm shadow-md transition flex items-center justify-center gap-2"
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
          <div className={`p-3 rounded text-xs font-bold flex items-center gap-2 ${
            refreshOk ? 'bg-emerald-100 text-emerald-900 border border-emerald-300' : 'bg-rose-100 text-rose-900 border border-rose-300'
          }`}>
            {refreshOk ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{refreshMsg}</span>
          </div>
        )}
      </div>

      {/* 🧹 VYČIŠTĚNÍ DAT */}
      <div className="mt-5 p-4 rounded bg-rose-50 border-2 border-rose-300 space-y-3">
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
          onClick={() => setConfirmingClean(true)}
          disabled={cleaning || confirmingClean}
          className="w-full py-3 rounded bg-rose-600 hover:bg-rose-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-black text-sm shadow-md transition flex items-center justify-center gap-2"
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

        {confirmingClean && (
          <div className="p-3 rounded bg-rose-100 border-2 border-rose-400 space-y-3">
            <div className="text-xs font-black text-rose-900">
              ⚠️ Tuto akci nelze vrátit zpět!
            </div>
            <p className="text-xs font-medium text-rose-900 leading-relaxed">
              Vyčištění SMAŽE VŠECHNA uživatelská data z databáze i z prohlížeče:
              objednávky, stáčení, inventury, odpisy, fasování, akce, kalendář, připomínky,
              sanitace, vozidla, odběratele, ceník, audit, feedback a rezervace výčepů.
              Referenční číselníky (piva, obaly, tanky) se resetují na výchozí stav.
            </p>
            <p className="text-xs font-bold text-rose-900">
              Pro potvrzení napiš do pole přesně text <span className="font-black underline">{CLEAN_CONFIRM_TEXT}</span>:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CLEAN_CONFIRM_TEXT}
              autoFocus
              className="w-full px-3 py-2 rounded bg-white border-2 border-rose-400 focus:border-rose-600 focus:outline-none text-sm font-mono font-bold text-rose-900 placeholder:text-rose-300"
            />
            <div className="flex gap-2">
              <button
                onClick={handleClearData}
                disabled={confirmText !== CLEAN_CONFIRM_TEXT || cleaning}
                className="flex-1 py-2.5 rounded bg-rose-700 hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-sm shadow transition flex items-center justify-center gap-2"
              >
                {cleaning ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Mažu data…</span>
                  </>
                ) : (
                  <>
                    <Eraser size={16} />
                    <span>Trvale smazat všechna data</span>
                  </>
                )}
              </button>
              <button
                onClick={() => { setConfirmingClean(false); setConfirmText(''); }}
                disabled={cleaning}
                className="px-4 py-2.5 rounded bg-neutral-200 hover:bg-neutral-300 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-800 font-bold text-sm transition"
              >
                Zrušit
              </button>
            </div>
          </div>
        )}

        {cleanMsg && (
          <div className={`p-3 rounded text-xs font-bold flex items-center gap-2 ${
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

