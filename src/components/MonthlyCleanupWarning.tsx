import { useState } from 'react';
import { CalendarX2, CheckCircle2, ClipboardList } from 'lucide-react';
import { isLastWeekOfMonth } from '../lib/monthlyCleanup';

type Props = {
  // Volitelné: tlačítko, které rovnou otevře stáčení (a tam se po splnění
  // „1. Začátek stáčení" zobrazí okno s měsíčním checklistem).
  onOpenMonthlyChecklist?: () => void;
};

// ⚠️ Výrazné upozornění v posledním týdnu měsíce: „V tomto týdnu je potřeba
// udělat měsíční úklid." Zobrazí se po přihlášení při KAŽDÉM otevření aplikace
// a zavírá se tlačítkem „OK vím o tom" (potlačení platí jen pro toto otevření).
export function MonthlyCleanupWarning({ onOpenMonthlyChecklist }: Props) {
  const [open, setOpen] = useState(() => isLastWeekOfMonth());

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-neutral-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl border-4 border-rose-500 relative overflow-hidden">
        <div className="h-3 w-full absolute top-0 left-0 right-0 bg-rose-600" />

        <div className="flex items-start gap-4 pt-2">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-lg bg-rose-600">
            <CalendarX2 size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-rose-600">
              <span>⚠️ Měsíční úklid</span>
              <span>•</span>
              <span>poslední týden měsíce</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-black text-neutral-950 leading-tight mt-1">
              V tomto týdnu je potřeba udělat měsíční úklid
            </h2>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-rose-50/90 border border-rose-300 text-neutral-900 font-medium text-sm leading-relaxed space-y-2">
          <p className="font-bold text-neutral-900">
            Je poslední týden v měsíci — v rámci stáčení je nutné provést <b>měsíční údržbu</b>{' '}
            stáčeček, naražečů a pivních cest (sekce „4. Měsíční údržba" v checklistu).
          </p>
          <p className="text-xs text-rose-800">
            Po splnění úvodního checklistu „1. Začátek stáčení" se automaticky otevře okno s měsíčním
            checklistem.
          </p>
        </div>

        <div className="pt-2 space-y-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-3.5 px-6 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-base transition shadow-xl hover:shadow-rose-500/20 active:scale-[0.98] flex items-center justify-center gap-3 ring-4 ring-rose-300"
          >
            <CheckCircle2 size={22} />
            <span>OK vím o tom</span>
          </button>
          {onOpenMonthlyChecklist && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenMonthlyChecklist();
              }}
              className="w-full py-3 px-6 rounded-2xl bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-sm transition flex items-center justify-center gap-2"
            >
              <ClipboardList size={18} />
              <span>Otevřít stáčení (měsíční checklist)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
