import { useState, useEffect } from 'react';
import { VehiclesScreen } from './Catalogs';
import KnihaJizdScreen from './KnihaJizdScreen';
import { Car, Navigation } from 'lucide-react';

interface VehiclesTabbedProps {
  initialTab?: 'vehicles' | 'kniha_jizd';
  setPage?: (p: any, sec?: string) => void;
}

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
      {/* Tab Navigation — přilepená nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('vehicles')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'vehicles'
              ? 'bg-white text-amber-900 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Car size={16} />
          <span>Vozový park (Auta)</span>
        </button>

        <button
          onClick={() => selectTab('kniha_jizd')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'kniha_jizd'
              ? 'bg-white text-amber-900 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Navigation size={16} />
          <span>Kniha jízd</span>
        </button>
      </div>

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
