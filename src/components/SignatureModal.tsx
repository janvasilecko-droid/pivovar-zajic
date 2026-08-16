import React, { useRef, useState, useEffect } from 'react';
import { Modal } from './ui';
import { RotateCcw, CheckCircle2 } from 'lucide-react';

type SignatureModalProps = {
  isOpen: boolean;
  onClose: () => void;
  customerName: string;
  onSaveSignature: (signatureDataUrl: string, signerName: string) => void;
};

export function SignatureModal({
  isOpen,
  onClose,
  customerName,
  onSaveSignature,
}: SignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [signerName, setSignerName] = useState(customerName || '');

  useEffect(() => {
    if (isOpen) {
      setSignerName(customerName || '');
      setHasDrawn(false);
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#111827';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }, 100);
    }
  }, [isOpen, customerName]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    onSaveSignature(dataUrl, signerName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="✍️ Podpis převzetí závozu" maxWidth="max-w-md">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-black text-neutral-700 mb-1">
            Jméno přebírající osoby:
          </label>
          <input
            type="text"
            className="input font-bold text-sm"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Jméno hospodského / obsluhy"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-neutral-600">
              Podpis na sklo (prstem):
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-xs font-bold text-neutral-500 hover:text-rose-600 flex items-center gap-1"
            >
              <RotateCcw size={13} /> Smazat podpis
            </button>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-neutral-300 overflow-hidden bg-white shadow-inner">
            <canvas
              ref={canvasRef}
              width={400}
              height={180}
              className="w-full h-[180px] touch-none cursor-crosshair"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-200">
          <button type="button" onClick={onClose} className="btn-secondary text-xs font-bold">
            Zrušit
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasDrawn}
            className="btn-primary text-xs font-black flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            <CheckCircle2 size={16} /> Potvrdit převzetí
          </button>
        </div>
      </div>
    </Modal>
  );
}
