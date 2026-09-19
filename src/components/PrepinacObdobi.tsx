import { Calendar } from 'lucide-react';
import { posunMesic, businessDateISO } from '../lib/businessDate';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';
import { dnyTydne, posunTyden } from '../lib/tydenDnu';

/**
 * 📅 Přepínač období: Den / Týden / Měsíc + šipky na posun.
 *
 * Stálo to dvakrát, skoro stejně, ve Stáčení KEG a ve Stáčení lahví —
 * a pokaždé to bylo poskládané z ručně malovaných tlačítek (`bg-amber-200`
 * pro vybrané, `bg-white` pro ostatní, šipky `bg-amber-200`). Dohromady
 * z toho bylo přes dvacet tlačítek, která si barvu malují sama, na dvou
 * nejpoužívanějších obrazovkách aplikace.
 *
 * Vybrané období používá `.nav-tab-active` — tutéž roli, jakou má aktivní
 * záložka jinde v appce, takže „tohle je vybrané" vypadá všude stejně.
 *
 * Šipky mají 44 px na výšku i šířku: přepíná se jimi den po dni v provozu,
 * často jednou rukou.
 */
export type Obdobi = 'day' | 'week' | 'month';

export function PrepinacObdobi({
  obdobi, onObdobi, den, onDen, tyden, onTyden, mesic, onMesic,
}: {
  obdobi: Obdobi;
  onObdobi: (o: Obdobi) => void;
  /** YYYY-MM-DD */
  den: string;
  onDen: (d: string) => void;
  /** Klíč ISO týdne (viz WeeklyOrderSummaryCard). */
  tyden: string;
  onTyden: (t: string) => void;
  /** YYYY-MM */
  mesic: string;
  onMesic: (m: string) => void;
}) {
  const volby: { klic: Obdobi; popis: string }[] = [
    { klic: 'day', popis: 'Den' },
    { klic: 'week', popis: 'Týden' },
    { klic: 'month', popis: 'Měsíc' },
  ];

  // `weekRange` popisek už umí — formátovat ho tu podruhé by znamenalo, že
  // se týden píše na dvou místech dvěma způsoby.
  const popisTydne = weekRange(tyden).label;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded p-0.5">
        {volby.map((v) => (
          <button
            key={v.klic}
            type="button"
            onClick={() => onObdobi(v.klic)}
            aria-pressed={obdobi === v.klic}
            className={`nav-tab !px-2.5 !py-1 ${obdobi === v.klic ? 'nav-tab-active' : ''}`}
          >
            <Calendar size={14} /> {v.popis}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn-secondary w-11 !px-0 shrink-0"
          aria-label="Předchozí období"
          onClick={() => {
            if (obdobi === 'day') onDen(posunTyden(den, -1));
            else if (obdobi === 'week') onTyden(shiftWeek(tyden, -1));
            else onMesic(posunMesic(mesic, -1));
          }}
        >‹</button>

        {/* 📅 DNY JAKO TLAČÍTKA, ne kalendář. Z provozu 19. 9. 2026: „místo
            den tam dej tlačítka po, út, st, čt, pá jako dny, a kliknutím na den
            se uvidí, jaký den se co stáčelo." Výběr přes systémový kalendář je na
            telefonu pět klepnutí a člověk u toho musí vědět, kolikátého bylo
            v úterý — přitom se stáčení plánuje po dnech v týdnu.
            Šipky proto listují po TÝDNECH: řádek dnů zůstane celý. */}
        {obdobi === 'day' && (
          <div className="flex items-center gap-0.5" role="group" aria-label="Den v týdnu">
            {dnyTydne(den).map((d) => {
              const vybrany = d.iso === den;
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => onDen(d.iso)}
                  aria-pressed={vybrany}
                  aria-label={`${d.zkratka} ${d.cislo}.`}
                  // Role místo vlastní barvy (viz docs/jednotny-styl.md).
                  // Víkend se neodlišuje BARVOU: šedá na světlém měla kontrast
                  // 2,45 : 1 při mezi 4,5 — našel to scripts/zkontroluj-kontrast.mjs.
                  // Mírnější váhu proto nese jen číslo dne.
                  className={`${vybrany ? 'btn-amber' : 'btn-ghost'} !w-10 !px-0 !flex-col !gap-0`}
                >
                  <span className="text-[11px] uppercase leading-none">{d.zkratka}</span>
                  <span className={`text-udaj tabular-nums leading-none ${d.vikend ? 'opacity-60' : 'opacity-80'}`}>{d.cislo}.</span>
                </button>
              );
            })}
          </div>
        )}
        {obdobi === 'week' && (
          <span className="chip badge-slate whitespace-nowrap">{popisTydne}</span>
        )}
        {obdobi === 'month' && (
          <input
            type="month"
            value={mesic}
            onChange={(e) => onMesic(e.target.value)}
            aria-label="Zvolený měsíc"
            className="input text-xs font-bold !px-2 !py-1"
          />
        )}

        <button
          type="button"
          className="btn-secondary w-11 !px-0 shrink-0"
          aria-label="Další období"
          onClick={() => {
            if (obdobi === 'day') onDen(posunTyden(den, 1));
            else if (obdobi === 'week') onTyden(shiftWeek(tyden, 1));
            else onMesic(posunMesic(mesic, 1));
          }}
        >›</button>
      </div>
    </div>
  );
}

/** Dnešek jako `YYYY-MM-DD` — pro výchozí hodnotu přepínače. */
export function dnesniDen(): string {
  return businessDateISO();
}

/** Tenhle týden jako klíč ISO týdne. */
export function tentoTyden(): string {
  return isoWeekKey(dnesniDen());
}
