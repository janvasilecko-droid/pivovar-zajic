import { useState, useEffect } from 'react';
import AkceScreen from './Akce';
import ExkurzeScreen from './ExkurzeScreen';
import { Sparkles, Building } from 'lucide-react';

interface MarketingTabbedProps {
  initialTab?: 'akce' | 'exkurze';
  setPage?: (p: any, sec?: string) => void;
}

export default function MarketingTabbed({ initialTab = 'akce', setPage }: MarketingTabbedProps) {
  const [activeTab, setActiveTab] = useState<'akce' | 'exkurze'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: 'akce' | 'exkurze') {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation — přilepená nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('akce')}
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
          onClick={() => selectTab('exkurze')}
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
