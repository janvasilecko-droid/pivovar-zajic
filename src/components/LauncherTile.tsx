// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button. V edit módu zůstává dlaždice
// samotná plně čitelná (ikona + popisek na plnou viditelnost, ať je jasné,
// co se zrovna přesouvá) a nabízí jen: čtyři šipky pro garantovaně funkční
// přesun (čisté kliknutí, doleva/doprava/nahoru/dolů) a tlačítko ⚙, které
// otevře sdílený modál (HomeScreen.tsx) s plnohodnotným — ne na dlaždici
// našlapaným — výběrem velikosti/barvy/popisku/stránky/skrytí.
//
// Dlouhé podržení (long-press, jako na Androidu) navíc pořád funguje pro
// rychlejší přesun na zařízeních, kde to gesto spolehlivě rozezná prohlížeč.
//
// Skupinová dlaždice ("složka", styl Windows Phone/iOS, viz homeLayout.ts
// mergeTiles) — `item` je null a místo něj se předá `groupItems` (2+ členů):
// vykreslí se mini 2×2 mřížka ikon místo jedné velké, jinak sdílí veškerou
// stejnou edit-mode "chrome" (dpad, ozubené kolo, jiggle, drag).
import type { CSSProperties } from 'react';
import type { NavItem } from './Layout';
import { hexToRgba, UNIT_COLS, type TileId, type TileOverride } from '../lib/homeLayout';

/** Explicitní pozice+rozestup (grid-column/-row) pro danou volnou pozici/velikost —
 *  dlaždice sedí přesně na uložené buňce (x,y), ne jen "další volné místo". */
export function tileGridStyle(x: number, y: number, w: number, h: number): CSSProperties {
  const span = w === 0 ? 1 : w * UNIT_COLS;
  return { gridColumn: `${x + 1} / span ${span}`, gridRow: `${y + 1} / span ${h}` };
}

export default function LauncherTile({
  id, item, groupItems, override, isPresetColor, editing, badge, tileOpacity,
  onClick, onDragPointerDown, isDragging, isPriming, dragOver, jiggling, onMoveStep, onOpenEditor,
}: {
  id: TileId;
  /** null pro skupinovou dlaždici — viz groupItems. */
  item: NavItem | null;
  /** Členové skupiny (2+) — jen pro skupinovou dlaždici. */
  groupItems?: NavItem[];
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
  onMoveStep: (direction: 'left' | 'right' | 'up' | 'down') => void;
  /** Otevře sdílený modál s plným nastavením téhle dlaždice. */
  onOpenEditor: () => void;
}) {
  const color = override.color ?? 'coral';
  const w = override.w ?? 1;
  const h = override.h ?? 1;
  const x = override.x ?? 0;
  const y = override.y ?? 0;
  const label = override.label || item?.label || 'Skupina';
  const Icon = item?.icon;

  return (
    <div
      className={`hs-tile ${isPresetColor ? `c-${color}` : ''} ${w === 0 ? 'xs' : ''} ${editing ? 'hs-editing' : ''} ${isDragging ? 'hs-picked-up' : ''} ${isPriming ? 'hs-priming' : ''} ${dragOver ? 'hs-drag-over' : ''} ${jiggling ? 'hs-jiggle' : ''}`}
      style={{
        ...tileGridStyle(x, y, w, h),
        ...(isPresetColor ? {} : { background: hexToRgba(color, tileOpacity) }),
        // touch-action:none jen na dlaždici, co je PRÁVĚ zvednutá (isDragging)
        // — ne hned od prvního dotyku (isPriming) a ne na všechny dlaždice jen
        // proto, že je zapnutý edit mód. Dřív to blokovalo scroll stránky
        // úplně (dotyk čehokoliv v mřížce = žádný posun); teď jde normálně
        // scrollovat, dokud dlaždice fakticky nepodrží ~400ms bez pohybu —
        // delší tažení dřív se prostě rozpozná jako scroll (viz
        // handleTileDragPointerDown: pohyb >18px zruší čekání na podržení).
        touchAction: isDragging ? 'none' : undefined,
      }}
      data-tile-id={id}
      onPointerDown={editing ? onDragPointerDown : undefined}
      onClick={editing ? undefined : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={editing ? undefined : (e) => { if (e.key === 'Enter') onClick(); }}
    >
      {groupItems ? (
        <div className="hs-tile-group-icons">
          {groupItems.slice(0, 4).map((gi, i) => {
            const GIcon = gi.icon;
            const isLastCell = i === 3 && groupItems.length > 4;
            return (
              <span key={gi.id}>
                {isLastCell ? <span className="hs-group-more">+{groupItems.length - 3}</span> : <GIcon />}
              </span>
            );
          })}
        </div>
      ) : (
        Icon && <Icon />
      )}
      <div className="hs-lbl">{label}</div>
      {badge !== undefined && <span className="hs-badge">{badge}</span>}

      {editing && (
        // stopPropagation, ať klik/dotek na ovládací prvky nezačne dlouhé
        // podržení celé dlaždice (rodič má vlastní onPointerDown pro přesun).
        <div className="hs-tile-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hs-move-dpad">
            <button type="button" className="hs-dpad-btn hs-dpad-up" title="Přesunout nahoru" onClick={() => onMoveStep('up')}>▲</button>
            <button type="button" className="hs-dpad-btn hs-dpad-left" title="Přesunout doleva" onClick={() => onMoveStep('left')}>◀</button>
            <button type="button" className="hs-dpad-btn hs-dpad-down" title="Přesunout dolů" onClick={() => onMoveStep('down')}>▼</button>
            <button type="button" className="hs-dpad-btn hs-dpad-right" title="Přesunout doprava" onClick={() => onMoveStep('right')}>▶</button>
          </div>
          <button type="button" className="hs-gear-btn" title="Upravit dlaždici" onClick={onOpenEditor}>⚙</button>
        </div>
      )}
    </div>
  );
}
