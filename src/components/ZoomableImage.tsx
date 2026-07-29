import { useRef, useState, useCallback, type WheelEvent, type PointerEvent } from 'react';

type Bbox = { x0: number; y0: number; x1: number; y1: number };

type Props = {
  src: string;
  bbox?: Bbox; // orientational overlay rectangle, in % of image size
  onClose: () => void;
};

/**
 * Fullscreen zoomable/pannable image viewer.
 * - Mouse wheel to zoom (desktop)
 * - Drag to pan
 * - Pinch to zoom (touch)
 * - +/- buttons and "reset" for accessibility
 * If `bbox` is provided, draws an orientational red rectangle over the
 * estimated area — but the user can freely zoom/pan anywhere on the photo,
 * since the AI estimate might not be pixel-perfect.
 */
export function ZoomableImage({ src, bbox, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({
    dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0,
  });
  const pinchRef = useRef<{ active: boolean; startDist: number; startScale: number }>({ active: false, startDist: 0, startScale: 1 });

  const clampScale = (s: number) => Math.min(8, Math.max(1, s));

  const zoomBy = useCallback((factor: number, centerX?: number, centerY?: number) => {
    setScale((prev) => {
      const next = clampScale(prev * factor);
      return next;
    });
  }, []);

  function onWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomBy(factor);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
  }
  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.startPosX + dx, y: dragRef.current.startPosY + dy });
  }
  function onPointerUp() {
    dragRef.current.dragging = false;
  }

  function dist(touches: TouchList) {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function onTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2) {
      pinchRef.current = { active: true, startDist: dist(e.touches as unknown as TouchList), startScale: scale };
    }
  }
  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length === 2 && pinchRef.current.active) {
      e.preventDefault();
      const d = dist(e.touches as unknown as TouchList);
      const factor = d / (pinchRef.current.startDist || 1);
      setScale(clampScale(pinchRef.current.startScale * factor));
    }
  }
  function onTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length < 2) pinchRef.current.active = false;
  }

  function reset() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col animate-fade-in" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
        <span className="text-white/70 text-xs">Přibliž kolečkem myši / prsty, táhni pro posun</span>
        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center" onClick={() => zoomBy(1 / 1.3)} title="Oddálit">−</button>
          <button className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg flex items-center justify-center" onClick={() => zoomBy(1.3)} title="Přiblížit">+</button>
          <button className="px-3 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs flex items-center justify-center" onClick={reset} title="Reset">Reset</button>
          <button className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl flex items-center justify-center" onClick={onClose} title="Zavřít">×</button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative touch-none select-none"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ cursor: scale > 1 ? 'grab' : 'default' }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragRef.current.dragging ? 'none' : 'transform 0.05s linear',
          }}
        >
          <div className="relative inline-block">
            <img src={src} alt="Fotka objednávky" className="max-w-[92vw] max-h-[80vh] object-contain block" draggable={false} />
            {bbox && (
              <div
                className="absolute border-2 border-red-500/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] pointer-events-none"
                style={{
                  left: `${bbox.x0}%`,
                  top: `${bbox.y0}%`,
                  width: `${Math.max(0, bbox.x1 - bbox.x0)}%`,
                  height: `${Math.max(0, bbox.y1 - bbox.y0)}%`,
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
