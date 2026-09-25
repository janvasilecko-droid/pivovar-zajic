// 🔔 Řádek s upozorněním — kdy, komu, kde, a co s ním jde udělat.
// ---------------------------------------------------------------------------
// Vytažené z bývalé obrazovky „Upozornění" (RemindersScreen), která zanikla —
// viz hlavička lib/upozorneniPoznamky.ts. Používá se dvakrát: pod poznámkou,
// ke které upozornění patří, a v seznamu upozornění bez poznámky (starší
// upomínky, které vznikly ještě na té obrazovce).
import { Bell, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { ReminderItem } from '../lib/reminders';
import { komuCesky, kdyCesky, zobrazeniCesky } from '../lib/upozorneniPoznamky';

export default function UpozorneniPruh({
  upozorneni,
  jaEmail,
  odkliknout,
  smazat,
  /** Samostatná karta (upozornění bez poznámky) vs. pruh pod poznámkou. */
  samostatne = false,
}: {
  upozorneni: ReminderItem;
  jaEmail: string;
  odkliknout: (id: string) => void;
  smazat: (id: string) => void;
  samostatne?: boolean;
}) {
  const odkliknuto = (upozorneni.acknowledged_by || []).includes(jaEmail);
  const jeNaCase = new Date(upozorneni.date_time).getTime() <= Date.now();

  return (
    <div
      className={`rounded border p-2.5 space-y-2 ${
        odkliknuto
          ? 'bg-neutral-50 border-neutral-200'
          : jeNaCase
          ? 'bg-amber-50 border-amber-300'
          : 'bg-white border-neutral-200'
      }`}
    >
      {samostatne && (
        <div className="font-display font-black text-sm text-neutral-900">{upozorneni.title}</div>
      )}
      {samostatne && upozorneni.note && (
        <p className="lze-vybrat text-xs text-neutral-700 font-medium whitespace-pre-wrap">{upozorneni.note}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-udaj font-bold text-neutral-500">
        <span className="inline-flex items-center gap-1 text-amber-700">
          <Clock size={12} /> {kdyCesky(upozorneni.date_time)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Bell size={12} /> {zobrazeniCesky(upozorneni.display_mode)}
        </span>
        <span>Komu: <strong className="text-neutral-800">{komuCesky(upozorneni.target_role, upozorneni.target_emails)}</strong></span>
        {upozorneni.acknowledged_by?.length ? (
          <span className="text-emerald-700 font-black">Odkliklo: {upozorneni.acknowledged_by.length}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {!odkliknuto && jeNaCase && (
          <button onClick={() => odkliknout(upozorneni.id)} className="btn-amber btn-sm">
            <CheckCircle2 size={14} /> Odkliknout
          </button>
        )}
        <button
          onClick={() => smazat(upozorneni.id)}
          className="btn-danger btn-sm"
        >
          <Trash2 size={14} /> Zrušit upozornění
        </button>
      </div>
    </div>
  );
}
