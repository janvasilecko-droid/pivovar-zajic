import { useState, useEffect } from 'react';
import CalendarScreen from './Calendar';
import RemindersScreen from './RemindersScreen';
import Notes from './Notes';
import Feedback from './Feedback';
import { CalendarDays, Bell, StickyNote, MessageSquare } from 'lucide-react';

interface PlanningTabbedProps {
  initialTab?: 'calendar' | 'reminders' | 'notes' | 'feedback';
}

export default function PlanningTabbed({ initialTab = 'calendar' }: PlanningTabbedProps) {
  const [activeTab, setActiveTab] = useState<'calendar' | 'reminders' | 'notes' | 'feedback'>(initialTab);

  // Sync state if initialTab changes from parent
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 overflow-x-auto scrollbar-thin">
        <button
          onClick={() => setActiveTab('calendar')}
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
          onClick={() => setActiveTab('reminders')}
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
          onClick={() => setActiveTab('notes')}
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
          onClick={() => setActiveTab('feedback')}
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
        {activeTab === 'feedback' && <Feedback />}
      </div>
    </div>
  );
}
