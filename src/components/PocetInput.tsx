// 🔢 Jednotné zadávání čísel — jedno místo pro všechny pasti mobilních
// číselných polí:
//
//  • `type="number"` na české klávesnici ZAHODÍ čárku: uživatel napíše „1,5"
//    a v hodnotě je prázdno. Proto text + inputMode="decimal" a normalizace
//    čárky na tečku při zápisu.
//  • Kolečko myši nad zaostřeným číselným polem tiše přepíše hodnotu —
//    stačí sjet stránku dolů a z 12 je 15. Kolečko se proto odchytává.
//  • Systémové šipky nahoru/dolů jsou na telefonu netrefitelné (12 px).
//    Místo nich jsou tlačítka −/+ o velikosti 44 px, tedy palcová norma.
//  • Klepnutí do pole vybere celou hodnotu — přepsat je běžnější než
//    dopisovat, a mazat po jedné číslici na telefonu zdržuje.
import { useRef } from 'react';
import { Minus, Plus } from 'lucide-react';
import { zavibruj } from '../lib/haptika';

export type PocetInputProps = {
  value: string | number;
  onChange: (hodnota: string) => void;
  /** Povolit desetinná čísla (hustota, hmotnost). Výchozí je celé kusy. */
  desetinne?: boolean;
  min?: number;
  max?: number;
  /** O kolik přidá/ubere tlačítko −/+. Výchozí 1. */
  krok?: number;
  /** Skrýt tlačítka −/+ (např. v úzké tabulce). */
  bezTlacitek?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Zarovnat text na střed — vhodné u počítání kusů. */
  naStred?: boolean;
  id?: string;
  onBlur?: () => void;
  'aria-label'?: string;
};

/** „1,5" → „1.5"; pryč s mezerami a vším, co není číslo. */
export function normalizujCislo(text: string, desetinne: boolean): string {
  let s = String(text).replace(/\s/g, '').replace(',', '.');
  s = desetinne ? s.replace(/[^0-9.-]/g, '') : s.replace(/[^0-9-]/g, '');
  // Jen jedna tečka a mínus jen na začátku.
  const zaporne = s.startsWith('-');
  s = s.replace(/-/g, '');
  const casti = s.split('.');
  s = casti.length > 1 ? `${casti[0]}.${casti.slice(1).join('')}` : s;
  return (zaporne ? '-' : '') + s;
}

export default function PocetInput({
  value, onChange, desetinne = false, min, max, krok = 1,
  bezTlacitek = false, placeholder, disabled, className = '',
  naStred = true, id, onBlur, ...rest
}: PocetInputProps) {
  const ref = useRef<HTMLInputElement>(null);

  const omez = (n: number) => {
    if (min !== undefined && n < min) return min;
    if (max !== undefined && n > max) return max;
    return n;
  };

  const posun = (o: number) => {
    const zaklad = Number(normalizujCislo(String(value ?? ''), desetinne) || 0);
    const nova = omez(Number((zaklad + o).toFixed(desetinne ? 3 : 0)));
    zavibruj('klik');
    onChange(String(nova));
  };

  const pole = (
    <input
      ref={ref}
      id={id}
      // Záměrně NE type="number" — viz komentář nahoře (čárka, kolečko, šipky).
      type="text"
      inputMode={desetinne ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      pattern={desetinne ? '[0-9]*[.,]?[0-9]*' : '[0-9]*'}
      value={value ?? ''}
      disabled={disabled}
      placeholder={placeholder}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(normalizujCislo(e.target.value, desetinne))}
      onBlur={onBlur}
      className={`input ${naStred ? 'text-center' : ''} font-bold tabular-nums ${className}`}
      {...rest}
    />
  );

  if (bezTlacitek) return pole;

  return (
    <div className="flex items-stretch gap-1.5">
      <button
        type="button"
        aria-label="O jedna méně"
        disabled={disabled}
        onClick={() => posun(-krok)}
        className="shrink-0 w-11 min-h-[44px] grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 active:scale-95 transition disabled:opacity-40"
      >
        <Minus className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">{pole}</div>
      <button
        type="button"
        aria-label="O jedna více"
        disabled={disabled}
        onClick={() => posun(krok)}
        className="shrink-0 w-11 min-h-[44px] grid place-items-center rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 active:scale-95 transition disabled:opacity-40"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
