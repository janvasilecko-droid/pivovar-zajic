import { useState, useEffect } from 'react';
import CalendarScreen from './Calendar';
import RemindersScreen from './RemindersScreen';
import Notes from './Notes';
import Feedback from './Feedback';
import { CalendarDays, Bell, StickyNote, MessageSquare } from 'lucide-react';
import { TabBar, type TabBarItem } from '../components/TabBar';

type PlanningTab = 'calendar' | 'reminders' | 'notes' | 'feedback';

interface PlanningTabbedProps {
  initialTab?: PlanningTab;
  setPage?: (p: any, sec?: string, sub?: string) => void;
  pageSubTab?: string;
}

const TABS: (TabBarItem & { id: PlanningTab })[] = [
  { id: 'calendar', label: 'Kalendář', icon: CalendarDays, color: '#d4a017' },
  { id: 'reminders', label: 'Upozornění', icon: Bell, color: '#ff6b6b' },
  { id: 'notes', label: 'Poznámky', icon: StickyNote, color: '#4dabf7' },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare, color: '#e066b0' },
];

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
      <TabBar items={TABS} activeId={activeTab} onSelect={(id) => selectTab(id as PlanningTab)} />

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
