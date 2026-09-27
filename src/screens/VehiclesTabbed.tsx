import { useState, useEffect } from 'react';
import { VehiclesScreen } from './Catalogs';
import KnihaJizdScreen from './KnihaJizdScreen';
import ZavozHistory from '../components/ZavozHistory';
import { Car, History, Navigation } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

type VehiclesTab = 'vehicles' | 'kniha_jizd' | 'historie_tras';

interface VehiclesTabbedProps {
  initialTab?: VehiclesTab;
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: VehiclesTab })[] = [
  { id: 'vehicles', label: 'Vozový park (Auta)', icon: Car, color: '#f5487f' },
  { id: 'kniha_jizd', label: 'Kniha jízd', icon: Navigation, color: '#4dabf7' },
  // Přesunuto ze Statistiky 24. 9. 2026 („vymaz ve statistice… historii
  // tras, presun do auta") — trasovky patří k vozovému parku.
  { id: 'historie_tras', label: 'Historie tras', icon: History, color: '#f59e0b' },
];

export default function VehiclesTabbed({ initialTab = 'vehicles', setPage }: VehiclesTabbedProps) {
  const [activeTab, setActiveTab] = useState<VehiclesTab>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: VehiclesTab) {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as VehiclesTab)} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'vehicles' && <VehiclesScreen />}
        {activeTab === 'kniha_jizd' && <KnihaJizdScreen setPage={setPage} />}
        {activeTab === 'historie_tras' && <ZavozHistory />}
      </div>
    </div>
  );
}
