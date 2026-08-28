import { useEffect, useRef, useState, useCallback } from 'react';

type Props = {
  src: string;
  onConfirm: (editedDataUrl: string) => void;
  onCancel: () => void;
};

/**
 * Lightweight image editor: rotate, flip, brightness/contrast, and drag-to-crop.
 * No external deps — uses canvas only. Output is a JPEG data URL.
 */
export function ImageEditor({ src, onConfirm, onCancel }: Props) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0); // 0/90/180/270
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  // Load image to get natural dimensions
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      setScale(Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight)));
    };
    img.src = src;
  }, [src]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !natural.w) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rotated = rotation % 180 !== 0;
    const baseW = rotated ? natural.h : natural.w;
    const baseH = rotated ? natural.w : natural.h;
    const dispW = Math.round(baseW * scale);
    const dispH = Math.round(baseH * scale);
    canvas.width = dispW;
    canvas.height = dispH;

    ctx.save();
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(dispW / 2, dispH / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    ctx.restore();

    if (crop) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(59,130,246,0.12)';
      ctx.fillRect(crop.x, crop.y, crop.w, crop.h);
    }
  }, [rotation, brightness, contrast, scale, natural, crop]);

  useEffect(() => { draw(); }, [draw]);

  function onPointerDown(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setDrag({ x, y });
    setCrop({ x, y, w: 0, h: 0 });
    (e.target as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setCrop({
      x: Math.min(drag.x, x),
      y: Math.min(drag.y, y),
      w: Math.abs(x - drag.x),
      h: Math.abs(y - drag.y),
    });
  }
  function onPointerUp() { setDrag(null); }

  function resetCrop() { setCrop(null); }

  function rotateLeft() { setRotation((r) => (r + 270) % 360); }
  function rotateRight() { setRotation((r) => (r + 90) % 360); }

  function confirm() {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    // Render at natural resolution for max OCR quality
    const out = document.createElement('canvas');
    const rotated = rotation % 180 !== 0;
    const baseW = rotated ? natural.h : natural.w;
    const baseH = rotated ? natural.w : natural.h;

    let sx = 0, sy = 0, sw = baseW, sh = baseH;
    if (crop && crop.w > 10 && crop.h > 10) {
      sx = crop.x / scale;
      sy = crop.y / scale;
      sw = crop.w / scale;
      sh = crop.h / scale;
    }
    out.width = Math.round(sw);
    out.height = Math.round(sh);
    const ctx = out.getContext('2d')!;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%)`;
    ctx.translate(out.width / 2, out.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    // Draw image so that the crop region maps to the output canvas
    ctx.drawImage(
      img,
      -natural.w / 2 - sx - sw / 2 + baseW / 2,
      -natural.h / 2 - sy - sh / 2 + baseH / 2,
    );
    onConfirm(out.toDataURL('image/jpeg', 0.92));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold text-primary-800">Uprav fotku před čtením</div>
        <div className="text-xs text-primary-400">Otoč · ořízni tažením · uprav jas/kontrast</div>
      </div>

      <div className="rounded border-2 border-primary-200 bg-primary-950 overflow-hidden flex items-center justify-center p-2 max-h-[50vh]">
        <canvas
          ref={canvasRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="max-w-full max-h-[48vh] touch-none cursor-crosshair"
        />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button className="btn-ghost !rounded text-sm" onClick={rotateLeft}>⟲ Otočit</button>
        <button className="btn-ghost !rounded text-sm" onClick={rotateRight}>⟳ Otočit</button>
        <button className="btn-ghost !rounded text-sm" onClick={resetCrop} disabled={!crop}>Zrušit ořez</button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label text-[11px]">Jas: {brightness}%</label>
          <input type="range" min={50} max={150} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full" />
        </div>
        <div>
          <label className="label text-[11px]">Kontrast: {contrast}%</label>
          <input type="range" min={50} max={150} value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="w-full" />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button className="btn-ghost !rounded" onClick={onCancel}>Zrušit</button>
        <button className="btn-primary !rounded" onClick={confirm}>Pokračovat na čtení</button>
      </div>
    </div>
  );
}
