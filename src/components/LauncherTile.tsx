// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button; v edit módu navíc nabízí
// přesun, přímý výběr velikosti, přebarvení, přejmenování a skrytí.
//
// Přesun je dlouhé podržení (long-press), stejně jako na Androidu — držení
// timeru a rozhodování "scroll vs. drag" řeší rodič (HomeScreen.tsx) přes
// window pointer eventy; tahle komponenta jen předává pointerdown a
// zobrazuje vizuální stav ("nabíjení" během čekání / zvednutá dlaždice /
// cíl přesunu / "jiggle" ostatních dlaždic, dokud se jedna přesouvá).
import { useState } from 'react';
import type { NavItem } from './Layout';
import { TILE_COLORS, COLOR_HEX, hexToRgba, type TileOverride, type TileSize } from '../lib/homeLayout';

function sizeClass(size: TileSize): string {
  if (size === 'w2') return 'w2';
  if (size === 'h2') return 'h2';
  if (size === 'w2h2') return 'w2 h2';
  if (size === 'sm') return 'sm';
  return '';
}

// Přímý výběr velikosti (místo cyklování jedním tlačítkem) — každá dlaždice
// ve výběru ukazuje svůj skutečný tvar/poměr stran, takže je jasné, co se
// stane, a stačí jedno klepnutí přesně na cílovou velikost.
const SIZE_OPTIONS: { key: TileSize; w: number; h: number; label: string }[] = [
  { key: 'sm', w: 8, h: 8, label: 'Malá' },
  { key: 'n', w: 14, h: 14, label: 'Normální' },
  { key: 'w2', w: 22, h: 11, label: 'Široká' },
  { key: 'h2', w: 11, h: 22, label: 'Vysoká' },
  { key: 'w2h2', w: 20, h: 20, label: 'Velká' },
];

export default function LauncherTile({
  item, override, editing, badge, tileOpacity, pageCount, currentPage, onMoveToPage,
  onClick, onDragPointerDown, isDragging, isPriming, dragOver, jiggling, onSetSize, onRecolor, onHide, onRename,
}: {
  item: NavItem;
  override: TileOverride;
  editing: boolean;
  badge?: string | number;
  tileOpacity: number;
  pageCount: number;
  currentPage: number;
  onMoveToPage: (targetPageIndex: number) => void;
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
  onSetSize: (size: TileSize) => void;
  onRecolor: (c: string) => void;
  onHide: () => void;
  onRename: (label: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const Icon = item.icon;
  const color = override.color ?? 'coral';
  const size = override.size ?? 'n';
  const label = override.label || item.label;
  // Přednastavená barva → CSS třída .c-<jméno> (viz HomeScreen.css); vlastní
  // barva z color pickeru (hex, není v seznamu jmen) → inline styl.
  const isPreset = (TILE_COLORS as string[]).includes(color);

  return (
    <div
      className={`hs-tile ${isPreset ? `c-${color}` : ''} ${sizeClass(size)} ${editing ? 'hs-editing' : ''} ${isDragging ? 'hs-picked-up' : ''} ${isPriming ? 'hs-priming' : ''} ${dragOver ? 'hs-drag-over' : ''} ${jiggling ? 'hs-jiggle' : ''}`}
      style={{
        ...(isPreset ? {} : { background: hexToRgba(color, tileOpacity) }),
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
      {renaming ? (
        <input
          autoFocus
          className="hs-rename-input"
          defaultValue={label}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onBlur={(e) => { onRename(e.target.value); setRenaming(false); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setRenaming(false);
          }}
        />
      ) : (
        <div
          className="hs-lbl"
          onPointerDown={(e) => { if (editing) e.stopPropagation(); }}
          onClick={(e) => { if (editing) { e.stopPropagation(); setRenaming(true); } }}
        >{label}</div>
      )}
      {badge !== undefined && <span className="hs-badge">{badge}</span>}
      {editing && !renaming && <span className="hs-move-hint">podrž a táhni</span>}

      {editing && (
        // stopPropagation, ať klik/dotek na tlačítko nezačne dlouhé podržení
        // celé dlaždice (rodič má vlastní onPointerDown pro přesun).
        <div className="hs-tile-controls" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
          <div className="hs-ctrl-row">
            {pageCount > 1 && (
              <select
                className="hs-page-select"
                title="Přesunout na stránku"
                value={currentPage}
                onChange={(e) => onMoveToPage(Number(e.target.value))}
              >
                {Array.from({ length: pageCount }, (_, i) => (
                  <option key={i} value={i}>{i + 1}</option>
                ))}
              </select>
            )}
            <button type="button" className="hs-size-btn" title="Skrýt dlaždici" onClick={onHide}>
              ✕
            </button>
          </div>

          <div className="hs-bottom-controls">
            <div className="hs-size-row">
              {SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`hs-size-opt ${size === opt.key ? 'active' : ''}`}
                  title={opt.label}
                  onClick={() => onSetSize(opt.key)}
                >
                  <span className="hs-size-shape" style={{ width: opt.w, height: opt.h }} />
                </button>
              ))}
            </div>

            <div className="hs-swatches">
              {TILE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`hs-swatch ${c === color ? 'active' : ''}`}
                  style={{ background: COLOR_HEX[c] }}
                  title={c}
                  onClick={() => onRecolor(c)}
                />
              ))}
              <label className="hs-swatch hs-swatch-custom" title="Vlastní barva" style={{ background: isPreset ? undefined : color }}>
                <input
                  type="color"
                  value={isPreset ? '#ffffff' : color}
                  onChange={(e) => onRecolor(e.target.value)}
                />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
