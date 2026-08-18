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
  emptyHint?: string;
  /** Skryje odznak stupně (12°/11°…) — v Objednávkách je zbytečný, důležité
      je vidět rozpis množství podle obalů, ne stupeň piva. */
  hideDegree?: boolean;
};

/**
 * Dvousloupcová mřížka dlaždic piv — sdílený vzhled pro Objednávky, Stáčení
 * (lahve i KEG) a Fasování/Prodejnu. Vyplněná dlaždice dostane zelený rámeček
 * a odznak ✓, aby šlo na první pohled (bez čtení drobného textu) poznat, co
 * už je v zápisu.
 */
export function BeerTileGrid({ beers, onSelect, summaryFor, emptyHint = 'klepni pro obaly', hideDegree = false }: BeerTileGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {beers.map((b) => {
        const { filled, label } = summaryFor(b);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b)}
            className={`relative text-left rounded-2xl shadow-sm p-3 min-h-[76px] transition-all hover:brightness-[0.97] active:scale-[0.98] flex flex-col gap-1.5 ${
              filled ? 'ring-2 ring-success-500 ring-offset-1 ring-offset-white dark:ring-offset-neutral-900' : 'ring-1 ring-black/5'
            }`}
            style={{ backgroundColor: beerBg(b) }}
          >
            {filled && (
              <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-success-600 text-white text-xs font-black grid place-items-center shadow-md">
                ✓
              </span>
            )}
            <span className={`font-black text-sm leading-tight ${beerText(b)}`}>{beerName(b)}</span>
            {!hideDegree && b.degree && (
              <span className={`self-start text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/70 ${beerText(b)} opacity-90`}>
                {b.degree}
              </span>
            )}
            <span className={`mt-auto text-[11px] font-bold ${filled ? beerText(b) : `${beerText(b)} opacity-70`}`}>
              {filled ? label : emptyHint}
            </span>
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
