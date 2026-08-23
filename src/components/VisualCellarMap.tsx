import React, { useState } from 'react';
import { CellarTank, Beer, beerBg, beerBorder, beerText } from '../lib/supabase';
import { Cylinder, Sparkles, Thermometer, Calendar, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

type VisualCellarMapProps = {
  tanks: CellarTank[];
  beers: Beer[];
  onSelectTank?: (tank: CellarTank) => void;
};

const STATUS_ICONS: Record<string, string> = {
  active: '🟢 Leží',
  filling: '🟡 Plní se',
  emptying: '🛢️ Stáčí se',
  empty: '⚪ Prázdný',
  sanitizing: '💧 Po H2O',
  rinsing: '🧼 Oplach',
  cleaning: '🧪 Po Louhu',
};

export function VisualCellarMap({ tanks, beers, onSelectTank }: VisualCellarMapProps) {
  const [filter, setFilter] = useState<'all' | 'spilka' | 'lezak'>('all');

  const filteredTanks = tanks.filter((t) => {
    const isSpilka = t.label.toLowerCase().includes('spilka');
    if (filter === 'spilka') return isSpilka;
    if (filter === 'lezak') return !isSpilka;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Horní filtr a legenda */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded border border-neutral-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3.5 py-1.5 rounded text-xs font-black transition ${
              filter === 'all' ? 'bg-white text-neutral-900 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-amber-50'
            }`}
          >
            Všechny tanky ({tanks.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('spilka')}
            className={`px-3.5 py-1.5 rounded text-xs font-black transition ${
              filter === 'spilka' ? 'bg-white text-neutral-900 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-amber-50'
            }`}
          >
            🏭 Spilka (CKT)
          </button>
          <button
            type="button"
            onClick={() => setFilter('lezak')}
            className={`px-3.5 py-1.5 rounded text-xs font-black transition ${
              filter === 'lezak' ? 'bg-white text-neutral-900 shadow-xs' : 'bg-neutral-100 text-neutral-700 hover:bg-amber-50'
            }`}
          >
            🍺 Ležácké tanky
          </button>
        </div>

        {/* Legenda stavů */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] font-bold text-neutral-600">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Aktivní / Leží</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Stáčí se</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-neutral-300"></span> Prázdný / Sanitace</span>
        </div>
      </div>

      {/* Vizuální schéma tanků */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
        {filteredTanks.map((t) => {
          const isSpilka = t.label.toLowerCase().includes('spilka');
          const beer = beers.find((b) => b.id === t.current_beer_id || b.name === t.current_beer_name);
          const capacity = Number(t.capacity_l || 7500);
          const currentVol = Number(t.current_volume_l || 0);
          const fillPct = Math.min(100, Math.max(0, capacity > 0 ? (currentVol / capacity) * 100 : 0));
          const isEmpty = t.status === 'empty' || t.status === 'sanitizing' || currentVol <= 0;

          // Doba ležení
          const startedAt = t.started_at ? new Date(t.started_at) : null;
          const daysConditioning = startedAt ? Math.floor((Date.now() - startedAt.getTime()) / (1000 * 60 * 60 * 24)) : null;

          const liquidColor = beer ? beerBg(beer) : '#f59e0b';
          const textColor = beer && beerText(beer) === 'text-white' ? '#ffffff' : '#111827';

          return (
            <div
              key={t.id}
              onClick={() => onSelectTank?.(t)}
              className="bg-white rounded border-2 border-neutral-200/90 shadow-sm hover:shadow-md transition-all p-4 flex flex-col justify-between relative overflow-hidden group cursor-pointer hover:border-amber-400"
            >
              {/* Hlavička tanku */}
              <div className="flex items-start justify-between gap-2 mb-3 z-10">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-display font-black text-base text-neutral-950">
                      {t.label}
                    </span>
                    {isSpilka && (
                      <span className="text-[10px] font-black bg-neutral-900 text-white px-1.5 py-0.5 rounded-md">
                        CKT
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-neutral-500 font-bold">
                    Kapacita: {capacity.toLocaleString('cs-CZ')} L ({(capacity / 100).toFixed(0)} hl)
                  </span>
                </div>

                <span className="chip text-[10px] font-black bg-neutral-100 text-neutral-800 border border-neutral-200 shrink-0">
                  {STATUS_ICONS[t.status] || t.status}
                </span>
              </div>

              {/* Vizuální tělo tanku (Cylindrický grafický tank) */}
              <div className="relative my-2 py-1">
                <div className="relative w-full h-36 rounded bg-neutral-100 border-2 border-neutral-300 overflow-hidden shadow-inner flex flex-col justify-end">
                  {/* Hladina piva */}
                  {!isEmpty && (
                    <div
                      className="w-full transition-all duration-500 relative flex items-center justify-center"
                      style={{
                        height: `${Math.max(15, fillPct)}%`,
                        backgroundColor: liquidColor,
                        borderTop: '3px solid rgba(255,255,255,0.4)',
                      }}
                    >
                      <div className="absolute top-1 inset-x-0 h-1.5 bg-white/30 rounded-full animate-pulse"></div>
                      <span
                        className="font-black text-xs px-2 py-0.5 rounded shadow-2xs z-10 border border-black/10"
                        style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#ffffff' }}
                      >
                        {(currentVol / 100).toFixed(1)} hl ({fillPct.toFixed(0)}%)
                      </span>
                    </div>
                  )}

                  {isEmpty && (
                    <div className="h-full flex items-center justify-center text-neutral-400 text-xs font-bold">
                      {t.status === 'sanitizing' ? '💧 Sanitace' : '⚪ Prázdný'}
                    </div>
                  )}
                </div>
              </div>

              {/* Informace o pivu a zrání */}
              <div className="mt-3 pt-2.5 border-t border-neutral-100 space-y-1.5 z-10">
                {beer ? (
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-extrabold text-xs text-neutral-900 truncate">
                      {beer.name}
                    </span>
                    <span className="text-[10px] font-black bg-amber-100 text-amber-950 border border-amber-300 px-1.5 py-0.5 rounded-md shrink-0">
                      {beer.degree || '🍺'}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-neutral-400 font-bold italic">
                    Bez přiřazeného piva
                  </div>
                )}

                {daysConditioning !== null && daysConditioning >= 0 && !isEmpty && (
                  <div className="flex items-center justify-between text-[11px] font-bold text-neutral-600 bg-amber-50/80 px-2 py-1 rounded">
                    <span className="flex items-center gap-1"><Clock size={12} className="text-amber-700" /> Doba ležení:</span>
                    <strong className="text-amber-950 font-black">{daysConditioning} dní</strong>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
