// 🛢️ Přehled ležáckých tanků 1–8 nahoře na ploše — mimo dlaždice, bílé pozadí.
// ---------------------------------------------------------------------------
// Z provozu 28. 9. 2026: „ty tanky dej nahoru, nedávej je do dlaždice, ať mají
// normálně bílé pozadí, ten ukazatel naplněnosti udělej horizontálně."
//
// U každého tanku: číslo, hl, pivo (v barvě z nastavení piv, ať je rozdíl
// mezi pivy vidět na první pohled) a vodorovný pruh plnosti v barvě piva —
// kolik zbývá z výstavu várky (výstav = 100 %).
// Klepnutí na jeden tank otevře Sklep rovnou na detailu toho tanku.
import { beerBg, beerText } from '../lib/supabase';
import { POPIS_FAZE, type FazeTanku } from '../lib/fazeTanku';

export type TankNaPlose = {
  id: string;
  label: string;
  pivo: string;
  barva: string | null;
  litry: number;
  /** Výstav várky v litrech = 100 % pruhu (30. 10. 2026: procenta z výstavu, ne z celého tanku). */
  vystav: number;
  prazdny: boolean;
  /**
   * Tank bez piva v sanitaci: uzavřený → po oplachu → po louhu → vysanitovaný
   * (lib/fazeTanku.ts, 18. 11. 2026). Místo piva a pruhu se ukáže fáze.
   */
  faze?: FazeTanku | null;
};

/** Barva štítku fáze — od varovné (uzavřený, musí se oplachovat) po zelenou (hotovo). */
const BARVY_FAZE: Record<FazeTanku, string> = {
  uzavreny: 'bg-rose-100 text-rose-900 border border-rose-300',
  po_oplachu: 'bg-sky-100 text-sky-900 border border-sky-300',
  po_louhu: 'bg-amber-100 text-amber-950 border border-amber-300',
  vysanitovany: 'bg-emerald-100 text-emerald-900 border border-emerald-300',
};

const kratce = (l: string) => l.replace(/spilka\s*/i, 'S').replace(/tank\s*/i, 'T');

export function PrehledTankuPlocha({ tanky, onOtevrit }: { tanky: TankNaPlose[]; onOtevrit: (tankId: string) => void }) {
  if (tanky.length === 0) return null;
  return (
    <section className="bg-white rounded border border-neutral-200/90 shadow-xs overflow-hidden">
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-2 p-2 select-none">
        {tanky.map((t) => {
          const faze = t.faze ?? null;
          const pct = t.prazdny || faze || !(t.vystav > 0) ? 0 : Math.min(100, Math.max(2, Math.round((t.litry / t.vystav) * 100)));
          const pivo = { beer_color: t.barva };
          const pismoPiva = beerText(pivo);
          // Pivo bez nastavené barvy by mělo pruh šedý na šedém — dostane jantarovou.
          const barvaPruhu = t.barva ?? '#d97706';
          return (
            <button
              key={t.id}
              type="button"
              aria-label={`Otevřít detail tanku ${t.label}`}
              title={faze ? `${t.label}: ${POPIS_FAZE[faze].napoveda}` : undefined}
              onClick={() => onOtevrit(t.id)}
              className="min-w-0 flex flex-col gap-1 text-left cursor-pointer rounded tap"
            >
              <div className="flex items-baseline justify-between gap-1 text-xs font-black text-neutral-900 leading-none">
                <span>{kratce(t.label)}</span>
                <span className="tabular-nums">{t.prazdny || !(t.litry > 0) ? '—' : `${(t.litry / 100).toFixed(t.litry < 1000 ? 1 : 0)} hl`}</span>
              </div>
              {faze ? (
                <div
                  data-faze-tanku={faze}
                  className={`text-udaj font-bold tracking-tight leading-tight truncate rounded px-0.5 ${BARVY_FAZE[faze]}`}
                >
                  {POPIS_FAZE[faze].text}
                </div>
              ) : t.prazdny ? (
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
            </button>
          );
        })}
      </div>
    </section>
  );
}
