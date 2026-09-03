import { useState, useEffect } from 'react';
import SanitationLogScreen from './SanitationLogScreen';
import HaccpScreen from './HaccpScreen';
import { ChecklistsScreen } from './BreweryScreens';
import BottleSanitationDiary from '../components/BottleSanitationDiary';
import KegSanitationDiary from '../components/KegSanitationDiary';
import TapSanitationDiary from '../components/TapSanitationDiary';
import { FlaskConical, Shield, CheckSquare, Wine, SlidersHorizontal } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';
import { IkonaSud, IkonaLahev } from '../components/ikony';

type SanitaceTab = 'tanks' | 'lahve' | 'kegy' | 'vycepy' | 'haccp' | 'checklists';

const TABS: (TabBarItem & { id: SanitaceTab })[] = [
  { id: 'tanks', label: 'Deník tanků & zařízení', icon: FlaskConical, color: '#4dabf7' },
  { id: 'lahve', label: 'Deník lahví (stáčení)', icon: IkonaLahev, color: '#f5487f' },
  { id: 'kegy', label: 'Deník KEGů (stáčení)', icon: IkonaSud, color: '#ffa94d' },
  { id: 'vycepy', label: 'Deník výčepů', icon: SlidersHorizontal, color: '#7c5cff' },
  { id: 'haccp', label: 'Sanitační postupy & Řád', icon: Shield, color: '#2f9e64' },
  { id: 'checklists', label: 'Check-listy & Návody', icon: CheckSquare, color: '#d4a017' },
];

interface SanitaceTabbedProps {
  initialTab?: 'sanitation_log' | 'haccp' | 'checklists' | 'tanks' | 'lahve' | 'kegy' | 'vycepy';
  initialSection?: string;
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}

// Mapování interní záložky → Page (viz App.tsx) — jen ty, co mají vlastní
// routovanou stránku (tanks/haccp/checklists mají historicky jiný Page
// název: 'sanitation_log', ostatní shodné s názvem záložky s prefixem).
const TAB_TO_PAGE: Record<SanitaceTab, string> = {
  tanks: 'sanitation_log',
  haccp: 'haccp',
  checklists: 'checklists',
  lahve: 'sanitace_lahve',
  kegy: 'sanitace_kegy',
  vycepy: 'sanitace_vycepy',
};

export default function SanitaceTabbed({ initialTab = 'sanitation_log', initialSection, setPage, pageSubTab }: SanitaceTabbedProps) {
  const [activeTab, setActiveTab] = useState<SanitaceTab>(
    initialTab === 'sanitation_log' ? 'tanks' : initialTab as any
  );

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab === 'sanitation_log' ? 'tanks' : initialTab as any);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: SanitaceTab) {
    if (setPage) setPage(TAB_TO_PAGE[tab]);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as SanitaceTab)} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'tanks' && <SanitationLogScreen setPage={setPage} />}
        {activeTab === 'lahve' && <BottleSanitationDiary />}
        {activeTab === 'kegy' && <KegSanitationDiary />}
        {activeTab === 'vycepy' && <TapSanitationDiary />}
        {activeTab === 'haccp' && <HaccpScreen initialSection={initialSection} setPage={setPage} initialSubTab={pageSubTab} />}
        {activeTab === 'checklists' && <ChecklistsScreen />}
      </div>
    </div>
  );
}
