// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button. V edit módu zůstává dlaždice
// samotná plně čitelná (ikona + popisek na plnou viditelnost, ať je jasné,
// co se zrovna přesouvá) a nabízí jen: dvě šipky pro garantovaně funkční
// přesun o pozici (čisté kliknutí) a tlačítko ⚙, které otevře sdílený modál
// (HomeScreen.tsx) s plnohodnotným — ne na dlaždici našlapaným — výběrem
// velikosti/barvy/popisku/stránky/skrytí.
//
// Dlouhé podržení (long-press, jako na Androidu) navíc pořád funguje pro
// rychlejší přesun na zařízeních, kde to gesto spolehlivě rozezná prohlížeč.
import type { CSSProperties } from 'react';
import type { NavItem } from './Layout';
import { hexToRgba, UNIT_COLS, type TileOverride } from '../lib/homeLayout';

/** Skutečný rozestup mřížky (grid-column/-row span) pro danou volnou velikost. */
export function tileGridStyle(w: number, h: number): CSSProperties {
  return { gridColumn: `span ${w === 0 ? 1 : w * UNIT_COLS}`, gridRow: `span ${h}` };
}

export default function LauncherTile({
  item, override, isPresetColor, editing, badge, tileOpacity,
  onClick, onDragPointerDown, isDragging, isPriming, dragOver, jiggling, onMoveStep, onOpenEditor,
}: {
  item: NavItem;
  override: TileOverride;
  /** true = override.color je jméno z TILE_COLORS (CSS třída); false = vlastní hex (inline styl) */
  isPresetColor: boolean;
  editing: boolean;
  badge?: string | number;
  tileOpacity: number;
  onClick: () => void;
  onDragPointerDown: (e: React.PointerEvent) => void;
  /** Tahle dlaždice je právě "zvednutá" (po dlouhém podržení) */
  isDragging: boolean;
  /** Prst drží dlaždici, ale ještě čeká se na uplynutí podržení */
  isPriming: boolean;
  /** Prst/kurzor je teď nad touhle dlaždicí během přesunu jiné */
  dragOver: boolean;
  /** Jiná dlaždice se právě přesouvá — tahle se jemně "chvěje" (jako na Androidu) */
  jiggling: boolean;
  /** Záložní garantovaně funkční přesun o jednu pozici — čisté kliknutí. */
  onMoveStep: (direction: -1 | 1) => void;
  /** Otevře sdílený modál s plným nastavením téhle dlaždice. */
  onOpenEditor: () => void;
}) {
  const Icon = item.icon;
  const color = override.color ?? 'coral';
  const w = override.w ?? 1;
  const h = override.h ?? 1;
  const label = override.label || item.label;

  return (
    <div
      className={`hs-tile ${isPresetColor ? `c-${color}` : ''} ${w === 0 ? 'xs' : ''} ${editing ? 'hs-editing' : ''} ${isDragging ? 'hs-picked-up' : ''} ${isPriming ? 'hs-priming' : ''} ${dragOver ? 'hs-drag-over' : ''} ${jiggling ? 'hs-jiggle' : ''}`}
      style={{
        ...tileGridStyle(w, h),
        ...(isPresetColor ? {} : { background: hexToRgba(color, tileOpacity) }),
        touchAction: editing ? 'none' : undefined,
      }}
      data-tile-id={item.id}
      onPointerDown={editing ? onDragPointerDown : undefined}
      onClick={editing ? undefined : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={editing ? undefined : (e) => { if (e.key === 'Enter') onClick(); }}
    >
      <Icon />
      <div className="hs-lbl">{label}</div>
      {badge !== undefined && <span className="hs-badge">{badge}</span>}

      {editing && (
        // stopPropagation, ať klik/dotek na ovládací prvky nezačne dlouhé
        // podržení celé dlaždice (rodič má vlastní onPointerDown pro přesun).
        <div className="hs-tile-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hs-move-arrows">
            <button type="button" className="hs-size-btn" title="Přesunout doleva/nahoru" onClick={() => onMoveStep(-1)}>◀</button>
            <button type="button" className="hs-size-btn" title="Přesunout doprava/dolů" onClick={() => onMoveStep(1)}>▶</button>
          </div>
          <button type="button" className="hs-gear-btn" title="Upravit dlaždici" onClick={onOpenEditor}>⚙</button>
        </div>
      )}
    </div>
  );
}
