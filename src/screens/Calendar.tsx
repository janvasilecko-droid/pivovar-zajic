import { Bell, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase, CalendarEvent, useRealtime } from '../lib/supabase';
import { Spinner, Modal } from '../components/ui';
import { potvrd } from '../lib/toast';

const COLORS: Record<string, string> = {
  primary: 'bg-primary-500',
  accent: 'bg-accent-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

function monthName(m: number): string {
  return ['Leden','Únor','Březen','Duben','Květen','Červen','Červenec','Srpen','Září','Říjen','Listopad','Prosinec'][m];
}

export default function CalendarScreen() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [form, setForm] = useState({ title: '', description: '', reminder: false, reminder_time: '09:00', color: 'primary' });

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('calendar_events').select('*').order('event_date');
    setEvents((data as CalendarEvent[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  useRealtime(['calendar_events'], load);

  async function add() {
    if (!selectedDate || !form.title.trim()) return;
    const { data } = await supabase.from('calendar_events').insert({
      event_date: selectedDate,
      title: form.title.trim(),
      description: form.description || null,
      reminder: form.reminder,
      reminder_time: form.reminder ? form.reminder_time : null,
      color: form.color,
    }).select().single();
    if (data) setEvents((e) => [...e, data as CalendarEvent].sort((a, b) => a.event_date.localeCompare(b.event_date)));
    setForm({ title: '', description: '', reminder: false, reminder_time: '09:00', color: 'primary' });
  }

  async function del(id: string) {
    if (!(await potvrd('Opravdu smazat tuto událost?'))) return;
    await supabase.from('calendar_events').delete().eq('id', id);
    setEvents((e) => e.filter((x) => x.id !== id));
  }

  const firstDay = new Date(cursor.y, cursor.m, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const dateStr = (d: number) => `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const eventsFor = (d: number) => events.filter((e) => e.event_date === dateStr(d));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const upcomingReminders = events
    .filter((e) => e.reminder && e.event_date >= todayStr)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))
    .slice(0, 5);

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-display font-bold text-primary-900"><Calendar className="ikona-text" /> Kalendář</h1>
        <p className="text-sm text-primary-500 mt-1">Poznámky a upomínky — klikni na den pro přidání události.</p>
      </div>

      {upcomingReminders.length > 0 && (
        <div className="card p-4 mb-5">
          <h3 className="font-display font-bold text-primary-900 mb-2"><Bell className="ikona-text" /> Nadcházející upomínky</h3>
          <div className="space-y-1.5">
            {upcomingReminders.map((e) => (
              <div key={e.id} className="flex items-center gap-3 text-sm">
                <span className={`w-3 h-3 rounded-full ${COLORS[e.color] ?? COLORS.primary}`} />
                <span className="font-medium text-primary-700">{new Date(e.event_date).toLocaleDateString('cs-CZ')}</span>
                {e.reminder_time && <span className="text-xs text-primary-400">{e.reminder_time.slice(0, 5)}</span>}
                <span className="text-primary-900">{e.title}</span>
                {e.description && <span className="text-xs text-primary-400 truncate">— {e.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <button className="btn-ghost !rounded !py-2 !px-3" onClick={() => setCursor((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: (c.m + 11) % 12 }))}>‹</button>
          <div className="font-display font-bold text-lg text-primary-900">{monthName(cursor.m)} {cursor.y}</div>
          <button className="btn-ghost !rounded !py-2 !px-3" onClick={() => setCursor((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: (c.m + 1) % 12 }))}>›</button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Po','Út','St','Ct','Pá','So','Ne'].map((d) => <div key={d} className="text-center text-xs font-bold text-primary-400 py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const ds = dateStr(d);
            const evs = eventsFor(d);
            const isToday = ds === todayStr;
            return (
              <button key={i} onClick={() => setSelectedDate(ds)}
                className={`min-h-[60px] sm:min-h-[80px] p-1.5 rounded border text-left transition-colors ${
                  isToday ? 'border-primary-500 bg-primary-50' : 'border-primary-100 hover:bg-primary-50/50'
                }`}>
                <div className={`text-xs font-bold ${isToday ? 'text-primary-700' : 'text-primary-500'}`}>{d}</div>
                <div className="space-y-0.5 mt-1">
                  {evs.slice(0, 3).map((e) => (
                    <div key={e.id} className="flex items-center gap-1 text-[10px] text-primary-700 truncate">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${COLORS[e.color] ?? COLORS.primary}`} />
                      {e.reminder && <span><Bell className="ikona-text" /></span>}
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                  {evs.length > 3 && <div className="text-[10px] text-primary-400">+{evs.length - 3} další</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Modal open={!!selectedDate} onClose={() => setSelectedDate(null)} title={selectedDate ? `Události — ${new Date(selectedDate).toLocaleDateString('cs-CZ')}` : ''}>
        <div className="space-y-4">
          {events.filter((e) => e.event_date === selectedDate).map((e) => (
            <div key={e.id} className="flex items-start gap-3 p-3 rounded bg-primary-50">
              <span className={`w-3 h-3 rounded-full mt-1 shrink-0 ${COLORS[e.color] ?? COLORS.primary}`} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-primary-900">{e.title} {e.reminder && <span className="text-xs"><Bell className="ikona-text" /> {e.reminder_time?.slice(0, 5)}</span>}</div>
                {e.description && <div className="text-sm text-primary-600 mt-0.5">{e.description}</div>}
              </div>
              <button className="text-danger-600 hover:text-danger-700 text-xs font-semibold" onClick={() => del(e.id)}>Smazat</button>
            </div>
          ))}

          <div className="border-t border-primary-100 pt-4">
            <h4 className="font-semibold text-primary-700 mb-2">Nová událost</h4>
            <div className="space-y-3">
              <input className="input" placeholder="Název" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              <textarea className="input" placeholder="Popis / poznámka" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.reminder} onChange={(e) => setForm({ ...form, reminder: e.target.checked })} />
                  Upomínka
                </label>
                {form.reminder && <input type="time" className="input !w-auto" value={form.reminder_time} onChange={(e) => setForm({ ...form, reminder_time: e.target.value })} />}
                <select className="input !w-auto" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}>
                  <option value="primary">Modrá</option>
                  <option value="accent">Tyrkysová</option>
                  <option value="success">Zelená</option>
                  <option value="warning">Oranžová</option>
                  <option value="danger">Červená</option>
                </select>
              </div>
              <button className="btn-primary !rounded w-full" onClick={add}>Přidat událost</button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
