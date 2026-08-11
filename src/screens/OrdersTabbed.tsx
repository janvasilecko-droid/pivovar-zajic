import { useState, useEffect } from 'react';
import Orders from './Orders';
import VycepyScreen from './VycepyScreen';
import { ClipboardList, Flame } from 'lucide-react';

interface OrdersTabbedProps {
  initialTab?: 'orders' | 'vycepy';
  autoOpenShareImport?: boolean;
  onShareImportHandled?: () => void;
  setPage?: (p: any, sec?: string) => void;
}

export default function OrdersTabbed({
  initialTab = 'orders',
  autoOpenShareImport,
  onShareImportHandled,
  setPage,
}: OrdersTabbedProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'vycepy'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'orders'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <ClipboardList size={16} />
          <span>Objednávky</span>
        </button>

        <button
          onClick={() => setActiveTab('vycepy')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'vycepy'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Flame size={16} />
          <span>Výčepy (Zápůjčky)</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'orders' ? (
          <Orders
            mode="all"
            setPage={setPage}
            autoOpenShareImport={autoOpenShareImport}
            onShareImportHandled={onShareImportHandled}
          />
        ) : (
          <VycepyScreen />
        )}
      </div>
    </div>
  );
}
