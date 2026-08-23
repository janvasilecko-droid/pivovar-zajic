import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAuth } from './lib/auth';
import AppSettingsScreen from './screens/AppSettingsScreen';
import AppVersionsScreen from './screens/AppVersionsScreen';

import Layout, { Page } from './components/Layout';
import AuthScreen from './screens/AuthScreen';
import Dashboard from './screens/Dashboard';
import HomeScreen from './screens/HomeScreen';
import Orders from './screens/Orders';
import Zavoz from './screens/Zavoz';
import Stock from './screens/Stock';
import { BeersScreen, PackagesScreen, PlacesScreen, VehiclesScreen } from './screens/Catalogs';
import Users from './screens/Users';
import KeggingScreen from './screens/Kegging';
import BottlingScreen from './screens/BottlingScreen';
import ProdejnaScreen from './screens/ProdejnaScreen';
import AkceScreen from './screens/Akce';
import Statistika from './screens/Statistika';
import PriceListScreen from './screens/PriceList';
import CellarScreen from './screens/Cellar';
import { SrotovaniScreen, ChecklistsScreen, ConcentrationScreen } from './screens/BreweryScreens';
import InventoryScreen from './screens/InventoryScreen';
import KnihaJizdScreen from './screens/KnihaJizdScreen';
import SkloPromoScreen from './screens/SkloPromoScreen';
import VycepyScreen from './screens/VycepyScreen';
import ExkurzeScreen from './screens/ExkurzeScreen';
import { ReminderNotificationManager } from './components/ReminderNotificationManager';
import { MandatoryAnnouncementModal } from './components/MandatoryAnnouncementModal';
import { CriticalMaterialAlertModal } from './components/CriticalMaterialAlertModal';
import { MonthlyCleanupWarning } from './components/MonthlyCleanupWarning';
import { SetPasswordModal } from './components/SetPasswordModal';
import { BottlingTasksSettings } from './components/BottlingTasksSettings';
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

import HaccpScreen from './screens/HaccpScreen';
import SanitationLogScreen from './screens/SanitationLogScreen';
import VehiclesTabbed from './screens/VehiclesTabbed';
import DepozitarTabbed from './screens/DepozitarTabbed';
import SanitaceTabbed from './screens/SanitaceTabbed';
import PlanningTabbed from './screens/PlanningTabbed';
import MarketingTabbed from './screens/MarketingTabbed';
import OrdersTabbed from './screens/OrdersTabbed';
import TimersScreen from './screens/TimersScreen';
import { KegTimerNotificationManager } from './components/KegTimerNotificationManager';

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
      <MandatoryAnnouncementModal />
      <CriticalMaterialAlertModal />
      <MonthlyCleanupWarning
        onOpenMonthlyChecklist={() => setPage('bottling')}
        onOpenKegMonthlyChecklist={() => setPage('kegging')}
      />
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
      {(page === 'orders' || page === 'orders_entry' || page === 'orders_detail' || page === 'orders_zavoz' || page === 'vycepy') && (
        <OrdersTabbed
          initialTab={page === 'vycepy' ? 'vycepy' : page === 'orders_detail' ? 'detail' : page === 'orders_zavoz' ? 'zavoz' : 'orders'}
          autoOpenShareImport={autoOpenShareImport}
          onShareImportHandled={() => setAutoOpenShareImport(false)}
          setPage={setPage}
        />
      )}

      {page === 'zavoz' && <Zavoz setPage={setPage} />}
      {page === 'stock' && <Stock />}
      {page === 'bottling' && <BottlingScreen mode="all" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'bottling_entry' && <BottlingScreen mode="entry_only" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'bottling_overview' && <BottlingScreen mode="overviews_only" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'srotovani' && <SrotovaniScreen setPage={setPage} />}

      {page === 'kegging' && <KeggingScreen mode="all" setPage={setPage} initialSubTab={pageSubTab} />}
      {page === 'fasovani' && <ProdejnaScreen setPage={setPage} table="fasovani" title="Fasování personál" icon="📦" showVycep />}
      {page === 'writeoffs' && (
        <ProdejnaScreen setPage={setPage} table="writeoffs" title="Odpis" icon="📉" />
      )}
      {page === 'prodejna' && <ProdejnaScreen setPage={setPage} />}
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
    </Layout>
  );
}
