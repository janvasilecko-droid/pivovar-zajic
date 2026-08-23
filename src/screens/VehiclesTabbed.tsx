import { useState, useEffect } from 'react';
import { VehiclesScreen } from './Catalogs';
import KnihaJizdScreen from './KnihaJizdScreen';
import { Car, Navigation } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

interface VehiclesTabbedProps {
  initialTab?: 'vehicles' | 'kniha_jizd';
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: 'vehicles' | 'kniha_jizd' })[] = [
  { id: 'vehicles', label: 'Vozový park (Auta)', icon: Car, color: '#f5487f' },
  { id: 'kniha_jizd', label: 'Kniha jízd', icon: Navigation, color: '#4dabf7' },
];

export default function VehiclesTabbed({ initialTab = 'vehicles', setPage }: VehiclesTabbedProps) {
  const [activeTab, setActiveTab] = useState<'vehicles' | 'kniha_jizd'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: 'vehicles' | 'kniha_jizd') {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as 'vehicles' | 'kniha_jizd')} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'vehicles' ? (
          <VehiclesScreen />
        ) : (
          <KnihaJizdScreen setPage={setPage} />
        )}
      </div>
    </div>
  );
}
