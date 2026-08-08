import { useEffect, useRef, useState } from 'react';

type Bbox = { x0: number; y0: number; x1: number; y1: number };

type Props = {
  src: string;
  bbox?: Bbox;
  className?: string;
  paddingPct?: number; // extra padding around bbox, in % of image dimension
  maxHeight?: number; // px
};

/**
 * Renders a cropped preview of `src` around `bbox` (percentages 0-100).
 * If bbox is missing, shows the full image scaled down instead — so the
 * user can always visually double-check what the AI read from the photo.
 */
export function CropPreview({ src, bbox, className, paddingPct = 4, maxHeight = 90, onClick }: Props & { onClick?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const iw = img.naturalWidth;
      const ih = img.naturalHeight;

      let sx = 0, sy = 0, sw = iw, sh = ih;
      if (bbox) {
        const x0 = Math.max(0, bbox.x0 - paddingPct);
        const y0 = Math.max(0, bbox.y0 - paddingPct);
        const x1 = Math.min(100, bbox.x1 + paddingPct);
        const y1 = Math.min(100, bbox.y1 + paddingPct);
        sx = (x0 / 100) * iw;
        sy = (y0 / 100) * ih;
        sw = ((x1 - x0) / 100) * iw;
        sh = ((y1 - y0) / 100) * ih;
        if (sw < 4 || sh < 4) { sx = 0; sy = 0; sw = iw; sh = ih; }
      }

      const targetH = maxHeight;
      const targetW = Math.max(1, Math.round((sw / sh) * targetH));
      canvas.width = targetW;
      canvas.height = targetH;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
    };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, bbox?.x0, bbox?.y0, bbox?.x1, bbox?.y1, paddingPct, maxHeight]);

  if (failed) return null;

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Náhled objednávky"
      className={className}
      onClick={onClick}
      style={{ maxHeight, height: maxHeight, width: 'auto', display: 'block', cursor: onClick ? 'zoom-in' : undefined }}
    />
  );
}


