// Jedna dlaždice přizpůsobitelného launcheru (src/screens/HomeScreen.tsx).
// Mimo edit mód je to prostý navigační button; v edit módu navíc nabízí
// přesun, cyklování velikosti a přebarvení (přednastavené barvy nebo
// libovolná vlastní přes nativní color picker).
//
// Přesun je "klepni a klepni" (tap-to-swap), NE gesto přetažení — pokusy
// o pointer-based drag (i s pointer capture a touch-action) na dotykových
// zařízeních nešlo spolehlivě rozjet. Klepnutí je jediná interakce, co už
// prokazatelně funguje všude (obyčejná navigace), takže na ní staví
// i přesouvání: klepneš na dlaždici → vybere se (zvýrazní), klepneš na
// druhou → prohodí se pozice. Méně "native", ale funguje jistě.
import type { NavItem } from './Layout';
import { TILE_COLORS, COLOR_HEX, hexToRgba, type TileOverride, type TileSize } from '../lib/homeLayout';

function sizeClass(size: TileSize): string {
  if (size === 'w2') return 'w2';
  if (size === 'h2') return 'h2';
  if (size === 'w2h2') return 'w2 h2';
  if (size === 'sm') return 'sm';
  return '';
}

export default function LauncherTile({
  item, override, editing, badge, tileOpacity, pageCount, currentPage, onMoveToPage,
  selectedForSwap, onClick, onTapToMove, onCycleSize, onRecolor,
}: {
  item: NavItem;
  override: TileOverride;
  editing: boolean;
  badge?: string | number;
  tileOpacity: number;
  pageCount: number;
  currentPage: number;
  onMoveToPage: (targetPageIndex: number) => void;
  /** true = tahle dlaždice je právě vybraná a čeká na klepnutí na cíl */
  selectedForSwap: boolean;
  onClick: () => void;
  /** Klik na dlaždici v edit módu (mimo ovládací prvky) — vybrat/prohodit. */
  onTapToMove: () => void;
  onCycleSize: () => void;
  onRecolor: (c: string) => void;
}) {
  const Icon = item.icon;
  const color = override.color ?? 'coral';
  const size = override.size ?? 'n';
  // Přednastavená barva → CSS třída .c-<jméno> (viz HomeScreen.css); vlastní
  // barva z color pickeru (hex, není v seznamu jmen) → inline styl.
  const isPreset = (TILE_COLORS as string[]).includes(color);

  return (
    <div
      className={`hs-tile ${isPreset ? `c-${color}` : ''} ${sizeClass(size)} ${editing ? 'hs-editing' : ''} ${selectedForSwap ? 'hs-selected' : ''}`}
      style={isPreset ? undefined : { background: hexToRgba(color, tileOpacity) }}
      data-tile-id={item.id}
      onClick={editing ? onTapToMove : onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') (editing ? onTapToMove() : onClick()); }}
    >
      <Icon />
      <div className="hs-lbl">{item.label}</div>
      {badge !== undefined && <span className="hs-badge">{badge}</span>}
      {editing && <span className="hs-move-hint">{selectedForSwap ? '✓ Klepni kam přesunout' : '⇄'}</span>}

      {editing && (
        // stopPropagation, ať klik na tlačítko neprovede taky "vybrat/prohodit".
        <div className="hs-tile-controls" onClick={(e) => e.stopPropagation()}>
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
            <button type="button" className="hs-size-btn" title="Změnit velikost" onClick={onCycleSize}>
              ⤢
            </button>
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
      )}
    </div>
  );
}
