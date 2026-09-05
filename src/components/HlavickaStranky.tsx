import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * 🪧 Hlavička obrazovky — jeden tvar pro všechny.
 *
 * Změřeno 5. 9. 2026: 38 nadpisů obrazovek v OSMI tvarech —
 * `text-lg font-display font-black` 10×, `text-xl font-display font-black` 7×,
 * `text-2xl font-black` 6×, `text-2xl font-display font-black` 5×,
 * `text-lg font-bold` 3×, `text-lg font-black` 3×, `text-lg font-mono font-black` 2×…
 * Žádný z těch rozdílů nikdo nezvolil; vznikly podle toho, kdo obrazovku psal.
 *
 * Kromě vzhledu to řeší i místo na telefonu: nadpis, podtitul a akce sedí
 * v jednom pruhu, který se na úzkém displeji zalomí pod sebe, místo aby si
 * každá obrazovka vymýšlela vlastní rozvržení.
 *
 * ```tsx
 * <HlavickaStranky
 *   titul="Stáčení KEG"
 *   podtitul="Co se dnes stočilo do sudů"
 *   ikona={IkonaSud}
 *   akce={<button className="btn-primary">Zapsat</button>}
 * />
 * ```
 *
 * Nadpis je `<h1>`: na obrazovce má být jeden a odečítač obrazovky podle něj
 * pozná, kde je člověk. Kdo potřebuje nadpis uvnitř karty, použije `<h2>`
 * a `text-podtitul` — na to tahle komponenta není.
 */
export function HlavickaStranky({ titul, podtitul, ikona: Ikona, akce, tridy = '' }: {
  titul: string;
  podtitul?: ReactNode;
  ikona?: LucideIcon;
  /** Tlačítka vpravo (na telefonu se zalomí pod nadpis). */
  akce?: ReactNode;
  tridy?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 flex-wrap ${tridy}`}>
      <div className="min-w-0">
        <h1 className="text-titul font-display font-black tracking-tight text-neutral-900 flex items-center gap-2">
          {Ikona && <Ikona size={22} className="text-primary-600 shrink-0" aria-hidden="true" />}
          <span className="truncate">{titul}</span>
        </h1>
        {podtitul && (
          <p className="text-popisek font-semibold text-neutral-500 mt-0.5">{podtitul}</p>
        )}
      </div>
      {akce && <div className="lista-akci flex-wrap shrink-0">{akce}</div>}
    </div>
  );
}
