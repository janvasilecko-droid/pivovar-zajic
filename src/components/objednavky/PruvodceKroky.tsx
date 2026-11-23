// 🧭 Průvodce objednávkou — lišta kroků (odběratel → kdy → piva → souhrn).
// ---------------------------------------------------------------------------
// Majitel 23. 11. 2026: „jen k tomu dej možnost kliknout po pořadě, … stejně
// jako se dělá inventura položka po položce." Lišta ukazuje, kde člověk je,
// a dovolí vrátit se na hotový krok. Na krok dopředu se přeskočit nedá, dokud
// nejsou v pořádku ty před ním (jeKrokDostupny) — pokračuje se tlačítkem Dál.
//
// Tvar: kolečko s číslem (u hotového kroku s fajfkou) a POD NÍM název. Název vedle
// kolečka se na telefonu při čtyřech krocích vedle sebe ořezával („Odbě…"); pod
// kolečkem má každý krok čtvrtinu šířky a „Odběratel" se vejde celý.
import { Check } from 'lucide-react';
import { KROKY_PRUVODCE, NAZVY_KROKU, type KrokPruvodce } from '../../lib/objednavkaPruvodce';

// Krok má tvar kolečka s názvem pod ním (ne roli `btn-*`); barvy jsou jen z palety aplikace.
const KROK = 'w-full min-h-[48px] rounded-xl px-0.5 py-0.5 flex flex-col items-center justify-center gap-0.5 transition disabled:opacity-50 disabled:cursor-not-allowed';
const KOLECKO = 'grid place-items-center w-7 h-7 shrink-0 rounded-full border-2 text-xs font-black transition';
const KOLECKO_AKTUALNI = 'border-primary-600 bg-primary-600 text-white ring-2 ring-primary-200 dark:ring-primary-800';
const KOLECKO_HOTOVY = 'border-primary-300 bg-primary-100 text-primary-800 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-200';
const KOLECKO_DALSI = 'border-neutral-300 bg-white text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200';
const NAZEV = 'max-w-full text-xs leading-4 font-black';
const NAZEV_AKTUALNI = 'text-primary-800 dark:text-primary-200';
const NAZEV_JINY = 'text-neutral-700 dark:text-neutral-300';

export function PruvodceKroky({ krok, dostupny, naKrok }: {
  krok: KrokPruvodce;
  /** Smí se na tenhle krok přeskočit? (jeKrokDostupny nad rozepsanou objednávkou) */
  dostupny: (k: KrokPruvodce) => boolean;
  naKrok: (k: KrokPruvodce) => void;
}) {
  const cislo = KROKY_PRUVODCE.indexOf(krok);
  return (
    <nav aria-label="Kroky objednávky" data-testid="pruvodce-kroky">
      <ol className="flex gap-1">
        {KROKY_PRUVODCE.map((k, i) => {
          const aktualni = k === krok;
          const hotovy = i < cislo;
          return (
            <li key={k} className="flex-1 min-w-0">
              <button
                type="button"
                onClick={() => naKrok(k)}
                disabled={!aktualni && !dostupny(k)}
                aria-current={aktualni ? 'step' : undefined}
                aria-label={`Krok ${i + 1} ze ${KROKY_PRUVODCE.length}: ${NAZVY_KROKU[k]}${hotovy ? ' (hotovo)' : ''}`}
                className={KROK}
              >
                <span className={`${KOLECKO} ${aktualni ? KOLECKO_AKTUALNI : hotovy ? KOLECKO_HOTOVY : KOLECKO_DALSI}`} aria-hidden="true">
                  {hotovy ? <Check size={14} strokeWidth={3} /> : i + 1}
                </span>
                <span className={`${NAZEV} ${aktualni ? NAZEV_AKTUALNI : NAZEV_JINY}`} aria-hidden="true">{NAZVY_KROKU[k]}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
