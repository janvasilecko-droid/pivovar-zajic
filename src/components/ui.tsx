import { ReactNode, useEffect, useRef, useState } from 'react';
import { Inbox, X, type LucideIcon } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="relative w-9 h-9">
        {/* border-[3px], ne border-3: Tailwind zná jen 0/2/4/8 a `border-3`
            se nevygeneruje. Preflight přitom všem prvkům nastavuje
            border-width: 0 — takže kolečko nemělo žádný okraj a spinner byl
            po celou dobu načítání neviditelný. */}
        <div className="w-9 h-9 border-[3px] border-neutral-200 border-t-primary-600 rounded-full animate-spin" />
        <div className="absolute inset-0 w-9 h-9 border-[3px] border-transparent border-b-amber-500 rounded-full animate-spin opacity-70" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
      </div>
    </div>
  );
}

/**
 * Prázdný stav — „tady zatím nic není" s ikonou a vysvětlením.
 *
 * `icon` bere kreslenou ikonu (lucide nebo z components/ikony.tsx) i obyčejný
 * řetězec. Řetězec zůstává schválně: dokud se všech 39 volání nepřevede,
 * musí obojí fungovat vedle sebe — a párkrát se hodí napsat rovnou znak.
 */
export function EmptyState({ text, icon = Inbox, akce }: {
  text: string;
  icon?: string | LucideIcon;
  /**
   * Co se dá udělat, když je prázdno. Prázdná obrazovka bez tlačítka nechává
   * člověka hádat, kde se zapisuje — nový člověk v pivovaru se to jinak učí
   * od někoho, kdo má práci. Nepovinné: kde není zřejmá jedna akce, je lepší
   * nenabízet žádnou než špatnou.
   */
  akce?: { popis: string; onClick: () => void };
}) {
  // Dvě proměnné, ne jedna: TypeScript pak ví, že ve větvi bez ikony
  // zbývá řetězec, a nesnaží se vykreslit komponentu jako text.
  const Ikona = typeof icon === 'string' ? null : icon;
  const znak = typeof icon === 'string' ? icon : null;
  return (
    <div className="card p-10 text-center animate-fade-in border-dashed border-2 border-neutral-200 bg-neutral-50/50">
      <div className="w-14 h-14 mx-auto mb-3.5 rounded bg-white shadow-sm border border-neutral-200/80 grid place-items-center text-3xl text-neutral-500">
        {Ikona ? <Ikona size={26} /> : znak}
      </div>
      <p className="text-neutral-600 text-sm font-medium">{text}</p>
      {akce && (
        <button
          type="button"
          onClick={akce.onClick}
          className="mt-3.5 px-4 py-2.5 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md transition"
        >
          {akce.popis}
        </button>
      )}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-500 mt-1 font-normal">{hint}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide, maxWidth }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  // Tlačítko Zpět (hardwarové na Androidu i v prohlížeči) zavře modal místo
  // toho, aby vyskočilo o stránku výš — zapíšeme si při otevření dodatečný
  // krok do historie (se zachováním page/subTab, ať App.tsx při jeho
  // odpopnutí nepřehodí stránku) a na popstate modal zavřeme.
  //
  // modalId: history.back() je asynchronní (popstate přijde až příští tick).
  // Když se jeden modal zavře a hned v tomtéž renderu se otevře další (např.
  // potvrzovací dialog → checklist), zpožděný back() z toho prvního by bez
  // téhle kontroly odpopnul historii AŽ PO tom, co druhý modal stihl
  // pushnout svůj vlastní záznam — a jeho popstate listener by ho tím pádem
  // hned zase zavřel. Cleanup proto volá back() jen tehdy, když je na vrcholu
  // historie pořád jeho VLASTNÍ záznam (podle unikátního id).
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const modalId = Math.random().toString(36).slice(2);
    window.history.pushState({ ...window.history.state, modalOpen: true, modalId }, '');
    const onPopState = () => onCloseRef.current();
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (window.history.state?.modalOpen && window.history.state?.modalId === modalId) {
        window.history.back();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className={`relative card shadow-2xl w-full ${maxWidth ?? (wide ? 'max-w-3xl' : 'max-w-md')} max-h-[92vh] flex flex-col animate-slide-up rounded-b-none sm:rounded border-neutral-200`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 sticky top-0 bg-white/95 backdrop-blur-md rounded-t-2xl z-10">
          <h3 className="font-display font-bold text-lg text-neutral-900 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
            title="Zavřít"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}

/** Číselná dlaždice. `icon` bere kreslenou ikonu i řetězec — viz EmptyState. */
export function Stat({ label, value, icon, tone = 'primary' }: {
  label: string; value: ReactNode; icon: string | LucideIcon; tone?: 'primary' | 'accent' | 'amber' | 'success' | 'warning' | 'danger';
}) {
  const Ikona = typeof icon === 'string' ? null : icon;
  const znak = typeof icon === 'string' ? icon : null;
  const tones: Record<string, { bg: string; iconBg: string; text: string; border: string }> = {
    primary: { bg: 'hover:border-primary-200', iconBg: 'bg-primary-50 text-primary-600 border-primary-100', text: 'text-neutral-900', border: 'border-neutral-200/80' },
    accent: { bg: 'hover:border-neutral-400', iconBg: 'bg-neutral-900 text-white border-neutral-800', text: 'text-neutral-900', border: 'border-neutral-200/80' },
    amber: { bg: 'hover:border-amber-300', iconBg: 'bg-amber-50 text-amber-700 border-amber-200/60', text: 'text-neutral-900', border: 'border-amber-200/50' },
    success: { bg: 'hover:border-emerald-300', iconBg: 'bg-emerald-50 text-emerald-700 border-emerald-200/60', text: 'text-neutral-900', border: 'border-emerald-200/50' },
    warning: { bg: 'hover:border-amber-300', iconBg: 'bg-amber-50 text-amber-700 border-amber-200/60', text: 'text-neutral-900', border: 'border-amber-200/50' },
    danger: { bg: 'hover:border-rose-300', iconBg: 'bg-rose-50 text-rose-700 border-rose-200/60', text: 'text-neutral-900', border: 'border-rose-200/50' },
  };
  const t = tones[tone] || tones.primary;

  return (
    <div className={`card-hover p-5 border ${t.border} ${t.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className={`w-10 h-10 rounded border grid place-items-center text-xl shadow-xs transition-transform group-hover:scale-105 ${t.iconBg}`}>
          {Ikona ? <Ikona size={20} /> : znak}
        </span>
      </div>
      <div className={`text-2xl sm:text-3xl font-display font-extrabold tracking-tight ${t.text}`}>{value}</div>
    </div>
  );
}

export function ConfirmButton({ onConfirm, children, className = '' }: {
  onConfirm: () => Promise<void> | void; children: ReactNode; className?: string;
}) {
  return (
    <button
      className={className}
      onClick={async (e) => { e.preventDefault(); await onConfirm(); }}
    >{children}</button>
  );
}
