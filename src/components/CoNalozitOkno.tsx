// 🚚 „Rozvoz — co naložit" nahoře na ploše, stejně jako okno „Co stočit".
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „ten rozvoz udělej tak jako co stočit — když nic
// není, je prázdný k rozkliknutí, když ne, tak se zobrazí, co je k závozu na
// další den."
//
// Výpočet je v lib/nalozitNaZavoz.ts (nejbližší den závozu po dnešku, pivo ×
// obal × kusy). Když je co naložit, okno je otevřené; když ne, je sbalené na
// jeden řádek a dá se rozkliknout. Ruční sbalení/rozbalení platí do dalšího
// otevření plochy.
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { beerBg, beerText } from '../lib/supabase';
import { kusy } from '../lib/cisla';
import type { NalozitNaZavoz } from '../lib/nalozitNaZavoz';

export function CoNalozitOkno({ nalozit, barvyPiv, onOtevrit }: {
  nalozit: NalozitNaZavoz | null;
  /** Barva piva podle jména (malými písmeny) — z nastavení piv. */
  barvyPiv: Map<string, string | null>;
  onOtevrit: () => void;
}) {
  const [rucne, setRucne] = useState<boolean | null>(null);
  const otevreno = rucne ?? !!nalozit;
  const den = nalozit
    ? new Date(nalozit.datum + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric' })
    : '';

  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={() => setRucne(!otevreno)}
        aria-expanded={otevreno}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="font-display font-black text-neutral-950 truncate">
          {nalozit ? `Rozvoz — naložit na ${den}` : 'Rozvoz — nic k závozu'}
        </span>
        <span className="flex items-center gap-1.5 shrink-0 text-neutral-700">
          {nalozit && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-neutral-950 font-black text-xs tabular-nums">
              {kusy(nalozit.kusuCelkem)}
            </span>
          )}
          {otevreno ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </span>
      </button>

      {otevreno && (
        <div className="px-3 pb-3 space-y-2">
          {nalozit ? (
            <>
              <div className="grid grid-cols-2 gap-1">
                {nalozit.polozky.map((p) => {
                  // Pivo v barvě z nastavení piv — rozdíl mezi pivy je vidět
                  // na první pohled.
                  const pivo = { beer_color: barvyPiv.get(p.pivo.trim().toLowerCase()) ?? null };
                  const pismo = beerText(pivo);
                  return (
                    <div
                      key={`${p.pivo}__${p.obal}`}
                      className={`flex items-baseline gap-1 text-xs font-bold leading-snug min-w-0 rounded px-1.5 py-1 ${pismo}`}
                      style={{ backgroundColor: beerBg(pivo) }}
                    >
                      <span className="truncate">{p.pivo}</span>
                      <span className="opacity-80 truncate">{p.obal}</span>
                      <span className="ml-auto shrink-0 tabular-nums">× {p.kusu}</span>
                    </div>
                  );
                })}
              </div>
              <div className="text-udaj font-bold text-neutral-600 truncate">
                {nalozit.objednavek} obj. · {nalozit.mista.join(', ')}
              </div>
            </>
          ) : (
            <div className="text-sm font-bold text-neutral-600">Na příštích 7 dní zatím nic k závozu.</div>
          )}
          <button type="button" className="btn-ghost !rounded text-xs" onClick={onOtevrit}>
            Otevřít Rozvoz
          </button>
        </div>
      )}
    </section>
  );
}
