import { useState } from 'react';
import { Announcement } from './MandatoryAnnouncementModal';
import { AlertTriangle, Save, Trash2, CheckCircle2 } from 'lucide-react';
import { isNotificationSupported, playOrderChime } from '../lib/notifications';

export function AnnouncementManagerModal({ onClose }: { onClose: () => void }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>(() => {
    try {
      const saved = localStorage.getItem('pivovar_active_announcement');
      return saved ? [JSON.parse(saved)] : [];
    } catch { return []; }
  });

  const [title, setTitle] = useState('⚠️ Technické upozornění: Odstávka a sanitace varny');
  const [body, setBody] = useState('V úterý od 8:00 do 12:00 proběhne plánovaná údržba. V této době nestáčet!');
  const [type, setType] = useState<'technical' | 'important' | 'info'>('technical');
  const [author, setAuthor] = useState('Ing. Petr Bednář (Sládek)');
  const [msg, setMsg] = useState<string | null>(null);

  function handlePublish(e: React.FormEvent) {
    e.preventDefault();
    const newAnn: Announcement = {
      id: `announcement_${Date.now()}`,
      title,
      body,
      type,
      author,
      date: new Date().toLocaleString('cs-CZ'),
      active: true,
    };

    localStorage.setItem('pivovar_active_announcement', JSON.stringify(newAnn));
    // Reset confirmation status to force all users to re-confirm
    localStorage.removeItem(`acknowledged_announcement_${newAnn.id}`);

    // Trigger test chime & browser push notification
    playOrderChime();
    if (isNotificationSupported() && Notification.permission === 'granted') {
      try {
        new Notification(newAnn.title, {
          body: newAnn.body,
          icon: '/favicon.ico',
          tag: newAnn.id,
        });
      } catch (err) { console.warn(err); }
    }

    setMsg('Hlášení bylo úspěšně publikováno! Zobrazí se všem uživatelům po přihlášení.');
    setTimeout(() => {
      setMsg(null);
      onClose();
    }, 2000);
  }

  function handleClear() {
    if (!window.confirm('Opravdu smazat a deaktivovat aktuální hlášení?')) return;
    localStorage.removeItem('pivovar_active_announcement');
    setMsg('Hlášení bylo deaktivováno.');
    setTimeout(() => {
      setMsg(null);
      onClose();
    }, 1500);
  }

  return (
    <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded max-w-lg w-full p-6 space-y-4 shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
          <h3 className="font-display font-black text-lg text-neutral-900 flex items-center gap-2">
            <AlertTriangle className="text-amber-600" size={20} />
            <span>Spravovat Technická Upozornění & Hlášení</span>
          </h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 font-bold text-lg">✕</button>
        </div>

        {msg && (
          <div className="p-3.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-950 text-xs font-black flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-700" />
            <span>{msg}</span>
          </div>
        )}

        <form onSubmit={handlePublish} className="space-y-3">
          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Typ hlášení</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="input font-bold text-xs"
            >
              <option value="technical">⚠️ Technické upozornění / Odstávka</option>
              <option value="important">❗ Důležité provozní hlášení</option>
              <option value="info">💡 Provozní oznam</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Nadpis hlášení</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input font-bold text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Text hlášení (Pokyny pro obsluhu)</label>
            <textarea
              required
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="input font-medium text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-neutral-700 mb-1">Autor hlášení</label>
            <input
              type="text"
              required
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="input font-bold text-xs"
            />
          </div>

          <div className="pt-3 flex items-center justify-between border-t border-neutral-100">
            <button
              type="button"
              onClick={handleClear}
              className="px-3.5 py-2 rounded bg-rose-100 hover:bg-rose-200 text-rose-950 font-bold text-xs transition flex items-center gap-1.5"
            >
              <Trash2 size={15} /> Smazat hlášení
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded bg-neutral-100 text-neutral-700 font-extrabold text-xs"
              >
                Zrušit
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md flex items-center gap-1.5"
              >
                <Save size={15} /> Publikovat hlášení
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
