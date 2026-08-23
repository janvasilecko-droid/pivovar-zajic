import { useState, useEffect } from 'react';
import Orders from './Orders';
import { ClipboardList, FileText, ChartBar } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

type TopTab = 'orders' | 'detail' | 'celkem';

interface OrdersTabbedProps {
  initialTab?: TopTab;
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  setPage?: (p: any, sec?: string) => void;
}

// Závoz a Výčepy jsou teď samostatné dlaždice/stránky (viz Layout.tsx
// EXTRA_NAV + App.tsx), ne záložky tady — dřív duplikovaly navigaci a na
// "mini" dlaždicích/úzké obrazovce byla lišta se 4 záložkami přeplácaná.
const TABS: (TabBarItem & { id: TopTab })[] = [
  { id: 'orders', label: 'Objednávky', icon: ClipboardList, color: '#38d9a9' },
  { id: 'detail', label: 'Přehled', icon: FileText, color: '#4dabf7' },
  { id: 'celkem', label: 'Celkem', icon: ChartBar, color: '#ffa94d' },
];

// Mapování interní záložky → Page (viz App.tsx).
const TAB_TO_PAGE: Record<TopTab, string> = {
  orders: 'orders',
  detail: 'orders_detail',
  celkem: 'orders_celkem',
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
      {/* Tab Navigation — pořadí: Objednávky, Přehled, Celkem */}
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as TopTab)} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        <Orders
          key={activeTab}
          mode="all"
          setPage={setPage}
          autoOpenShareImport={autoOpenShareImport}
          onShareImportHandled={onShareImportHandled}
          initialViewMode={activeTab === 'detail' ? 'detail' : activeTab === 'celkem' ? 'celkem' : 'summary'}
        />
      </div>
    </div>
  );
}
