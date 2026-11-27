import { TrendingDown } from 'lucide-react';
import type { ZtrataMesice } from '../lib/ztrataOprotiInventure';

// 📉 „Rozdíl oproti inventuře" na konci měsíce — jen BOKEM (lib/ztrataOprotiInventure.ts).
// Majitel 26. 11. 2026: „…napsat bokem na konci měsíce rozdíl oproti inventuře, ať je vidět ztráta, ale
// nepočítat je, počítá se jen co je reálně na skladě." Nic z tohohle bloku nevstupuje do stavu skladu ani do
// čísel v Rozboru — jsou to jen součty rozdílů, které odhalila počítání (Úprava skladu, inventura). Počítají se
// živě (27. 11. 2026: „pokud se bude dofasovávat zpětně, to číslo se může zmenšovat").

const kusu = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} ks`;

export default function RozborZtrataBokem({ mesicText, vysledek }: { mesicText: string; vysledek: ZtrataMesice }) {
  const { radky, ztrata, prebytek, pocitani } = vysledek;
  return (
    <section
      data-testid="rozbor-ztrata-bokem"
      aria-label="Rozdíl oproti inventuře za měsíc"
      className="rounded-xl border-2 border-neutral-300 bg-neutral-50 p-3 space-y-2"
    >
      <div className="flex items-center gap-1.5 font-black text-sm text-neutral-950">
        <TrendingDown size={16} className="shrink-0 text-rose-700" aria-hidden="true" />
        <span>Rozdíl oproti inventuře — {mesicText}</span>
      </div>
      <p className="text-xs font-bold text-neutral-700">
        Jen bokem: do stavu skladu ani do čísel nahoře se nepočítá — počítá se jen to, co je napočítané. Součet rozdílů, které
        odhalila Úprava skladu (napočítáno proti tomu, co podle evidence mělo být). Mění se podle evidence: když se zpětně
        dopíše fasování za dny před počítáním, rozdíl se zmenší.
      </p>
      {pocitani === 0 ? (
        <p className="text-xs font-black text-neutral-800">V tomhle měsíci nebyla žádná Úprava skladu ani inventura.</p>
      ) : radky.length === 0 ? (
        <p className="text-xs font-black text-emerald-800">Za {pocitani} počítání všechno sedělo — žádný rozdíl.</p>
      ) : (
        <>
          <p className="text-sm font-black tabular-nums">
            <span className="text-rose-700" data-testid="rozbor-ztrata-soucet">ztráta {kusu(ztrata)}</span>
            {prebytek > 0 && <span className="text-neutral-700"> · přebytek {kusu(prebytek)}</span>}
          </p>
          <ul className="space-y-1">
            {radky.map((r) => (
              <li key={r.key} className="flex items-baseline justify-between gap-2 rounded border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-900">
                <span className="min-w-0 break-words">{r.beer_name} {r.package_label}</span>
                <span className={`shrink-0 tabular-nums font-black ${r.rozdil < 0 ? 'text-rose-700' : 'text-neutral-700'}`}>
                  {kusu(r.rozdil)}
                  {r.pocitani > 0 && <span className="font-semibold text-neutral-500"> · {r.pocitani}× počítáno</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
