import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import type { CellarTankCycle } from '../lib/supabase';
import { ztratyPodle, TREND_CYKLU } from '../lib/ztratyTanku';
import { EmptyState } from './ui';

/** Nad kolik procent se ztráta barví jako vysoká (stejně jako na kartě tanku). */
const VYSOKA_ZTRATA_PCT = 3;

/**
 * 📉 Ztráty při stáčení po pivech a po tancích (lib/ztratyTanku.ts).
 * Počítá z cyklů, které má Sklep načtené (posledních 200).
 */
export function ZtratyTankuPrehled({ cycles }: { cycles: CellarTankCycle[] }) {
  const [podle, setPodle] = useState<'pivo' | 'tank'>('pivo');
  const skupiny = useMemo(() => ztratyPodle(cycles, podle), [cycles, podle]);

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-700">
          Vážený průměr ztrát ze všech ukončených cyklů. Šipka porovnává posledních {TREND_CYKLU} cykly se staršími.
        </p>
        <div className="flex gap-1.5" role="group" aria-label="Seskupit ztráty">
          {(['pivo', 'tank'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={podle === v}
              className={podle === v ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setPodle(v)}
            >
              {v === 'pivo' ? 'Po pivech' : 'Po tancích'}
            </button>
          ))}
        </div>
      </div>

      {skupiny.length === 0 ? (
        <EmptyState text="Zatím není žádný ukončený cyklus tanku s počátečním objemem." />
      ) : (
        <div className="overflow-x-auto roluje-vodorovne">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-neutral-600">
                <th scope="col" className="py-2 pr-3">{podle === 'pivo' ? 'Pivo' : 'Tank'}</th>
                <th scope="col" className="py-2 px-2 text-right">Cyklů</th>
                <th scope="col" className="py-2 px-2 text-right">Ztraceno</th>
                <th scope="col" className="py-2 px-2 text-right">Ztráta</th>
                <th scope="col" className="py-2 pl-2 text-right">Vývoj</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {skupiny.map((s) => {
                const horsi = s.poslednichPct != null && s.predtimPct != null && s.poslednichPct > s.predtimPct;
                const lepsi = s.poslednichPct != null && s.predtimPct != null && s.poslednichPct < s.predtimPct;
                return (
                  <tr key={s.klic}>
                    <td className="py-2 pr-3 font-bold text-neutral-900">{s.nazev}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{s.cyklu}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{(s.ztrataL / 100).toFixed(1)} hl</td>
                    <td className={`py-2 px-2 text-right tabular-nums font-black ${s.ztrataPct > VYSOKA_ZTRATA_PCT ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {s.ztrataPct.toFixed(1)} %
                    </td>
                    <td className="py-2 pl-2 text-right text-xs whitespace-nowrap">
                      {s.poslednichPct == null ? (
                        <span className="text-neutral-500">málo cyklů</span>
                      ) : (
                        <span className={horsi ? 'text-rose-700 font-bold' : lepsi ? 'text-emerald-700 font-bold' : 'text-neutral-600'}>
                          {horsi && <TrendingUp size={14} className="inline -mt-0.5 mr-1" aria-hidden />}
                          {lepsi && <TrendingDown size={14} className="inline -mt-0.5 mr-1" aria-hidden />}
                          {s.predtimPct?.toFixed(1)} → {s.poslednichPct.toFixed(1)} %
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
