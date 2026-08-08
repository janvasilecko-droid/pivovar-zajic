import { useState, useEffect } from 'react';
import AkceScreen from './Akce';
import ExkurzeScreen from './ExkurzeScreen';
import { Sparkles, Building } from 'lucide-react';

interface MarketingTabbedProps {
  initialTab?: 'akce' | 'exkurze';
}

export default function MarketingTabbed({ initialTab = 'akce' }: MarketingTabbedProps) {
  const [activeTab, setActiveTab] = useState<'akce' | 'exkurze'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('akce')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'akce'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Sparkles size={16} />
          <span>Akce</span>
        </button>

        <button
          onClick={() => setActiveTab('exkurze')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'exkurze'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Building size={16} />
          <span>Exkurze</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'akce' && <AkceScreen />}
        {activeTab === 'exkurze' && <ExkurzeScreen />}
      </div>
    </div>
  );
}
