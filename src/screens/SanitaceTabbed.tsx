import { useState, useEffect } from 'react';
import SanitationLogScreen from './SanitationLogScreen';
import HaccpScreen from './HaccpScreen';
import { ChecklistsScreen } from './BreweryScreens';
import { FlaskConical, Shield, CheckSquare } from 'lucide-react';

interface SanitaceTabbedProps {
  initialTab?: 'sanitation_log' | 'haccp' | 'checklists';
  initialSection?: string;
  setPage?: (p: any, sec?: string) => void;
}

export default function SanitaceTabbed({ initialTab = 'sanitation_log', initialSection, setPage }: SanitaceTabbedProps) {
  const [activeTab, setActiveTab] = useState<'sanitation_log' | 'haccp' | 'checklists'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('sanitation_log')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'sanitation_log'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <FlaskConical size={16} />
          <span>Sanitační deník</span>
        </button>

        <button
          onClick={() => setActiveTab('haccp')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'haccp'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Shield size={16} />
          <span>Sanitační postupy & Řád</span>
        </button>

        <button
          onClick={() => setActiveTab('checklists')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'checklists'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <CheckSquare size={16} />
          <span>Check-listy & Návody</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'sanitation_log' && <SanitationLogScreen setPage={setPage} />}
        {activeTab === 'haccp' && <HaccpScreen initialSection={initialSection} />}
        {activeTab === 'checklists' && <ChecklistsScreen />}
      </div>
    </div>
  );
}
