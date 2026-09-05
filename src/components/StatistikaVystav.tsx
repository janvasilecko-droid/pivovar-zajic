// 📊 Výstav — hlavní pohled Statistiky.
// ---------------------------------------------------------------------------
// Odpovídá na otázky, které o pivovaru padnou nejčastěji: kolik se uvařilo
// tento týden / měsíc / rok, jak to vypadá proti loňsku, které pivo táhne
// a kdo je největší odběratel.
//
// VÝSTAV JSOU JEN SUDY. Lahvuje se z už stočených sudů, takže lahve do výstavu
// nepatří — jinak by se tentýž objem počítal dvakrát. Lahvování se ukazuje
// zvlášť jako „přestočeno do lahví": kam pivo z výstavu putovalo.
//
// K barvám: řada barev je pevná a přiřazuje se podle POŘADÍ položky, ne podle
// aktuálního umístění v žebříčku — když se změní filtr, pivo si nechá svoji
// barvu. Paleta prošla kontrolou na barvosleposti (nejhorší sousední dvojice
// ΔE 13,3 pro deuteranopii), takže se sousední výseče dají rozlišit i bez
// plného vnímání barev. Vedle barvy je vždycky i popisek — barva sama nikdy
// nenese informaci.
import { useMemo } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import {
  formatHl, hl, litryPoMesicich, litryPoTydnech, litryVRozsahu, podilPodleObalu,
  podilPodlePiva, podleOdberatelu, posunDnu, posunMesicu, predchoziRozsah,
  rozsahObdobi, zmenaProcent,
  type Obal, type Obdobi, type Pivo, type VyrobniRadek,
} from '../lib/statistika';

// Pořadí je záměrné — sousední dvojice musí být rozlišitelné i při barvosleposti.
/**
 * 🎨 Barvy grafu se berou z PROMĚNNÝCH, ne z napsaných hodnot.
 *
 * Recharts kreslí do SVG přes atributy `fill`/`stroke`, takže se na ně
 * nedají použít třídy — hodnota musí být řetězec. Dřív tu byly napsané
 * odstíny natvrdo, takže v tmavém režimu zůstala mřížka světlá, popisky
 * os tmavé (na tmavém pozadí je nebylo vidět) a koláč byl obtažený bílou.
 *
 * `barvaZMotivu()` přečte tutéž proměnnou, na které stojí celý
 * tailwind.config.js — takže graf sleduje motiv sám a nemá druhou sadu
 * barev, která by se rozešla.
 *
 * Čte se až při vykreslení (ne do konstanty), protože motiv se dá přepnout
 * za běhu v Nastavení.
 */
export function barvaZMotivu(promenna: string, zaloha: string): string {
  if (typeof window === 'undefined') return zaloha;
  const hodnota = getComputedStyle(document.documentElement).getPropertyValue(promenna).trim();
  // Proměnné jsou uložené jako „R G B" pro rgb(var(--x) / <alpha>).
  return hodnota ? `rgb(${hodnota.split(/\s+/).join(' ')})` : zaloha;
}

const RADA_BAREV = ['#b3730a', '#0369a1', '#15803d', '#7e22ce', '#c85f1e', '#0891b2', '#65a30d', '#be123c'];
const BARVA_LETOS = '#b3730a';

const MESICE_ZKR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

type Props = {
  bottlingRows: VyrobniRadek[];
  keggingRows: VyrobniRadek[];
  obaly: Obal[];
  piva: Pivo[];
  orders: { id: string; place_name: string | null; delivery_date: string | null; order_date: string; status: string }[];
  orderItems: { order_id: string; package_id: string | null; quantity: number | null }[];
  dnes: string;
  obdobi: Obdobi;
  onObdobi: (o: Obdobi) => void;
};

const POPIS_OBDOBI: Record<Obdobi, string> = {
  tyden: 'tento týden', mesic: 'tento měsíc', rok: 'letos', vse: 'za celou dobu',
};
const POPIS_PREDCHOZI: Record<Obdobi, string> = {
  tyden: 'minulý týden', mesic: 'minulý měsíc', rok: 'loni', vse: '',
};

function Trend({ zmena }: { zmena: number | null }) {
  if (zmena === null) return null;
  const roste = zmena > 1, klesa = zmena < -1;
  const Ikona = roste ? TrendingUp : klesa ? TrendingDown : Minus;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-black ${
      roste ? 'text-emerald-700' : klesa ? 'text-rose-700' : 'text-neutral-500'
    }`}>
      <Ikona className="w-3.5 h-3.5" />
      {zmena > 0 ? '+' : ''}{zmena.toFixed(0)} %
    </span>
  );
}

function Dlazdice({ popis, litry, zmena, protiCemu }: {
  popis: string; litry: number; zmena: number | null; protiCemu?: string;
}) {
  return (
    <div className="card p-3.5 sm:p-4">
      <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">{popis}</div>
      <div className="font-display font-extrabold text-2xl sm:text-3xl text-neutral-900 tabular-nums mt-1">
        {formatHl(litry)} <span className="text-base font-bold text-neutral-400">hl</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5 min-h-[18px]">
        <Trend zmena={zmena} />
        {zmena !== null && protiCemu && <span className="text-udaj font-semibold text-neutral-400">proti {protiCemu}</span>}
      </div>
    </div>
  );
}

/** Popisek nad grafem — název nese informaci, takže u jedné řady netřeba legendu. */
function Nadpis({ text, popis }: { text: string; popis?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display font-extrabold text-sm text-neutral-900">{text}</h3>
      {popis && <p className="text-udaj font-semibold text-neutral-500 mt-0.5">{popis}</p>}
    </div>
  );
}

const stylTooltipuZaklad = {
  contentStyle: { borderRadius: 12, fontSize: 12, fontWeight: 700 },
  labelStyle: { fontWeight: 800 },
};

export default function StatistikaVystav({
  bottlingRows, keggingRows, obaly, piva, orders, orderItems, dnes, obdobi, onObdobi,
}: Props) {
  // Barvy grafu podle motivu. Přepočítají se při každém vykreslení, takže
  // přepnutí světlý/tmavý v Nastavení se projeví bez znovunačtení stránky.
  const INK_TLUMENA = barvaZMotivu('--ink-neutral-500', '#64748b');
  const MRIZKA = barvaZMotivu('--bd-neutral-200', '#e2e8f0');
  const BARVA_LONI = barvaZMotivu('--ink-neutral-400', '#94a3b8');
  // Obtažení výsečí koláče musí být barva PODKLADU, ne bílá — v tmavém
  // režimu z bílé vznikly svítící linky přes celý graf.
  const OBTAZENI = barvaZMotivu('--bg-white', '#ffffff');
  const stylTooltipu = {
    contentStyle: {
      ...stylTooltipuZaklad.contentStyle,
      border: `1px solid ${MRIZKA}`,
      background: OBTAZENI,
      color: barvaZMotivu('--ink-neutral-900', '#0f172a'),
    },
    labelStyle: { ...stylTooltipuZaklad.labelStyle, color: barvaZMotivu('--ink-neutral-900', '#0f172a') },
  };

  const mapaObalu = useMemo(() => new Map(obaly.map((o) => [o.id, o])), [obaly]);
  // Výstav = stočené SUDY. Lahvování se sleduje zvlášť (viz komentář nahoře).
  const vyroba = keggingRows;
  const lahvovani = bottlingRows;

  const { od, do: doKdy } = rozsahObdobi(obdobi, dnes);
  const predchozi = predchoziRozsah(obdobi, dnes);

  const soucty = useMemo(() => {
    const zaObdobi = (o: Obdobi) => {
      const r = rozsahObdobi(o, dnes);
      const p = predchoziRozsah(o, dnes);
      const ted = litryVRozsahu(vyroba, mapaObalu, r.od, r.do);
      const drive = p ? litryVRozsahu(vyroba, mapaObalu, p.od, p.do) : 0;
      return { ted, zmena: p ? zmenaProcent(ted, drive) : null };
    };
    return { tyden: zaObdobi('tyden'), mesic: zaObdobi('mesic'), rok: zaObdobi('rok'), vse: zaObdobi('vse') };
  }, [vyroba, mapaObalu, dnes]);

  // ── Porovnání měsíců: letos vs. loni, měsíc po měsíci ────────────────────
  const dataMesice = useMemo(() => {
    const podleMesice = litryPoMesicich(vyroba, mapaObalu);
    const letos = dnes.slice(0, 4);
    const loni = String(Number(letos) - 1);
    return MESICE_ZKR.map((zkr, i) => {
      const mm = String(i + 1).padStart(2, '0');
      return {
        mesic: zkr,
        letos: hl(podleMesice.get(`${letos}-${mm}`) ?? 0),
        loni: hl(podleMesice.get(`${loni}-${mm}`) ?? 0),
      };
    });
  }, [vyroba, mapaObalu, dnes]);

  const maLonskaData = useMemo(() => dataMesice.some((d) => d.loni > 0), [dataMesice]);

  // ── Posledních 12 týdnů ────────────────────────────────────────────────
  const dataTydny = useMemo(() => {
    const podleTydne = litryPoTydnech(vyroba, mapaObalu);
    const out: { tyden: string; hl: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const pondeli = posunDnu(dnes, -7 * i);
      const d = new Date(pondeli + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      const klic = d.toISOString().slice(0, 10);
      out.push({ tyden: `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`, hl: hl(podleTydne.get(klic) ?? 0) });
    }
    return out;
  }, [vyroba, mapaObalu, dnes]);

  const podlePiv = useMemo(
    () => podilPodlePiva(vyroba, mapaObalu, piva, od, doKdy),
    [vyroba, mapaObalu, piva, od, doKdy],
  );
  const podleObalu = useMemo(
    () => podilPodleObalu(vyroba, mapaObalu, od, doKdy),
    [vyroba, mapaObalu, od, doKdy],
  );
  // Kam pivo z výstavu putovalo — lahve a PET. Do výstavu se to nepřičítá.
  const podleLahvi = useMemo(
    () => podilPodleObalu(lahvovani, mapaObalu, od, doKdy),
    [lahvovani, mapaObalu, od, doKdy],
  );
  const litryDoLahvi = useMemo(
    () => litryVRozsahu(lahvovani, mapaObalu, od, doKdy),
    [lahvovani, mapaObalu, od, doKdy],
  );
  const odberatele = useMemo(
    () => podleOdberatelu(orders, orderItems, mapaObalu, od, doKdy).slice(0, 10),
    [orders, orderItems, mapaObalu, od, doKdy],
  );

  // Barva podle pořadí v katalogu, ne v žebříčku — pivo si barvu drží,
  // i když se filtrem změní pořadí.
  const barvaPiva = useMemo(() => {
    const m = new Map<string, string>();
    piva.forEach((p, i) => m.set(p.id, RADA_BAREV[i % RADA_BAREV.length]));
    return m;
  }, [piva]);
  const barvaObalu = useMemo(() => {
    const m = new Map<string, string>();
    obaly.forEach((o, i) => m.set(o.id, RADA_BAREV[i % RADA_BAREV.length]));
    return m;
  }, [obaly]);

  const litryObdobi = litryVRozsahu(vyroba, mapaObalu, od, doKdy);

  return (
    <div className="space-y-4">
      {/* Souhrn — čtyři čísla, na která se ptá každý */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Dlazdice popis="Tento týden" litry={soucty.tyden.ted} zmena={soucty.tyden.zmena} protiCemu="minulému týdnu" />
        <Dlazdice popis="Tento měsíc" litry={soucty.mesic.ted} zmena={soucty.mesic.zmena} protiCemu="minulému měsíci" />
        <Dlazdice popis="Letos" litry={soucty.rok.ted} zmena={soucty.rok.zmena} protiCemu="loňsku" />
        <Dlazdice popis="Výstav celkem" litry={soucty.vse.ted} zmena={null} />
      </div>

      {/* Porovnání měsíců — dvě řady ve stejné jednotce, jedna osa. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Výstav po měsících (sudy)"
          popis={maLonskaData ? `Hektolitry — ${dnes.slice(0, 4)} proti ${Number(dnes.slice(0, 4)) - 1}` : `Hektolitry za rok ${dnes.slice(0, 4)}`}
        />
        <div className="h-[240px] sm:h-[300px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataMesice} barGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mesic" tick={{ fontSize: 11, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
              <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${Number(v).toFixed(1)} hl`, n === 'letos' ? dnes.slice(0, 4) : String(Number(dnes.slice(0, 4)) - 1)]} />
              {maLonskaData && <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} formatter={(v) => (v === 'letos' ? dnes.slice(0, 4) : String(Number(dnes.slice(0, 4)) - 1))} />}
              {maLonskaData && <Bar dataKey="loni" fill={BARVA_LONI} radius={[4, 4, 0, 0]} maxBarSize={18} />}
              <Bar dataKey="letos" fill={BARVA_LETOS} radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Týdny — jedna řada, takže bez legendy; název grafu ji pojmenuje. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Posledních 12 týdnů" popis="Hektolitry stočené v jednotlivých týdnech" />
        <div className="h-[200px] sm:h-[240px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dataTydny} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="tyden" tick={{ fontSize: 10, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
              <Tooltip {...stylTooltipu} formatter={(v: any) => [`${Number(v).toFixed(1)} hl`, 'Výstav']} labelFormatter={(l) => `Týden od ${l}`} />
              <Bar dataKey="hl" fill={BARVA_LETOS} radius={[4, 4, 0, 0]} maxBarSize={26} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Přepínač období pro rozpady pod ním */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
        {(['tyden', 'mesic', 'rok', 'vse'] as Obdobi[]).map((o) => (
          <button
            key={o}
            onClick={() => onObdobi(o)}
            className={`min-h-[40px] px-3 rounded-xl text-xs font-black transition ${
              obdobi === o ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            {o === 'tyden' ? 'Týden' : o === 'mesic' ? 'Měsíc' : o === 'rok' ? 'Rok' : 'Celkem'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Podíl piv */}
        <section className="card p-3.5 sm:p-5">
          <Nadpis text="Které pivo táhne" popis={`Podíl na výstavu ${POPIS_OBDOBI[obdobi]} · celkem ${formatHl(litryObdobi)} hl`} />
          {podlePiv.length === 0 ? (
            <p className="text-sm text-neutral-500 font-semibold py-8 text-center">V tomhle období se nic nestočilo.</p>
          ) : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={podlePiv} dataKey="litry" nameKey="nazev" innerRadius="52%" outerRadius="80%" paddingAngle={2} stroke={OBTAZENI} strokeWidth={2}>
                      {podlePiv.map((p) => <Cell key={p.id} fill={barvaPiva.get(p.id) ?? RADA_BAREV[0]} />)}
                    </Pie>
                    <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${(Number(v) / 100).toFixed(1)} hl`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Tabulka vedle grafu — barva sama nikdy nenese informaci. */}
              <div className="space-y-1 mt-2">
                {podlePiv.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaPiva.get(p.id) }} />
                    <span className="flex-1 min-w-0 truncate font-bold text-neutral-800">{p.nazev}</span>
                    <span className="tabular-nums font-black text-neutral-900">{formatHl(p.litry)} hl</span>
                    <span className="tabular-nums font-semibold text-neutral-400 w-11 text-right">{(p.podil * 100).toFixed(0)} %</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Podíl obalů */}
        <section className="card p-3.5 sm:p-5">
          <Nadpis text="Do jakých sudů" popis={`Rozpad výstavu podle velikosti sudu ${POPIS_OBDOBI[obdobi]}`} />
          {podleObalu.length === 0 ? (
            <p className="text-sm text-neutral-500 font-semibold py-8 text-center">V tomhle období se nic nestočilo.</p>
          ) : (
            <>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={podleObalu} dataKey="litry" nameKey="nazev" innerRadius="52%" outerRadius="80%" paddingAngle={2} stroke={OBTAZENI} strokeWidth={2}>
                      {podleObalu.map((p) => <Cell key={p.id} fill={barvaObalu.get(p.id) ?? RADA_BAREV[1]} />)}
                    </Pie>
                    <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${(Number(v) / 100).toFixed(1)} hl`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1 mt-2">
                {podleObalu.map((p) => (
                  <div key={p.id} className="flex items-center gap-2.5 text-sm">
                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaObalu.get(p.id) }} />
                    <span className="flex-1 min-w-0 truncate font-bold text-neutral-800">{p.nazev}</span>
                    <span className="tabular-nums font-black text-neutral-900">{p.kusy} ks</span>
                    <span className="tabular-nums font-semibold text-neutral-400 w-16 text-right">{formatHl(p.litry)} hl</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Přestočeno do lahví — údaj o tom, kam pivo z výstavu šlo dál. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Přestočeno do lahví"
          popis={`${POPIS_OBDOBI[obdobi]} — lahvuje se z už stočených sudů, do výstavu se to proto NEpřičítá`}
        />
        {podleLahvi.length === 0 ? (
          <p className="text-sm text-neutral-500 font-semibold py-6 text-center">V tomhle období se nelahvovalo.</p>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums">{formatHl(litryDoLahvi)}</span>
              <span className="text-base font-bold text-neutral-400">hl</span>
              {litryObdobi > 0 && (
                <span className="text-xs font-semibold text-neutral-500">
                  = {((litryDoLahvi / litryObdobi) * 100).toFixed(0)} % výstavu
                </span>
              )}
            </div>
            <div className="space-y-1">
              {podleLahvi.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5 text-sm">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaObalu.get(p.id) }} />
                  <span className="flex-1 min-w-0 truncate font-bold text-neutral-800">{p.nazev}</span>
                  <span className="tabular-nums font-black text-neutral-900">{p.kusy} ks</span>
                  <span className="tabular-nums font-semibold text-neutral-400 w-16 text-right">{formatHl(p.litry)} hl</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Odběratelé */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis text="Největší odběratelé" popis={`Podle objednaného množství ${POPIS_OBDOBI[obdobi]} — rozhoduje den závozu`} />
        {odberatele.length === 0 ? (
          <p className="text-sm text-neutral-500 font-semibold py-8 text-center">V tomhle období není žádná objednávka.</p>
        ) : (
          <div className="space-y-1.5">
            {odberatele.map((o, i) => {
              const podil = odberatele[0].litry > 0 ? o.litry / odberatele[0].litry : 0;
              return (
                <div key={o.nazev} className="flex items-center gap-3 min-h-[44px]">
                  <span className="w-6 text-right tabular-nums font-black text-neutral-400 text-xs shrink-0">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-bold text-sm text-neutral-900 truncate">{o.nazev}</span>
                      <span className="tabular-nums font-black text-sm text-neutral-900 shrink-0">{formatHl(o.litry)} hl</span>
                    </div>
                    {/* Pruh je jen doplněk k číslu, ne jediný nositel informace. */}
                    <div className="h-1.5 rounded-full bg-neutral-100 mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(2, podil * 100)}%`, backgroundColor: BARVA_LETOS }} />
                    </div>
                    <div className="text-udaj font-semibold text-neutral-500 mt-0.5">
                      {o.kusy} ks · {o.objednavek} {o.objednavek === 1 ? 'objednávka' : o.objednavek < 5 ? 'objednávky' : 'objednávek'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Piva v číslech — tabulka jako alternativa ke grafu */}
      {podlePiv.length > 0 && (
        <section className="card p-3.5 sm:p-5">
          <Nadpis text="Piva v číslech" popis={`${POPIS_OBDOBI[obdobi]}${predchozi ? ` · srovnání s obdobím ${POPIS_PREDCHOZI[obdobi]}` : ''}`} />
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table-drzi-prvni-sloupec w-full text-sm">
              <thead>
                <tr className="text-udaj font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                  <th scope="col" className="text-left py-2">Pivo</th>
                  <th scope="col" className="text-right py-2">Kusů</th>
                  <th scope="col" className="text-right py-2">Hektolitrů</th>
                  <th scope="col" className="text-right py-2">Podíl</th>
                  {predchozi && <th scope="col" className="text-right py-2">Změna</th>}
                </tr>
              </thead>
              <tbody>
                {podlePiv.map((p) => {
                  const drive = predchozi
                    ? podilPodlePiva(vyroba, mapaObalu, piva, predchozi.od, predchozi.do).find((x) => x.id === p.id)?.litry ?? 0
                    : 0;
                  return (
                    <tr key={p.id} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaPiva.get(p.id) }} />
                          <span className="font-bold text-neutral-900">{p.nazev}</span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums font-semibold text-neutral-700">{p.kusy}</td>
                      <td className="text-right tabular-nums font-black text-neutral-900">{formatHl(p.litry)}</td>
                      <td className="text-right tabular-nums font-semibold text-neutral-500">{(p.podil * 100).toFixed(0)} %</td>
                      {predchozi && <td className="text-right"><Trend zmena={zmenaProcent(p.litry, drive)} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-udaj text-neutral-400 font-semibold px-1">
        Výstav = objem stočených <strong>sudů</strong> (množství × objem obalu). Lahve se do něj nepočítají —
        lahvuje se z už stočených sudů, takže pivo v lahvi do výstavu vstoupilo už jako sud; přičítat ho znovu
        by tentýž objem počítalo dvakrát. Ze skladu se sudy na lahvování odečítají (viz Sklad → „Sud spotřebován
        na lahve"). Objednávky se do výstavu nepočítají — objednané pivo nemusí být stočené a naopak.
      </p>
    </div>
  );
}
