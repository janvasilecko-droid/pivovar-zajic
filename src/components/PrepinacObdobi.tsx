import { Calendar } from 'lucide-react';
import { posunMesic, businessDateISO } from '../lib/businessDate';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';
import { dnyProVyber, posunTyden } from '../lib/tydenDnu';

/**
 * 📅 Přepínač období: dny týdne / Týden / Měsíc + šipky na posun.
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
 * Zadání z 19. 9. 2026: „misto toho ze kliknu na den a pak teprv muzu
 * vybrat den, tak at rovnou muzu klikat na vybrany den." Dřív bylo „Den"
 * samostatné tlačítko a teprve po jeho zmáčknutí se objevila druhá řada
 * s dny týdne — dvě klepnutí místo jednoho. Tlačítka dnů (po, út, st, čt,
 * pá) jsou teď PŘÍMO v hlavní řadě místo tlačítka „Den": klik na den
 * zároveň přepne na denní pohled i vybere ten den.
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
  // `weekRange` popisek už umí — formátovat ho tu podruhé by znamenalo, že
  // se týden píše na dvou místech dvěma způsoby.
  const popisTydne = weekRange(tyden).label;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* 📅 DNY JAKO TLAČÍTKA, PŘÍMO v hlavní řadě — ne kalendář a ne
          samostatné tlačítko „Den", po kterém teprve vyleze výběr dnů.
          Zadání z 19. 9. 2026 (poprvé) a znovu totéž: „misto toho ze kliknu
          na den a pak teprv muzu vybrat den, tak at rovnou muzu klikat na
          vybrany den" — a pro obě obrazovky, protože si to obě půjčují
          odsud. Klik na den zároveň přepne na denní pohled i vybere ho —
          jedno klepnutí místo dvou.
          Výběr přes systémový kalendář je na telefonu pět klepnutí a
          člověk u toho musí vědět, kolikátého bylo v úterý — přitom se
          stáčení plánuje po dnech v týdnu.
          Sobota a neděle v řadě nejsou — v pivovaru se o víkendu nestáčí
          („so, ne nemusíš"). Víkendové záznamy jsou dál vidět v přehledu za
          Týden a za Měsíc. Viz dnyProVyber v lib/tydenDnu.ts. */}
      <div className="flex items-center gap-1 bg-white border border-neutral-200 rounded p-0.5 flex-wrap" role="group" aria-label="Den v týdnu">
        {dnyProVyber(den).map((d) => {
          const vybrany = obdobi === 'day' && d.iso === den;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => { onObdobi('day'); onDen(d.iso); }}
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
        {(['week', 'month'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onObdobi(k)}
            aria-pressed={obdobi === k}
            className={`nav-tab !px-2.5 !py-1 ${obdobi === k ? 'nav-tab-active' : ''}`}
          >
            <Calendar size={14} /> {k === 'week' ? 'Týden' : 'Měsíc'}
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
