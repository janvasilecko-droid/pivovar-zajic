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

export default function App() {
  const { session, loading } = useAuth();
  const [page, setPageState] = useState<Page>(() => (wasOpenedViaShare() ? 'orders' : readPageFromHistory()));
  const [autoOpenShareImport, setAutoOpenShareImport] = useState(() => wasOpenedViaShare());
  const [haccpSection, setHaccpSection] = useState<string | undefined>();

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

  function setPage(p: Page, targetSection?: string) {
    if (targetSection) {
      setHaccpSection(targetSection);
    }
    if (p === page && !targetSection) return;
    window.history.pushState({ page: p, targetSection }, '', '');
    setPageState(p);
  }

  useEffect(() => {
    if (!window.history.state || !window.history.state.page) {
      window.history.replaceState({ page }, '', '');
    }
    const onPopState = (e: PopStateEvent) => {
      const p: Page = (e.state && e.state.page) || DEFAULT_PAGE;
      if (e.state && e.state.targetSection) {
        setHaccpSection(e.state.targetSection);
      }
      setPageState(p);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
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
      if (page !== DEFAULT_PAGE) {
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
      {page === 'concentration' && <ConcentrationScreen />}
      {(page === 'checklists' || page === 'haccp' || page === 'sanitation_log' || page === 'sanitace') && (
        <SanitaceTabbed
          initialTab={
            page === 'haccp' ? 'haccp' : page === 'checklists' ? 'checklists' : 'sanitation_log'
          }
          initialSection={haccpSection}
          setPage={setPage}
        />
      )}
      {(page === 'orders' || page === 'orders_entry' || page === 'vycepy') && (
        <OrdersTabbed
          initialTab={page === 'vycepy' ? 'vycepy' : 'orders'}
          autoOpenShareImport={autoOpenShareImport}
          onShareImportHandled={() => setAutoOpenShareImport(false)}
          setPage={setPage}
        />
      )}

      {page === 'zavoz' && <Zavoz setPage={setPage} />}
      {page === 'stock' && <Stock />}
      {page === 'bottling' && <BottlingScreen mode="all" setPage={setPage} />}
      {page === 'bottling_entry' && <BottlingScreen mode="entry_only" setPage={setPage} />}
      {page === 'bottling_overview' && <BottlingScreen mode="overviews_only" setPage={setPage} />}
      {page === 'srotovani' && <SrotovaniScreen setPage={setPage} />}

      {page === 'kegging' && <KeggingScreen mode="all" setPage={setPage} />}
      {page === 'fasovani' && <ProdejnaScreen setPage={setPage} table="fasovani" title="Personál" icon="📦" showVycep />}
      {page === 'writeoffs' && (
        <ProdejnaScreen setPage={setPage} table="writeoffs" title="Odpis" icon="📉" />
      )}
      {page === 'prodejna' && <ProdejnaScreen setPage={setPage} />}
      {(page === 'akce' || page === 'exkurze' || page === 'marketing') && (
        <MarketingTabbed
          initialTab={
            page === 'exkurze' ? 'exkurze' : 'akce'
          }
        />
      )}
      {page === 'inventory' && <InventoryScreen />}
      {(page === 'calendar' || page === 'feedback' || page === 'planning' || page === 'reminders') && (
        <PlanningTabbed
          initialTab={page === 'reminders' ? 'reminders' : page === 'feedback' ? 'feedback' : 'calendar'}
        />
      )}
      {page === 'history' && <Statistika />}
      {(page === 'pricelist' || page === 'places' || page === 'beers' || page === 'packages' || page === 'depozitar') && (
        <DepozitarTabbed
          initialTab={
            page === 'beers' ? 'beers' : page === 'packages' ? 'packages' : page === 'pricelist' ? 'pricelist' : 'places'
          }
        />
      )}
      {page === 'bottling_needs' && <BottlingTasksSettings />}
      {page === 'cellar' && <CellarScreen setPage={setPage} />}
      {(page === 'vehicles' || page === 'kniha_jizd') && (
        <VehiclesTabbed
          initialTab={page === 'kniha_jizd' ? 'kniha_jizd' : 'vehicles'}
          setPage={setPage}
        />
      )}
      {page === 'users' && <Users />}
      {page === 'app_settings' && <AppSettingsScreen />}
      {page === 'app_versions' && <AppVersionsScreen />}
    </Layout>
  );
}
