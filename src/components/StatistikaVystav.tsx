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
import { useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { TrendingDown, TrendingUp, Minus, Store, ChevronDown } from 'lucide-react';
import { EmptyState } from './ui';
import {
  formatHl, hl, litryPoMesicich, litryPoTydnech, litryPoObdobiAObalech, litryVRozsahu,
  obalyVCislech, obalyVDatech, pivaVCislech,
  podleOdberatelu, pondeliTydne, posunDnu, predchoziRozsah,
  prumernaPotrebaKegu, popisRozsahu, denObdobi, rozpocetSudu, rozsahObdobi, zmenaProcent, podilSudyLahve,
  type CisloRadek, type Obal, type Obdobi, type Pivo, type VyrobniRadek,
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

/** Popisek v bublině grafu KEG vs lahve: hektolitry a podíl v tom sloupci. */
function popisSudyLahve(v: any, n: any, polozka: any): [string, string] {
  const p = polozka?.payload ?? {};
  const celkem = Number(p.sudy ?? 0) + Number(p.lahve ?? 0);
  const podil = celkem > 0 ? ` (${Math.round((Number(v) / celkem) * 100)} %)` : '';
  return [`${Number(v).toFixed(1)} hl${podil}`, n];
}

const MESICE_ZKR = ['led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis', 'pro'];

type Props = {
  bottlingRows: VyrobniRadek[];
  keggingRows: VyrobniRadek[];
  /** Vyfasované a odepsané kusy — podklad pro rozpočet sudů. */
  fasovaniRows: VyrobniRadek[];
  writeoffRows: VyrobniRadek[];
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
const VOLBY_OBDOBI = [
  ['tyden', 'Týden'], ['mesic', 'Měsíc'], ['rok', 'Rok'], ['vse', 'Celkem'],
] as const satisfies readonly (readonly [Obdobi, string])[];

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

/**
 * Segmentový přepínač — pruh voleb, ze kterých je vybraná právě jedna.
 *
 * Schválně jedna komponenta pro VŠECHNY přepínače na téhle obrazovce
 * (období i pohled grafů): druhé místo se stejnými třídami by byla druhá
 * kopie téhož významu, a ta se dřív nebo později rozejde.
 */
function Prepinac<T extends string>({ volby, vybrano, onZmena }: {
  volby: readonly (readonly [T, string])[];
  vybrano: T;
  onZmena: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
      {volby.map(([k, popisek]) => (
        <button
          key={k}
          type="button"
          onClick={() => onZmena(k)}
          aria-pressed={vybrano === k}
          className={`min-h-[44px] px-3 rounded-xl text-xs font-black transition ${
            vybrano === k ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          {popisek}
        </button>
      ))}
    </div>
  );
}

/** Kusy na jedno desetinné místo — průměr celé číslo skoro nikdy nevyjde. */
const ksFormat = (v: number) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });

const stylTooltipuZaklad = {
  contentStyle: { borderRadius: 12, fontSize: 12, fontWeight: 700 },
  labelStyle: { fontWeight: 800 },
};

/**
 * Skupina řádků tabulky „Obaly v číslech" — mezinadpis, řádky a součet.
 *
 * Součet je ZÁMĚRNĚ za skupinu, ne za celou tabulku: sudy a lahve se sčítat
 * nesmí (lahvuje se z už stočených sudů, tentýž objem by se počítal dvakrát)
 * a „kolik celkem lahví a kegů dohromady" je stejně údaj, který nikomu
 * neodpoví na nic.
 */
function SkupinaObalu({ nazev, radky, barvy, maZmenu }: {
  nazev: string; radky: CisloRadek[]; barvy: Map<string, string>; maZmenu: boolean;
}) {
  if (radky.length === 0) return null;
  const kusy = radky.reduce((s, r) => s + r.kusy, 0);
  const litry = radky.reduce((s, r) => s + r.litry, 0);
  return (
    <>
      <tr className="bg-neutral-50">
        <th scope="colgroup" colSpan={maZmenu ? 5 : 4} className="text-left py-1.5 text-udaj font-black uppercase tracking-wider text-neutral-500">
          {nazev}
        </th>
      </tr>
      {radky.map((r) => (
        <tr key={r.id} className="border-b border-neutral-100">
          <td className="py-2.5">
            <span className="inline-flex items-center gap-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvy.get(r.id) ?? RADA_BAREV[1] }} />
              <span className="font-bold text-neutral-900">{r.nazev}</span>
            </span>
          </td>
          <td className="text-right tabular-nums font-black text-neutral-900">{r.kusy.toLocaleString('cs-CZ')}</td>
          <td className="text-right tabular-nums font-semibold text-neutral-700">{formatHl(r.litry)}</td>
          <td className="text-right tabular-nums font-semibold text-neutral-500">{(r.podil * 100).toFixed(0)} %</td>
          {maZmenu && <td className="text-right"><Trend zmena={r.zmena} /></td>}
        </tr>
      ))}
      <tr className="border-b-2 border-neutral-200">
        <td className="py-2 font-black text-neutral-500 text-udaj uppercase tracking-wider">Dohromady</td>
        <td className="text-right tabular-nums font-black text-neutral-900">{kusy.toLocaleString('cs-CZ')}</td>
        <td className="text-right tabular-nums font-black text-neutral-900">{formatHl(litry)}</td>
        <td />
        {maZmenu && <td />}
      </tr>
    </>
  );
}

export default function StatistikaVystav({
  bottlingRows, keggingRows, fasovaniRows, writeoffRows, obaly, piva, orders, orderItems,
  dnes, obdobi, onObdobi,
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

  // O kolik období zpět se zrovna kouká (0 = to, ve kterém jsme teď).
  // Posouvají se jím jen ROZPADY pod přepínačem; dlaždice a grafy nahoře
  // ukazují pořád aktuální stav.
  const [posun, setPosun] = useState(0);
  // Grafy umí dva pohledy: souhrn (a proti loňsku) a rozpad na konkrétní
  // obaly. Přepínač je společný pro oba grafy — jinak by šlo přepnout jeden
  // a druhý ne a člověk by porovnával dvě různé věci.
  const [rezimGrafu, setRezimGrafu] = useState<'celkem' | 'sudyLahve' | 'obaly'>('celkem');
  // Rozbalený odběratel v žebříčku — najednou jen jeden, ať se seznam
  // nerozjede přes celý displej.
  const [rozbalenyOdberatel, setRozbalenyOdberatel] = useState<string | null>(null);
  const denProObdobi = denObdobi(obdobi, dnes, posun);

  // Nadpisy pod přepínačem musí říkat, co je OPRAVDU vidět. Dokud se
  // needituje posun, zůstává zažité „tento měsíc"; po posunu se ukáže
  // konkrétní období, ať popisek nelže.
  const popisVybraneho = posun === 0 ? POPIS_OBDOBI[obdobi] : popisRozsahu(obdobi, denProObdobi);

  const { od, do: doKdy } = rozsahObdobi(obdobi, denProObdobi);
  // Nová identita objektu při každém renderu by shazovala každé `useMemo`,
  // které ho má v závislostech — proto se drží stabilní přes useMemo.
  const predchozi = useMemo(() => predchoziRozsah(obdobi, denProObdobi), [obdobi, denProObdobi]);

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

  // Srovnání s předchozím obdobím se počítá rovnou u rozpadu — dřív se
  // dopočítávalo uvnitř `.map()` tabulky, tedy celý průchod daty na každý
  // jednotlivý řádek.
  // ── Stohované řady podle KONKRÉTNÍHO obalu ─────────────────────────────
  // Jeden sloupec = jeden měsíc/týden, jedna barva = jedna velikost sudu.
  // Souhrnný sloupec neukáže, že se výroba překlopila z třicítek na
  // padesátky — objem zůstane stejný a graf mlčí.
  const radyObalu = useMemo(() => obalyVDatech(vyroba, mapaObalu), [vyroba, mapaObalu]);

  const dataMesiceObaly = useMemo(() => {
    const podle = litryPoObdobiAObalech(vyroba, mapaObalu, (d) => d.slice(0, 7));
    const letos = dnes.slice(0, 4);
    return MESICE_ZKR.map((zkr, i) => {
      const vnitrni = podle.get(`${letos}-${String(i + 1).padStart(2, '0')}`);
      const radek: Record<string, string | number> = { mesic: zkr };
      for (const o of radyObalu) radek[o.id] = hl(vnitrni?.get(o.id) ?? 0);
      return radek;
    });
  }, [vyroba, mapaObalu, dnes, radyObalu]);

  const dataTydnyObaly = useMemo(() => {
    const podle = litryPoObdobiAObalech(vyroba, mapaObalu, pondeliTydne);
    const out: Record<string, string | number>[] = [];
    for (let i = 11; i >= 0; i--) {
      const pondeli = pondeliTydne(posunDnu(dnes, -7 * i));
      const vnitrni = podle.get(pondeli);
      const radek: Record<string, string | number> = {
        tyden: `${Number(pondeli.slice(8, 10))}.${Number(pondeli.slice(5, 7))}.`,
      };
      for (const o of radyObalu) radek[o.id] = hl(vnitrni?.get(o.id) ?? 0);
      out.push(radek);
    }
    return out;
  }, [vyroba, mapaObalu, dnes, radyObalu]);

  // ── KEG vs lahve po měsících a týdnech ─────────────────────────────────
  // Stejný výpočet jako karta „KEG vs lahve" (podilSudyLahve): lahve jsou
  // část výstavu, v sudech zůstal výstav − přestočeno do lahví.
  const dataMesiceSudyLahve = useMemo(() => {
    const sudy = litryPoMesicich(vyroba, mapaObalu);
    const lahve = litryPoMesicich(lahvovani, mapaObalu);
    const letos = dnes.slice(0, 4);
    return MESICE_ZKR.map((zkr, i) => {
      const k = `${letos}-${String(i + 1).padStart(2, '0')}`;
      const r = podilSudyLahve(sudy.get(k) ?? 0, lahve.get(k) ?? 0);
      return { mesic: zkr, sudy: hl(r.sudyL), lahve: hl(r.lahveL) };
    });
  }, [vyroba, lahvovani, mapaObalu, dnes]);

  const dataTydnySudyLahve = useMemo(() => {
    const sudy = litryPoTydnech(vyroba, mapaObalu);
    const lahve = litryPoTydnech(lahvovani, mapaObalu);
    const out: { tyden: string; sudy: number; lahve: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const pondeli = pondeliTydne(posunDnu(dnes, -7 * i));
      const r = podilSudyLahve(sudy.get(pondeli) ?? 0, lahve.get(pondeli) ?? 0);
      out.push({ tyden: `${Number(pondeli.slice(8, 10))}.${Number(pondeli.slice(5, 7))}.`, sudy: hl(r.sudyL), lahve: hl(r.lahveL) });
    }
    return out;
  }, [vyroba, lahvovani, mapaObalu, dnes]);

  const podlePiv = useMemo(
    () => pivaVCislech(vyroba, mapaObalu, piva, od, doKdy, predchozi),
    [vyroba, mapaObalu, piva, od, doKdy, predchozi],
  );
  const podleObalu = useMemo(
    () => obalyVCislech(vyroba, mapaObalu, od, doKdy, predchozi),
    [vyroba, mapaObalu, od, doKdy, predchozi],
  );
  // Kam pivo z výstavu putovalo — lahve a PET. Do výstavu se to nepřičítá.
  const podleLahvi = useMemo(
    () => obalyVCislech(lahvovani, mapaObalu, od, doKdy, predchozi),
    [lahvovani, mapaObalu, od, doKdy, predchozi],
  );
  const litryDoLahvi = useMemo(
    () => litryVRozsahu(lahvovani, mapaObalu, od, doKdy),
    [lahvovani, mapaObalu, od, doKdy],
  );
  // Odběratelé mají vlastní přepínač Měsíc / Rok (zadání 26. 9. 2026: „u
  // odběratelů dej nejen za měsíc, ale ať se dá překliknout i na rok").
  // Bere se aktuální měsíc / rok — žebříček se čte hlavně „kdo teď bere nejvíc".
  const [obdobiOdberatelu, setObdobiOdberatelu] = useState<'mesic' | 'rok'>('mesic');
  // Šipkami zpátky do minulých měsíců / let (0 = teď), stejně jako přepínač
  // období výš — jen vlastní, ať se dá listovat odběrateli zvlášť.
  const [posunOdberatelu, setPosunOdberatelu] = useState(0);
  const denOdberatelu = denObdobi(obdobiOdberatelu, dnes, posunOdberatelu);
  const rozsahOdberatelu = rozsahObdobi(obdobiOdberatelu, denOdberatelu);
  const odberatele = useMemo(
    () => podleOdberatelu(orders, orderItems, mapaObalu, rozsahOdberatelu.od, rozsahOdberatelu.do).slice(0, 10),
    [orders, orderItems, mapaObalu, rozsahOdberatelu.od, rozsahOdberatelu.do],
  );

  // 🛢️ Kolik sudů průměrně padne za týden a za měsíc — podklad pro to, kolik
  // jich mít doma umytých. Počítá se z ukončených období (viz lib/statistika).
  const potrebaKegu = useMemo(
    () => prumernaPotrebaKegu(vyroba, mapaObalu, dnes),
    [vyroba, mapaObalu, dnes],
  );

  // 🛢️ Rozpočet sudů — co se stočilo proti tomu, co se vyfasovalo
  // a odepsalo. Dřív to bylo v měsíčních přehledech jako „Ztráty KEG",
  // ale jen souhrnem za měsíc; tady je to za zvolené období a po
  // konkrétních velikostech, protože sudy se neztrácejí rovnoměrně.
  const rozpocet = useMemo(
    () => rozpocetSudu(vyroba, fasovaniRows, writeoffRows, orders, orderItems, mapaObalu, od, doKdy),
    [vyroba, fasovaniRows, writeoffRows, orders, orderItems, mapaObalu, od, doKdy],
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
  const sudyVsLahve = podilSudyLahve(litryObdobi, litryDoLahvi);
  const kusuLahvi = podleLahvi.reduce((s, p) => s + p.kusy, 0);

  return (
    <div className="space-y-4">
      {/* Souhrn — čtyři čísla, na která se ptá každý */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Dlazdice popis="Tento týden" litry={soucty.tyden.ted} zmena={soucty.tyden.zmena} protiCemu="minulému týdnu" />
        <Dlazdice popis="Tento měsíc" litry={soucty.mesic.ted} zmena={soucty.mesic.zmena} protiCemu="minulému měsíci" />
        <Dlazdice popis="Letos" litry={soucty.rok.ted} zmena={soucty.rok.zmena} protiCemu="loňsku" />
        <Dlazdice popis="Výstav celkem" litry={soucty.vse.ted} zmena={null} />
      </div>

      {/* 🛢️ Průměrná potřeba sudů — v KUSECH, ne v hektolitrech: odpovídá na
          „kolik jich musím mít doma umytých", a na to hektolitry neodpoví
          (padesátka i desítka je pořád jeden sud). Z ukončených období —
          běžící týden by průměr v pondělí strhl dolů. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Průměrná potřeba sudů"
          popis={`Kolik sudů se průměrně stočí — z posledních ${potrebaKegu.tydnu} ukončených týdnů a ${potrebaKegu.mesicu} měsíců`}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Na týden</div>
            <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums mt-1">
              {ksFormat(potrebaKegu.tyden)}{' '}
              <span className="text-base font-bold text-neutral-400">sudů</span>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-white p-3">
            <div className="text-udaj font-black uppercase tracking-wider text-neutral-500">Na měsíc</div>
            <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums mt-1">
              {ksFormat(potrebaKegu.mesic)}{' '}
              <span className="text-base font-bold text-neutral-400">sudů</span>
            </div>
          </div>
        </div>

        {/* 📦 Rozpad podle VELIKOSTI sudu. Souhrnné číslo nahoře neřekne,
            jestli mít nachystané padesátky, nebo třicítky — a přitom přesně
            to je ta otázka, kvůli které se sem člověk dívá. */}
        {potrebaKegu.obaly.length > 0 && (
          <div className="mt-3 overflow-x-auto -mx-1 px-1">
            <table className="table-drzi-prvni-sloupec w-full text-sm">
              <thead>
                <tr className="text-udaj font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                  <th scope="col" className="text-left py-2">Velikost sudu</th>
                  <th scope="col" className="text-right py-2">Na týden</th>
                  <th scope="col" className="text-right py-2">Na měsíc</th>
                </tr>
              </thead>
              <tbody>
                {potrebaKegu.obaly.map((o) => (
                  <tr key={o.id} className="border-b border-neutral-100 last:border-0">
                    <td className="py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaObalu.get(o.id) ?? RADA_BAREV[1] }} />
                        <span className="font-bold text-neutral-900">{o.nazev}</span>
                      </span>
                    </td>
                    <td className="text-right tabular-nums font-black text-neutral-900">{ksFormat(o.tyden)} ks</td>
                    <td className="text-right tabular-nums font-semibold text-neutral-700">{ksFormat(o.mesic)} ks</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Přepínač pohledu grafů — souhrn, KEG vs lahve, nebo rozpad na
          konkrétní obaly. */}
      <Prepinac
        volby={[['celkem', 'Celkem'], ['sudyLahve', 'KEG vs lahve'], ['obaly', 'Po obalech']] as const}
        vybrano={rezimGrafu}
        onZmena={setRezimGrafu}
      />

      {/* Porovnání měsíců — dvě řady ve stejné jednotce, jedna osa. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Výstav po měsících (sudy)"
          popis={
            rezimGrafu === 'sudyLahve'
              ? `Hektolitry za rok ${dnes.slice(0, 4)} — co zůstalo v sudech a co šlo do lahví`
              : rezimGrafu === 'obaly'
              ? `Hektolitry za rok ${dnes.slice(0, 4)} — sloupec rozpadlý na velikosti sudů`
              : maLonskaData
                ? `Hektolitry — ${dnes.slice(0, 4)} proti ${Number(dnes.slice(0, 4)) - 1}`
                : `Hektolitry za rok ${dnes.slice(0, 4)}`
          }
        />
        <div className="h-[240px] sm:h-[300px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            {rezimGrafu === 'sudyLahve' ? (
              <BarChart data={dataMesiceSudyLahve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mesic" tick={{ fontSize: 11, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={popisSudyLahve} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="sudy" name="V sudech (KEG)" stackId="sl" fill={RADA_BAREV[0]} maxBarSize={22} />
                <Bar dataKey="lahve" name="V lahvích" stackId="sl" fill={RADA_BAREV[1]} maxBarSize={22} />
              </BarChart>
            ) : rezimGrafu === 'obaly' ? (
              <BarChart data={dataMesiceObaly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mesic" tick={{ fontSize: 11, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${Number(v).toFixed(1)} hl`, n]} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                {radyObalu.map((o) => (
                  <Bar key={o.id} dataKey={o.id} name={o.nazev} stackId="obaly" fill={barvaObalu.get(o.id) ?? RADA_BAREV[1]} maxBarSize={22} />
                ))}
              </BarChart>
            ) : (
              <BarChart data={dataMesice} barGap={2} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mesic" tick={{ fontSize: 11, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${Number(v).toFixed(1)} hl`, n === 'letos' ? dnes.slice(0, 4) : String(Number(dnes.slice(0, 4)) - 1)]} />
                {maLonskaData && <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} formatter={(v) => (v === 'letos' ? dnes.slice(0, 4) : String(Number(dnes.slice(0, 4)) - 1))} />}
                {maLonskaData && <Bar dataKey="loni" fill={BARVA_LONI} radius={[4, 4, 0, 0]} maxBarSize={18} />}
                <Bar dataKey="letos" fill={BARVA_LETOS} radius={[4, 4, 0, 0]} maxBarSize={18} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Týdny — jedna řada, takže bez legendy; název grafu ji pojmenuje. */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="Posledních 12 týdnů"
          popis={
            rezimGrafu === 'sudyLahve' ? 'Hektolitry po týdnech — co zůstalo v sudech a co šlo do lahví'
              : rezimGrafu === 'obaly' ? 'Hektolitry po týdnech, sloupec rozpadlý na velikosti sudů'
                : 'Hektolitry stočené v jednotlivých týdnech'
          }
        />
        <div className="h-[200px] sm:h-[240px] -ml-3">
          <ResponsiveContainer width="100%" height="100%">
            {rezimGrafu === 'sudyLahve' ? (
              <BarChart data={dataTydnySudyLahve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tyden" tick={{ fontSize: 10, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={popisSudyLahve} labelFormatter={(l) => `Týden od ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="sudy" name="V sudech (KEG)" stackId="sl" fill={RADA_BAREV[0]} maxBarSize={30} />
                <Bar dataKey="lahve" name="V lahvích" stackId="sl" fill={RADA_BAREV[1]} maxBarSize={30} />
              </BarChart>
            ) : rezimGrafu === 'obaly' ? (
              <BarChart data={dataTydnyObaly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tyden" tick={{ fontSize: 10, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={(v: any, n: any) => [`${Number(v).toFixed(1)} hl`, n]} labelFormatter={(l) => `Týden od ${l}`} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                {radyObalu.map((o) => (
                  <Bar key={o.id} dataKey={o.id} name={o.nazev} stackId="obaly" fill={barvaObalu.get(o.id) ?? RADA_BAREV[1]} maxBarSize={30} />
                ))}
              </BarChart>
            ) : (
              <BarChart data={dataTydny} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={MRIZKA} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="tyden" tick={{ fontSize: 10, fill: INK_TLUMENA, fontWeight: 700 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: INK_TLUMENA }} axisLine={false} tickLine={false} width={38} />
                <Tooltip {...stylTooltipu} formatter={(v: any) => [`${Number(v).toFixed(1)} hl`, 'Výstav']} labelFormatter={(l) => `Týden od ${l}`} />
                <Bar dataKey="hl" fill={BARVA_LETOS} radius={[4, 4, 0, 0]} maxBarSize={26} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      </section>

      {/* Přepínač období pro rozpady pod ním + posouvání šipkami.
          Zadání 23. 9. 2026: „uprav ten filtr tyden, tento tyden at to
          ukazuje, mesic aktualni, rok aktualni a at se daj vsechny tyto
          udaje sipkama jednoduse posouvat." Výchozí je vždycky období,
          ve kterém jsme teď (posun 0); šipka vlevo jde do minulosti. */}
      <div className="flex flex-wrap items-center gap-2">
        <Prepinac
          volby={VOLBY_OBDOBI}
          vybrano={obdobi}
          onZmena={(o) => { onObdobi(o); setPosun(0); }}
        />

        {/* U „Celkem" není co posouvat — celá doba je jen jedna. */}
        {obdobi !== 'vse' && (
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
            <button
              type="button"
              onClick={() => setPosun((p) => p - 1)}
              className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base"
              title="Předchozí období"
              aria-label="Předchozí období"
            >
              ‹
            </button>
            <span className="px-2 text-xs font-black text-neutral-900 tabular-nums whitespace-nowrap">
              {popisRozsahu(obdobi, denProObdobi)}
            </span>
            <button
              type="button"
              onClick={() => setPosun((p) => Math.min(0, p + 1))}
              disabled={posun >= 0}
              className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base disabled:opacity-30"
              title="Následující období"
              aria-label="Následující období"
            >
              ›
            </button>
            {posun !== 0 && (
              <button
                type="button"
                onClick={() => setPosun(0)}
                className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black text-amber-700"
              >
                Teď
              </button>
            )}
          </div>
        )}
      </div>

      {/* 🛢️🍾 KEG vs lahve — zadání 26. 9. 2026: „dej ať je tam určitě podíl
          keg vs lahve". Lahve se plní z už stočených sudů, takže nejsou
          navíc k výstavu, ale jeho část: v sudech zůstal výstav minus to,
          co se přestočilo do lahví (lib/statistika.ts, podilSudyLahve). */}
      <section className="card p-3.5 sm:p-5">
        <Nadpis
          text="KEG vs lahve"
          popis={`${popisVybraneho} — kolik stočeného piva zůstalo v sudech a kolik šlo do lahví`}
        />
        {sudyVsLahve.sudyL + sudyVsLahve.lahveL === 0 ? (
          <p className="text-sm text-neutral-500 font-semibold py-4 text-center">V tomhle období se nic nestočilo.</p>
        ) : (
          <>
            <div
              className="flex h-4 rounded-full overflow-hidden bg-neutral-100"
              role="img"
              aria-label={`Sudy ${(sudyVsLahve.podilSudy * 100).toFixed(0)} %, lahve ${(sudyVsLahve.podilLahve * 100).toFixed(0)} %`}
            >
              <div style={{ width: `${sudyVsLahve.podilSudy * 100}%`, backgroundColor: RADA_BAREV[0] }} />
              <div style={{ width: `${sudyVsLahve.podilLahve * 100}%`, backgroundColor: RADA_BAREV[1] }} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <div className="flex items-center gap-2 text-udaj font-black uppercase tracking-wider text-neutral-500">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: RADA_BAREV[0] }} />
                  V sudech (KEG)
                </div>
                <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums mt-1">
                  {(sudyVsLahve.podilSudy * 100).toFixed(0)} %
                </div>
                <div className="text-xs font-semibold text-neutral-500 tabular-nums">{formatHl(sudyVsLahve.sudyL)} hl</div>
              </div>
              <div>
                <div className="flex items-center gap-2 text-udaj font-black uppercase tracking-wider text-neutral-500">
                  <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: RADA_BAREV[1] }} />
                  V lahvích
                </div>
                <div className="font-display font-extrabold text-2xl text-neutral-900 tabular-nums mt-1">
                  {(sudyVsLahve.podilLahve * 100).toFixed(0)} %
                </div>
                <div className="text-xs font-semibold text-neutral-500 tabular-nums">{formatHl(sudyVsLahve.lahveL)} hl · {kusuLahvi} ks</div>
              </div>
            </div>
            <p className="text-udaj text-neutral-400 font-semibold mt-2">
              Lahve se plní ze stočených sudů, proto jsou podílem výstavu ({formatHl(litryObdobi)} hl), ne něčím navíc.
              {sudyVsLahve.zDrivejsich && ' V tomhle období se lahvovalo víc, než se stočilo — i ze sudů stočených dřív.'}
            </p>
          </>
        )}
      </section>

      {/* 📦 Obaly v číslech — jádro toho, kvůli čemu se sem chodí.
          Zadání 23. 9. 2026: „nestojim o data kolik celkem bylo stoceny
          lahvi a kegu najednou (udaj k nicemu, je potreba vedet konkretni
          obaly kolik za jaky obdobi)." Řádek je proto JEDEN OBAL, ne skupina.

          Sudy a lahve mají vlastní podíl a vlastní součet, každá skupina
          zvlášť: sečíst je do jednoho by tentýž objem počítalo dvakrát,
          protože se lahvuje z už stočených sudů. */}
      {(podleObalu.length > 0 || podleLahvi.length > 0) && (
        <section className="card p-3.5 sm:p-5">
          <Nadpis
            text="Obaly v číslech"
            popis={`${popisVybraneho}${predchozi ? ` · změna proti období ${POPIS_PREDCHOZI[obdobi]}` : ''}`}
          />
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="table-drzi-prvni-sloupec w-full text-sm">
              <thead>
                <tr className="text-udaj font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                  <th scope="col" className="text-left py-2">Obal</th>
                  <th scope="col" className="text-right py-2">Kusů</th>
                  <th scope="col" className="text-right py-2">Hektolitrů</th>
                  <th scope="col" className="text-right py-2">Podíl</th>
                  {predchozi && <th scope="col" className="text-right py-2">Změna</th>}
                </tr>
              </thead>
              <tbody>
                <SkupinaObalu
                  nazev="Sudy (výstav)"
                  radky={podleObalu}
                  barvy={barvaObalu}
                  maZmenu={!!predchozi}
                />
                <SkupinaObalu
                  nazev="Lahve a PET (přestočeno ze sudů)"
                  radky={podleLahvi}
                  barvy={barvaObalu}
                  maZmenu={!!predchozi}
                />
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pivo a odběratelé vedle sebe — „kdo a co" za zvolené období. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Podíl piv */}
        <section className="card p-3.5 sm:p-5">
          <Nadpis text="Které pivo táhne" popis={`Podíl na výstavu ${popisVybraneho} · celkem ${formatHl(litryObdobi)} hl`} />
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

        {/* Odběratelé */}
        <section className="card p-3.5 sm:p-5">
          <Nadpis
            text="Největší odběratelé"
            popis={`Podle objednaného množství ${obdobiOdberatelu === 'rok' ? 'za rok' : 'za měsíc'} ${popisRozsahu(obdobiOdberatelu, denOdberatelu)} — rozhoduje den závozu`}
          />
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Prepinac
              volby={[['mesic', 'Měsíc'], ['rok', 'Rok']] as const}
              vybrano={obdobiOdberatelu}
              onZmena={(o) => { setObdobiOdberatelu(o); setPosunOdberatelu(0); }}
            />
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-white border border-neutral-200 w-fit">
              <button
                type="button"
                onClick={() => setPosunOdberatelu((p) => p - 1)}
                className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base"
                title="Předchozí období odběratelů"
                aria-label="Předchozí období odběratelů"
              >
                ‹
              </button>
              <span className="px-2 text-xs font-black text-neutral-900 tabular-nums whitespace-nowrap">
                {popisRozsahu(obdobiOdberatelu, denOdberatelu)}
              </span>
              <button
                type="button"
                onClick={() => setPosunOdberatelu((p) => Math.min(0, p + 1))}
                disabled={posunOdberatelu >= 0}
                className="btn-ghost !rounded-xl !py-2 !px-3 font-black text-base disabled:opacity-30"
                title="Následující období odběratelů"
                aria-label="Následující období odběratelů"
              >
                ›
              </button>
              {posunOdberatelu !== 0 && (
                <button
                  type="button"
                  onClick={() => setPosunOdberatelu(0)}
                  className="btn-ghost !rounded-xl !py-2 !px-3 text-xs font-black text-amber-700"
                >
                  Teď
                </button>
              )}
            </div>
          </div>
          {odberatele.length === 0 ? (
            <EmptyState text="V tomhle období není žádná objednávka." icon={Store} />
          ) : (
            <div className="space-y-1.5">
              {odberatele.map((o, i) => {
                const podil = odberatele[0].litry > 0 ? o.litry / odberatele[0].litry : 0;
                const rozbaleno = rozbalenyOdberatel === o.nazev;
                return (
                  <div key={o.nazev}>
                    {/* 📦 Klik rozbalí, DO ČEHO se tomu odběrateli vozí.
                        Souhrnné „16 ks" se pro nachystání závozu použít nedá —
                        šest padesátek a deset PET je jiná práce než šestnáct
                        třicítek. */}
                    <button
                      type="button"
                      onClick={() => setRozbalenyOdberatel(rozbaleno ? null : o.nazev)}
                      aria-expanded={rozbaleno}
                      className="w-full text-left flex items-center gap-3 min-h-[44px] rounded-xl hover:bg-neutral-50 px-1 -mx-1 transition"
                    >
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
                        <div className="text-udaj font-semibold text-neutral-500 mt-0.5 flex items-center gap-1">
                          <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${rozbaleno ? 'rotate-180' : ''}`} />
                          {o.kusy} ks · {o.objednavek} {o.objednavek === 1 ? 'objednávka' : o.objednavek < 5 ? 'objednávky' : 'objednávek'}
                          {!rozbaleno && o.obaly.length > 0 && <span className="text-neutral-400">· do čeho ▸</span>}
                        </div>
                      </div>
                    </button>
                    {rozbaleno && (
                      <div className="ml-9 mt-1 mb-2 rounded-xl border border-neutral-200 bg-neutral-50 p-2.5 space-y-1">
                        {o.obaly.length === 0 ? (
                          <p className="text-udaj font-semibold text-neutral-500">U položek není uvedený obal.</p>
                        ) : (
                          <>
                            {o.obaly.map((ob) => (
                              <div key={ob.id} className="flex items-center gap-2.5 text-sm">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaObalu.get(ob.id) ?? RADA_BAREV[1] }} />
                                <span className="flex-1 min-w-0 truncate font-bold text-neutral-800">{ob.nazev}</span>
                                <span className="tabular-nums font-black text-neutral-900">{ob.kusy} ks</span>
                                <span className="tabular-nums font-semibold text-neutral-400 w-24 text-right">
                                  {o.objednavek > 0 ? `${ksFormat(ob.kusy / o.objednavek)} / závoz` : ''}
                                </span>
                              </div>
                            ))}
                            <p className="text-udaj font-semibold text-neutral-500 pt-1 border-t border-neutral-200">
                              „/ závoz" = průměr na jednu objednávku v tomhle období — podklad pro to, co naložit.
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* Další rozpady — sbalené. Na telefonu dělaly skoro třetinu stránky
          a z velké části opakují, co je výš („Do jakých sudů" a „Přestočeno
          do lahví" jsou tytéž obaly jako v tabulce „Obaly v číslech", „Piva
          v číslech" tentýž rozpad jako graf „Které pivo táhne"). Čísla se
          nemění, jen jsou o klepnutí dál. */}
      <details className="group">
        <summary className="card p-3.5 sm:p-4 cursor-pointer select-none list-none flex items-center justify-between gap-2">
          <span>
            <span className="block font-display font-black text-base text-neutral-900">Další rozpady</span>
            <span className="block text-udaj font-semibold text-neutral-500">Velikosti sudů v grafu, přestočeno do lahví, rozpočet sudů, piva v číslech</span>
          </span>
          <ChevronDown size={18} className="shrink-0 text-neutral-500 transition group-open:rotate-180" />
        </summary>
        <div className="space-y-4 mt-4">
          {/* Podíl obalů */}
          <section className="card p-3.5 sm:p-5">
            <Nadpis text="Do jakých sudů" popis={`Rozpad výstavu podle velikosti sudu ${popisVybraneho}`} />
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
        {/* Přestočeno do lahví — údaj o tom, kam pivo z výstavu šlo dál. */}
        <section className="card p-3.5 sm:p-5">
          <Nadpis
            text="Přestočeno do lahví"
            popis={`${popisVybraneho} — lahvuje se z už stočených sudů, do výstavu se to proto NEpřičítá`}
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

        {/* 🛢️ Rozpočet sudů — přesunuto sem ze záložky „Měsíční přehledy",
            kde to viselo jako „Ztráty KEG" jen jako souhrn za měsíc.
            Vzorec je tentýž (stočeno − fasováno − odpisy), jen po konkrétních
            velikostech a za zvolené období. */}
        {rozpocet.length > 0 && (
          <section className="card p-3.5 sm:p-5">
            <Nadpis
              text="Rozpočet sudů"
              popis={`${popisVybraneho} — co se stočilo proti tomu, co se vyfasovalo a odepsalo`}
            />
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="table-drzi-prvni-sloupec w-full text-sm">
                <thead>
                  <tr className="text-udaj font-black uppercase tracking-wider text-neutral-500 border-b border-neutral-200">
                    <th scope="col" className="text-left py-2">Sud</th>
                    <th scope="col" className="text-right py-2">Stočeno</th>
                    <th scope="col" className="text-right py-2">Fasováno</th>
                    <th scope="col" className="text-right py-2">Odpisy</th>
                    <th scope="col" className="text-right py-2">Objednáno</th>
                    <th scope="col" className="text-right py-2">Nerozpočteno</th>
                  </tr>
                </thead>
                <tbody>
                  {rozpocet.map((r) => (
                    <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: barvaObalu.get(r.id) ?? RADA_BAREV[1] }} />
                          <span className="font-bold text-neutral-900">{r.nazev}</span>
                        </span>
                      </td>
                      <td className="text-right tabular-nums font-black text-neutral-900">{r.stoceno}</td>
                      <td className="text-right tabular-nums font-semibold text-neutral-700">{r.fasovano}</td>
                      <td className="text-right tabular-nums font-semibold text-neutral-700">{r.odpisy}</td>
                      <td className="text-right tabular-nums font-semibold text-neutral-500">{r.objednano}</td>
                      <td className={`text-right tabular-nums font-black ${r.nerozpocteno > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {r.nerozpocteno}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-udaj text-neutral-400 font-semibold mt-2">
              Nerozpočteno = stočeno − fasováno − odpisy. Objednané kusy jsou vedle jen jako kontext (podle dne závozu),
              do rozdílu nevstupují — objednávka není pohyb skladu.
            </p>
          </section>
        )}

        {/* Piva v číslech — tabulka jako alternativa ke grafu */}
        {podlePiv.length > 0 && (
          <section className="card p-3.5 sm:p-5">
            <Nadpis text="Piva v číslech" popis={`${popisVybraneho}${predchozi ? ` · srovnání s obdobím ${POPIS_PREDCHOZI[obdobi]}` : ''}`} />
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
                        {predchozi && <td className="text-right"><Trend zmena={p.zmena} /></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        </div>
      </details>

      <p className="text-udaj text-neutral-400 font-semibold px-1">
        Výstav = objem stočených <strong>sudů</strong> (množství × objem obalu). Lahve se do něj nepočítají —
        lahvuje se z už stočených sudů, takže pivo v lahvi do výstavu vstoupilo už jako sud; přičítat ho znovu
        by tentýž objem počítalo dvakrát. Ze skladu se sudy na lahvování odečítají (viz Sklad → „Sud spotřebován
        na lahve"). Objednávky se do výstavu nepočítají — objednané pivo nemusí být stočené a naopak.
      </p>
    </div>
  );
}
