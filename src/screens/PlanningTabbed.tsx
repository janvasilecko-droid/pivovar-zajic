import { useState, useEffect } from 'react';
import CalendarScreen from './Calendar';
import RemindersScreen from './RemindersScreen';
import Notes from './Notes';
import Feedback from './Feedback';
import { CalendarDays, Bell, StickyNote, MessageSquare } from 'lucide-react';

type PlanningTab = 'calendar' | 'reminders' | 'notes' | 'feedback';

interface PlanningTabbedProps {
  initialTab?: PlanningTab;
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}

export default function PlanningTabbed({ initialTab = 'calendar', setPage, pageSubTab }: PlanningTabbedProps) {
  const [activeTab, setActiveTab] = useState<PlanningTab>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Přepnutí záložky zapíšeme do historie stránek (setPage), ne jen do
  // lokálního stavu — jinak tlačítko Zpět z téhle obrazovky nevrátí
  // předchozí záložku, ale rovnou vyskočí do hlavního menu.
  function selectTab(tab: PlanningTab) {
    if (setPage) setPage(tab);
    else setActiveTab(tab);
  }

  return (
    <div className="space-y-6">
      {/* Tab Navigation — přilepená nahoře, ať jde přepínat záložku i uprostřed scrollování. */}
      <div className="sticky top-0 z-20 bg-neutral-100 pt-1 flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => selectTab('calendar')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'calendar'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <CalendarDays size={16} />
          <span>Kalendář</span>
        </button>

        <button
          onClick={() => selectTab('reminders')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'reminders'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <Bell size={16} />
          <span>Upozornění</span>
        </button>

        <button
          onClick={() => selectTab('notes')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'notes'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <StickyNote size={16} />
          <span>Poznámky</span>
        </button>

        <button
          onClick={() => selectTab('feedback')}
          className={`px-4 py-2.5 rounded-2xl font-black text-xs transition flex items-center gap-2 shrink-0 ${
            activeTab === 'feedback'
              ? 'bg-amber-500 text-neutral-950 shadow-md ring-2 ring-amber-300'
              : 'bg-white text-neutral-700 hover:bg-neutral-100 border border-neutral-200'
          }`}
        >
          <MessageSquare size={16} />
          <span>Feedback</span>
        </button>
      </div>

      {/* Screen Render */}
      <div className="transition-all duration-200">
        {activeTab === 'calendar' && <CalendarScreen />}
        {activeTab === 'reminders' && <RemindersScreen />}
        {activeTab === 'notes' && <Notes />}
        {activeTab === 'feedback' && <Feedback setPage={setPage} initialSubTab={pageSubTab} />}
      </div>
    </div>
  );
}
