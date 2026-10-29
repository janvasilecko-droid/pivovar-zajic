// 🚶 Krokové zadávání — jedna otázka na obrazovku, velké pole, klávesnice.
// ---------------------------------------------------------------------------
// Společný panel pro Lahve, KEG a Fasování (zadání z 29. 10. 2026). Stejný
// princip jako Popořadě v inventuře: po klepnutí na pivo se rovnou otevře
// pole a klávesnice. Nahoře se klikem vybere velikost obalu, pod polem je
// pět nejčastějších čísel. U lahví jsou kroky dva (z kolika sudů → kolik
// lahví), jinde jeden.
//
// Panel NEMÁ vlastní data. Čte a zapisuje přes `mnozstvi` / `nastav`, které
// dodává obrazovka, takže zápis zůstává v těch samých polích jako dřív
// (řádky entryRows, rozepsaný koncept v zařízení) a nic dalšího se nemění.
//
// Číslo se do zápisu přenáší hned, jak se píše — kdyby appku z telefonu něco
// vyhodilo uprostřed (hovor, uspání), rozepsané zůstane v zařízení
// (lib/rozepsanyZapis.ts, 15. 10. 2026). Zavření NIC nezahazuje: rozepsané
// jde do zápisu pod dlaždicemi, jako vždycky.
import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Beer, beerBg, beerName, beerText } from '../lib/supabase';
import { kusy } from '../lib/krokoveZadavani';
import type { DnesPolozka } from '../lib/dnesUlozeno';

export type KrokVolba = {
  id: string;
  label: string;
  /** Nadpis skupiny nad obaly (Fasování: „Lahve“ / „Sudy“); mění se, kdykoli se skupina změní. */
  skupina?: string;
};

export type KrokDef = {
  /** Krátký štítek v liště kroků: „Z kolika sudů". */
  stitek: string;
  /** Otázka nad polem. */
  otazka: string;
  obaly: KrokVolba[];
  /** Jednotka u pole: „sudů 50 l". */
  jednotka: (obal: KrokVolba) => string;
  mnozstvi: (obalId: string) => number;
  nastav: (obalId: string, mnozstvi: number) => void;
  /** Nejčastější čísla pro obal (nejvýš pět). */
  rychle: (obalId: string) => number[];
  /** Obal, který je vybraný po otevření kroku (jinak první s počtem, jinak první). */
  vychozi?: string;
  /** Kolik různých obalů smí mít počet najednou (sudy: dvě velikosti). */
  maxObalu?: number;
  /** Text tlačítka pro další obal v tomhle kroku: „+ další sud". */
  dalsiText: string;
  /** Doplněk nad otázkou kroku (přepínač dne u plánu). */
  nahore?: ReactNode;
  /** Doplněk pod polem pro vybraný obal; dostane rozepsané číslo a jeho nastavení. */
  pod?: (obalId: string, rozepsano: number, nastavCislo: (n: number) => void) => ReactNode;
  /** Krok se dá potvrdit i bez čísla, jen po odsouhlasení varování. */
  bezMnozstvi?: { zprava: string; pokracovat: string };
  /** Zpráva, když se poslední krok potvrdí bez čísla, ačkoli dřívější krok něco má. */
  povinny?: string;
};

type Props = {
  beer: Beer;
  /** „Stáčení lahví", „Stáčení KEG", „Fasování". */
  podtitul: string;
  kroky: KrokDef[];
  /** Zavření (křížek, Hotovo, klepnutí vedle). Volá se až po přenesení čísla do zápisu. */
  onZavrit: () => void;
  /** Co už se ten den uložilo u tohohle piva — pod polem. */
  dnes?: DnesPolozka[];
  /** Který den to je: „dnes", nebo datum, když se zapisuje zpětně. */
  den?: string;
  /** Doplněk vpravo v liště (např. pole „pro koho" u fasování). */
  hlavickaVpravo?: ReactNode;
};

const kratky = (stitek: string) => stitek.replace(/^\d+\s*·\s*/, '');

export function KrokoveZadavani({ beer, podtitul, kroky, onZavrit, dnes, den = 'dnes', hlavickaVpravo }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const vychozi = (i: number) => {
    const k = kroky[i];
    return k.vychozi ?? k.obaly.find((o) => k.mnozstvi(o.id) > 0)?.id ?? k.obaly[0]?.id ?? '';
  };
  const [krok, setKrok] = useState(0);
  const [vybrany, setVybrany] = useState(() => vychozi(0));
  const [hodnota, setHodnota] = useState(() => {
    const n = kroky[0].mnozstvi(vychozi(0));
    return n > 0 ? String(n) : '';
  });
  const [varovani, setVarovani] = useState(false);
  const [zprava, setZprava] = useState('');
  const [koncim, setKoncim] = useState(false);
  // Kolik mělo vybrané políčko v okamžiku výběru: číslo napsané PŘED volbou
  // velikosti patří té nově vybrané, ale jen když políčko předtím prázdné bylo.
  const puvodniRef = useRef(kroky[0].mnozstvi(vychozi(0)));
  // Přesouvá se jen číslo napsané k PŘEDVOLENÉ velikosti (oprava „psal jsem na
  // padesátku, mělo to být 30"). Kdo velikost klepnul sám, ten ji myslel.
  const volilSamRef = useRef(false);

  const kr = kroky[krok];
  const posledni = krok === kroky.length - 1;
  const rozepsano = kusy(hodnota);

  // Zavírá se až v dalším vykreslení: do té doby obrazovka dostane přenesená
  // čísla a `onZavrit` vidí už aktuální stav (rozepsaný řádek se z něj skládá).
  useEffect(() => {
    if (koncim) onZavrit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [koncim]);

  // Po každém přepnutí kroku nebo obalu zpátky do pole a vybrat text, ať se
  // dá rovnou psát (Popořadě dělá totéž).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [krok, vybrany]);

  /** Počet obalu s ohledem na to, co je právě v poli. */
  const pocetObalu = (k: KrokDef, id: string) => (k === kr && id === vybrany ? rozepsano : k.mnozstvi(id));
  const souctyKroku = (k: KrokDef) => k.obaly.reduce((s, o) => s + pocetObalu(k, o.id), 0);

  function preneste(k: KrokDef, obalId: string, text: string) {
    const n = kusy(text);
    if (obalId && n !== k.mnozstvi(obalId)) k.nastav(obalId, n);
  }

  const pouzite = kr.obaly.filter((o) => pocetObalu(kr, o.id) > 0).map((o) => o.id);
  const zakazany = (id: string) =>
    kr.maxObalu !== undefined && id !== vybrany && !pouzite.includes(id) && pouzite.length >= kr.maxObalu;

  function vyber(id: string) {
    setZprava('');
    setVarovani(false);
    if (id === vybrany) { volilSamRef.current = true; inputRef.current?.focus(); return; }
    if (!volilSamRef.current && rozepsano > 0 && puvodniRef.current === 0 && kr.mnozstvi(id) === 0) {
      // Napřed číslo, pak velikost: číslo se přesune z předvolené velikosti.
      volilSamRef.current = true;
      kr.nastav(vybrany, 0);
      kr.nastav(id, rozepsano);
      setVybrany(id);
      return;
    }
    volilSamRef.current = true;
    const n = kr.mnozstvi(id);
    puvodniRef.current = n;
    setVybrany(id);
    setHodnota(n > 0 ? String(n) : '');
  }

  function dalsi() {
    preneste(kr, vybrany, hodnota);
    const pouziteTed = new Set(pouzite);
    if (rozepsano > 0) pouziteTed.add(vybrany);
    const volne = kr.obaly.filter((o) => o.id !== vybrany && !pouziteTed.has(o.id));
    const dalsiObal = kr.maxObalu !== undefined && pouziteTed.size >= kr.maxObalu ? undefined : volne[0];
    setVarovani(false);
    if (!dalsiObal) {
      setZprava('Další velikost už není k dispozici.');
      return;
    }
    setZprava('');
    puvodniRef.current = 0;
    volilSamRef.current = true;
    setVybrany(dalsiObal.id);
    setHodnota('');
  }

  function potvrdit(text: string, bezVarovani = false) {
    if (kr.bezMnozstvi && !bezVarovani && souctyKroku(kr) - pocetObalu(kr, vybrany) + kusy(text) === 0) {
      setVarovani(true);
      return;
    }
    setVarovani(false);
    if (!posledni) {
      preneste(kr, vybrany, text);
      setZprava('');
      const dalsiKrok = krok + 1;
      const v = vychozi(dalsiKrok);
      const n = kroky[dalsiKrok].mnozstvi(v);
      puvodniRef.current = n;
      volilSamRef.current = false;
      setKrok(dalsiKrok);
      setVybrany(v);
      setHodnota(n > 0 ? String(n) : '');
      return;
    }
    const drivejsiMaji = kroky.slice(0, -1).some((k) => souctyKroku(k) > 0);
    const celkem = souctyKroku(kr) - pocetObalu(kr, vybrany) + kusy(text);
    if (kr.povinny && celkem === 0 && drivejsiMaji) {
      setZprava(kr.povinny);
      return;
    }
    preneste(kr, vybrany, text);
    setKoncim(true);
  }

  function zmenPocet(delta: number) {
    const n = Math.max(0, Math.min(9999, rozepsano + delta));
    const text = n > 0 ? String(n) : '';
    setHodnota(text);
    preneste(kr, vybrany, text);
    setVarovani(false);
    setZprava('');
    inputRef.current?.focus();
  }

  function zavrit() {
    preneste(kr, vybrany, hodnota);
    setKoncim(true);
  }

  function naKrok(i: number) {
    if (i === krok) return;
    preneste(kr, vybrany, hodnota);
    setVarovani(false);
    setZprava('');
    const v = vychozi(i);
    const n = kroky[i].mnozstvi(v);
    puvodniRef.current = n;
    volilSamRef.current = false;
    setKrok(i);
    setVybrany(v);
    setHodnota(n > 0 ? String(n) : '');
  }

  const obal = kr.obaly.find((o) => o.id === vybrany) ?? kr.obaly[0];
  const rychle = obal ? kr.rychle(obal.id) : [];
  const textTrida = beerText(beer);
  const dnesPolozky = dnes ?? [];
  // Den, na který se zapisuje: dnešek (středa 29. 10.), nebo zpětně zvolené datum.
  const denText = new Date(den === 'dnes' ? Date.now() : `${den}T12:00:00`)
    .toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'Europe/Prague' });

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-stretch sm:items-center justify-center sm:p-4" onClick={zavrit}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${podtitul} — ${beerName(beer)}`}
        className="w-full max-w-xl bg-white dark:bg-neutral-800 flex flex-col sm:rounded overflow-hidden shadow-2xl max-h-full sm:max-h-[94vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2.5 flex items-center justify-between gap-2 shrink-0" style={{ backgroundColor: beerBg(beer) }}>
          <div className={`min-w-0 ${hlavickaVpravo ? 'max-w-[45%]' : 'flex-1'} ${textTrida}`}>
            <div className="font-black text-lg leading-tight truncate">{beerName(beer)}</div>
            <div className="text-xs font-bold opacity-80 truncate">
              {podtitul}{kroky.length > 1 ? ` · krok ${krok + 1} ze ${kroky.length}` : ''} · {denText}
            </div>
          </div>
          {hlavickaVpravo && <div className="min-w-0 flex-1 flex">{hlavickaVpravo}</div>}
          <button type="button" onClick={zavrit} className="btn-secondary !px-0 w-11 shrink-0" aria-label="Zavřít a nechat rozepsané" title="Zavřít — rozepsané zůstane v zápisu">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 space-y-3 overflow-y-auto">
          {kroky.length > 1 && (
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${kroky.length}, minmax(0, 1fr))` }}>
              {kroky.map((k, i) => (
                <button
                  key={k.stitek}
                  type="button"
                  onClick={() => naKrok(i)}
                  aria-current={i === krok ? 'step' : undefined}
                  className={i === krok ? 'btn-amber !px-1 !text-xs' : 'btn-ghost !px-1 !text-xs'}
                >
                  {k.stitek}{i < krok && <Check size={14} />}
                </button>
              ))}
            </div>
          )}

          {kr.nahore}

          <div className="text-2xl font-black text-neutral-900 dark:text-neutral-100" id="krok-otazka">{kr.otazka}</div>

          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Velikost obalu">
            {kr.obaly.map((o, i) => {
              const n = pocetObalu(kr, o.id);
              const vyb = o.id === vybrany;
              const novaSkupina = o.skupina && o.skupina !== kr.obaly[i - 1]?.skupina;
              return (
                <Fragment key={o.id}>
                {novaSkupina && <div className="basis-full text-udaj font-black uppercase tracking-wider text-neutral-500 mt-0.5">{o.skupina}</div>}
                <button
                  type="button"
                  role="radio"
                  aria-checked={vyb}
                  disabled={zakazany(o.id)}
                  title={zakazany(o.id) ? 'Víc velikostí najednou nejde' : undefined}
                  onClick={() => vyber(o.id)}
                  className={`relative ${vyb ? 'btn-amber' : 'btn-ghost'} !px-3 min-w-[56px]`}
                >
                  {o.label}
                  {n > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-emerald-700 text-white text-[11px] leading-5 font-black">{n}</span>
                  )}
                </button>
                </Fragment>
              );
            })}
          </div>

          <div className="flex items-stretch gap-2">
            <button type="button" onClick={() => zmenPocet(-1)} disabled={rozepsano <= 0} className="btn-pocet !w-14 !text-3xl min-h-[80px] disabled:opacity-30" aria-label="Ubrat jeden kus">−</button>
            <div className="relative flex-1 min-w-0">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                autoFocus
                maxLength={4}
                enterKeyHint={posledni ? 'done' : 'next'}
                aria-labelledby="krok-otazka"
                value={hodnota}
                placeholder="0"
                onChange={(e) => {
                  const text = e.target.value.replace(/[^0-9]/g, '');
                  setHodnota(text);
                  preneste(kr, vybrany, text);
                  setVarovani(false);
                  setZprava('');
                }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); potvrdit(hodnota); } }}
                className="w-full h-20 pb-4 rounded border-[3px] border-amber-500 bg-white dark:bg-neutral-900 text-neutral-950 dark:text-neutral-50 text-5xl font-black text-center tabular-nums px-3 focus:outline-none focus:ring-4 focus:ring-amber-300/60"
              />
              {obal && (
                <span className="absolute inset-x-0 bottom-1 text-center text-xs font-black leading-tight text-neutral-500 pointer-events-none">
                  {kr.jednotka(obal)}
                </span>
              )}
            </div>
            <button type="button" onClick={() => zmenPocet(1)} className="btn-pocet !w-14 !text-3xl min-h-[80px]" aria-label="Přidat jeden kus">+</button>
          </div>

          {varovani && kr.bezMnozstvi && (
            <div className="rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-300 p-2.5 space-y-2" role="alert">
              <p className="text-sm font-bold text-amber-950 dark:text-amber-200">{kr.bezMnozstvi.zprava}</p>
              <button type="button" onClick={() => potvrdit(hodnota, true)} className="btn-ghost !text-xs">{kr.bezMnozstvi.pokracovat}</button>
            </div>
          )}
          {zprava && !varovani && (
            <div className="rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-300 p-2.5 text-sm font-bold text-rose-800 dark:text-rose-200" role="alert">{zprava}</div>
          )}

          {obal && kr.pod?.(obal.id, rozepsano, (n) => setHodnota(n > 0 ? String(n) : ''))}

          <div>
            <div className="text-udaj font-black uppercase tracking-wider text-neutral-500 mb-1.5">Nejčastěji · klepnutí = zadáno</div>
            {rychle.length > 0 ? (
              <div className="grid grid-cols-5 gap-1.5">
                {rychle.map((q) => (
                  <button key={q} type="button" onClick={() => { setHodnota(String(q)); potvrdit(String(q)); }} className="btn-secondary !text-xl !font-black tabular-nums !px-0 min-h-[52px]">
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">U tohoto obalu zatím není historie — napiš číslo.</p>
            )}
          </div>


          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-2.5">
            <div className="text-udaj font-black uppercase tracking-wider text-neutral-500 mb-1">Už uloženo {den} u {beerName(beer)}</div>
            {dnesPolozky.length > 0 ? (
              <ul className="space-y-1">
                {dnesPolozky.map((p) => (
                  <li key={p.id} className="flex items-baseline gap-2 text-sm text-neutral-800 dark:text-neutral-100">
                    <span className="font-black text-neutral-500 tabular-nums min-w-[2.5rem]">{p.cas}</span>
                    <span className="font-bold">{p.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-neutral-500">Zatím nic.</p>
            )}
          </div>
        </div>
        <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 p-3 bg-white dark:bg-neutral-800" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <button type="button" onClick={dalsi} className="btn-secondary min-h-[52px]">
              <Plus size={16} /> {kr.dalsiText}
            </button>
            <button type="button" onClick={() => potvrdit(hodnota)} className="btn-emerald min-h-[52px]">
              {posledni ? 'Hotovo' : `Dál → ${kratky(kroky[krok + 1].stitek).toLowerCase()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Seznam dnešních uložených zápisů všech piv — pod zápisem na hlavní obrazovce. */
export function DnesUlozeno({ nadpis, polozky, beers }: { nadpis: string; polozky: DnesPolozka[]; beers: Beer[] }) {
  if (polozky.length === 0) return null;
  return (
    <div className="mt-4 border border-emerald-200 dark:border-emerald-800/60 bg-white dark:bg-neutral-800 rounded p-3">
      <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-2">{nadpis}</div>
      <ul className="space-y-1">
        {polozky.map((p) => {
          const pivo = beers.find((b) => b.id === p.beerId);
          return (
            <li key={p.id} className="flex items-baseline gap-2 text-sm text-neutral-800 dark:text-neutral-100">
              <span className="font-black text-neutral-500 tabular-nums min-w-[2.5rem]">{p.cas}</span>
              {pivo && <span className="w-2.5 h-2.5 rounded-sm shrink-0 self-center border border-black/20" style={{ backgroundColor: beerBg(pivo) }} aria-hidden="true" />}
              <span><span className="font-black">{pivo ? beerName(pivo) : ''}</span> · {p.text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Přepínač dne nad otázkou: „Týden" a dny, na které je něco objednáno.
 * Přepočítá Objednáno/Chybí pod polem na vybraný den místo celého týdne.
 */
export function PrepinacDne({
  dny,
  vybrany,
  zmen,
  chybi,
  popisBezTerminu = 'Bez dne',
  bezTerminu,
}: {
  dny: { day: string; label: string; date?: string | null }[];
  vybrany: string;
  zmen: (den: string) => void;
  /** Kolik chybí v který den (den → počet). */
  chybi: Record<string, number>;
  popisBezTerminu?: string;
  /** Klíč dne „bez termínu" (BEZ_TERMINU z keggingPlan). */
  bezTerminu: string;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-none -mx-1 px-1 pb-1.5 border-b border-neutral-200 dark:border-neutral-700">
      <button type="button" onClick={() => zmen('tyden')} className={`btn-zalozka ${vybrany === 'tyden' ? 'btn-zalozka-aktivni' : ''}`}>Týden</button>
      {dny.map((p) => {
        const m = chybi[p.day] ?? 0;
        const vyb = vybrany === p.day;
        return (
          <button
            key={p.day}
            type="button"
            onClick={() => zmen(p.day)}
            className={`btn-zalozka ${vyb ? 'btn-zalozka-aktivni' : ''}`}
            title={p.day === bezTerminu ? 'Bez uvedeného dne dovozu' : `${p.label} ${p.date ? new Date(p.date + 'T00:00:00Z').toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', timeZone: 'UTC' }) : ''}`}
          >
            {p.day === bezTerminu ? popisBezTerminu : p.label}
            {m > 0 && <span className="px-1 min-w-[16px] rounded-full text-[11px] leading-4 bg-neutral-950 text-amber-300">{m}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Objednáno / chybí stočit — stejné číslo jako v „Co stočit na který den",
 * přímo u zadávání. „Chybí" se počítá naživo: odečte se i to, co je právě
 * v poli, dokud se neuloží (z provozu 15. 9. 2026).
 */
export function PlanObjednavky({
  plan,
  rozepsano,
  onObjednavky,
  onZadat,
  onNachystano,
}: {
  plan: { ordered: number; missing: number } | undefined;
  rozepsano: number;
  onObjednavky: () => void;
  onZadat: (n: number) => void;
  /** Jen pracovní odškrtnutí „mám nachystáno" — nezapisuje stáčení. */
  onNachystano?: () => void;
}) {
  if (!plan || plan.ordered <= 0) return null;
  const chybi = Math.max(0, plan.missing - rozepsano);
  const naSklad = Math.max(0, rozepsano - plan.missing);
  const barva = chybi > 0
    ? 'border-rose-200 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/20'
    : 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/20';
  return (
    <div className={`rounded border p-2 space-y-1.5 ${barva}`}>
      <button
        type="button"
        onClick={onObjednavky}
        className="tap text-udaj font-bold text-neutral-600 hover:text-neutral-800 underline decoration-dotted underline-offset-2 text-left"
        title="Zobrazit objednávky s touhle položkou"
      >
        Objednáno: <span className="font-black text-neutral-900">{plan.ordered}</span>
        {' '}· Chybí: <span className={`font-black ${chybi > 0 ? 'text-rose-700' : 'text-emerald-800'}`}>{chybi}</span>
        {naSklad > 0 && <> · Sklad: <span className="font-black text-sky-800">{naSklad}</span></>}
      </button>
      {chybi > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button type="button" onClick={() => onZadat(plan.missing)} className="btn-amber !text-xs" title="Vyplní pole přesně chybějícím počtem">
            Zadat chybějících {plan.missing}
          </button>
          {onNachystano && (
            <button type="button" onClick={onNachystano} className="btn-ghost !text-xs" title="Nezapisuje stáčení — jen pracovní odškrtnutí, že je to nachystané">
              Mám nachystáno
            </button>
          )}
        </div>
      )}
    </div>
  );
}
