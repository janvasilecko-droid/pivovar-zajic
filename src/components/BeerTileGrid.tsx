import { ReactNode } from 'react';
import { Beer, beerBg, beerText, beerName } from '../lib/supabase';
import { Check, X } from 'lucide-react';

type TileSummary = {
  filled: boolean;
  label: string;
};

type BeerTileGridProps = {
  beers: Beer[];
  onSelect: (beer: Beer) => void;
  summaryFor: (beer: Beer) => TileSummary;
  /**
   * Kolik kusů tohohle piva ještě chybí stočit do konce týdne — stejné číslo,
   * jaké dřív bylo vidět jen v samostatné „Potřeby stáčení". Uživatel na
   * začátku 9. 9. 2026: musí kvůli tomu furt přeskakovat mezi Potřeby stáčení
   * a Zápisem stáčení. Červený štítek v rohu dlaždice ať je vidět bez
   * přepínání obrazovky. Nepovinné — dlaždice v Objednávkách/Fasování/Prodejně
   * tohle číslo nemají a štítek se u nich nezobrazí.
   */
  missingFor?: (beer: Beer) => number;
};

/**
 * Mřížka dlaždic piv — sdílený vzhled pro Objednávky, Stáčení (lahve i KEG)
 * a Fasování/Prodejnu. Styl sjednocený s dlaždicemi na Domů
 * (viz LauncherTile/HomeScreen.css .hs-tile): plná barva piva (beer_color),
 * stejný tvar (border-radius 4px, ne "pilulkovité" zaoblení), bez rámečku.
 * Text je bílý/tmavý podle jasu barvy piva (beerText) — natvrdo bílý text
 * byl u světlých piv (např. světlý ležák) špatně čitelný. Vyplněná dlaždice
 * dostane kontrastní prstenec a pod názvem konkrétní rozpis množství. Název
 * piva (beerName) už stupeň obsahuje (např. "12° Světlá"), proto se sem
 * stupeň znovu nepřidává - dřív se tím zdvojoval ("12° 12° Světlá").
 *
 * TŘI SLOUPCE: šest piv se tak vejde na dvě řady a jsou vidět všechna
 * naráz bez rolování — u dvou sloupců byla poslední řada za spodní hranou
 * a muselo se scrollovat pod velkým panelem akcí. Prázdné (nezadané)
 * dlaždice jsou nízké (52 px) a název menší, ať se vejde i „Summer Ale"
 * na jeden řádek.
 *
 * VYPLNĚNÁ DLAŽDICE SE ZVĚTŠÍ: jakmile se do piva něco zadá, dlaždice
 * roztáhne přes celou šířku (col-span-3) a ukáže celý rozpis zadaného
 * množství velkým, čitelným písmem. Tím je na první pohled vidět, co už
 * je nachystané, aniž by se muselo otevírat detail — a nezadaná piva
 * zůstávají malá a rychle klikatelná. Rozpis se může zalomit, dlaždice
 * poroste s ním.
 */
export function BeerTileGrid({ beers, onSelect, summaryFor, missingFor }: BeerTileGridProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {beers.map((b) => {
        const { filled, label } = summaryFor(b);
        const textClass = beerText(b);
        const isDark = textClass === 'text-white';
        const missing = missingFor?.(b) ?? 0;
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onSelect(b)}
            className={`relative text-left rounded shadow-sm transition-all hover:brightness-110 active:scale-[0.98] ${textClass} ${
              filled
                ? `col-span-3 p-3 min-h-[56px] flex items-center justify-between gap-3 ${isDark ? 'ring-2 ring-white/80' : 'ring-2 ring-primary-900/40'}`
                : 'p-2 min-h-[52px] flex flex-col gap-0.5'
            }`}
            style={{ backgroundColor: beerBg(b) }}
          >
            {missing > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 z-10 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-black grid place-items-center shadow ring-2 ring-white dark:ring-neutral-900"
                title={`Chybí stočit ${missing} ks do konce týdne`}
              >
                {missing}
              </span>
            )}
            <span className={`font-black leading-tight ${filled ? 'text-base shrink-0' : 'text-[13px]'}`}>{beerName(b)}</span>
            {filled && (
              <span className={`text-right text-sm font-black leading-tight tabular-nums ${isDark ? 'text-white' : 'text-primary-900'}`}>{label}</span>
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
    <div className="flex items-center justify-between gap-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-3 py-2 mb-3">
      <span className="text-udaj font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300">{label}</span>
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
  /**
   * Co udělá fajfka („Hotovo") — na rozdíl od křížku, který jen zavírá.
   * Bez zadání se fajfka chová stejně jako křížek (jen zavře). U stáčení KEG
   * (Kegging.tsx) rovnou uloží rozepsaný zápis, ať uživatel po „Zadat
   * chybějících N" nemusí ještě hledat samostatné tlačítko „Uložit stáčení"
   * dole pod dlaždicemi — z provozu 9. 9. 2026: „když dám hotovo, tak ať se
   * rovnou stáčení zapíše".
   */
  onConfirm?: () => void;
  /** Fajfka se na chvíli změní na spinner/text, ať je vidět, že se ukládá. */
  confirming?: boolean;
};

/** Plnoobrazovkový panel otevřený z dlaždice — stejná "skořápka" pro všechny obrazovky, obsah (řádky obalů) dodává volající. */
export function BeerTilePanel({ beer, onClose, children, headerRight, footer, onConfirm, confirming }: BeerTilePanelProps) {
  const confirm = onConfirm ?? onClose;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 p-2 sm:p-4 flex items-center justify-center overflow-hidden" onClick={onClose}>
      <div className="w-full max-w-xl m-auto" onClick={(e) => e.stopPropagation()}>
        <div className="rounded overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
          <div className="px-3 py-2.5 flex items-center justify-between gap-2 shrink-0" style={{ backgroundColor: beerBg(beer) }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`font-black text-base leading-tight truncate drop-shadow ${beerText(beer)}`}>{beerName(beer)}</span>
              <span className={`text-sm font-bold shrink-0 opacity-80 ${beerText(beer)}`}>{beer.degree ?? ''}</span>
              {headerRight}
            </div>
            {/* Fajfka: potvrdí (a když je zadané onConfirm, i uloží) rovnou
                z lišty, bez scrollování na konec panelu. Křížek jen zavírá —
                nic se tím nezahazuje, rozepsaný zápis zůstává, jak byl. */}
            <div className="shrink-0 flex items-center gap-1.5">
              <button
                type="button"
                onClick={confirm}
                disabled={confirming}
                className="w-11 h-11 grid place-items-center rounded bg-emerald-700 hover:bg-emerald-400 text-white font-black transition select-none shadow-sm disabled:opacity-60"
                title="Hotovo — potvrdit a zavřít" aria-label="Hotovo — potvrdit a zavřít"><Check size={20} /></button>
              <button
                type="button"
                onClick={onClose}
                // Plná barva, ne černá s průhledností: lišta má barvu piva a
                // u světlého ležáku se bílý křížek na 25% černé ztrácel.
                className="w-11 h-11 grid place-items-center rounded bg-neutral-800 hover:bg-neutral-700 text-white font-black text-xl transition select-none"
                title="Zavřít a vrátit se k dlaždicím" aria-label="Zavřít a vrátit se k dlaždicím"><X size={18} /></button>
            </div>
          </div>
          <div className="p-2.5 bg-white dark:bg-neutral-800 space-y-1.5 overflow-y-auto">
            {children}
            {footer ?? (
              <div className="flex justify-end pt-1">
                <button type="button" onClick={confirm} disabled={confirming} className="btn-primary !rounded font-black shadow-md disabled:opacity-60">
                  {confirming ? 'Ukládám…' : <>Hotovo <Check className="ikona-text" /></>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
