// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button; v edit módu navíc nabízí
// přetažení (drag handle = celá dlaždice), cyklování velikosti a přebarvení.
import type { NavItem } from './Layout';
import { TILE_COLORS, COLOR_HEX, type TileOverride, type TileSize, type TileColor } from '../lib/homeLayout';

function sizeClass(size: TileSize): string {
  if (size === 'w2') return 'w2';
  if (size === 'h2') return 'h2';
  if (size === 'w2h2') return 'w2 h2';
  if (size === 'sm') return 'sm';
  return '';
}

export default function LauncherTile({
  item, override, editing, badge, onClick, onDragStart, onDragOver, onDrop, dragOver, onCycleSize, onRecolor,
}: {
  item: NavItem;
  override: TileOverride;
  editing: boolean;
  badge?: string | number;
  onClick: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  dragOver: boolean;
  onCycleSize: () => void;
  onRecolor: (c: TileColor) => void;
}) {
  const Icon = item.icon;
  const color = override.color ?? 'coral';
  const size = override.size ?? 'n';

  return (
    <div
      className={`hs-tile c-${color} ${sizeClass(size)} ${editing ? 'hs-editing' : ''} ${dragOver ? 'hs-drag-over' : ''}`}
      draggable={editing}
      onDragStart={editing ? onDragStart : undefined}
      onDragOver={editing ? (e) => { e.preventDefault(); onDragOver(e); } : undefined}
      onDrop={editing ? (e) => { e.preventDefault(); onDrop(e); } : undefined}
      onClick={editing ? undefined : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={editing ? undefined : (e) => { if (e.key === 'Enter') onClick(); }}
    >
      <Icon />
      <div className="hs-lbl">{item.label}</div>
      {badge !== undefined && <span className="hs-badge">{badge}</span>}

      {editing && (
        // draggable={false} je nutné explicitně — jinak potomek zdědí gesto
        // přetažení z rodičovské dlaždice a myš na desktopu spustí drag
        // místo kliknutí na tlačítko (klik na velikost/barvu by nefungoval).
        <div className="hs-tile-controls" draggable={false} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div className="hs-ctrl-row">
            <button type="button" draggable={false} className="hs-size-btn" title="Změnit velikost" onClick={onCycleSize}>
              ⤢
            </button>
          </div>
          <div className="hs-swatches">
            {TILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                draggable={false}
                className={`hs-swatch ${c === color ? 'active' : ''}`}
                style={{ background: COLOR_HEX[c] }}
                title={c}
                onClick={() => onRecolor(c)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
