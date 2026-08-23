import { ReactNode } from 'react';
import { Beer, beerBg, beerText, beerName } from '../lib/supabase';

type TileSummary = {
  filled: boolean;
  label: string;
};

type BeerTileGridProps = {
  beers: Beer[];
  onSelect: (beer: Beer) => void;
  summaryFor: (beer: Beer) => TileSummary;
};

/**
 * Dvousloupcová mřížka dlaždic piv — sdílený vzhled pro Objednávky, Stáčení
 * (lahve i KEG) a Fasování/Prodejnu. Styl sjednocený s dlaždicemi na Domů
 * (viz LauncherTile/HomeScreen.css .hs-tile): plná barva piva (beer_color),
 * stejný tvar (border-radius 4px, ne "pilulkovité" zaoblení), bez rámečku.
 * Text je bílý/tmavý podle jasu barvy piva (beerText) — natvrdo bílý text
 * byl u světlých piv (např. světlý ležák) špatně čitelný. Vyplněná dlaždice
 * dostane kontrastní prstenec a pod názvem konkrétní rozpis množství. Název
 * piva (beerName) už stupeň obsahuje (např. "12° Světlá"), proto se sem
 * stupeň znovu nepřidává - dřív se tím zdvojoval ("12° 12° Světlá").
 */
export function BeerTileGrid({ beers, onSelect, summaryFor }: BeerTileGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {beers.map((b) => {
        const { filled, label } = summaryFor(b);
        const textClass = beerText(b);
        const isDark = textClass === 'text-white';
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b)}
            className={`text-left rounded shadow-sm p-3 min-h-[64px] transition-all hover:brightness-110 active:scale-[0.98] flex flex-col gap-1 ${textClass} ${
              filled ? (isDark ? 'ring-2 ring-white/80' : 'ring-2 ring-primary-900/40') : ''
            }`}
            style={{ backgroundColor: beerBg(b) }}
          >
            <span className="font-black text-sm leading-tight">{beerName(b)}</span>
            {filled && (
              <span className={`text-[11px] font-bold ${isDark ? 'text-white/90' : 'text-primary-900/80'}`}>{label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

type TileTotalBarProps = {
  label: string;
  value: string;
};

/** Malá lišta se souhrnem nad dlaždicemi — vždy na očích, ne až po scrollu pod nimi. */
export function TileTotalBar({ label, value }: TileTotalBarProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-3 py-2 mb-3">
      <span className="text-[11px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">{label}</span>
      <span className="text-sm font-black text-amber-900 dark:text-amber-200">{value}</span>
    </div>
  );
}

type BeerTilePanelProps = {
  beer: Beer;
  onClose: () => void;
  children: ReactNode;
  headerRight?: ReactNode;
  /** Vlastní patička (např. „Přidat do zápisu“ / „Zpět“ u stáčení). Bez zadání se zobrazí výchozí tlačítko „Hotovo ✓“. */
  footer?: ReactNode;
};

/** Plnoobrazovkový panel otevřený z dlaždice — stejná "skořápka" pro všechny obrazovky, obsah (řádky obalů) dodává volající. */
export function BeerTilePanel({ beer, onClose, children, headerRight, footer }: BeerTilePanelProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-2 sm:p-4 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="w-full max-w-xl m-auto" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div className="px-4 py-3 flex items-center justify-between gap-2 shrink-0" style={{ backgroundColor: beerBg(beer) }}>
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className={`font-black text-lg leading-tight truncate drop-shadow ${beerText(beer)}`}>{beerName(beer)}</span>
              <span className={`text-sm font-bold shrink-0 opacity-80 ${beerText(beer)}`}>{beer.degree ?? ''}</span>
              {headerRight}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-10 h-10 grid place-items-center rounded-xl bg-black/25 hover:bg-black/40 text-white font-black text-xl transition select-none"
              title="Zavřít a vrátit se k dlaždicím"
            >✕</button>
          </div>
          <div className="p-3 bg-white dark:bg-neutral-800 space-y-2 overflow-y-auto">
            {children}
            {footer ?? (
              <div className="flex justify-end pt-1">
                <button type="button" onClick={onClose} className="btn-primary font-black shadow-md">Hotovo ✓</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
