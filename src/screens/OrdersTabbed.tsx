import { useState, useEffect } from 'react';
import Orders from './Orders';
import VycepyScreen from './VycepyScreen';
import { ClipboardList, FileText, Truck, Flame } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

type TopTab = 'orders' | 'detail' | 'zavoz' | 'vycepy';

interface OrdersTabbedProps {
  initialTab?: TopTab;
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: TopTab })[] = [
  { id: 'orders', label: 'Objednávky', icon: ClipboardList, color: '#38d9a9' },
  { id: 'detail', label: 'Přehled', icon: FileText, color: '#4dabf7' },
  { id: 'zavoz', label: 'Závoz', icon: Truck, color: '#ffa94d' },
  { id: 'vycepy', label: 'Výčepy (Zápůjčky)', icon: Flame, color: '#f5487f' },
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
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as TopTab)} />

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
