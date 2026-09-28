// 🛢️ Přehled ležáckých tanků 1–8 nahoře na ploše — mimo dlaždice, bílé pozadí.
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „ty tanky dej nahoru, nedávej je do dlaždice, ať mají
// normálně bílé pozadí, ten ukazatel naplněnosti udělej horizontálně."
//
// U každého tanku: číslo, hl, pivo (v barvě z nastavení piv, ať je rozdíl
// mezi pivy vidět na první pohled) a vodorovný pruh plnosti v barvě piva.
// Klepnutí otevře Sklep.
import { beerBg, beerText } from '../lib/supabase';

export type TankNaPlose = {
  label: string;
  pivo: string;
  barva: string | null;
  litry: number;
  kapacita: number;
  prazdny: boolean;
};

const kratce = (l: string) => l.replace(/spilka\s*/i, 'S').replace(/tank\s*/i, 'T');

export function PrehledTankuPlocha({ tanky, onOtevrit }: { tanky: TankNaPlose[]; onOtevrit: () => void }) {
  if (tanky.length === 0) return null;
  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
      <div
        role="link"
        tabIndex={0}
        aria-label="Otevřít Sklep"
        onClick={onOtevrit}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOtevrit(); } }}
        className="grid grid-cols-4 gap-x-2 gap-y-2 p-2.5 cursor-pointer select-none"
      >
        {tanky.map((t) => {
          const pct = t.prazdny ? 0 : Math.min(100, Math.max(2, Math.round((t.litry / t.kapacita) * 100)));
          const pivo = { beer_color: t.barva };
          const pismoPiva = beerText(pivo);
          // Pivo bez nastavené barvy by mělo pruh šedý na šedém — dostane jantarovou.
          const barvaPruhu = t.barva ?? '#d97706';
          return (
            <div key={t.label} className="min-w-0 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-1 text-xs font-black text-neutral-900 leading-none">
                <span>{kratce(t.label)}</span>
                <span className="tabular-nums">{t.prazdny ? '—' : `${(t.litry / 100).toFixed(t.litry < 1000 ? 1 : 0)} hl`}</span>
              </div>
              {t.prazdny ? (
                <div className="text-udaj font-bold text-neutral-500 leading-tight truncate">prázdný</div>
              ) : (
                <div
                  className={`text-udaj font-bold leading-tight truncate rounded px-1 ${pismoPiva}`}
                  style={{ backgroundColor: beerBg(pivo) }}
                >
                  {t.pivo || '—'}
                </div>
              )}
              {/* Vodorovný pruh plnosti v barvě piva. */}
              <div className="h-2 w-full rounded-full bg-neutral-200 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: barvaPruhu }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
