import { ReactNode, useEffect, useRef, useState } from 'react';
import { Inbox, X, AlertTriangle, type LucideIcon } from 'lucide-react';
import { plnostTanku, popisPlnosti } from '../lib/tankPlnost';
import { useChovaniDialogu } from '../lib/zavriNaZpet';
import { litry } from '../lib/cisla';

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
export function EmptyState({ text, icon, akce, varianta = 'prazdno' }: {
  text: string;
  icon?: string | LucideIcon;
  /**
   * Co se dá udělat, když je prázdno. Prázdná obrazovka bez tlačítka nechává
   * člověka hádat, kde se zapisuje — nový člověk v pivovaru se to jinak učí
   * od někoho, kdo má práci. Nepovinné: kde není zřejmá jedna akce, je lepší
   * nenabízet žádnou než špatnou. U chyby to bývá „Zkusit znovu".
   */
  akce?: { popis: string; onClick: () => void };
  /**
   * `prazdno` = fakt tu nic není (nemá se nic dělat). `chyba` = načtení
   * selhalo (dá se zkusit znovu). Dřív obojí vypadalo stejně, takže
   * „nemáš objednávky" a „nepodařilo se je načíst" nešlo rozeznat — u prvního
   * se nemá dělat nic, u druhého zkusit znovu.
   */
  varianta?: 'prazdno' | 'chyba';
}) {
  const jeChyba = varianta === 'chyba';
  // Výchozí ikona podle varianty: prázdno = schránka, chyba = vykřičník.
  const skutecnaIkona = icon ?? (jeChyba ? AlertTriangle : Inbox);
  // Dvě proměnné, ne jedna: TypeScript pak ví, že ve větvi bez ikony
  // zbývá řetězec, a nesnaží se vykreslit komponentu jako text.
  const Ikona = typeof skutecnaIkona === 'string' ? null : skutecnaIkona;
  const znak = typeof skutecnaIkona === 'string' ? skutecnaIkona : null;
  return (
    <div className={`card p-10 text-center animate-fade-in border-dashed border-2 ${jeChyba ? 'border-rose-300 bg-rose-50/60' : 'border-neutral-200 bg-neutral-50/50'}`}>
      <div className={`w-14 h-14 mx-auto mb-3.5 rounded bg-white shadow-sm border grid place-items-center text-3xl ${jeChyba ? 'border-rose-200 text-rose-500' : 'border-neutral-200/80 text-neutral-500'}`}>
        {Ikona ? <Ikona size={26} /> : znak}
      </div>
      <p className={`text-sm font-medium ${jeChyba ? 'text-rose-800' : 'text-neutral-600'}`}>{text}</p>
      {akce && (
        <button
          type="button"
          onClick={akce.onClick}
          className={`mt-3.5 px-4 py-2.5 rounded font-black text-xs shadow-md transition ${jeChyba ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-amber-500 hover:bg-amber-400 text-neutral-950'}`}
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
  // Zavírání na Escape, zamčené rolování pod dialogem a zavření tlačítkem
  // Zpět. Vytaženo do lib/zavriNaZpet.ts, aby to samé měly i dialogy, které
  // si `fixed inset-0` kreslí samy — bylo jich třináct a Zpět v nich odešel
  // z celé obrazovky i s rozepsanou prací.
  useChovaniDialogu(open, onClose);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-md transition-opacity" onClick={onClose} />
      <div className={`relative card shadow-2xl w-full ${maxWidth ?? (wide ? 'max-w-3xl' : 'max-w-md')} max-h-[92vh] flex flex-col animate-slide-up rounded-b-none sm:rounded border-neutral-200`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 sticky top-0 bg-white/95 backdrop-blur-md rounded-t-2xl z-10">
          <h3 className="font-display font-bold text-lg text-neutral-900 tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition tap"
            title="Zavřít" aria-label="Zavřít"
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
          {Ikona ? <Ikona size={18} /> : znak}
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

/**
 * 🛢️ Ukazatel plnosti tanku — vodorovný pruh, který na první pohled řekne
 * „skoro plný / na dojezdu", místo aby to člověk počítal z litrů v hlavě.
 *
 * Barva NENESE informaci sama: pod pruhem (nebo v `title`) je vždy popis
 * slovy, takže se to dá přečíst i bez plného vnímání barev.
 */
export function UkazatelPlnosti({ zbyvaLitru, kapacitaLitru, popisek = true }: {
  zbyvaLitru: number;
  kapacitaLitru: number;
  /** false = jen pruh (do dlaždice, kde na text není místo). */
  popisek?: boolean;
}) {
  const p = plnostTanku(zbyvaLitru, kapacitaLitru);
  const barva =
    p.stav === 'prazdny' ? 'bg-neutral-300'
    : p.stav === 'dojezd' ? 'bg-rose-500'
    : p.stav === 'stred' ? 'bg-amber-500'
    : 'bg-emerald-500';
  const popis = popisPlnosti(p);
  return (
    <div className="mt-2" title={`Plnost tanku: ${popis}`}>
      <div
        className="h-2.5 w-full rounded-full bg-neutral-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={p.procent}
        aria-label={`Plnost tanku: ${popis}`}
      >
        <div className={`h-full ${barva} transition-all duration-500`} style={{ width: `${p.procent}%` }} />
      </div>
      {popisek && (
        <div className="mt-1 flex items-center justify-between text-udaj font-bold text-neutral-600">
          <span className="tabular-nums">{litry(zbyvaLitru)} z {litry(kapacitaLitru)}</span>
          <span>{popis}</span>
        </div>
      )}
    </div>
  );
}
