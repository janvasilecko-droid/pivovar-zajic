import { useEffect, useState } from 'react';
import { useAuth } from './lib/auth';
import AppSettingsScreen from './screens/AppSettingsScreen';

import Layout, { Page } from './components/Layout';
import AuthScreen from './screens/AuthScreen';
import Dashboard from './screens/Dashboard';
import Orders from './screens/Orders';
import Zavoz from './screens/Zavoz';
import Stock from './screens/Stock';
import { EntryModule } from './components/EntryModule';
import { BeersScreen, PackagesScreen, PlacesScreen, VehiclesScreen } from './screens/Catalogs';
import Users from './screens/Users';
import KeggingScreen from './screens/Kegging';
import AkceScreen from './screens/Akce';
import CalendarScreen from './screens/Calendar';
import Feedback from './screens/Feedback';
import Statistika from './screens/Statistika';
import PriceListScreen from './screens/PriceList';
import CellarScreen from './screens/Cellar';
import { SrotovaniScreen, ChecklistsScreen, ConcentrationScreen, VarniListyScreen } from './screens/BreweryScreens';
import InventoryScreen from './screens/InventoryScreen';
import KnihaJizdScreen from './screens/KnihaJizdScreen';
import SkloPromoScreen from './screens/SkloPromoScreen';
import VycepyScreen from './screens/VycepyScreen';
import ExkurzeScreen from './screens/ExkurzeScreen';
import RemindersScreen from './screens/RemindersScreen';
import { ReminderNotificationManager } from './components/ReminderNotificationManager';
import { MandatoryAnnouncementModal } from './components/MandatoryAnnouncementModal';
import { CriticalMaterialAlertModal } from './components/CriticalMaterialAlertModal';
import { exportBottlingToExcel, exportFasovaniToExcel, exportProdejnaToExcel, exportWriteoffsToExcel, exportInventoryToExcel } from './lib/excel';
import { Spinner } from './components/ui';

const DEFAULT_PAGE: Page = 'dashboard';

function readPageFromHistory(): Page {
  return (window.history.state && window.history.state.page) || DEFAULT_PAGE;
}

function wasOpenedViaShare(): boolean {
  return window.location.pathname === '/share';
}

import HaccpScreen from './screens/HaccpScreen';
import SanitationLogScreen from './screens/SanitationLogScreen';

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
      <ReminderNotificationManager />
      <MandatoryAnnouncementModal />
      <CriticalMaterialAlertModal />
      {page === 'dashboard' && <Dashboard setPage={setPage} />}
      {page === 'concentration' && <ConcentrationScreen />}
      {page === 'checklists' && <ChecklistsScreen />}
      {page === 'haccp' && <HaccpScreen initialSection={haccpSection} />}
      {page === 'sanitation_log' && <SanitationLogScreen setPage={setPage} />}
      {page === 'orders_entry' && <Orders mode="entry_only" setPage={setPage} autoOpenShareImport={autoOpenShareImport} onShareImportHandled={() => setAutoOpenShareImport(false)} />}
      {page === 'orders' && <Orders mode="overviews_only" setPage={setPage} autoOpenShareImport={autoOpenShareImport} onShareImportHandled={() => setAutoOpenShareImport(false)} />}

      {page === 'zavoz' && <Zavoz setPage={setPage} />}
      {page === 'kniha_jizd' && <KnihaJizdScreen setPage={setPage} />}
      {page === 'stock' && <Stock />}
      {page === 'bottling_entry' && <EntryModule table="bottling" mode="entry_only" title="Stáčení lahví" icon="🍾" packageKind="bottle" hasSourceVolume hasNote showOrderedWeek multiRow subtitle="Rychlý zápis — vyber pivo, obal a množství." exportFn={exportBottlingToExcel} setPage={setPage} />}
      {page === 'srotovani' && <SrotovaniScreen setPage={setPage} />}
      {page === 'bottling_overview' && <EntryModule table="bottling" mode="overviews_only" title="Stáčení lahví" icon="🍾" packageKind="bottle" hasSourceVolume hasNote showOrderedWeek multiRow subtitle="Přehledy stáčení lahví podle týdnů." exportFn={exportBottlingToExcel} setPage={setPage} />}
      {page === 'bottling' && <EntryModule table="bottling" mode="entry_only" title="Stáčení lahví" icon="🍾" packageKind="bottle" hasSourceVolume hasNote showOrderedWeek multiRow subtitle="Rychlý zápis — vyber pivo, obal a množství." exportFn={exportBottlingToExcel} setPage={setPage} />}

      {page === 'kegging_entry' && <KeggingScreen mode="entry_only" setPage={setPage} />}
      {page === 'kegging_overview' && <KeggingScreen mode="overviews_only" setPage={setPage} />}
      {page === 'kegging' && <KeggingScreen mode="entry_only" setPage={setPage} />}      {page === 'fasovani' && <EntryModule table="fasovani" title="Fasování" icon="📦" subtitle="Soukromé fasování piva — vyber pivo, obal a množství." exportFn={exportFasovaniToExcel} setPage={setPage} multiRow multiRowCount={5} />}
      {page === 'writeoffs' && <EntryModule table="writeoffs" title="Odpis" icon="📉" subtitle="Odpis piva — vyber pivo, obal a množství." exportFn={exportWriteoffsToExcel} setPage={setPage} multiRow multiRowCount={5} />}
      {page === 'prodejna' && <EntryModule table="fasovani_private" title="Prodejna" icon="🏪" subtitle="Fasování piva pro prodejnu — vyber pivo, obal a množství." exportFn={exportProdejnaToExcel} multiRow multiRowCount={20} setPage={setPage} />}
      {page === 'sklo_promo' && <SkloPromoScreen setPage={setPage} />}
      {page === 'vycepy' && <VycepyScreen />}
      {page === 'exkurze' && <ExkurzeScreen />}
      {page === 'reminders' && <RemindersScreen />}
      {page === 'akce' && <AkceScreen />}
      {page === 'inventory' && <InventoryScreen />}
      {page === 'calendar' && <CalendarScreen />}
      {page === 'feedback' && <Feedback />}
      {page === 'history' && <Statistika />}
      {page === 'pricelist' && <PriceListScreen />}
      {page === 'cellar' && <CellarScreen setPage={setPage} />}
      {page === 'places' && <PlacesScreen />}
      {page === 'beers' && <BeersScreen />}
      {page === 'packages' && <PackagesScreen />}
      {page === 'vehicles' && <VehiclesScreen />}
      {page === 'users' && <Users />}
      {page === 'app_settings' && <AppSettingsScreen />}
    </Layout>
  );
}
