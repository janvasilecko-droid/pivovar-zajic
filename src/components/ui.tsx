import { ReactNode, useEffect, useState } from 'react';

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center py-12 ${className}`}>
      <div className="relative w-9 h-9">
        <div className="w-9 h-9 border-3 border-neutral-200 border-t-primary-600 rounded-full animate-spin" />
        <div className="absolute inset-0 w-9 h-9 border-3 border-transparent border-b-amber-500 rounded-full animate-spin opacity-70" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
      </div>
    </div>
  );
}

export function EmptyState({ text, icon = '📭' }: { text: string; icon?: string }) {
  return (
    <div className="card p-10 text-center animate-fade-in border-dashed border-2 border-neutral-200 bg-neutral-50/50">
      <div className="w-14 h-14 mx-auto mb-3.5 rounded-2xl bg-white shadow-sm border border-neutral-200/80 grid place-items-center text-3xl">
        {icon}
      </div>
      <p className="text-neutral-600 text-sm font-medium">{text}</p>
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className={`relative card shadow-2xl w-full ${maxWidth ?? (wide ? 'max-w-3xl' : 'max-w-md')} max-h-[92vh] flex flex-col animate-slide-up rounded-b-none sm:rounded-2xl border-neutral-200`}>
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-neutral-100 sticky top-0 bg-white/95 backdrop-blur-md rounded-t-2xl z-10">
          <h3 className="font-display font-bold text-lg text-neutral-900 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-y-auto scrollbar-thin">{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, icon, tone = 'primary' }: {
  label: string; value: ReactNode; icon: string; tone?: 'primary' | 'accent' | 'amber' | 'success' | 'warning' | 'danger';
}) {
  const tones: Record<string, { bg: string; iconBg: string; text: string; border: string }> = {
    primary: { bg: 'hover:border-primary-200', iconBg: 'bg-primary-50 text-primary-600 border-primary-100', text: 'text-neutral-900', border: 'border-neutral-200/80' },
    accent: { bg: 'hover:border-neutral-400', iconBg: 'bg-neutral-900 text-white border-neutral-800', text: 'text-neutral-900', border: 'border-neutral-200/80' },
    amber: { bg: 'hover:border-amber-300', iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60', text: 'text-neutral-900', border: 'border-amber-200/50' },
    success: { bg: 'hover:border-emerald-300', iconBg: 'bg-emerald-50 text-emerald-600 border-emerald-200/60', text: 'text-neutral-900', border: 'border-emerald-200/50' },
    warning: { bg: 'hover:border-amber-300', iconBg: 'bg-amber-50 text-amber-600 border-amber-200/60', text: 'text-neutral-900', border: 'border-amber-200/50' },
    danger: { bg: 'hover:border-rose-300', iconBg: 'bg-rose-50 text-rose-600 border-rose-200/60', text: 'text-neutral-900', border: 'border-rose-200/50' },
  };
  const t = tones[tone] || tones.primary;

  return (
    <div className={`card-hover p-5 border ${t.border} ${t.bg}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className={`w-10 h-10 rounded-xl border grid place-items-center text-xl shadow-xs transition-transform group-hover:scale-105 ${t.iconBg}`}>
          {icon}
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

export function useConfirm() {
  const [state, setState] = useState<{ msg: string; resolve: (v: boolean) => void } | null>(null);
  const confirm = (msg: string) => new Promise<boolean>((resolve) => setState({ msg, resolve }));
  const node = state ? (
    <Modal open onClose={() => { state.resolve(false); setState(null); }} title="Potvrzení akci">
      <p className="text-sm text-neutral-700 mb-6 font-medium leading-relaxed">{state.msg}</p>
      <div className="flex gap-3 justify-end">
        <button className="btn-ghost" onClick={() => { state.resolve(false); setState(null); }}>Zrušit</button>
        <button className="btn-danger" onClick={() => { state.resolve(true); setState(null); }}>Potvrdit</button>
      </div>
    </Modal>
  ) : null;
  return { confirm, node };
}
