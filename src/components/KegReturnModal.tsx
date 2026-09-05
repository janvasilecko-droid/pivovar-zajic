import React, { useState, useEffect } from 'react';
import { Modal } from './ui';
import { Plus, Minus, CheckCircle2, RotateCcw } from 'lucide-react';
import { IkonaSud } from './ikony';

type KegReturnModalProps = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  onSaveReturns: (returns: { size: string; count: number }[]) => void;
};

const KEG_SIZES = ['50L', '30L', '20L', '15L', '10L'];

const EMPTY_COUNTS: Record<string, number> = { '50L': 0, '30L': 0, '20L': 0, '15L': 0, '10L': 0 };

export function KegReturnModal({
  isOpen,
  onClose,
  customerName,
  onSaveReturns,
}: KegReturnModalProps) {
  const [counts, setCounts] = useState<Record<string, number>>(EMPTY_COUNTS);

  // BUGFIX: reset counts when modal opens for a (possibly different) customer
  useEffect(() => {
    if (isOpen) setCounts({ ...EMPTY_COUNTS });
  }, [isOpen, customerName]);

  const handleDelta = (size: string, delta: number) => {
    setCounts((prev) => ({
      ...prev,
      [size]: Math.max(0, (prev[size] || 0) + delta),
    }));
  };

  const totalReturned = Object.values(counts).reduce((s, v) => s + v, 0);

  if (!isOpen) return null;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={`Vrácené prázdné sudy — ${customerName}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <p className="text-xs text-neutral-600 font-medium">
          Zadejte počet prázdných KEG sudů vrácených odběratelem:
        </p>

        <div className="space-y-2">
          {KEG_SIZES.map((size) => {
            const count = counts[size] || 0;
            return (
              <div
                key={size}
                className="flex items-center justify-between p-3 rounded bg-neutral-50 border border-neutral-200"
              >
                <div className="flex items-center gap-2">
                  <IkonaSud size={18} className="text-amber-600" />
                  <span className="font-display font-black text-sm text-neutral-900">
                    KEG {size}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleDelta(size, -1)}
                    className="w-9 h-9 rounded bg-white hover:bg-neutral-200 border border-neutral-300 grid place-items-center text-lg font-black active:scale-95 transition tap"
                  >
                    <Minus size={16} />
                  </button>

                  <span className="font-mono font-black text-xl text-amber-900 w-8 text-center">
                    {count}
                  </span>

                  <button
                    type="button"
                    onClick={() => handleDelta(size, 1)}
                    className="w-9 h-9 rounded bg-amber-500 hover:bg-amber-400 text-neutral-950 grid place-items-center text-lg font-black active:scale-95 transition shadow-xs tap"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
          <div className="text-xs font-black text-neutral-900">
            Celkem vráceno: <span className="text-amber-800 font-mono font-bold">{totalReturned} sudů</span>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCounts({ ...EMPTY_COUNTS })} className="btn-ghost !rounded text-xs font-bold flex items-center gap-1" title="Vynulovat">
              <RotateCcw size={14} /> Reset
            </button>
            <button type="button" onClick={onClose} className="btn-secondary text-xs font-bold">
              Zrušit
            </button>
            <button
              type="button"
              onClick={() => {
                const list = Object.entries(counts)
                  .filter(([_, cnt]) => cnt > 0)
                  .map(([size, cnt]) => ({ size, count: cnt }));
                onSaveReturns(list);
                onClose();
              }}
              className="btn-primary !rounded text-xs font-black flex items-center gap-1.5 shadow-md"
            >
              <CheckCircle2 size={16} /> Uložit vrácení
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
