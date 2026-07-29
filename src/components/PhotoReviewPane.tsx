import { useRef, useState, useCallback, type WheelEvent, type PointerEvent } from 'react';

type Bbox = { x0: number; y0: number; x1: number; y1: number };
type PhotoEntry = { dataUrl: string; name: string };

type Props = {
  photos: PhotoEntry[];
  activeIndex: number;
  onChangeIndex: (i: number) => void;
  activeBbox?: Bbox;
};

/**
 * Top half of the fullscreen review screen: shows the currently active
 * photo, zoomable/pannable (wheel, drag, pinch), with dot/arrow navigation
 * between multiple uploaded photos. If a bbox estimate is available for
 * the currently selected item, draws an orientational rectangle over it.
 */
export function PhotoReviewPane({ photos, activeIndex, onChangeIndex, activeBbox }: Props) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; startPosX: number; startPosY: number }>({
    dragging: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0,
  });
  const pinchRef = useRef<{ active: boolean; startDist: number; startScale: number }>({ active: false, startDist: 0, startScale: 1 });

  const clampScale = (s: number) => Math.min(8, Math.max(1, s));

  const zoomBy = useCallback((factor: number) => {
    setScale((prev) => clampScale(prev * factor));
  }, []);

  function resetView() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  function goTo(i: number) {
    resetView();
    onChangeIndex(Math.max(0, Math.min(photos.length - 1, i)));
  }

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
  function onPointerUp() { dragRef.current.dragging = false; }

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

  const photo = photos[activeIndex];

  return (
    <div className="relative h-full w-full bg-primary-950 flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 bg-primary-900/80 text-white text-xs shrink-0 z-10">
        <span className="text-white/60">Přibliž kolečkem myši / prsty, táhni pro posun</span>
        <div className="flex items-center gap-2">
          <button className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-base" onClick={() => zoomBy(1 / 1.3)} title="Oddálit">−</button>
          <button className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-base" onClick={() => zoomBy(1.3)} title="Přiblížit">+</button>
          <button className="px-2 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center" onClick={resetView} title="Reset">Reset</button>
        </div>
      </div>

      <div
        className="flex-1 overflow-hidden relative touch-none select-none"
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
        {photo && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: dragRef.current.dragging ? 'none' : 'transform 0.05s linear',
            }}
          >
            <div className="relative inline-block">
              <img src={photo.dataUrl} alt="Fotka objednávky" className="max-w-[94vw] max-h-full object-contain block" draggable={false} />
              {activeBbox && (
                <div
                  className="absolute border-2 border-red-500/90 pointer-events-none"
                  style={{
                    left: `${activeBbox.x0}%`,
                    top: `${activeBbox.y0}%`,
                    width: `${Math.max(0, activeBbox.x1 - activeBbox.x0)}%`,
                    height: `${Math.max(0, activeBbox.y1 - activeBbox.y0)}%`,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-3 py-2 bg-primary-900/80 shrink-0 z-10">
          <button
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
            onClick={() => goTo(activeIndex - 1)}
            disabled={activeIndex === 0}
            title="Předchozí fotka"
          >‹</button>
          <div className="flex items-center gap-1.5">
            {photos.map((_, i) => (
              <button
                key={i}
                className={`w-2.5 h-2.5 rounded-full transition-colors ${i === activeIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/50'}`}
                onClick={() => goTo(i)}
                title={`Fotka ${i + 1}`}
              />
            ))}
          </div>
          <button
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center disabled:opacity-30"
            onClick={() => goTo(activeIndex + 1)}
            disabled={activeIndex === photos.length - 1}
            title="Další fotka"
          >›</button>
          <span className="text-white/50 text-xs ml-1">{activeIndex + 1}/{photos.length}</span>
        </div>
      )}
    </div>
  );
}
