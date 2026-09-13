// 🧮 Souhrn objednaného množství podle varianty — část obrazovky Objednávky.

import { ArrowRight, Calculator } from 'lucide-react';
import { Beer, Package, beerBg, beerName, formatPackageLabel, pkgBg } from '../../lib/supabase';
import { EmptyState } from '../ui';

import type {  } from '../../lib/stockLedger';

import { type VariantTotalsResult } from '../../lib/variantTotals';

import type {  } from '../../lib/tankUZapisu';

// 🧮 Záložka „Celkem“ — souhrn objednaného množství podle varianty (pivo + obal)
// v aktuálně zvoleném rozsahu (týden / měsíc / vše). Kliknutí na variantu otevře
// Přehled objednávek filtrovaný na přesně dané pivo + obal.
export function VariantTotalsPanel({ totals, beers, packages, timeScope, onPick }: {
  totals: VariantTotalsResult;
  beers: Beer[];
  packages: Package[];
  timeScope: 'week' | 'month' | 'all';
  onPick: (beerId: string, packageId: string) => void;
}) {
  if (!totals.totalKs) {
    return <EmptyState text="Žádné objednávky v tomto rozsahu — zatím není co sčítat." icon={Calculator} />;
  }
  const scopeLabel = timeScope === 'week' ? 'tento týden' : timeScope === 'month' ? 'celý měsíc' : 'všechny objednávky';
  const sorted = [...totals.totals].sort((a, b) => {
    const pkgA = packages.find((p) => p.id === a.packageId);
    const pkgB = packages.find((p) => p.id === b.packageId);
    const kindA = pkgA?.kind === 'keg' ? 0 : 1;
    const kindB = pkgB?.kind === 'keg' ? 0 : 1;
    if (kindA !== kindB) return kindA - kindB;
    const la = formatPackageLabel(pkgA?.label) || a.packageId;
    const lb = formatPackageLabel(pkgB?.label) || b.packageId;
    if (la !== lb) return la.localeCompare(lb, 'cs');
    return beerName(beers.find((x) => x.id === a.beerId)).localeCompare(beerName(beers.find((x) => x.id === b.beerId)), 'cs');
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-neutral-200 p-3 shadow-2xs">
        <div className="flex items-start gap-2">
          <span className="text-lg leading-none mt-0.5"><Calculator className="ikona-text" /></span>
          <div>
            <div className="text-sm font-display font-black text-amber-800">Souhrn objednaného množství podle varianty</div>
            <div className="text-udaj font-bold text-neutral-500">
              Rozsah: {scopeLabel} · kliknutí na variantu zobrazí objednávky jen s daným pivem v daném obalu
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="chip bg-amber-500 text-neutral-950 font-black">{totals.totalKs} ks celkem</span>
          <span className="chip bg-white border border-neutral-300 text-neutral-700 font-black">{totals.totalOrders} obj.</span>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((t) => {
          const beer = beers.find((b) => b.id === t.beerId);
          const pkg = packages.find((p) => p.id === t.packageId);
          const ordersTxt = t.orderCount === 1 ? 'objednávka' : t.orderCount < 5 ? 'objednávky' : 'objednávek';
          return (
            <button
              key={`${t.beerId}|${t.packageId}`}
              type="button"
              onClick={() => onPick(t.beerId, t.packageId)}
              title={`Zobrazit objednávky: ${beerName(beer)} v obalu ${formatPackageLabel(pkg?.label) || '?'}`}
              className="group text-left bg-white rounded border-2 border-neutral-200 hover:border-amber-400 hover:ring-2 hover:ring-amber-300 hover:shadow-md transition-all p-3 flex flex-col gap-1.5 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="font-display font-black text-sm text-neutral-800 truncate flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full shrink-0 border border-black/10" style={{ backgroundColor: beerBg(beer) }} />
                  {beerName(beer)}
                </span>
                <span className="font-black text-xl text-amber-700 shrink-0">
                  {t.qty} <span className="text-udaj font-bold text-neutral-500">ks</span>
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 min-w-0">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-neutral-600 truncate">
                  <span className="inline-block w-6 h-3.5 rounded-sm shrink-0 border border-black/10" style={{ backgroundColor: pkgBg(pkg) }} />
                  {formatPackageLabel(pkg?.label) || t.packageId}
                </span>
                <span className="text-udaj font-bold text-neutral-400 shrink-0 flex items-center gap-1">
                  {t.orderCount} {ordersTxt}
                  <ArrowRight size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

