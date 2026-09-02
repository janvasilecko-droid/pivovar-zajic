import { useRef } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Settings, Zap } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { NavItem } from './Layout';
import { hexToRgba, tileTextColor, COLOR_HEX, UNIT_COLS, defaultTileColor, type TileColor, type TileId, type TileOverride } from '../lib/homeLayout';
import { zavibruj } from '../lib/haptika';

/** Explicitní pozice+rozestup (grid-column/-row) pro danou volnou pozici/velikost —
 *  dlaždice sedí přesně na uložené buňce (x,y), ne jen "další volné místo". */
export function tileGridStyle(x: number, y: number, w: number, h: number): CSSProperties {
  const span = w === 0 ? 1 : w * UNIT_COLS;
  return { gridColumn: `${x + 1} / span ${span}`, gridRow: `${y + 1} / span ${h}` };
}

export default function LauncherTile({
  id, item, groupItems, override, isPresetColor, editing, selected, badge, tileOpacity,
  onClick, onSelect, onDragPointerDown, isDragging, isPriming, dragOver, jiggling, onMoveStep, onOpenEditor,
  onOpenQuickActions, customContent,
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
  /** Otevře rychlé akce (quick actions) pro daný modul. */
  onOpenQuickActions?: () => void;
  /** Vlastní bohatý obsah pro mini-widget dlaždice (poznámky, checklisty, kalendář). */
  customContent?: React.ReactNode;
}) {
  const color = override.color ?? defaultTileColor(id);
  const w = override.w ?? 1;
  const h = override.h ?? 1;
  const x = override.x ?? 0;
  const y = override.y ?? 0;
  const label = override.label || item?.label || 'Skupina';
  const Icon = item?.icon;
  const resolvedHex = isPresetColor ? COLOR_HEX[color as TileColor] : color;
  const textColor = tileTextColor(resolvedHex);

  const lpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const pointerStartPos = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(e: React.PointerEvent) {
    if (editing) {
      onDragPointerDown(e);
      return;
    }
    if (!onOpenQuickActions) return;
    pointerStartPos.current = { x: e.clientX, y: e.clientY };
    didLongPress.current = false;
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = setTimeout(() => {
      didLongPress.current = true;
      try { zavibruj('odskrtnuto'); } catch {}
      onOpenQuickActions();
    }, 420);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (editing || !pointerStartPos.current) return;
    if (Math.hypot(e.clientX - pointerStartPos.current.x, e.clientY - pointerStartPos.current.y) > 12) {
      if (lpTimer.current) clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }

  function handlePointerUp() {
    if (lpTimer.current) clearTimeout(lpTimer.current);
    lpTimer.current = null;
    pointerStartPos.current = null;
  }

  function handleClick() {
    if (editing) {
      onSelect();
      return;
    }
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    onClick();
  }

  return (
    <div
      className={`hs-tile vlastni-vyska ${isPresetColor ? `c-${color}` : ''} ${id === 'notes' ? 'hs-tile-sticky' : ''} ${w === 0 ? 'xs' : ''} ${w >= 2 && h === 1 ? 'hs-tile-wide' : ''} ${h >= 2 && w < 2 ? 'hs-tile-tall' : ''} ${w >= 2 && h >= 2 ? 'hs-tile-large' : ''} ${editing ? 'hs-editing' : ''} ${editing && selected ? 'hs-selected' : ''} ${isDragging ? 'hs-picked-up' : ''} ${isPriming ? 'hs-priming' : ''} ${dragOver ? 'hs-drag-over' : ''} ${jiggling ? 'hs-jiggle' : ''}`}
      style={{
        ...tileGridStyle(x, y, w, h),
        ...(isPresetColor ? {} : { background: hexToRgba(color, tileOpacity) }),
        color: textColor,
        // `none` už v EDIT MÓDU, ne teprve při tažení. Prohlížeč se rozhoduje,
        // jestli je gesto scroll nebo něco jiného, hned při prvním dotyku —
        // dokud tu stálo `isDragging`, přišlo to o 400 ms podržení pozdě:
        // prst se pohnul, prohlížeč si gesto vzal na scroll, poslal
        // `pointercancel` a tažení umřelo. Dlaždicí pak nešlo hnout.
        // Mimo edit mód zůstává scroll i přejíždění mezi stránkami.
        touchAction: editing || isDragging ? 'none' : undefined,
        // Dlaždice v ruce jde plynule za prstem. `pointerEvents: none` je
        // nutné — jinak by si stála pod kurzorem sama sobě v cestě a hledání
        // cílové buňky (elementFromPoint) by pod prstem našlo pořád ji.
        //
        // Posun zvednuté dlaždice sem ZÁMĚRNĚ nepatří: zapisuje ho přímo do
        // DOM obsluha tažení v HomeScreen.tsx. Kdyby šel přes React, muselo
        // by se při každém pohybu prstu překreslit všech ~26 dlaždic a
        // dlaždice by za prstem viditelně kulhala.
        //
        // `transition` musí být `none` — jakýkoli přechod znamená, že
        // dlaždice dobíhá tam, kde prst už dávno není.
        ...(isDragging
          ? { pointerEvents: 'none' as const, transition: 'none', willChange: 'transform' }
          : {}),
      }}
      data-tile-id={id}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
      onContextMenu={(e) => {
        if (!editing && onOpenQuickActions) {
          e.preventDefault();
          onOpenQuickActions();
        }
      }}
      role="button"
      tabIndex={0}
      onKeyDown={editing ? (e) => { if (e.key === 'Enter') onSelect(); } : (e) => { if (e.key === 'Enter') onClick(); }}
    >
      {customContent ? (
        customContent
      ) : (
        <>
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
        </>
      )}
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
