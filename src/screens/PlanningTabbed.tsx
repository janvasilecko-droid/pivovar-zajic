import CalendarScreen from './Calendar';
import RemindersScreen from './RemindersScreen';
import Feedback from './Feedback';

export default function PlanningTabbed() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-12 items-start">
      {/* Hlavní kalendář na levé straně (2 sloupce na velkých displejích) */}
      <div className="lg:col-span-2">
        <CalendarScreen />
      </div>

      {/* Upomínky a Poznámky sloučené na pravé straně (1 sloupec na velkých displejích) */}
      <div className="lg:col-span-1 space-y-6">
        <RemindersScreen />
        <Feedback />
      </div>
    </div>
  );
}
