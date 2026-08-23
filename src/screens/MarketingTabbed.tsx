import { useState, useEffect } from 'react';
import AkceScreen from './Akce';
import ExkurzeScreen from './ExkurzeScreen';
import { Sparkles, Building } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

interface MarketingTabbedProps {
  initialTab?: 'akce' | 'exkurze';
  setPage?: (p: any, sec?: string) => void;
}

const TABS: (TabBarItem & { id: 'akce' | 'exkurze' })[] = [
  { id: 'akce', label: 'Akce', icon: Sparkles, color: '#ffd43b' },
  { id: 'exkurze', label: 'Exkurze', icon: Building, color: '#7c5cff' },
];

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
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as 'akce' | 'exkurze')} />

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'akce' && <AkceScreen />}
        {activeTab === 'exkurze' && <ExkurzeScreen />}
      </div>
    </div>
  );
}
