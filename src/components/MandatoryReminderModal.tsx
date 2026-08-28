import { ReminderItem, acknowledgeReminder } from '../lib/reminders';
import { AlertTriangle, Bell, CheckCircle2, Clock, User } from 'lucide-react';

export function MandatoryReminderModal({ reminder, currentUserEmail, onDismiss }: {
  reminder: ReminderItem;
  currentUserEmail: string;
  onDismiss: () => void;
}) {
  async function handleConfirm() {
    await acknowledgeReminder(reminder.id, currentUserEmail);
    onDismiss();
  }

  const dtFormatted = new Date(reminder.date_time).toLocaleString('cs-CZ', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/80 backdrop-blur-md animate-fade-in">
      <div className="card w-full max-w-lg p-6 sm:p-8 bg-white border-2 border-amber-500 rounded shadow-2xl space-y-5 animate-scale-in">
        {/* Header Icon */}
        <div className="flex items-center gap-3 border-b border-amber-200 pb-4">
          <div className="w-12 h-12 rounded bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-xl shadow-md shrink-0">
            <Bell className="ikona-text" />
          </div>
          <div>
            <div className="text-[11px] font-black uppercase text-amber-700 tracking-wider">
              DŮLEŽITÁ UPOMÍNKA K ODKLIKNUTÍ
            </div>
            <h2 className="font-display font-black text-xl text-neutral-950 tracking-tight">
              {reminder.title}
            </h2>
          </div>
        </div>

        {/* Content Details */}
        <div className="bg-amber-50/70 border border-amber-200 rounded p-4 space-y-3">
          {reminder.note && (
            <p className="text-sm font-bold text-neutral-800 whitespace-pre-wrap leading-relaxed">
              {reminder.note}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/60 text-xs font-bold text-neutral-600">
            <span className="flex items-center gap-1.5 text-neutral-900">
              <Clock size={15} className="text-amber-600" />
              <span>Termín: <strong>{dtFormatted}</strong></span>
            </span>
            <span className="flex items-center gap-1.5 text-neutral-600">
              <User size={15} className="text-amber-600" />
              <span>Zadal: <strong>{reminder.created_by}</strong></span>
            </span>
          </div>
        </div>

        <div className="p-3 bg-neutral-100 rounded text-xs font-semibold text-neutral-600 text-center">
          Tato upomínka vyžaduje vaše potvrzení. Kliknutím na tlačítko níže potvrdíte, že jste zprávu zaznamenali.
        </div>

        {/* Action Button */}
        <div>
          <button
            onClick={handleConfirm}
            className="w-full py-4 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-sm transition shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] cursor-pointer"
          >
            <CheckCircle2 size={20} />
            <span>Rozumím, beru na vědomí (Odkliknout)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
