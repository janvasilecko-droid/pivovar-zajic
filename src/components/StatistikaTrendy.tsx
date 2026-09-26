// 📈 Statistika → Žebříčky: meziroční srovnání piv, odpisy v čase a kdo by
// měl podle zvyku brzy objednat. Zadání 26. 9. 2026 (návrhy 2, 4 a 5).
// Výpočty v lib/statistikaObchod.ts.
import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BARVA_LETOS, MESICE_ZKR, Nadpis, Trend, barvyGrafu } from './StatistikaVystav';
import { kdoBrzyObjedna, mezirocniPodlePiv, odpisyPoMesicich } from '../lib/statistikaObchod';
import { formatHl, hl, type Obal, type Pivo, type VyrobniRadek } from '../lib/statistika';

type Props = {
  sudy: VyrobniRadek[];
  odpisy: VyrobniRadek[];
  obaly: Obal[];
  piva: Pivo[];
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[];
  dnes: string;
};

/** Hektolitry i pro malá čísla (odpisy bývají pár desetin hl). */
const hlMale = (litry: number) => (litry / 100).toLocaleString('cs-CZ', { maximumFractionDigits: litry < 100 ? 2 : 1 });

const datum = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('cs-CZ');

export default function StatistikaTrendy({ sudy, odpisy, obaly, piva, orders, dnes }: Props) {
  const barvy = barvyGrafu();
  const mapaObalu = useMemo(() => new Map(obaly.map((o) => [o.id, o])), [obaly]);
  const mezirocni = useMemo(() => mezirocniPodlePiv(sudy, mapaObalu, piva, dnes), [sudy, mapaObalu, piva, dnes]);
  const odpisyMesice = useMemo(() => odpisyPoMesicich(odpisy, sudy, mapaObalu, dnes.slice(0, 7)), [odpisy, sudy, mapaObalu, dnes]);
  const brzy = useMemo(() => kdoBrzyObjedna(orders, dnes), [orders, dnes]);

  const letos = dnes.slice(0, 4);
  const odpisyLetos = odpisyMesice.filter((m) => m.mesic.startsWith(letos));
  const odpisyLetosL = odpisyLetos.reduce((s, m) => s + m.litry, 0);
  const odpisyLetosKs = odpisyLetos.reduce((s, m) => s + m.kusy, 0);
  const vystavLetosL = odpisyLetos.reduce((s, m) => s + m.vystavL, 0);
  const grafOdpisu = odpisyMesice.map((m) => ({ ...m, popis: `${Number(m.mesic.slice(5, 7))}.`, hl: hl(m.litry) }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 🔔 Kdo by měl brzy objednat — podle vlastního rytmu odběratele. */}
      <section className="card p-3.5 sm:p-5 lg:col-span-2">
        <Nadpis
          text="Kdo by měl brzy objednat"
          popis="Podle toho, jak často obvykle bere (medián odstupu mezi závozy). Kdo už má naplánovaný závoz, tu není."
        />
        {brzy.length === 0 ? (
          <p className="text-sm font-semibold text-neutral-500">Nikdo — pravidelní odběratelé mají objednáno, nebo jejich termín ještě nepřišel.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {brzy.map((o) => (
              <div key={o.nazev} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-neutral-900 truncate">{o.nazev}</div>
                  <div className="text-udaj font-semibold text-neutral-500">
                    obvykle každých {o.kazdychDni} dní · naposled {datum(o.posledni)}
                  </div>
                </div>
                <span className={`shrink-0 text-xs font-black px-2 py-1 rounded-lg tabular-nums ${
                  o.poTerminu > 0 ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'
                }`}>
                  {o.poTerminu > 0 ? `${o.poTerminu} ${o.poTerminu === 1 ? 'den' : o.poTerminu < 5 ? 'dny' : 'dní'} po termínu`
                    : o.poTerminu === 0 ? 'termín dnes'
                      : `za ${-o.poTerminu} ${-o.poTerminu === 1 ? 'den' : 'dny'}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 📊 Piva letos proti loňsku — stejně dlouhý úsek, ne celý loňský rok. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Piva letos proti loňsku"
          popis={`Výstav (sudy) od 1. 1. do dneška proti stejnému úseku roku ${Number(letos) - 1}`}
        />
        {mezirocni.length === 0 ? (
          <p className="text-sm font-semibold text-neutral-500">Zatím nic stočeno.</p>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table-drzi-prvni-sloupec w-full text-sm">
              <thead>
                <tr className="text-udaj font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                  <th scope="col" className="text-left py-2">Pivo</th>
                  <th scope="col" className="text-right py-2">Letos</th>
                  <th scope="col" className="text-right py-2">Loni</th>
                  <th scope="col" className="text-right py-2">Změna</th>
                </tr>
              </thead>
              <tbody>
                {mezirocni.map((p) => (
                  <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5 font-bold text-neutral-900">{p.nazev}</td>
                    <td className="text-right tabular-nums font-black text-neutral-900">{formatHl(p.letos)} hl</td>
                    <td className="text-right tabular-nums font-semibold text-neutral-500">{formatHl(p.loni)} hl</td>
                    <td className="text-right">
                      {p.zmena === null ? <span className="text-xs font-black text-emerald-700">nové</span> : <Trend zmena={p.zmena} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 📉 Odpisy v čase — rostou ztráty? */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Odpisy po měsících"
          popis={`Letos odepsáno ${odpisyLetosKs} ks (${hlMale(odpisyLetosL)} hl)${vystavLetosL > 0 ? ` = ${((odpisyLetosL / vystavLetosL) * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} % výstavu` : ''}`}
        />
        <div className="h-[200px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafOdpisu} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={barvy.MRIZKA} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="popis" tick={{ fontSize: 10, fill: barvy.INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis
                tick={{ fontSize: 10, fill: barvy.INK_TLUMENA }} axisLine={false} tickLine={false} width={40}
                tickFormatter={(v: number) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 2 })}
              />
              <Tooltip
                {...barvy.stylTooltipu}
                formatter={(v: any, _n: any, polozka: any) => {
                  const p = polozka?.payload ?? {};
                  const podil = p.podil == null ? '' : ` · ${Number(p.podil).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} % výstavu`;
                  return [`${hlMale(Number(p.litry ?? 0))} hl · ${p.kusy ?? 0} ks${podil}`, 'Odepsáno'];
                }}
                labelFormatter={(_l: any, p: any) => {
                  const m = p?.[0]?.payload?.mesic as string | undefined;
                  return m ? `${MESICE_ZKR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '';
                }}
              />
              <Bar dataKey="hl" fill={BARVA_LETOS} radius={[3, 3, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-udaj font-semibold text-neutral-400 mt-1">Hektolitry odepsaných kusů; v bublině i kusy a podíl z výstavu toho měsíce.</p>
      </section>
    </div>
  );
}
