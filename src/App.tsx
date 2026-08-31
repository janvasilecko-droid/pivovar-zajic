import { useEffect, useState, lazy, Suspense } from 'react';
import { Package as PackageIcon, TrendingDown } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from './lib/auth';
import { requestOpenHomeNotes } from './lib/homeNotes';
const AppSettingsScreen = lazy(() => import('./screens/AppSettingsScreen'));
const AppVersionsScreen = lazy(() => import('./screens/AppVersionsScreen'));

import Layout, { Page } from './components/Layout';
import AuthScreen from './screens/AuthScreen';
const Dashboard = lazy(() => import('./screens/Dashboard'));
import HomeScreen from './screens/HomeScreen';
const Orders = lazy(() => import('./screens/Orders'));
const Zavoz = lazy(() => import('./screens/Zavoz'));
const Stock = lazy(() => import('./screens/Stock'));
const BeersScreen = lazy(() => import('./screens/Catalogs').then((m) => ({ default: m.BeersScreen })));
const PackagesScreen = lazy(() => import('./screens/Catalogs').then((m) => ({ default: m.PackagesScreen })));
const PlacesScreen = lazy(() => import('./screens/Catalogs').then((m) => ({ default: m.PlacesScreen })));
const VehiclesScreen = lazy(() => import('./screens/Catalogs').then((m) => ({ default: m.VehiclesScreen })));
const Users = lazy(() => import('./screens/Users'));
const KeggingScreen = lazy(() => import('./screens/Kegging'));
const BottlingScreen = lazy(() => import('./screens/BottlingScreen'));
const ProdejnaScreen = lazy(() => import('./screens/ProdejnaScreen'));
const AkceScreen = lazy(() => import('./screens/Akce'));
const Statistika = lazy(() => import('./screens/Statistika'));
const ExportExcelScreen = lazy(() => import('./screens/ExportExcelScreen'));
const PriceListScreen = lazy(() => import('./screens/PriceList'));
const CellarScreen = lazy(() => import('./screens/Cellar'));
const SrotovaniScreen = lazy(() => import('./screens/BreweryScreens').then((m) => ({ default: m.SrotovaniScreen })));
const ChecklistsScreen = lazy(() => import('./screens/BreweryScreens').then((m) => ({ default: m.ChecklistsScreen })));
const ConcentrationScreen = lazy(() => import('./screens/BreweryScreens').then((m) => ({ default: m.ConcentrationScreen })));
const InventoryScreen = lazy(() => import('./screens/InventoryScreen'));
const KnihaJizdScreen = lazy(() => import('./screens/KnihaJizdScreen'));
const SkloPromoScreen = lazy(() => import('./screens/SkloPromoScreen'));
const VycepyScreen = lazy(() => import('./screens/VycepyScreen'));
const ExkurzeScreen = lazy(() => import('./screens/ExkurzeScreen'));
const VehiclesTabbed = lazy(() => import('./screens/VehiclesTabbed'));
const DepozitarTabbed = lazy(() => import('./screens/DepozitarTabbed'));
const SanitaceTabbed = lazy(() => import('./screens/SanitaceTabbed'));
const PlanningTabbed = lazy(() => import('./screens/PlanningTabbed'));
const MarketingTabbed = lazy(() => import('./screens/MarketingTabbed'));
const OrdersTabbed = lazy(() => import('./screens/OrdersTabbed'));
const TimersScreen = lazy(() => import('./screens/TimersScreen'));
import { KegTimerNotificationManager } from './components/KegTimerNotificationManager';
import { TimerDoneAlertModal } from './components/TimerDoneAlertModal';
import { ReminderNotificationManager } from './components/ReminderNotificationManager';
import { MandatoryAnnouncementModal } from './components/MandatoryAnnouncementModal';
import { CriticalMaterialAlertModal } from './components/CriticalMaterialAlertModal';
import { MonthlyCleanupWarning } from './components/MonthlyCleanupWarning';
import { SetPasswordModal } from './components/SetPasswordModal';
const BottlingTasksSettings = lazy(() => import('./components/BottlingTasksSettings').then((m) => ({ default: m.BottlingTasksSettings })));
import { Spinner } from './components/ui';
import { scheduleNightlyCheck } from './lib/zavozDeduction';

const DEFAULT_PAGE: Page = 'home';

function readPageFromHistory(): Page {
  return (window.history.state && window.history.state.page) || DEFAULT_PAGE;
}

// Vnitřní záložka uvnitř stránky (např. Kegging: Zápis/Přehled/Potřeba/Přefuk),
// pro obrazovky, které NEmají vlastní Page hodnotu pro každou záložku — jinak
// tlačítko Zpět z takové záložky přeskočí rovnou o celou stránku výš (viz
// setPage níže).
function readSubTabFromHistory(): string {
  return (window.history.state && window.history.state.subTab) || '';
}

function wasOpenedViaShare(): boolean {
  return window.location.pathname === '/share';
}

export default function App() {
  const { session, loading } = useAuth();
  const [page, setPageState] = useState<Page>(() => (wasOpenedViaShare() ? 'orders' : readPageFromHistory()));
  const [autoOpenShareImport, setAutoOpenShareImport] = useState(() => wasOpenedViaShare());
  const [haccpSection, setHaccpSection] = useState<string | undefined>();
  const [pageSubTab, setPageSubTabState] = useState<string>(() => (wasOpenedViaShare() ? '' : readSubTabFromHistory()));

  useEffect(() => {
    if (wasOpenedViaShare()) {
      window.history.replaceState({ page: 'orders' }, '', '/');
    }
  }, []);

  // Automatický odpočet závozu ze skladu (spuštěn po přihlášení, každý den v 01:00)
  useEffect(() => {
    if (!session) return;
    const cleanup = scheduleNightlyCheck();
    return cleanup;
  }, [session]);

  // subTab: vnitřní záložka v rámci stránky (viz readSubTabFromHistory výše).
  // Běžná navigace (klik na položku menu) subTab nezadává → vždy se vynuluje,
  // ať si nová stránka neponese cizí záložku z předchozí. Kliknutí na vnitřní
  // záložku volá setPage(stejná stránka, undefined, 'nazev-zalozky').
  function setPage(p: Page, targetSection?: string, subTab?: string) {
    // 'notes' bývalo dvoje — samostatná stránka (sdílená nástěnka bez
    // zaškrtávání) a dlaždice na Domů (se zaškrtáváním). Sjednoceno na jedno:
    // kdokoli zavolá setPage('notes') odkudkoli (vyhledávání, menu, záložky),
    // skončí na Domů s otevřeným oknem poznámek — viz lib/homeNotes.ts.
    if (p === 'notes') {
      requestOpenHomeNotes();
      p = 'home';
    }
    if (targetSection) {
      setHaccpSection(targetSection);
    }
    const nextSubTab = subTab ?? '';
    if (p === page && !targetSection && nextSubTab === pageSubTab) return;
    window.history.pushState({ page: p, targetSection, subTab: nextSubTab }, '', '');
    setPageState(p);
    setPageSubTabState(nextSubTab);
  }

  useEffect(() => {
    if (!window.history.state || !window.history.state.page) {
      window.history.replaceState({ page, subTab: pageSubTab }, '', '');
    }
    const onPopState = (e: PopStateEvent) => {
      const p: Page = (e.state && e.state.page) || DEFAULT_PAGE;
      if (e.state && e.state.targetSection) {
        setHaccpSection(e.state.targetSection);
      }
      setPageState(p);
      setPageSubTabState((e.state && e.state.subTab) || '');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hardwarové tlačítko Zpět na Androidu (bez tohoto Capacitor bez
  // registrovaného posluchače aplikaci rovnou ukončí — po opětovném otevření
  // se pak WebView natvrdo restartuje na DEFAULT_PAGE, což vypadá jako
  // "skok do menu" místo očekávaného kroku zpět). Místo ukončení jdeme
  // o krok zpět v historii stránek (stejná historie, kterou plní setPage);
  // teprve na výchozí stránce se aplikace jen minimalizuje.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      // I na výchozí stránce může být otevřený modal (viz Modal v ui.tsx,
      // který si pro sebe připojí vlastní krok do historie) — v tom případě
      // jde hardwarové tlačítko Zpět taky o krok zpět (zavře modal), ne
      // rovnou minimalizovat appku.
      if (page !== DEFAULT_PAGE || (window.history.state && window.history.state.modalOpen)) {
        window.history.back();
      } else {
        CapacitorApp.minimizeApp();
      }
    });
    return () => { listenerPromise.then((l) => l.remove()); };
  }, [page]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-primary-50">
        <Spinner />
      </div>
    );
  }
  if (!session) return <AuthScreen />;

  return (
    <Layout page={page} setPage={setPage}>
      <SetPasswordModal />
      <ReminderNotificationManager />
      <KegTimerNotificationManager />
      <TimerDoneAlertModal />
      <MandatoryAnnouncementModal />
      <CriticalMaterialAlertModal />
      <MonthlyCleanupWarning
        onOpenMonthlyChecklist={() => setPage('bottling')}
        onOpenKegMonthlyChecklist={() => setPage('kegging')}
      />
      {/* Obrazovky se stahuji az pri prvnim otevreni (React.lazy). Drive se
          vsech ~40 nacetlo najednou pri startu — 2,9 MB, i kdyz uzivatel
          otevrel jen Domu. Fallback je stejny spinner jako jinde v appce. */}
      <Suspense fallback={<Spinner />}>
      {page === 'home' && <HomeScreen setPage={setPage} />}
      {(page === 'dashboard' || page === 'sklo_promo') && (
        <Dashboard setPage={setPage} initialTab={page === 'sklo_promo' ? 'sklo_promo' : 'sklad'} />
      )}
      {page === 'concentration' && <ConcentrationScreen setPage={setPage} initialSubTab={pageSubTab} />}
      {(page === 'checklists' || page === 'haccp' || page === 'sanitation_log' || page === 'sanitace' || page === 'sanitace_lahve' || page === 'sanitace_kegy' || page === 'sanitace_vycepy') && (
        <SanitaceTabbed
          initialTab={
            page === 'haccp' ? 'haccp'
            : page === 'checklists' ? 'checklists'
            : page === 'sanitace_lahve' ? 'lahve'
            : page === 'sanitace_kegy' ? 'kegy'
            : page === 'sanitace_vycepy' ? 'vycepy'
            : 'sanitation_log'
          }
          initialSection={haccpSection}
          setPage={setPage}
          pageSubTab={pageSubTab}
        />
      )}
      {(page === 'orders' || page === 'orders_entry' || page === 'orders_detail' || page === 'orders_celkem') && (
        <OrdersTabbed
          initialTab={page === 'orders_detail' ? 'detail' : page === 'orders_celkem' ? 'celkem' : 'orders'}
          autoOpenShareImport={autoOpenShareImport}
          onShareImportHandled={() => setAutoOpenShareImport(false)}
          setPage={setPage}
        />
      )}

      {/* Výčepy a Závoz jsou teď samostatné dlaždice/stránky (viz Layout.tsx
          EXTRA_NAV), ne vnitřní záložky Objednávek — čistá obrazovka bez
          záložkové lišty Objednávek nahoře. 'orders_zavoz' je starší Page
          název téhož cíle (kvůli už umístěným dlaždicím), vede na stejnou
          obrazovku jako 'zavoz'. */}
      {page === 'vycepy' && <VycepyScreen />}
      {(page === 'zavoz' || page === 'orders_zavoz') && <Zavoz setPage={setPage} />}
      {page === 'stock' && <Stock />}
      {page === 'bottling' && <BottlingScreen mode="all" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'bottling_entry' && <BottlingScreen mode="entry_only" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'bottling_overview' && <BottlingScreen mode="overviews_only" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'srotovani' && <SrotovaniScreen setPage={setPage} />}

      {page === 'kegging' && <KeggingScreen mode="all" setPage={setPage} initialSubTab={pageSubTab} />}
      {/* Fasování, Odpis a Prodejna jsou tentýž formulář, liší se jen tabulkou,
          do které zapisuje. Schválně se vykresluje z JEDNOHO místa: kdyby to
          byly tři samostatné větve, React by při přepnutí druhu komponentu
          odmountoval a rozepsané řádky by se ztratily. Takhle zůstanou —
          když někdo zjistí, že to měl být odpis, přepne a uloží. */}
      {(page === 'fasovani' || page === 'writeoffs' || page === 'prodejna') && (
        <ProdejnaScreen
          setPage={setPage}
          {...(page === 'fasovani'
            ? { table: 'fasovani', title: 'Fasování', Ikona: PackageIcon, showVycep: true }
            : page === 'writeoffs'
            ? { table: 'writeoffs', title: 'Odpis', Ikona: TrendingDown }
            : {})}
        />
      )}
      {(page === 'akce' || page === 'exkurze' || page === 'marketing') && (
        <MarketingTabbed
          initialTab={
            page === 'exkurze' ? 'exkurze' : 'akce'
          }
          setPage={setPage}
        />
      )}
      {page === 'inventory' && <InventoryScreen setPage={setPage} initialSubTab={pageSubTab} />}
      {(page === 'calendar' || page === 'feedback' || page === 'planning' || page === 'reminders' || page === 'notes') && (
        <PlanningTabbed
          initialTab={page === 'reminders' ? 'reminders' : page === 'feedback' ? 'feedback' : page === 'notes' ? 'notes' : 'calendar'}
          setPage={setPage}
          pageSubTab={pageSubTab}
        />
      )}
      {page === 'history' && <Statistika setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'export_excel' && <ExportExcelScreen />}
      {(page === 'pricelist' || page === 'places' || page === 'beers' || page === 'packages' || page === 'depozitar') && (
        <DepozitarTabbed
          initialTab={
            page === 'beers' ? 'beers' : page === 'packages' ? 'packages' : page === 'pricelist' ? 'pricelist' : 'places'
          }
          setPage={setPage}
        />
      )}
      {page === 'bottling_needs' && <BottlingTasksSettings />}
      {page === 'cellar' && <CellarScreen setPage={setPage} initialSubTab={pageSubTab} />}
      {(page === 'vehicles' || page === 'kniha_jizd') && (
        <VehiclesTabbed
          initialTab={page === 'kniha_jizd' ? 'kniha_jizd' : 'vehicles'}
          setPage={setPage}
        />
      )}
      {page === 'users' && <Users setPage={setPage} initialSubTab={pageSubTab} />}
      {(page === 'stopwatch' || page === 'timer' || page === 'keg_timer') && (
        <TimersScreen
          initialTab={page === 'timer' ? 'timer' : page === 'keg_timer' ? 'keg' : 'stopwatch'}
          setPage={setPage}
        />
      )}
      {page === 'app_settings' && <AppSettingsScreen />}
      {page === 'app_versions' && <AppVersionsScreen />}
      </Suspense>
    </Layout>
  );
}
