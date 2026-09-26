// 🍺 Statistika → Po pivech. Zadání 26. 9. 2026: „kolik 12sv se stočilo
// tento měsíc, předchozí, kolik se udělalo 12sv lahví tento měsíc,
// minulý…" a hned potom „udělej to přehledněji". Proto: vybere se pivo
// a období (týden / měsíc / rok) a vždy se ukáže jen dvojice „teď proti
// minule" — zvlášť sudy, zvlášť lahve, po obalech. Dole přehled všech piv
// za stejné období. Výpočet: lib/statistika.ts (staceniPivaPoObdobich).
import { useMemo, useState } from 'react';
import { Nadpis, Prepinac, Trend } from './StatistikaVystav';
import {
  formatHl, obdobiPoPivech, popisRozsahu, staceniPivaPoObdobich, zmenaProcent,
  type Obal, type Obdobi, type Pivo, type SkupinaPoPivech, type VyrobniRadek,
} from '../lib/statistika';

type Props = {
  sudy: VyrobniRadek[];
  lahve: VyrobniRadek[];
  obaly: Obal[];
  piva: Pivo[];
  dnes: string;
};

type Druh = 'tyden' | 'mesic' | 'rok';
/** Index „teď" v obdobiPoPivech; „minule" je hned za ním. */
const INDEX: Record<Druh, number> = { tyden: 0, mesic: 2, rok: 4 };
/** Index letoška — celkem letos se ukazuje vždy, i u týdne a měsíce. */
const LETOS = INDEX.rok;
/** „proti …" ve správném pádě. */
const PROTI: Record<Druh, string> = { tyden: 'proti minulému týdnu', mesic: 'proti minulému měsíci', rok: 'proti loňsku' };

const ks = (v: number) => v.toLocaleString('cs-CZ');

/** Jedna karta: sudy, nebo lahve — součet teď proti minule a pod tím obaly. */
function KartaSkupiny({ nazev, data, ted, minule, popisTed, popisMinule, proti, rok }: {
  nazev: string;
  proti: string;
  /** Popis letoška („2026"); u přepínače Rok je letošek už nahoře, tak se neopakuje. */
  rok: string;
  data: SkupinaPoPivech;
  ted: number;
  minule: number;
  popisTed: string;
  popisMinule: string;
}) {
  const sLetos = ted !== LETOS;
  const obaly = data.obaly.filter((o) => o.kusy[ted] || o.kusy[minule] || (sLetos && o.kusy[LETOS]));
  return (
    <section className="card p-3.5 sm:p-5" aria-label={nazev}>
      <h3 className="font-display font-extrabold text-sm text-neutral-900">{nazev}</h3>
      <div className="mt-2 grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5">
          <div className="text-udaj font-black uppercase tracking-wider text-amber-800">{popisTed}</div>
          <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums mt-0.5">{ks(data.kusy[ted])} ks</div>
          <div className="text-xs font-bold text-neutral-600 tabular-nums">{formatHl(data.litry[ted])} hl</div>
        </div>
        <div className="rounded-xl bg-neutral-50 border border-neutral-200 p-2.5">
          <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">{popisMinule}</div>
          <div className="font-display font-extrabold text-2xl text-neutral-500 tabular-nums mt-0.5">{ks(data.kusy[minule])} ks</div>
          <div className="text-xs font-bold text-neutral-500 tabular-nums">{formatHl(data.litry[minule])} hl</div>
        </div>
      </div>
      {zmenaProcent(data.litry[ted], data.litry[minule]) !== null && (
        <div className="mt-2 flex items-center gap-1.5">
          <Trend zmena={zmenaProcent(data.litry[ted], data.litry[minule])} />
          <span className="text-udaj font-semibold text-neutral-400">{proti} (v hl)</span>
        </div>
      )}
      {sLetos && (
        <div className="mt-2 flex items-baseline justify-between gap-2 rounded-xl bg-white border border-neutral-200 px-2.5 py-2">
          <span className="text-udaj font-black uppercase tracking-wider text-neutral-500">Celkem letos ({rok})</span>
          <span className="tabular-nums whitespace-nowrap">
            <span className="font-black text-neutral-900">{ks(data.kusy[LETOS])} ks</span>
            <span className="text-xs font-bold text-neutral-500"> · {formatHl(data.litry[LETOS])} hl</span>
          </span>
        </div>
      )}
      {obaly.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-neutral-500">{sLetos ? 'Letos se nestáčelo.' : 'Ani letos, ani loni se nestáčelo.'}</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-udaj font-black uppercase tracking-wider text-neutral-500">
              <th scope="col" className="text-left py-1.5">Obal</th>
              <th scope="col" className="text-right py-1.5 pl-3">{popisTed}</th>
              <th scope="col" className="text-right py-1.5 pl-3">{popisMinule}</th>
              {sLetos && <th scope="col" className="text-right py-1.5 pl-3">Letos</th>}
            </tr>
          </thead>
          <tbody>
            {obaly.map((o) => (
              <tr key={o.id} className="border-b border-neutral-100 last:border-0">
                <th scope="row" className="py-2 text-left font-bold text-neutral-900">{o.nazev}</th>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums font-black text-neutral-900">{o.kusy[ted] ? `${ks(o.kusy[ted])} ks` : '–'}</td>
                <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums font-semibold text-neutral-500">{o.kusy[minule] ? `${ks(o.kusy[minule])} ks` : '–'}</td>
                {sLetos && <td className="py-2 pl-3 text-right whitespace-nowrap tabular-nums font-bold text-neutral-700">{o.kusy[LETOS] ? `${ks(o.kusy[LETOS])} ks` : '–'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
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
  const [druh, setDruh] = useState<Druh>('mesic');
  const pivoId = vybrane ?? vychozi;
  const pivo = piva.find((p) => p.id === pivoId);

  const data = useMemo(
    () => staceniPivaPoObdobich(sudy, lahve, mapaObalu, pivoId, obdobi),
    [sudy, lahve, mapaObalu, pivoId, obdobi],
  );

  const ted = INDEX[druh];
  const minule = ted + 1;
  const popisTed = obdobi[ted].popis;
  const popisMinule = obdobi[minule].popis;
  const rozsah = (i: number) => popisRozsahu(obdobi[i].klic.split('-')[0] as Obdobi, obdobi[i].od);

  // Všechna piva za vybrané období — stejný výpočet jako pro jedno pivo.
  const vsechna = useMemo(() => {
    const jen = [obdobi[ted]];
    return piva
      .map((p) => ({ pivo: p, ...staceniPivaPoObdobich(sudy, lahve, mapaObalu, p.id, jen) }))
      .filter((r) => r.sudy.kusy[0] || r.lahve.kusy[0])
      .sort((a, b) => b.sudy.litry[0] + b.lahve.litry[0] - (a.sudy.litry[0] + a.lahve.litry[0]));
  }, [piva, sudy, lahve, mapaObalu, obdobi, ted]);

  return (
    <div className="space-y-4">
      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Vyber pivo a období" />
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
        <div className="mt-3">
          <Prepinac
            volby={[['tyden', 'Týden'], ['mesic', 'Měsíc'], ['rok', 'Rok']] as const}
            vybrano={druh}
            onZmena={setDruh}
          />
        </div>
      </section>

      <div>
        <h2 className="font-display font-extrabold text-lg text-neutral-900 px-1">{pivo ? pivo.name : 'Pivo'} — stočeno</h2>
        <p className="text-udaj font-semibold text-neutral-500 px-1">
          {popisTed} ({rozsah(ted)}) {PROTI[druh]} ({rozsah(minule)})
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <KartaSkupiny nazev="Sudy (KEG)" data={data.sudy} ted={ted} minule={minule} popisTed={popisTed} popisMinule={popisMinule} proti={PROTI[druh]} rok={rozsah(LETOS)} />
        <KartaSkupiny nazev="Lahve a PET" data={data.lahve} ted={ted} minule={minule} popisTed={popisTed} popisMinule={popisMinule} proti={PROTI[druh]} rok={rozsah(LETOS)} />
      </div>

      <section className="card p-3.5 sm:p-5">
        <Nadpis text={`Všechna piva — ${popisTed.toLowerCase()}`} popis={`${rozsah(ted)} · klepnutím na pivo ho zobrazíš nahoře`} />
        {vsechna.length === 0 ? (
          <p className="text-sm font-semibold text-neutral-500">V tomhle období se nic nestáčelo.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-udaj font-black uppercase tracking-wider text-neutral-500">
                <th scope="col" className="text-left py-1.5">Pivo</th>
                <th scope="col" className="text-right py-1.5">Sudy</th>
                <th scope="col" className="text-right py-1.5">Lahve</th>
              </tr>
            </thead>
            <tbody>
              {vsechna.map((r) => (
                <tr key={r.pivo.id} className={`border-b border-neutral-100 last:border-0 ${r.pivo.id === pivoId ? 'bg-amber-50' : ''}`}>
                  <th scope="row" className="py-1 text-left">
                    <button
                      type="button"
                      onClick={() => setVybrane(r.pivo.id)}
                      className="btn-ghost !rounded-lg !py-1 !px-1.5 text-sm font-bold text-neutral-900 text-left"
                    >
                      {r.pivo.name}
                    </button>
                  </th>
                  {[r.sudy, r.lahve].map((s, i) => (
                    <td key={i} className="py-1 text-right tabular-nums">
                      {s.kusy[0] ? (
                        <>
                          <div className="font-black text-neutral-900">{ks(s.kusy[0])} ks</div>
                          <div className="text-udaj font-semibold text-neutral-500">{formatHl(s.litry[0])} hl</div>
                        </>
                      ) : <span className="text-neutral-300">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-udaj font-semibold text-neutral-400 px-1">
        Sudy = zápisy stáčení KEG, lahve = zápisy stáčení lahví. Lahve se plní ze stočených sudů, proto se sudy a lahve nesčítají. Opravy z inventury (manko) se odečítají, ale stočeno nikdy nejde pod nulu.
      </p>
    </div>
  );
}
