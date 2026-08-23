import { useState, useEffect } from 'react';
import { PlacesScreen, BeersScreen, PackagesScreen } from './Catalogs';
import PriceListScreen from './PriceList';
import { Building, Beer, Boxes, Tag } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

type DepozitarTab = 'places' | 'beers' | 'packages' | 'pricelist';

interface DepozitarTabbedProps {
  initialTab?: DepozitarTab;
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: DepozitarTab })[] = [
  { id: 'places', label: 'Odběratelé', icon: Building, color: '#2f9e64' },
  { id: 'beers', label: 'Piva', icon: Beer, color: '#ffa94d' },
  { id: 'packages', label: 'Obaly (Lahve, Podtácky…)', icon: Boxes, color: '#0ca5b0' },
  { id: 'pricelist', label: 'Ceník', icon: Tag, color: '#38d9a9' },
];

export default function DepozitarTabbed({ initialTab = 'places', setPage }: DepozitarTabbedProps) {
  const [activeTab, setActiveTab] = useState<DepozitarTab>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: DepozitarTab) {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as DepozitarTab)} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'places' && <PlacesScreen />}
        {activeTab === 'beers' && <BeersScreen />}
        {activeTab === 'packages' && <PackagesScreen />}
        {activeTab === 'pricelist' && <PriceListScreen />}
      </div>
    </div>
  );
}
