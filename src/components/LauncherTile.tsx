import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Settings } from 'lucide-react';
// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button. V edit módu klik na dlaždici
// ji jen OZNAČÍ (viz `selected`/`onSelect`) — ovládání (čtyři šipky pro
// garantovaně funkční přesun + tlačítko ⚙, které otevře sdílený modál s
// plnohodnotným výběrem velikosti/barvy/popisku/stránky/skrytí) se objeví
// centrovaně nad OZNAČENOU dlaždicí, ne nad všemi najednou — dřív každá
// dlaždice v edit módu pořád zobrazovala svoje vlastní šipky+kolečko, což na
// malém displeji bylo přeplácané a na "mini" dlaždicích se to kvůli
// overflow:hidden vůbec nevešlo (kolečko zmizelo úplně mimo dlaždici).
//
// Dlouhé podržení (long-press, jako na Androidu) navíc pořád funguje pro
// rychlejší přesun na zařízeních, kde to gesto spolehlivě rozezná prohlížeč.
//
// Skupinová dlaždice ("složka", styl Windows Phone/iOS, viz homeLayout.ts
// mergeTiles) — `item` je null a místo něj se předá `groupItems` (2+ členů):
// vykreslí se mini 2×2 mřížka ikon místo jedné velké, jinak sdílí veškerou
// stejnou edit-mode "chrome" (dpad, ozubené kolo, jiggle, drag, výběr).
import type { CSSProperties } from 'react';
import type { NavItem } from './Layout';
import { hexToRgba, tileTextColor, COLOR_HEX, UNIT_COLS, type TileColor, type TileId, type TileOverride } from '../lib/homeLayout';

/** Explicitní pozice+rozestup (grid-column/-row) pro danou volnou pozici/velikost —
 *  dlaždice sedí přesně na uložené buňce (x,y), ne jen "další volné místo". */
export function tileGridStyle(x: number, y: number, w: number, h: number): CSSProperties {
  const span = w === 0 ? 1 : w * UNIT_COLS;
  return { gridColumn: `${x + 1} / span ${span}`, gridRow: `${y + 1} / span ${h}` };
}

export default function LauncherTile({
  id, item, groupItems, override, isPresetColor, editing, selected, badge, tileOpacity,
  onClick, onSelect, onDragPointerDown, isDragging, isPriming, dragOver, jiggling, onMoveStep, onOpenEditor,
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
  /** Tahle dlaždice je v edit módu právě označená kliknutím — jen ona zobrazuje ovládání. */
  selected: boolean;
  badge?: string | number;
  tileOpacity: number;
  onClick: () => void;
  /** Klik na dlaždici v edit módu — označí/odznačí ji (viz `selected`). */
  onSelect: () => void;
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
  // Popisek/ikona nemůže být natvrdo bílá — na světlých odstínech (citrus,
  // honey, peach, mustard, blush...), obzvlášť nad taky světlými scénami
  // pozadí, by byl skoro neviditelný (viz tileTextColor).
  const resolvedHex = isPresetColor ? COLOR_HEX[color as TileColor] : color;
  const textColor = tileTextColor(resolvedHex);

  return (
    <div
      className={`hs-tile vlastni-vyska ${isPresetColor ? `c-${color}` : ''} ${w === 0 ? 'xs' : ''} ${w >= 2 && h === 1 ? 'hs-tile-wide' : ''} ${h >= 2 && w < 2 ? 'hs-tile-tall' : ''} ${w >= 2 && h >= 2 ? 'hs-tile-large' : ''} ${editing ? 'hs-editing' : ''} ${editing && selected ? 'hs-selected' : ''} ${isDragging ? 'hs-picked-up' : ''} ${isPriming ? 'hs-priming' : ''} ${dragOver ? 'hs-drag-over' : ''} ${jiggling ? 'hs-jiggle' : ''}`}
      style={{
        ...tileGridStyle(x, y, w, h),
        ...(isPresetColor ? {} : { background: hexToRgba(color, tileOpacity) }),
        color: textColor,
        touchAction: isDragging ? 'none' : undefined,
      }}
      data-tile-id={id}
      onPointerDown={editing ? onDragPointerDown : undefined}
      onClick={editing ? onSelect : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={editing ? (e) => { if (e.key === 'Enter') onSelect(); } : (e) => { if (e.key === 'Enter') onClick(); }}
    >
      <div className="hs-tile-icon-box">
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
      </div>
      <div className="hs-lbl" title={label}>{label}</div>
      {badge !== undefined && <span className="hs-badge">{badge}</span>}

      {editing && selected && (
        // stopPropagation, ať klik/dotek na ovládací prvky nezačne dlouhé
        // podržení celé dlaždice (rodič má vlastní onPointerDown pro přesun)
        // a neodznačí ji zpátky (klik by jinak probublal na .hs-tile výš).
        // Plovoucí panel VYCENTROVANÝ nad dlaždicí (ne přilepený uvnitř jejích
        // rohů) — funguje stejně na velké i "mini" (w=0) dlaždici, protože se
        // zobrazuje jen pro tu jednu OZNAČENOU (viz .hs-selected v CSS:
        // overflow:visible + vyšší z-index, ať panel nic neoseká).
        <div className="hs-tile-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hs-move-dpad">
            <button type="button" className="hs-dpad-btn hs-dpad-up" title="Přesunout nahoru" onClick={() => onMoveStep('up')}><ChevronUp size={16} /></button>
            <button type="button" className="hs-dpad-btn hs-dpad-left" title="Přesunout doleva" onClick={() => onMoveStep('left')}><ChevronLeft size={16} /></button>
            <button type="button" className="hs-dpad-btn hs-dpad-down" title="Přesunout dolů" onClick={() => onMoveStep('down')}><ChevronDown size={16} /></button>
            <button type="button" className="hs-dpad-btn hs-dpad-right" title="Přesunout doprava" onClick={() => onMoveStep('right')}><ChevronRight size={16} /></button>
          </div>
          <button type="button" className="hs-gear-btn" title="Barva, velikost a další nastavení" onClick={onOpenEditor}><Settings className="ikona-text" /></button>
        </div>
      )}
    </div>
  );
}
