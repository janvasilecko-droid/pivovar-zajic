import { useEffect, useRef, useState } from 'react';

/**
 * Čitelný rozbalovací výběr (náhrada nativního <select>).
 * - Žádná nativní šipka — celé pole je čitelné a klikací.
 * - Rozbalený seznam zobrazí všechny možnosti plně a čitelně.
 * - Zavře se kliknutím mimo, Esc, nebo výběrem.
 */
export function ReadableSelect<T extends string | number>({ value, onChange, options, placeholder = '—', className = '' }: {
  value: T | '';
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input text-xs w-full text-left px-2 py-1.5 truncate ${value === '' ? 'text-neutral-400' : 'text-neutral-800'}`}
      >
        {selected ? selected.label : placeholder}
      </button>

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 card !p-0 max-h-64 overflow-auto scrollbar-thin animate-fade-in shadow-lg">
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-50 transition-colors"
            onClick={() => { onChange('' as T); setOpen(false); }}
          >
            {placeholder}
          </button>
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              className={`w-full text-left px-3 py-2 text-xs truncate transition-colors ${o.value === value ? 'bg-amber-100 text-amber-950 font-bold' : 'text-neutral-700 hover:bg-amber-50'}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
