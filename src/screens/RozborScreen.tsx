// 🔎 Rozbor — objednané položky tohoto týdne a proklik do historie pohybů.
// ---------------------------------------------------------------------------
// Z provozu 30. 9. 2026: „ať je to rozbor všech položek, když na to kliknu,
// ať se jednoduše prokliknu k historii (stočeno, objednáno…), nejčastěji
// týden" a „udělej to jako dlaždici — kliknu na to, jen když budu potřebovat
// vidět pohyb". Dlaždice na ploše vede sem; klepnutí na položku otevře
// Sklad → Pohyby předvybrané na to pivo a obal za aktuální týden.
import { Check, ChevronRight } from 'lucide-react';
import { beerBg, beerName } from '../lib/supabase';
import { businessDateISO } from '../lib/businessDate';
import { isoWeekKey } from '../components/WeeklyOrderSummaryCard';
import { usePlanStaceni } from '../lib/usePlanStaceni';
import { mergeWeekPlan } from '../lib/keggingPlan';
import { predvyberPohyby } from '../lib/pohybyPredvyber';
import { Spinner, EmptyState } from '../components/ui';
import type { Page } from '../components/Layout';

function kratkyObal(label: string): string {
  const m = label.match(/\d+(?:[,.]\d+)?\s*l\b/i);
  return m ? m[0].replace(/\s+/g, '') : label;
}

export default function RozborScreen({ setPage }: { setPage: (p: Page) => void }) {
  const weekKey = isoWeekKey(businessDateISO());
  const { data, chyba, planySudy, planyLahve } = usePlanStaceni(weekKey);
  if (chyba && !data) return <EmptyState varianta="chyba" text="Rozbor se nepodařilo načíst." />;
  if (!data) return <Spinner />;
  const pivoPodleId = new Map(data.beers.map((b) => [b.id, b]));
  const polozky = [
    ...mergeWeekPlan(planySudy, 'týden').items,
    ...mergeWeekPlan(planyLahve, 'týden').items,
  ].filter((it) => it.ordered > 0);

  return (
    <div className="space-y-3 pb-12">
      <p className="text-sm font-bold text-neutral-700">
        Objednáno tento týden. Klepni na položku — otevře se historie pohybů (stočeno, závozy…).
      </p>
      {polozky.length === 0 ? (
        <EmptyState text="Tento týden nic objednaného." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {polozky.map((it) => {
            const pivo = pivoPodleId.get(it.beer_id);
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => { predvyberPohyby(it.beer_id, it.package_id); setPage('stock_pohyby'); }}
                className="w-full min-h-[48px] flex items-center justify-between gap-2 rounded border border-neutral-200 bg-white hover:bg-amber-50 px-3 py-2 text-left text-sm font-bold text-neutral-950 shadow-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-3 h-3 rounded-full shrink-0 border border-neutral-300" style={{ background: beerBg(pivo) }} />
                  <span className="truncate font-black">{pivo ? beerName(pivo) : it.beer_name} {kratkyObal(it.package_label)}</span>
                </span>
                <span className="shrink-0 tabular-nums text-xs">
                  obj. {it.ordered}
                  {it.missing > 0 ? <span className="font-black text-amber-800"> · stočit {it.missing}</span> : <span className="text-emerald-700"> · <Check size={12} className="inline" /></span>}
                  {(it.dluh ?? 0) > 0 && <span className="font-black text-rose-700"> (−{it.dluh} sklad)</span>}
                  <ChevronRight size={14} className="inline ml-1" />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
