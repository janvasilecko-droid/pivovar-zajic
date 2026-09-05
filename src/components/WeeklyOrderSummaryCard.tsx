import { useMemo, useState } from 'react';
import { Beer, beerBg, beerBorder, beerInk, beerText, formatPackageLabel, Package, pkgBg, pkgText } from '../lib/supabase';
import { AlertCircle, Beer as BeerIcon, Calendar, CheckCircle2, ChevronLeft, ChevronRight, Hourglass, LayoutGrid, ListFilter, Package as PackageIcon } from 'lucide-react';

export type WeeklyOrderItem = {
  beerKey: string;
  beerName: string;
  volume: number;
  packageLabel: string;
  ordered: number;
  remaining: number;
  stock: number; // Počet kusů na skladě
  beerId: string; // Added for filtering
  packageId: string; // Added for filtering
};

export function isoWeekKey(dateStr: string): string {
  const dt = new Date(dateStr + 'T00:00:00Z');
  const thu = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate() + 3 - ((dt.getUTCDay() + 6) % 7)));
  const ys = new Date(Date.UTC(thu.getUTCFullYear(), 0, 1));
  const wk = 1 + Math.round(((thu.getTime() - ys.getTime()) / 86400000 - 3 + ((ys.getUTCDay() + 6) % 7)) / 7);
  return `${thu.getUTCFullYear()}-${String(wk).padStart(2, '0')}`;
}

export function weekRange(wk: string): { start: Date; end: Date; label: string } {
  const [y, w] = wk.split('-').map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4));
  const j4d = (j4.getUTCDay() + 6) % 7;
  const ws = new Date(j4); ws.setUTCDate(j4.getUTCDate() - j4d + (w - 1) * 7);
  const we = new Date(ws); we.setUTCDate(ws.getUTCDate() + 6);
  const f = (d: Date) => d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
  return { start: ws, end: we, label: `${f(ws)} – ${f(we)}` };
}

export function shiftWeek(wk: string, d: number): string { 
  const [y, w] = wk.split('-').map(Number);
  const j4 = new Date(Date.UTC(y, 0, 4));
  const j4d = (j4.getUTCDay() + 6) % 7;
  const ws = new Date(j4); ws.setUTCDate(j4.getUTCDate() - j4d + (w - 1) * 7);
  ws.setUTCDate(ws.getUTCDate() + d * 7);
  return isoWeekKey(ws.toISOString().slice(0, 10));
}

type Props = {
  title?: string;
  subtitle?: string;
  items: WeeklyOrderItem[];
  beers: Beer[];
  weekKey: string;
  onWeekChange: (newWeekKey: string) => void;
  weekLabel: string;
  onItemClick?: (beerId: string, packageId: string) => void;
  onSummaryFilterClick?: (filter: 'all' | 'remaining' | 'done') => void;
};

export function WeeklyOrderSummaryCard({
  title = 'Objednané množství na týden',
  subtitle = 'Součet kusů z objednávek (bez storna) v daném týdnu a stav k dokončení',
  items,
  beers,
  weekKey,
  onWeekChange,
  weekLabel,
  onItemClick,
  onSummaryFilterClick,
}: Props) {
  const [filterMode, setFilterMode] = useState<'all' | 'remaining'>('all');
  const [selectedVolume, setSelectedVolume] = useState<number | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');

  const totalOrdered = useMemo(() => items.reduce((s, i) => s + i.ordered, 0), [items]);
  const totalRemaining = useMemo(() => items.reduce((s, i) => s + i.remaining, 0), [items]);

  // Všechny dostupné velikosti pro záložky filtru
  const availableVolumes = useMemo(() => {
    const vols = [...new Set(items.map((i) => i.volume))].sort((a, b) => b - a);
    return vols;
  }, [items]);

  const remainingBySize = useMemo(() => {
    const m = new Map<number, number>();
    items.forEach((i) => {
      if (i.remaining > 0) {
        m.set(i.volume, (m.get(i.volume) ?? 0) + i.remaining);
      }
    });
    return [...m.entries()]
      .map(([volume, remaining]) => ({ volume, remaining }))
      .sort((a, b) => b.volume - a.volume);
  }, [items]);

  const displayedItems = useMemo(() => {
    let result = items;
    if (filterMode === 'remaining') result = result.filter((i) => i.remaining > 0);
    if (selectedVolume !== 'all') result = result.filter((i) => i.volume === selectedVolume);
    return result;
  }, [items, filterMode, selectedVolume]);

  const weekNum = weekKey.split('-')[1];
  const yearNum = weekKey.split('-')[0];

  return (
    <div className="card p-5 mb-6 shadow-md border-amber-200/90 bg-gradient-to-br from-amber-500/10 via-amber-100/30 to-white text-neutral-900 rounded">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-amber-200/80">
        <div>
          <h3 className="font-display font-black text-xl text-amber-950 flex items-center gap-2.5">
            <span className="p-2 rounded bg-amber-500 text-neutral-950 shadow-md text-lg"><BeerIcon className="ikona-text" /></span>
            <span>{title}</span>
          </h3>
          <p className="text-xs text-amber-900/80 mt-1 font-bold">{subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-amber-300/80 rounded p-1 shadow-xs">
            <button
              onClick={() => onWeekChange(shiftWeek(weekKey, -1))}
              className="p-1.5 hover:bg-amber-100 rounded text-amber-900 transition tap"
              title="Předchozí týden"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="px-4 py-1 text-center min-w-[140px]">
              <div className="font-display font-extrabold text-sm text-neutral-900 flex items-center justify-center gap-1.5">
                <Calendar size={14} className="text-amber-600" />
                <span>Týden {weekNum} / {yearNum}</span>
              </div>
              <div className="text-[11px] text-amber-800 font-extrabold">{weekLabel}</div>
            </div>
            <button
              onClick={() => onWeekChange(shiftWeek(weekKey, 1))}
              className="p-1.5 hover:bg-amber-100 rounded text-amber-900 transition tap"
              title="Následující týden"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <button
            onClick={() => onWeekChange(isoWeekKey(new Date().toISOString().slice(0,10)))}
            className="px-3.5 py-2 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs transition shadow-md shadow-amber-500/20"
            > 
            Aktuální týden
          </button>
        </div>
      </div>

      {/* KPI Top Cards & Remaining Chips */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 my-4">
        <button
          onClick={() => onSummaryFilterClick?.('all')}
          className={`p-4 rounded bg-white border border-amber-200/80 shadow-xs flex items-center justify-between text-left transition-all ${onSummaryFilterClick ? 'hover:scale-105 hover:ring-2 hover:ring-amber-400' : ''}`}
        >
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-neutral-500">Objednáno celkem</div>
            <div className="text-2xl font-display font-extrabold text-neutral-900 mt-0.5">{totalOrdered} <span className="text-xs text-neutral-500 font-normal">ks</span></div>
          </div>
          <div className="w-10 h-10 rounded bg-amber-100 text-amber-800 flex items-center justify-center text-lg font-bold">
            <PackageIcon className="ikona-text" />
          </div>
        </button>

        <button
          onClick={() => onSummaryFilterClick?.('remaining')}
          className={`p-4 rounded bg-rose-50 border border-rose-200 shadow-xs flex items-center justify-between text-left transition-all ${onSummaryFilterClick ? 'hover:scale-105 hover:ring-2 hover:ring-rose-400' : ''}`}
        >
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-rose-700">Zbývá stočit / připravit</div>
            <div className="text-2xl font-display font-extrabold text-rose-900 mt-0.5">{totalRemaining} <span className="text-xs text-rose-700 font-normal">ks</span></div>
          </div>
          <div className="w-10 h-10 rounded bg-rose-200 text-rose-900 flex items-center justify-center text-lg font-bold">
            <Hourglass className="ikona-text" />
          </div>
        </button>

        <button
          onClick={() => onSummaryFilterClick?.('done')}
          className={`p-4 rounded bg-emerald-50 border border-emerald-200 shadow-xs flex items-center justify-between text-left transition-all ${onSummaryFilterClick ? 'hover:scale-105 hover:ring-2 hover:ring-emerald-400' : ''}`}
        >
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-emerald-700">Dokončeno stočení</div>
            <div className="text-2xl font-display font-extrabold text-emerald-900 mt-0.5">
              {totalOrdered > 0 ? Math.round(((totalOrdered - totalRemaining) / totalOrdered) * 100) : 100}%
            </div>
          </div>
          <div className="w-10 h-10 rounded bg-emerald-200 text-emerald-900 flex items-center justify-center text-lg font-bold">
            <CheckCircle2 className="ikona-text" />
          </div>
        </button>
      </div>

      {/* Remaining Sizes Highlight Bar */}
      {remainingBySize.length > 0 ? (
        <div className="p-4 rounded bg-rose-50 border-2 border-rose-200 my-3 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <AlertCircle size={18} />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-rose-950">Celkem zbývá ke stočení v týdnu</div>
              <div className="text-[11px] text-rose-800 font-medium">Součet chybějících kusů podle velikostí obalu</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {remainingBySize.map((s) => (
              <button
                key={s.volume}
                onClick={() => setSelectedVolume(selectedVolume === s.volume ? 'all' : s.volume)}
                className={`tap px-3.5 py-1.5 rounded font-extrabold text-xs transition-all shadow-xs flex items-center gap-1.5 ${
                  selectedVolume === s.volume
                    ? 'bg-amber-500 text-neutral-950 ring-2 ring-amber-400 scale-105 font-black'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                <span className="font-mono text-white">{formatPackageLabel(`${s.volume} L`)}:</span>
                <span className="font-black">{s.remaining} ks</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="p-3 rounded bg-emerald-100 border border-emerald-300 my-3 text-center text-emerald-900 text-xs font-extrabold flex items-center justify-center gap-2">
          <CheckCircle2 size={16} />
          <span>Všechna piva pro tento týden jsou 100% stočena a připravena!</span>
        </div>
      )}

      {/* Filter Tabs & View Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 my-4 pt-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => { setFilterMode('all'); setSelectedVolume('all'); }}
            className={`tap px-3 py-1.5 rounded text-xs font-extrabold transition ${
              filterMode === 'all' && selectedVolume === 'all'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Vše položky ({items.length})
          </button>

          <button
            onClick={() => setFilterMode('remaining')}
            className={`tap px-3 py-1.5 rounded text-xs font-extrabold transition ${
              filterMode === 'remaining' && selectedVolume === 'all'
                ? 'bg-amber-500 text-neutral-950 shadow-sm'
                : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
            }`}
          >
            Jen zbývající ({items.filter((i) => i.remaining > 0).length})
          </button>

          {availableVolumes.length > 1 && (
            <div className="h-4 w-px bg-neutral-300 mx-1 hidden sm:block" />
          )}

          {availableVolumes.map((vol) => (
            <button
              key={vol}
              onClick={() => setSelectedVolume(selectedVolume === vol ? 'all' : vol)}
              className={`tap px-3 py-1 rounded text-xs font-bold transition ${
                selectedVolume === vol
                  ? 'bg-amber-500 text-neutral-950 font-black shadow-xs'
                  : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'
              }`}
            >
              Velikost {vol} L
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-white p-1 rounded border border-neutral-200 shadow-xs">
          <button
            onClick={() => setViewMode('grid')}
            className={`tap p-1.5 rounded text-xs font-bold transition ${viewMode === 'grid' ? 'bg-amber-500 text-neutral-950 shadow-xs' : 'bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100'}`}
            title="Karty / Mřížka"
          >
            <LayoutGrid size={15} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`tap p-1.5 rounded text-xs font-bold transition ${viewMode === 'table' ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-400 hover:text-neutral-700'}`}
            title="Tabulka"
          >
            <ListFilter size={15} />
          </button>
        </div>
      </div>

      {/* Table View */}
      {displayedItems.length > 0 ? (
        <div className="overflow-hidden rounded border border-neutral-200 shadow-md">
          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
                <thead>
                  <tr className="bg-neutral-900 text-amber-300 uppercase tracking-wider text-[11px] font-black border-b border-neutral-800">
                    <th className="py-3 px-4 text-left">Pivo</th>
                    <th className="py-3 px-4 text-center">Velikost</th>
                    <th className="py-3 px-4 text-right">Sklad (ks)</th>
                    <th className="py-3 px-4 text-right">Objednáno (ks)</th>
                    <th className="py-3 px-4 text-center">Stav</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/60">
                  {displayedItems.map((r, idx) => {
                    const done = r.remaining <= 0;
                    const rowBeerObj = beers.find((b) => b.id === r.beerKey) ?? beers.find((b) => b.name === r.beerName);
                    const progressPct = r.ordered > 0 ? Math.min(100, Math.round(((r.ordered - r.remaining) / r.ordered) * 100)) : 100;
                    const bgColor = beerBg(rowBeerObj) || '#fef3c7';
                    const txtColor = beerText(rowBeerObj) || 'text-neutral-900';

                    return (
                      <tr
                        key={`${r.beerKey}|${r.volume}|${idx}`}
                        className={`plocha-z-dat plocha-z-dat-tlumena transition-colors hover:brightness-95 ${onItemClick ? 'cursor-pointer' : ''}`}
                        style={{ backgroundColor: bgColor, ['--ink-plochy' as any]: beerInk(rowBeerObj) }}
                        onClick={() => onItemClick?.(r.beerId, r.packageId)}
                      >
                        <td className="py-3.5 px-4 font-black">
                          <div className="flex items-center gap-2.5">
                            <span className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs border border-black/20" style={{ backgroundColor: '#d97706' }} />
                            <span className={`text-sm font-black ${txtColor}`}>{r.beerName}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className="px-3 py-1 rounded bg-neutral-900 text-amber-300 font-mono font-black text-xs shadow-xs">
                            {formatPackageLabel(r.packageLabel) || `${r.volume} L`}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-neutral-900 text-sm">{r.stock} ks</td>
                        <td className="py-3.5 px-4 text-right font-mono font-black text-neutral-900 text-sm">{r.ordered} ks</td>
                        <td className="py-3.5 px-4 text-center">
                          {done ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700 text-white text-xs font-black shadow-xs">
                              <CheckCircle2 size={14} /> Hotovo (100%)
                            </span>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-20 bg-neutral-900/20 h-2.5 rounded-full overflow-hidden border border-black/10">
                                <div className="bg-amber-600 h-full rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                              </div>
                              <span className="text-xs font-mono text-neutral-900 font-black">{progressPct}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
        <div className="py-10 text-center bg-white/5 rounded border border-white/10 text-neutral-500 text-sm font-medium">
          Žádné položky neodpovídají zvolenému filtru.
        </div>
      )}
    </div>
  );
}
