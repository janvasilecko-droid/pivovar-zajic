import { useState, useEffect } from 'react';
import { AlertTriangle, BellRing, Check, CheckCircle2, Megaphone, ShieldAlert } from 'lucide-react';
import { isNotificationSupported, playOrderChime } from '../lib/notifications';

export type Announcement = {
  id: string;
  title: string;
  body: string;
  type: 'technical' | 'important' | 'info';
  author: string;
  date: string;
  active: boolean;
};

const DEFAULT_ANNOUNCEMENT: Announcement = {
  id: 'announcement_2026_07_27_01',
  title: 'Technické upozornění: Odstávka sanity a údržba stáčecí linky',
  body: 'V úterý 28. 7. od 8:00 do 12:00 proběhne plánovaná profilaktická sanitace a výměna těsnění na stáčecí lince KEG sudů. V této době nestáčet a dodržovat BOZP pokyny sládka!',
  type: 'technical',
  author: 'Ing. Petr Bednář (Sládek)',
  date: '27. 7. 2026 17:35',
  active: true,
};

export function MandatoryAnnouncementModal() {
  const [currentAnnouncement, setCurrentAnnouncement] = useState<Announcement | null>(null);
  const [acknowledged, setAcknowledged] = useState<boolean>(true);

  useEffect(() => {
    // Načtení aktivního hlášení (z localStorage nebo výchozího)
    try {
      const saved = localStorage.getItem('pivovar_active_announcement');
      const announcement: Announcement = saved ? JSON.parse(saved) : DEFAULT_ANNOUNCEMENT;

      if (announcement && announcement.active) {
        setCurrentAnnouncement(announcement);
        const ackKey = `acknowledged_announcement_${announcement.id}`;
        const hasAck = localStorage.getItem(ackKey) === 'true';
        setAcknowledged(hasAck);

        // Pokud ještě nebylo přečteno, spustíme push notifikaci na telefonu/PC a zvukový signál
        if (!hasAck) {
          playOrderChime();
          if (isNotificationSupported() && Notification.permission === 'granted') {
            try {
              new Notification(announcement.title, {
                body: announcement.body,
                icon: '/favicon.ico',
                tag: announcement.id,
              });
            } catch (e) { console.warn(e); }
          }
        }
      } else {
        setAcknowledged(true);
      }
    } catch {
      setAcknowledged(true);
    }
  }, []);

  function handleConfirmRead() {
    if (!currentAnnouncement) return;
    const ackKey = `acknowledged_announcement_${currentAnnouncement.id}`;
    localStorage.setItem(ackKey, 'true');
    setAcknowledged(true);
  }

  if (acknowledged || !currentAnnouncement || !currentAnnouncement.active) {
    return null;
  }

  const isTech = currentAnnouncement.type === 'technical';
  const isImp = currentAnnouncement.type === 'important';

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="bg-white rounded max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-amber-500 relative overflow-hidden">
        {/* Decorative Top Accent Line */}
        <div className={`h-3 w-full absolute top-0 left-0 right-0 ${isTech ? 'bg-amber-500' : isImp ? 'bg-rose-600' : 'bg-sky-600'}`} />

        <div className="flex items-start gap-4 pt-2">
          <div className={`w-14 h-14 rounded flex items-center justify-center text-white shrink-0 shadow-lg ${
            isTech ? 'bg-amber-500' : isImp ? 'bg-rose-600' : 'bg-sky-600'
          }`}>
            {isTech ? <AlertTriangle size={32} /> : isImp ? <ShieldAlert size={32} /> : <BellRing size={32} />}
          </div>

          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-amber-700">
              <span>Pivovarské hlášení</span>
              <span>•</span>
              <span>{currentAnnouncement.date}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              {currentAnnouncement.title}
            </h2>
            <p className="text-xs font-bold text-neutral-500 mt-0.5">
              Autor: <strong className="text-neutral-800">{currentAnnouncement.author}</strong>
            </p>
          </div>
        </div>

        {/* Notice Body Box */}
        <div className="p-5 rounded bg-amber-50/90 border border-amber-300 text-neutral-900 font-medium text-sm leading-relaxed space-y-2">
          <div className="font-black text-xs uppercase text-amber-950 flex items-center gap-1.5 border-b border-amber-200/80 pb-2">
            <span><Megaphone className="ikona-text" /> Znění technického upozornění:</span>
          </div>
          <p className="whitespace-pre-wrap font-bold text-neutral-900">{currentAnnouncement.body}</p>
        </div>

        {/* Mandatory Action Button */}
        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={handleConfirmRead}
            className="w-full py-4 px-6 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-base transition shadow-xl hover:shadow-amber-500/20 active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-amber-300"
          >
            <CheckCircle2 size={24} />
            <span><Check className="ikona-text" /> Přečetl jsem a rozumím (Potvrdit přečtení)</span>
          </button>
          <p className="text-center text-[11px] font-bold text-neutral-400">
            Pro pokračování do aplikace musíte výslovně potvrdit přečtení tohoto pokynu.
          </p>
        </div>
      </div>
    </div>
  );
}
