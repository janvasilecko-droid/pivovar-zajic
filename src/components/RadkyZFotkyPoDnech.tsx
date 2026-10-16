// 📅 Řádky z fotky po dnech — seznam ve Stáčení KEG a ve Fasování / Prodejně / Odpisu.
// ---------------------------------------------------------------------------
// Majitel 16. 10. 2026: „udělej to pro všechno." Fotka tabulky z Excelu má víc
// dnů a každý řádek patří na svůj den. Formulář má jedno datum a dlaždice, které
// by dva dny téhož piva a obalu slily do jedné, proto se řádky z víc dnů drží
// tady: vidět po dnech, jde je opravit (počet) nebo odstranit, a uloží se
// společně s formulářem jeho tlačítkem (lib/zapisPoDnech.ts).
import { CalendarDays, Trash2 } from 'lucide-react';
import { datumCesky } from '../../supabase/functions/_shared/tabulka-staceni';
import { seskupPoDnech, souhrnDnu, type RadekSDnem } from '../lib/zapisPoDnech';

type Props<R extends RadekSDnem & { qty: string }> = {
  radky: R[];
  /** Co je řádek zač, např. „10° Desítka · 30l". */
  popisek: (r: R) => string;
  onKusy: (index: number, qty: string) => void;
  onOdeber: (index: number) => void;
  onZahodit: () => void;
  /** Věta pod seznamem: kdy a čím se řádky uloží. */
  napoveda: string;
};

export default function RadkyZFotkyPoDnech<R extends RadekSDnem & { qty: string }>({ radky, popisek, onKusy, onOdeber, onZahodit, napoveda }: Props<R>) {
  const dny = seskupPoDnech(radky);
  if (dny.length === 0) return null;
  const pocet = dny.reduce((soucet, d) => soucet + d.radky.length, 0);
  return (
    <section className="card !bg-amber-50/60 border border-amber-200 p-4 space-y-3" data-testid="radky-z-fotky-po-dnech" aria-label="Řádky z fotky po dnech">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black text-amber-900">
          <CalendarDays className="ikona-text" /> Řádky z fotky po dnech — {souhrnDnu(pocet, dny.length)}
        </h3>
        <button type="button" className="btn-ghost !rounded text-xs" onClick={onZahodit}>Zahodit řádky z fotky</button>
      </div>

      {dny.map((den) => (
        <div key={den.den} data-testid={`den-${den.den}`} className="space-y-1.5">
          <div className="text-xs font-black uppercase tracking-wide text-amber-900">{datumCesky(den.den)}</div>
          <ul className="space-y-1.5">
            {den.radky.map(({ radek, index }) => {
              const kusu = Number(radek.qty) || 0;
              const nazev = `${popisek(radek)}, ${datumCesky(den.den)}`;
              return (
                <li key={index} className={`flex items-center justify-between gap-2 bg-white border border-neutral-200 px-2.5 py-1.5 ${kusu > 0 ? '' : 'opacity-50'}`}>
                  <span className="text-xs font-bold text-neutral-800 truncate">{popisek(radek)}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button type="button" className="btn-pocet disabled:opacity-30" title="Ubrat kus" disabled={kusu <= 0} onClick={() => onKusy(index, String(Math.max(0, kusu - 1)))}>−</button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={radek.qty}
                      placeholder="0"
                      aria-label={`Počet kusů — ${nazev}`}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => onKusy(index, e.target.value.replace(/[^0-9]/g, ''))}
                      className="w-14 h-10 text-center text-base font-black text-neutral-800 bg-white border-2 border-amber-200 rounded"
                    />
                    <button type="button" className="btn-pocet" title="Přidat kus" onClick={() => onKusy(index, String(kusu + 1))}>+</button>
                    <button
                      type="button"
                      className="btn-ikona bg-rose-100 hover:bg-rose-200 text-rose-700"
                      title="Odstranit řádek"
                      aria-label={`Odstranit řádek — ${nazev}`}
                      onClick={() => onOdeber(index)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="text-udaj text-neutral-600">{napoveda}</p>
    </section>
  );
}
