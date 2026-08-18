import { useState, useEffect } from 'react';
import Orders from './Orders';
import VycepyScreen from './VycepyScreen';
import { ClipboardList, FileText, Truck, Flame } from 'lucide-react';

type TopTab = 'orders' | 'detail' | 'zavoz' | 'vycepy';

interface OrdersTabbedProps {
  initialTab?: TopTab;
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  setPage?: (p: any, sec?: string) => void;
}

const TABS: { id: TopTab; label: string; icon: typeof ClipboardList }[] = [
  { id: 'orders', label: 'Objednávky', icon: ClipboardList },
  { id: 'detail', label: 'Přehled', icon: FileText },
  { id: 'zavoz', label: 'Závoz', icon: Truck },
  { id: 'vycepy', label: 'Výčepy (Zápůjčky)', icon: Flame },
];

// Mapování interní záložky → Page (viz App.tsx). 'zavoz' Page název je už
// obsazený samostatnou obrazovkou Zavoz.tsx, proto tahle záložka má vlastní
// 'orders_zavoz' název.
const TAB_TO_PAGE: Record<TopTab, string> = {
  orders: 'orders',
  detail: 'orders_detail',
  zavoz: 'orders_zavoz',
  vycepy: 'vycepy',
};

export default function OrdersTabbed({
  initialTab = 'orders',
  autoOpenShareImport,
  onShareImportHandled,
  setPage,
}: OrdersTabbedProps) {
  const [activeTab, setActiveTab] = useState<TopTab>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: TopTab) {
    if (setPage) setPage(TAB_TO_PAGE[tab]);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation — pořadí: Objednávky, Přehled, Závoz, Výčepy (Zápůjčky) */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
                activeTab === tab.id
                  ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
                  : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
              }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'vycepy' ? (
          <VycepyScreen />
        ) : (
          <Orders
            key={activeTab}
            mode="all"
            setPage={setPage}
            autoOpenShareImport={autoOpenShareImport}
            onShareImportHandled={onShareImportHandled}
            initialViewMode={activeTab === 'detail' ? 'detail' : activeTab === 'zavoz' ? 'zavoz' : 'summary'}
          />
        )}
      </div>
    </div>
  );
}
