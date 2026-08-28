import React, { useState } from 'react';
import { Modal } from './ui';
import { Beer, Package, beerBg, beerText, formatPackageLabel } from '../lib/supabase';
import { Plus, Minus, CheckCircle2, RotateCcw } from 'lucide-react';

type QuickCountModalProps = {
  isOpen: boolean;
  onClose: () => void;
  beers: Beer[];
  packages: Package[];
  onConfirmCount?: (items: { beerId: string; packageId: string; count: number }[]) => void;
};

export function QuickCountModal({
  isOpen,
  onClose,
  beers,
  packages,
  onConfirmCount,
}: QuickCountModalProps) {
  const [selectedBeerId, setSelectedBeerId] = useState(beers[0]?.id || '');
  const [selectedPkgId, setSelectedPkgId] = useState(packages[0]?.id || '');
  const [counts, setCounts] = useState<Record<string, number>>({});

  const activeKey = `${selectedBeerId}_${selectedPkgId}`;
  const currentCount = counts[activeKey] || 0;

  const handleAdd = (delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [activeKey]: Math.max(0, (prev[activeKey] || 0) + delta),
    }));
  };

  const handleSetExact = (val: number) => {
    setCounts((prev) => ({
      ...prev,
      [activeKey]: Math.max(0, val),
    }));
  };

  const activeBeer = beers.find((b) => b.id === selectedBeerId);
  const activePkg = packages.find((p) => p.id === selectedPkgId);

  const totalCountedAll = Object.values(counts).reduce((s, v) => s + v, 0);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Rychlé mobilní sčítadlo skladu"
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* Výběr piva */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-neutral-700 mb-1.5">
            1. Zvol pivo:
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
            {beers.filter((b) => b.is_active !== false).map((b) => {
              const isSel = b.id === selectedBeerId;
              const hasCount = Object.entries(counts).some(([k, v]) => k.startsWith(b.id) && v > 0);

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setSelectedBeerId(b.id)}
                  style={{
                    backgroundColor: beerBg(b),
                    color: beerText(b) === 'text-white' ? '#ffffff' : '#111827',
                  }}
                  className={`p-2 rounded border-2 text-xs font-black text-left transition shadow-2xs relative ${
                    isSel ? 'ring-4 ring-amber-400 scale-[1.03] z-10' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="truncate">{b.name}</div>
                  {hasCount && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-white"></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Výběr obalu */}
        <div>
          <div className="text-xs font-black uppercase tracking-wider text-neutral-700 mb-1.5">
            2. Zvol obal:
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {packages.map((pkg) => {
              const isSel = pkg.id === selectedPkgId;
              const key = `${selectedBeerId}_${pkg.id}`;
              const c = counts[key] || 0;

              return (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPkgId(pkg.id)}
                  className={`p-2.5 rounded border text-xs font-black flex items-center justify-between transition ${
                    isSel
                      ? 'bg-white text-amber-900 border-amber-400 ring-2 ring-amber-300 shadow-sm'
                      : 'bg-white text-neutral-900 border-neutral-200 hover:bg-amber-50'
                  }`}
                >
                  <span>{formatPackageLabel(pkg.label)}</span>
                  {c > 0 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-100 text-emerald-950">
                      {c} ks
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Velké dotykové sčítadlo */}
        <div className="bg-neutral-900 text-white p-4 rounded space-y-3 shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-400">
              {activeBeer?.name} · {formatPackageLabel(activePkg?.label)}
            </span>
            <button
              type="button"
              onClick={() => handleSetExact(0)}
              className="text-[11px] font-bold text-neutral-400 hover:text-rose-400 flex items-center gap-1"
            >
              <RotateCcw size={12} /> Vynulovat
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 py-2">
            <button
              type="button"
              onClick={() => handleAdd(-1)}
              className="w-14 h-14 rounded bg-neutral-800 hover:bg-neutral-700 grid place-items-center text-2xl font-black active:scale-95 transition border border-neutral-700"
            >
              <Minus size={22} />
            </button>

            <div className="font-mono font-black text-4xl sm:text-5xl text-amber-400 min-w-[100px] text-center tracking-tight">
              {currentCount}
              <span className="text-xs font-sans text-neutral-400 ml-1">ks</span>
            </div>

            <button
              type="button"
              onClick={() => handleAdd(1)}
              className="w-14 h-14 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 grid place-items-center text-2xl font-black active:scale-95 transition shadow-md"
            >
              <Plus size={22} />
            </button>
          </div>

          {/* Rychlá tlačítka pro násobky */}
          <div className="grid grid-cols-5 gap-1.5 pt-1">
            {[+5, +10, +20, +24, +50].map((step) => (
              <button
                key={step}
                type="button"
                onClick={() => handleAdd(step)}
                className="py-2 rounded bg-neutral-800 hover:bg-neutral-700 font-mono font-bold text-xs text-neutral-200 border border-neutral-700 active:scale-95 transition"
              >
                +{step}
              </button>
            ))}
          </div>
        </div>

        {/* Shrnutí celkem a potvrzení */}
        <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
          <div className="text-xs font-black text-neutral-900">
            Celkem nasčítáno: <span className="text-amber-800 font-mono font-bold">{totalCountedAll} ks</span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-secondary text-xs font-bold">
              Zavřít
            </button>
            <button
              type="button"
              onClick={() => {
                const itemsList = Object.entries(counts)
                  .filter(([_, cnt]) => cnt > 0)
                  .map(([k, cnt]) => {
                    const [bId, pId] = k.split('_');
                    return { beerId: bId, packageId: pId, count: cnt };
                  });
                onConfirmCount?.(itemsList);
                onClose();
              }}
              className="btn-primary !rounded text-xs font-black flex items-center gap-1.5 shadow-md"
            >
              <CheckCircle2 size={16} /> Potvrdit inventuru
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
