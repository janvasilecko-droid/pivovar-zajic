// 🔍 „Proč je tam tohle číslo" — rozpad jednoho skladového stavu na pohyby.
// ---------------------------------------------------------------------------
// Skladová kniha (lib/stockLedger.ts) rozpad umí odjakživa, ale nikde nešel
// otevřít. Když se pak číslo nezdálo, dohledávalo se to ručně po obrazovkách
// a klidně hodinu. Takhle je to na tři klepnutí: poslední inventura, každý
// pohyb po ní a průběžný součet, ze kterého je vidět, kde se stav zlomil.
import { useMemo } from 'react';
import { X } from 'lucide-react';
import { MOVEMENT_LABELS, movementsFor, type Movement, type MovementKind } from '../lib/stockLedger';
import { useChovaniDialogu } from '../lib/zavriNaZpet';

type Props = {
  open: boolean;
  onClose: () => void;
  movements: Movement[];
  beerId: string;
  packageId: string;
  nazev: string;
  /** Stav ke kterému dni se ukazuje (konec zvoleného měsíce nebo dnešek). */
  kDatu: string;
  /** Datum poslední inventury a stav podle ní — začátek řady. */
  baselineDate: string | null;
  baselineQty: number;
  vysledek: number;
};

const ZNAMENKO: Partial<Record<MovementKind, 'prijem' | 'vydej'>> = {
  staceni: 'prijem', kegovani: 'prijem', prefuk_do: 'prijem',
  fasovani: 'vydej', prodejna: 'vydej', odpis: 'vydej', zavoz: 'vydej',
  akce: 'vydej', prefuk_z: 'vydej', sud_na_lahve: 'vydej',
};

function den(iso: string) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
}

export default function PohybyModal({
  open, onClose, movements, beerId, packageId, nazev, kDatu, baselineDate, baselineQty, vysledek,
}: Props) {
  // Jen pohyby, které do stavu opravdu vstupují — tedy od poslední inventury.
  // Starší už do výsledku nepatří a v seznamu by jen mátly.
  const radky = useMemo(() => {
    if (!open) return [];
    const od = baselineDate ?? undefined;
    const vse = movementsFor(movements, beerId, packageId, od, kDatu)
      .filter((m) => m.kind !== 'inventura')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let soucet = baselineQty;
    return vse.map((m, i) => {
      soucet += m.qty;
      return { klic: `${m.date}-${m.kind}-${i}`, m, soucet };
    });
  }, [open, movements, beerId, packageId, kDatu, baselineDate, baselineQty]);

  // Zpět zavře dialog místo odchodu z obrazovky — viz lib/zavriNaZpet.ts.
  useChovaniDialogu(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-potvrzeni bg-neutral-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="p-4 border-b border-neutral-200 flex items-start gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="font-display font-extrabold text-base text-neutral-900 truncate">{nazev}</h2>
            <p className="text-xs text-neutral-500 font-semibold mt-0.5">
              Odkud se vzalo číslo {vysledek} — stav ke dni {den(kDatu)}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Zavřít"
            className="shrink-0 w-11 h-11 grid place-items-center rounded-xl text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-neutral-100 px-3 py-2.5">
            <div className="min-w-0">
              <div className="font-black text-sm text-neutral-900">
                {baselineDate ? 'Inventura' : 'Bez inventury — počítá se od nuly'}
              </div>
              {baselineDate && (
                <div className="text-xs text-neutral-500 font-semibold">{den(baselineDate)} — od té doby se počítá</div>
              )}
            </div>
            <div className="font-black tabular-nums text-lg text-neutral-900 shrink-0">{baselineQty}</div>
          </div>

          {radky.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500 font-semibold">
              Od inventury žádný pohyb — stav je pořád ten napočítaný.
            </p>
          ) : (
            radky.map(({ klic, m, soucet }) => {
              const smer = ZNAMENKO[m.kind];
              return (
                <div key={klic} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200/80 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-neutral-800 truncate">{MOVEMENT_LABELS[m.kind]}</div>
                    <div className="text-xs text-neutral-500 font-semibold">
                      {den(m.date)}
                      {m.note ? ` · ${m.note}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span
                      className={`font-black tabular-nums text-sm ${
                        smer === 'prijem' ? 'text-emerald-600' : smer === 'vydej' ? 'text-rose-600' : 'text-neutral-600'
                      }`}
                    >
                      {m.qty > 0 ? `+${m.qty}` : m.qty}
                    </span>
                    {/* Průběžný součet — je z něj vidět, kdy stav spadl pod nulu. */}
                    <span className={`w-10 text-right font-bold tabular-nums text-sm ${soucet < 0 ? 'text-rose-600' : 'text-neutral-400'}`}>
                      {soucet}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t border-neutral-200 flex items-center justify-between shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <span className="font-black text-sm uppercase tracking-wider text-neutral-500">Výsledný stav</span>
          <span className={`font-display font-extrabold text-2xl tabular-nums ${vysledek < 0 ? 'text-rose-600' : 'text-neutral-900'}`}>
            {vysledek}
          </span>
        </div>
      </div>
    </div>
  );
}
