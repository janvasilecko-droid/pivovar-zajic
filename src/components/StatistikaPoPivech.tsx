// 🍺 Statistika → Po pivech. Zadání 26. 9. 2026: „kolik 12sv se stočilo
// tento měsíc, předchozí, kolik se udělalo 12sv lahví tento měsíc,
// minulý…". Vybere se pivo a tabulka ukáže sudy a lahve po obalech za
// tento/minulý týden, měsíc a rok. Výpočet: lib/statistika.ts
// (staceniPivaPoObdobich).
import { useMemo, useState } from 'react';
import { Nadpis } from './StatistikaVystav';
import {
  formatHl, obdobiPoPivech, popisRozsahu, staceniPivaPoObdobich,
  type Obal, type Obdobi, type Pivo, type SkupinaPoPivech, type VyrobniRadek,
} from '../lib/statistika';

type Props = {
  sudy: VyrobniRadek[];
  lahve: VyrobniRadek[];
  obaly: Obal[];
  piva: Pivo[];
  dnes: string;
};

const ks = (v: number) => v.toLocaleString('cs-CZ');

/** Buňka: kusy, hektolitry a pod tím rozpad po obalech („8× KEG 50l"). */
function Bunka({ data, i }: { data: SkupinaPoPivech; i: number }) {
  if (!data.kusy[i]) return <td className="py-2.5 text-right text-neutral-300 align-top">–</td>;
  const rozpad = data.obaly.filter((o) => o.kusy[i]).map((o) => `${ks(o.kusy[i])}× ${o.nazev}`).join(', ');
  return (
    <td className="py-2.5 text-right align-top">
      <div className="font-black text-neutral-900 tabular-nums">{ks(data.kusy[i])} ks</div>
      <div className="text-udaj font-semibold text-neutral-500 tabular-nums">{formatHl(data.litry[i])} hl</div>
      <div className="text-udaj font-semibold text-neutral-400">{rozpad}</div>
    </td>
  );
}

export default function StatistikaPoPivech({ sudy, lahve, obaly, piva, dnes }: Props) {
  const mapaObalu = useMemo(() => new Map(obaly.map((o) => [o.id, o])), [obaly]);
  const obdobi = useMemo(() => obdobiPoPivech(dnes), [dnes]);

  // Výchozí pivo: to, kterého se tento měsíc stočilo nejvíc (sudy i lahve).
  const vychozi = useMemo(() => {
    const m = obdobi[2];
    const litry = new Map<string, number>();
    for (const r of [...sudy, ...lahve]) {
      if (!r.beer_id || !r.entry_date || r.entry_date < m.od || r.entry_date > m.do) continue;
      const o = r.package_id ? mapaObalu.get(r.package_id) : undefined;
      litry.set(r.beer_id, (litry.get(r.beer_id) ?? 0) + Number(r.quantity || 0) * Number(o?.volume_l ?? 0));
    }
    return [...litry.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? piva[0]?.id ?? '';
  }, [sudy, lahve, mapaObalu, obdobi, piva]);
  const [vybrane, setVybrane] = useState<string | null>(null);
  const pivoId = vybrane ?? vychozi;
  const pivo = piva.find((p) => p.id === pivoId);

  const data = useMemo(
    () => staceniPivaPoObdobich(sudy, lahve, mapaObalu, pivoId, obdobi),
    [sudy, lahve, mapaObalu, pivoId, obdobi],
  );

  return (
    <div className="space-y-4">
      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Vyber pivo" popis="Kolik se ho stočilo do sudů a do lahví — po obalech, za týden, měsíc a rok" />
        <div className="flex flex-wrap gap-2">
          {piva.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setVybrane(p.id)}
              aria-pressed={p.id === pivoId}
              className={`${p.id === pivoId ? 'btn-primary' : 'btn-ghost'} !rounded-xl !py-2 !px-3 text-xs font-black`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </section>

      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text={pivo ? `${pivo.name} — stočeno` : 'Stočeno'}
          popis="Kusy a hektolitry, pod nimi rozpad po obalech"
        />
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-udaj font-black uppercase tracking-wider text-neutral-500">
              <th scope="col" className="text-left py-2">Období</th>
              <th scope="col" className="text-right py-2">Sudy (KEG)</th>
              <th scope="col" className="text-right py-2">Lahve a PET</th>
            </tr>
          </thead>
          <tbody>
            {obdobi.map((o, i) => (
              <tr key={o.klic} className={`border-b border-neutral-100 ${i % 2 === 1 ? 'border-b-2 border-b-neutral-200' : ''}`}>
                <th scope="row" className="py-2.5 text-left align-top">
                  <div className="font-bold text-neutral-900">{o.popis}</div>
                  <div className="text-udaj font-semibold text-neutral-400">{popisRozsahu(o.klic.split('-')[0] as Obdobi, o.od)}</div>
                </th>
                <Bunka data={data.sudy} i={i} />
                <Bunka data={data.lahve} i={i} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-udaj font-semibold text-neutral-400 mt-2">
          Sudy = zápisy stáčení KEG, lahve = zápisy stáčení lahví. Lahve se plní ze stočených sudů, proto se sudy a lahve nesčítají.
        </p>
      </section>
    </div>
  );
}
