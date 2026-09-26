// 💰 Statistika → Tržby. Kolik korun dělají objednávky podle ceníku: po
// měsících a podle odběratelů. Zadání 26. 9. 2026 (návrh „tržby podle
// ceníku"). Výpočet v lib/statistikaObchod.ts — cena k datu objednávky
// jako v detailu objednávky, měsíc podle dne závozu jako zbytek Statistiky.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Store } from 'lucide-react';
import { EmptyState } from './ui';
import { BARVA_LETOS, MESICE_ZKR, Nadpis, Prepinac, Trend, barvyGrafu } from './StatistikaVystav';
import { trzbyPoMesicich, trzbyPodleOdberatelu } from '../lib/statistikaObchod';
import { denObdobi, popisRozsahu, rozsahObdobi, zmenaProcent } from '../lib/statistika';
import type { CenaPolozky } from '../lib/hodnotaObjednavky';

type Props = {
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[];
  orderItems: { order_id: string; beer_id: string | null; package_id: string | null; quantity: number | null }[];
  cenik: CenaPolozky[];
  dnes: string;
};

export const kc = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;

export default function StatistikaTrzby({ orders, orderItems, cenik, dnes }: Props) {
  const barvy = barvyGrafu();
  const tentoMesic = dnes.slice(0, 7);
  const letos = dnes.slice(0, 4);

  // 24 měsíců: posledních 12 do grafu, zbytek na srovnání s loňskem.
  const mesice24 = useMemo(() => trzbyPoMesicich(orders, orderItems, cenik, tentoMesic, 24), [orders, orderItems, cenik, tentoMesic]);
  const graf = mesice24.slice(12).map((m) => ({
    ...m,
    popis: `${Number(m.mesic.slice(5, 7))}.`,
    letos: m.mesic.startsWith(letos),
  }));
  const mesicTed = mesice24[23];
  const mesicMinule = mesice24[22];
  const letosSoucet = mesice24.filter((m) => m.mesic.startsWith(letos)).reduce((s, m) => s + m.castka, 0);
  // Loni stejný úsek (leden až tentýž měsíc) — ne celý loňský rok.
  const loniSoucet = mesice24
    .filter((m) => m.mesic.startsWith(String(Number(letos) - 1)) && m.mesic.slice(5) <= tentoMesic.slice(5))
    .reduce((s, m) => s + m.castka, 0);
  const maLoni = mesice24.slice(0, 12).some((m) => m.castka > 0);

  // Odběratelé podle tržeb — vlastní Měsíc / Rok a šipky, jako u objemu.
  const [obdobi, setObdobi] = useState<'mesic' | 'rok'>('mesic');
  const [posun, setPosun] = useState(0);
  const den = denObdobi(obdobi, dnes, posun);
  const rozsah = rozsahObdobi(obdobi, den);
  const odberatele = useMemo(
    () => trzbyPodleOdberatelu(orders, orderItems, cenik, rozsah.od, rozsah.do),
    [orders, orderItems, cenik, rozsah.od, rozsah.do],
  );
  const bezCenyVObdobi = odberatele.reduce((s, o) => s + o.bezCeny, 0);
  const soucetObdobi = odberatele.reduce((s, o) => s + o.castka, 0);

  if (cenik.length === 0) {
    return (
      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Tržby podle ceníku" />
        <EmptyState text="Ceník je prázdný — bez cen se tržby spočítat nedají. Doplň ceny v Ceníku." icon={AlertTriangle} />
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5">
        <div className="card p-3.5 sm:p-4">
          <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Tento měsíc</div>
          <div className="font-display font-extrabold text-xl sm:text-2xl text-neutral-900 tabular-nums mt-1">{kc(mesicTed.castka)}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <Trend zmena={zmenaProcent(mesicTed.castka, mesicMinule.castka)} />
            <span className="text-udaj font-semibold text-neutral-400">proti minulému měsíci</span>
          </div>
        </div>
        <div className="card p-3.5 sm:p-4">
          <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Letos</div>
          <div className="font-display font-extrabold text-xl sm:text-2xl text-neutral-900 tabular-nums mt-1">{kc(letosSoucet)}</div>
          {maLoni && (
            <div className="mt-1 flex items-center gap-1.5">
              <Trend zmena={zmenaProcent(letosSoucet, loniSoucet)} />
              <span className="text-udaj font-semibold text-neutral-400">proti loňsku ve stejném období</span>
            </div>
          )}
        </div>
      </div>

      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Tržby po měsících" popis="Podle ceníku a dne závozu — posledních 12 měsíců, letošní zvýrazněné" />
        <div className="h-[220px] sm:h-[260px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={graf} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={barvy.MRIZKA} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="popis" tick={{ fontSize: 10, fill: barvy.INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis
                tick={{ fontSize: 10, fill: barvy.INK_TLUMENA }} axisLine={false} tickLine={false} width={40}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                {...barvy.stylTooltipu}
                formatter={(v: any, _n: any, polozka: any) => {
                  const bez = polozka?.payload?.bezCeny ?? 0;
                  return [`${kc(Number(v))}${bez ? ` (+ ${bez} pol. bez ceny)` : ''}`, 'Tržby'];
                }}
                labelFormatter={(_l: any, p: any) => {
                  const m = p?.[0]?.payload?.mesic as string | undefined;
                  return m ? `${MESICE_ZKR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : '';
                }}
              />
              <Bar dataKey="castka" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {graf.map((g) => <Cell key={g.mesic} fill={g.letos ? BARVA_LETOS : barvy.BARVA_LONI} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Odběratelé podle tržeb"
          popis={`${obdobi === 'rok' ? 'Za rok' : 'Za měsíc'} ${popisRozsahu(obdobi, den)} · celkem ${kc(soucetObdobi)}`}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Prepinac
            volby={[['mesic', 'Měsíc'], ['rok', 'Rok']] as const}
            vybrano={obdobi}
            onZmena={(o) => { setObdobi(o); setPosun(0); }}
          />
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
            <button
              type="button"
              onClick={() => setPosun((p) => p - 1)}
              className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base"
              title="Předchozí období tržeb"
              aria-label="Předchozí období tržeb"
            >
              ‹
            </button>
            <span className="px-2 text-xs font-black text-neutral-900 tabular-nums whitespace-nowrap">{popisRozsahu(obdobi, den)}</span>
            <button
              type="button"
              onClick={() => setPosun((p) => Math.min(0, p + 1))}
              disabled={posun >= 0}
              className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base disabled:opacity-30"
              title="Následující období tržeb"
              aria-label="Následující období tržeb"
            >
              ›
            </button>
            {posun !== 0 && (
              <button type="button" onClick={() => setPosun(0)} className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black text-amber-700">
                Teď
              </button>
            )}
          </div>
        </div>
        {odberatele.length === 0 ? (
          <EmptyState text="V tomhle období není žádná objednávka." icon={Store} />
        ) : (
          <div className="space-y-2">
            {odberatele.slice(0, 15).map((o, i) => {
              const podil = odberatele[0].castka > 0 ? o.castka / odberatele[0].castka : 0;
              return (
                <div key={o.nazev} className="flex items-center gap-3">
                  <span className="w-6 text-right tabular-nums font-black text-neutral-400 text-xs shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-sm text-neutral-900 truncate">{o.nazev}</span>
                      <span className="tabular-nums font-black text-sm text-neutral-900 shrink-0">{kc(o.castka)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-neutral-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, podil * 100)}%`, backgroundColor: BARVA_LETOS }} />
                    </div>
                    <div className="text-udaj font-semibold text-neutral-500 mt-0.5">
                      {o.objednavek} {o.objednavek === 1 ? 'objednávka' : o.objednavek < 5 ? 'objednávky' : 'objednávek'}
                      {o.bezCeny > 0 && <span className="text-amber-700"> · {o.bezCeny} pol. bez ceny</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {bezCenyVObdobi > 0 && (
          <p className="mt-3 text-udaj font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
            <AlertTriangle className="ikona-text" /> {bezCenyVObdobi}{' '}
            {bezCenyVObdobi === 1 ? 'položka nemá' : bezCenyVObdobi < 5 ? 'položky nemají' : 'položek nemá'} v ceníku platnou cenu,
            do částek {bezCenyVObdobi === 1 ? 'není započtená' : 'nejsou započtené'}. Doplň ceny v Ceníku.
          </p>
        )}
      </section>

      <p className="text-udaj text-neutral-400 font-semibold px-1">
        Tržby = kusy z objednávek × cena z ceníku platná k datu objednávky (stejně jako hodnota v detailu objednávky).
        Nejsou to vystavené faktury — slevy, zálohy za sudy ani storna faktur tu nejsou. Stornované objednávky se nepočítají.
      </p>
    </div>
  );
}
