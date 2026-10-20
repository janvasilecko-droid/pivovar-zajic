// 🛢️ Statistika → Malé sudy: kolik malých sudů (20 / 15 / 10 l) šlo, s jakým
// pivem a pro koho. Výpočet: lib/statistikaMalychSudu.ts.
import { useMemo, useState } from 'react';
import { EmptyState } from './ui';
import { Nadpis, Prepinac } from './StatistikaVystav';
import { SipkyObdobi } from './SipkyObdobi';
import { denObdobi, popisRozsahu, rozsahObdobi, type Obdobi } from '../lib/statistika';
import { statistikaMalychSudu, type ObjednavkaStat, type PivoStat, type PolozkaStat } from '../lib/statistikaMalychSudu';
import type { ObalProSudy } from '../lib/maleSudy';

type Props = {
  orders: ObjednavkaStat[];
  orderItems: PolozkaStat[];
  obaly: (ObalProSudy & { id: string })[];
  piva: PivoStat[];
  dnes: string;
};

const cz = (n: number) => n.toLocaleString('cs-CZ');

export default function StatistikaMalychSudu({ orders, orderItems, obaly, piva, dnes }: Props) {
  const [obdobi, setObdobi] = useState<Obdobi>('mesic');
  const [posun, setPosun] = useState(0);
  const den = denObdobi(obdobi, dnes, posun);
  const rozsah = rozsahObdobi(obdobi, den);
  const s = useMemo(
    () => statistikaMalychSudu({ orders, items: orderItems, obaly, piva, od: rozsah.od, do: rozsah.do }),
    [orders, orderItems, obaly, piva, rozsah.od, rozsah.do],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Prepinac
          volby={[['tyden', 'Týden'], ['mesic', 'Měsíc'], ['rok', 'Rok'], ['vse', 'Vše']] as const}
          vybrano={obdobi}
          onZmena={(o) => { setObdobi(o); setPosun(0); }}
        />
        {obdobi !== 'vse' && (
          <SipkyObdobi popis={popisRozsahu(obdobi, den)} posun={posun} onPosun={setPosun} nazev="období" />
        )}
      </div>

      {s.kusu === 0 ? (
        <EmptyState text="V tomhle období nejsou v objednávkách žádné malé sudy (20, 15, 10 l)." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <div className="card p-3.5">
              <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Sudů</div>
              <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums">{cz(s.kusu)}</div>
            </div>
            <div className="card p-3.5">
              <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Zavezeno</div>
              <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums">{cz(s.zavezeno)}</div>
            </div>
            <div className="card p-3.5">
              <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Litrů</div>
              <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums">{cz(s.litru)}</div>
            </div>
          </div>

          <section className="card p-3.5 sm:p-5">
            <Nadpis text="Podle velikosti a obsahu" popis="Kolik kusů a jaké pivo bylo v sudech (zavezeno = objednávka už odjela)" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-udaj font-black uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                    <th scope="col" className="text-left py-1.5 pr-2">Sud</th>
                    <th scope="col" className="text-right py-1.5 px-2">Kusů</th>
                    <th scope="col" className="text-right py-1.5 pl-2">Zavezeno</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {s.poObalech.map((o) => (
                    <tr key={o.obalL} className="border-b border-neutral-100">
                      <th scope="row" className="text-left py-1.5 pr-2 font-black">{o.obal}</th>
                      <td className="text-right py-1.5 px-2 font-bold">{cz(o.kusu)}</td>
                      <td className="text-right py-1.5 pl-2">{cz(o.zavezeno)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-udaj font-black uppercase tracking-wide text-neutral-500 border-b border-neutral-200">
                    <th scope="col" className="text-left py-1.5 pr-2">Pivo</th>
                    <th scope="col" className="text-right py-1.5 px-2">Kusů</th>
                    <th scope="col" className="text-right py-1.5 pl-2">Litrů</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {s.poPivech.map((b) => (
                    <tr key={b.pivo} className="border-b border-neutral-100">
                      <th scope="row" className="text-left py-1.5 pr-2 font-black">{b.pivo}</th>
                      <td className="text-right py-1.5 px-2 font-bold">{cz(b.kusu)}</td>
                      <td className="text-right py-1.5 pl-2">{cz(b.litru)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-3.5 sm:p-5">
            <Nadpis text="Pro koho" popis="Odběratelé podle počtu malých sudů, pod nimi co přesně dostali" />
            <ul className="space-y-3">
              {s.poOdberatelich.map((o) => (
                <li key={o.odberatel} className="rounded-xl border border-neutral-200 p-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-display font-black text-neutral-900 break-words">{o.odberatel}</span>
                    <span className="text-sm font-black tabular-nums text-amber-900 shrink-0">{cz(o.kusu)} ks · {cz(o.litru)} l</span>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {o.radky.map((r) => (
                      <li key={`${r.pivo}|${r.obalL}`} className="flex items-baseline gap-2 text-xs text-neutral-800">
                        <span className="font-bold break-words min-w-0">{r.pivo}</span>
                        <span className="font-black shrink-0">{r.obal}</span>
                        <span className="ml-auto tabular-nums font-black shrink-0">×{cz(r.kusu)}{r.zavezeno < r.kusu ? ` (zavezeno ${cz(r.zavezeno)})` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
