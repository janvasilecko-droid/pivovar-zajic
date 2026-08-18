import { useState, useEffect } from 'react';
import { PlacesScreen, BeersScreen, PackagesScreen } from './Catalogs';
import PriceListScreen from './PriceList';
import { Building, Beer, Boxes, Tag } from 'lucide-react';

type DepozitarTab = 'places' | 'beers' | 'packages' | 'pricelist';

interface DepozitarTabbedProps {
  initialTab?: DepozitarTab;
  setPage?: (p: any, sec?: string) => void;
}

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
      {/* Tab Navigation */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('places')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'places'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Building size={16} />
          <span>Odběratelé</span>
        </button>

        <button
          onClick={() => selectTab('beers')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'beers'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Beer size={16} />
          <span>Piva</span>
        </button>

        <button
          onClick={() => selectTab('packages')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'packages'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Boxes size={16} />
          <span>Obaly (Lahve, Podtácky…)</span>
        </button>

        <button
          onClick={() => selectTab('pricelist')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'pricelist'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Tag size={16} />
          <span>Ceník</span>
        </button>
      </div>

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
