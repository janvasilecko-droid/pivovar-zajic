// 📵 Pruh „tahle čísla nemusí být aktuální" — nad Skladem, Pohyby, Inventurou.
// ---------------------------------------------------------------------------
// Sklad se skládá z deseti tabulek. Když některý dotaz na slabém signálu
// vyprší, appka odpoví z paměti telefonu (supabase.ts, serveCached) — a to je
// správně, bez signálu je lepší poslední známý stav než nic. Jenže dřív se to
// nedozvěděl nikdo: čísla vypadala stejně jako čerstvá a jednou byla o kus
// vedle (15. 10. 2026: Jantar 50 l „na začátku 3" místo 2).
//
// Pruh to řekne nahlas a sám to zkouší znovu: dokud je vidět, každých 20 s
// a hned po návratu signálu. Jakmile přijdou čerstvá data, zmizí.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';

/** Jak často se data zkusí načíst sama, dokud jsou z paměti telefonu. */
export const OBNOVA_STARYCH_DAT_MS = 20_000;

export default function StaraDataPruh({
  zPameti = false,
  chyba = null,
  onZnovu,
  className = '',
}: {
  /** Server neodpověděl včas, čísla jsou z paměti telefonu. */
  zPameti?: boolean;
  /** Text chyby: nepodařilo se načíst všechno (obrazovka ukazuje poslední úspěšný stav, pokud nějaký má). */
  chyba?: string | null;
  /** Načíst znovu — bez kostry (tiše), aby se obrazovka neblikala. */
  onZnovu: () => Promise<unknown> | void;
  className?: string;
}) {
  const [bezi, setBezi] = useState(false);
  const znovu = useRef(onZnovu);
  znovu.current = onZnovu;
  const videt = zPameti || !!chyba;

  async function zkusit() {
    setBezi(true);
    try { await znovu.current(); } finally { setBezi(false); }
  }

  useEffect(() => {
    if (!videt) return;
    // Schovaná záložka / zhasnutý telefon nemá co zkoušet.
    const casovac = setInterval(() => {
      if (document.visibilityState !== 'hidden') void znovu.current();
    }, OBNOVA_STARYCH_DAT_MS);
    const naPripojeni = () => { void znovu.current(); };
    window.addEventListener('online', naPripojeni);
    return () => {
      clearInterval(casovac);
      window.removeEventListener('online', naPripojeni);
    };
  }, [videt]);

  if (!videt) return null;

  // Chyba má přednost: „nenačetlo se to" je horší zpráva než „je to starší".
  const jeChyba = !!chyba;
  return (
    <div
      role={jeChyba ? 'alert' : 'status'}
      data-testid="stara-data-pruh"
      className={`rounded border-2 p-3 flex flex-wrap items-center gap-x-3 gap-y-2 ${
        jeChyba ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-amber-300 bg-amber-50 text-amber-900'
      } ${className}`}
    >
      {jeChyba ? <AlertTriangle size={20} className="shrink-0" aria-hidden /> : <WifiOff size={20} className="shrink-0" aria-hidden />}
      <div className="flex-1 min-w-[12rem] text-sm font-bold">
        {jeChyba ? (
          <>
            Nepodařilo se načíst všechna data.
            <div className="text-xs font-semibold mt-0.5">{chyba}</div>
            <div className="text-xs font-semibold mt-0.5">
              Čísla níž (pokud nějaká jsou) jsou z posledního úspěšného načtení. Zkouším to znovu.
            </div>
          </>
        ) : (
          <>
            Server neodpověděl včas — čísla jsou z paměti telefonu a nemusí být aktuální.
            <div className="text-xs font-semibold mt-0.5">Zkouším to znovu, jakmile bude signál.</div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => void zkusit()}
        disabled={bezi}
        className={`btn-sm ${jeChyba ? 'btn-danger' : 'btn-ghost'}`}
      >
        <RefreshCw size={14} className={bezi ? 'animate-spin' : ''} aria-hidden />
        {bezi ? 'Načítám…' : 'Načíst znovu'}
      </button>
    </div>
  );
}
