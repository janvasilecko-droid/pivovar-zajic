import { Calendar } from 'lucide-react';
import { posunMesic } from '../lib/businessDate';
import { isoWeekKey, weekRange, shiftWeek } from './WeeklyOrderSummaryCard';

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

  /** Posun dne o „delta" dní. Přes UTC, ať nezáleží na zóně zařízení. */
  const posunDen = (d: string, delta: number) => {
    const t = new Date(d + 'T00:00:00Z');
    t.setUTCDate(t.getUTCDate() + delta);
    return t.toISOString().slice(0, 10);
  };

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
            className={`nav-tab !px-2.5 !py-1 !min-h-[36px] ${obdobi === v.klic ? 'nav-tab-active' : ''}`}
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
            if (obdobi === 'day') onDen(posunDen(den, -1));
            else if (obdobi === 'week') onTyden(shiftWeek(tyden, -1));
            else onMesic(posunMesic(mesic, -1));
          }}
        >‹</button>

        {obdobi === 'day' && (
          <input
            type="date"
            value={den}
            onChange={(e) => onDen(e.target.value)}
            aria-label="Zvolený den"
            className="input text-xs font-bold !px-2 !py-1"
          />
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
            if (obdobi === 'day') onDen(posunDen(den, 1));
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
  return new Date().toISOString().slice(0, 10);
}

/** Tenhle týden jako klíč ISO týdne. */
export function tentoTyden(): string {
  return isoWeekKey(dnesniDen());
}
