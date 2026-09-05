// 🔔 Jediné místo, kde se vykreslují oznámení a potvrzovací dialog.
// Montuje se jednou v main.tsx; volá se odkudkoli přes lib/toast.ts.
import { useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import {
  odebirejOznameni, stavOznameni, zavriToast, uzavriPotvrzeni,
  type Toast, type ToastTon,
} from '../lib/toast';
import { zavibruj } from '../lib/haptika';

const TONY: Record<ToastTon, { ikona: typeof Info; barva: string; pruh: string }> = {
  info: { ikona: Info, barva: 'text-primary-600', pruh: 'bg-primary-500' },
  uspech: { ikona: CheckCircle2, barva: 'text-emerald-600', pruh: 'bg-emerald-500' },
  varovani: { ikona: AlertTriangle, barva: 'text-amber-600', pruh: 'bg-amber-500' },
  chyba: { ikona: XCircle, barva: 'text-rose-600', pruh: 'bg-rose-500' },
};

function Radek({ t }: { t: Toast }) {
  const { ikona: Ikona, barva, pruh } = TONY[t.ton];
  return (
    <div
      role="status"
      className="pointer-events-auto relative overflow-hidden w-full rounded-2xl bg-white shadow-lg border border-neutral-200/90 flex items-start gap-3 pl-4 pr-2 py-3 animate-[toastIn_180ms_ease-out]"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${pruh}`} aria-hidden />
      <Ikona className={`w-5 h-5 shrink-0 mt-0.5 ${barva}`} />
      <p className="flex-1 text-sm font-semibold text-neutral-800 leading-snug break-words">{t.text}</p>
      {t.akce && (
        // Dotykový cíl na plných 44 px — „Vrátit zpět" se musí dát trefit
        // palcem na první pokus, jinak je celý vzorec k ničemu.
        <button
          className="shrink-0 min-h-[44px] px-3 rounded-xl text-sm font-black text-primary-700 hover:bg-primary-50 active:scale-95 transition"
          onClick={() => { zavibruj('klik'); zavriToast(t.id); void t.akce!.onClick(); }}
        >
          {t.akce.label}
        </button>
      )}
      <button
        aria-label="Zavřít oznámení"
        className="shrink-0 w-11 h-11 grid place-items-center rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
        onClick={() => zavriToast(t.id)}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function ToastHost() {
  const stav = useSyncExternalStore(odebirejOznameni, stavOznameni, stavOznameni);
  const p = stav.potvrzeni;

  return (
    <>
      {/* Oznámení sedí NAD spodní lištou (64 px + bezpečná zóna), ať nezakryjí
          navigaci ani palec, kterým se ovládá. */}
      <div
        className="fixed left-0 right-0 z-toast px-3 flex flex-col gap-2 items-center pointer-events-none sm:max-w-lg sm:mx-auto"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)' }}
      >
        {stav.toasty.map((t) => <Radek key={t.id} t={t} />)}
      </div>

      {p && (
        <div
          className="fixed inset-0 z-potvrzeni flex items-end sm:items-center justify-center bg-neutral-900/50 backdrop-blur-[2px] animate-[sheetFade_120ms_ease-out]"
          onClick={() => uzavriPotvrzeni(false)}
        >
          {/* Na telefonu vyjede zespoda (palec je dole), na počítači je uprostřed. */}
          <div
            className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] sm:pb-5 animate-[sheetUp_200ms_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="sm:hidden w-10 h-1.5 rounded-full bg-neutral-200 mx-auto mb-4" aria-hidden />
            <h2 className="text-lg font-display font-extrabold text-neutral-900 mb-2">
              {p.titulek ?? 'Potvrzení'}
            </h2>
            <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line mb-6">{p.text}</p>
            {/* Na telefonu pod sebou a přes celou šířku — nejjistější trefa. */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                className="btn-ghost !rounded-xl w-full sm:w-auto !min-h-[48px]"
                onClick={() => uzavriPotvrzeni(false)}
              >
                {p.zrusit ?? 'Zrušit'}
              </button>
              <button
                className={`${p.nebezpecne ? 'btn-danger' : 'btn-primary'} !rounded-xl w-full sm:w-auto !min-h-[48px]`}
                onClick={() => { zavibruj('klik'); uzavriPotvrzeni(true); }}
                autoFocus
              >
                {p.potvrdit ?? 'Potvrdit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
