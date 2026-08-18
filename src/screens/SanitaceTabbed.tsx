import { useState, useEffect } from 'react';
import SanitationLogScreen from './SanitationLogScreen';
import HaccpScreen from './HaccpScreen';
import { ChecklistsScreen } from './BreweryScreens';
import BottleSanitationDiary from '../components/BottleSanitationDiary';
import KegSanitationDiary from '../components/KegSanitationDiary';
import TapSanitationDiary from '../components/TapSanitationDiary';
import { FlaskConical, Shield, CheckSquare, Wine, Cylinder, SlidersHorizontal } from 'lucide-react';

type SanitaceTab = 'tanks' | 'lahve' | 'kegy' | 'vycepy' | 'haccp' | 'checklists';

interface SanitaceTabbedProps {
  initialTab?: 'sanitation_log' | 'haccp' | 'checklists' | 'tanks' | 'lahve' | 'kegy' | 'vycepy';
  initialSection?: string;
  setPage?: (p: any, sec?: string) => void;
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

export default function SanitaceTabbed({ initialTab = 'sanitation_log', initialSection, setPage }: SanitaceTabbedProps) {
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
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('tanks')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'tanks'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <FlaskConical size={16} />
          <span>Deník tanků & zařízení</span>
        </button>

        <button
          onClick={() => selectTab('lahve')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'lahve'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Wine size={16} />
          <span>Deník lahví (stáčení)</span>
        </button>

        <button
          onClick={() => selectTab('kegy')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'kegy'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Cylinder size={16} />
          <span>Deník KEGů (stáčení)</span>
        </button>

        <button
          onClick={() => selectTab('vycepy')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'vycepy'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <SlidersHorizontal size={16} />
          <span>Deník výčepů</span>
        </button>

        <button
          onClick={() => selectTab('haccp')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'haccp'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Shield size={16} />
          <span>Sanitační postupy & Řád</span>
        </button>

        <button
          onClick={() => selectTab('checklists')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'checklists'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <CheckSquare size={16} />
          <span>Check-listy & Návody</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'tanks' && <SanitationLogScreen setPage={setPage} />}
        {activeTab === 'lahve' && <BottleSanitationDiary />}
        {activeTab === 'kegy' && <KegSanitationDiary />}
        {activeTab === 'vycepy' && <TapSanitationDiary />}
        {activeTab === 'haccp' && <HaccpScreen initialSection={initialSection} />}
        {activeTab === 'checklists' && <ChecklistsScreen />}
      </div>
    </div>
  );
}
