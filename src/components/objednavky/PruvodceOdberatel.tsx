// 🧭 Průvodce objednávkou — krok 1: pro koho a na kdy.
// ---------------------------------------------------------------------------
// Majitel 18. 11. 2026 („hledání odběratelů ať jde i bez diakritiky",
// „Sklad a Drobák patří pod odběratele Radek", „udělej ty objednávky tak jako
// první návrh"): nahoře hledání, pod ním největší odběratelé jako velké
// dlaždice, u odběratele s víc místy „kam tentokrát?" a dny závozu na jedno
// klepnutí. Den, který nikdo nevybere, se ukáže předem (výchozí den
// odběratele) — stejné pravidlo jako ve starém formuláři i v databázi.
import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Search, UserPlus } from 'lucide-react';
import type { Place } from '../../lib/supabase';
import { nejcastejsiOdberatele, odberateleAbecedne } from '../../lib/odberateleDleCetnosti';
import { proHledani } from '../../lib/hledani';
import { jeAutomatickyBezZavozu } from '../../lib/bezZavozu';
import { vychoziDenZavozu } from '../../lib/denZavozu';
import { DAYS } from '../../lib/shared';
import { mistaOdberatele } from '../../lib/mistaZavozu';
import {
  POCET_RYCHLYCH_ODBERATELU, datumKratce, hledejOdberatele, jeDalsiMesic, mistaKVolbe, nabidkaDnu, nastavBezZavozu, nastavDatum,
  nastavDen, nastavMisto, odberateleKVyberu, odberatelKonceptu, popisMist, popisZavozu, potvrdDalsiMesic, ucinnyZavoz,
  vyberOdberatele, zrusVyberDne,
} from '../../lib/objednavkaPruvodce';
import type { DataPruvodce, ZmenaKonceptu } from './pruvodceTypy';
import type { KonceptObjednavky } from '../../lib/objednavkaPruvodce';

/** Pod jménem na dlaždici: místa závozu a obvyklý den („Sklad · Drobák · obvykle St"). */
function podNazvem(p: Place, places: readonly Place[]): string {
  const den = vychoziDenZavozu(places, p.id, p.name);
  const kdy = jeAutomatickyBezZavozu(p.name)
    ? 'bez závozu'
    : den ? `obvykle ${DAYS.find((d) => d.v === den)?.label ?? den}` : 'bez pevného dne';
  return [popisMist(p), kdy].filter(Boolean).join(' · ');
}

// Odběratel a den jsou VOLBA (jedno z několika), ne akce — mají tvar dlaždice jako
// na ploše a ve Fasování, proto jejich třídy nejsou v rolích `btn-*`. Barvy jsou
// jen z palety aplikace (primary, neutral).
const DLAZDICE = 'min-h-[68px] w-full text-left rounded-2xl border-2 px-3.5 py-2.5 flex flex-col justify-center gap-0.5 transition';
const DLAZDICE_VYBRANA = 'border-primary-600 bg-primary-50 text-neutral-900';
const DLAZDICE_JINA = 'border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100';

const CIP = 'min-h-[52px] rounded-2xl border-2 flex flex-col items-center justify-center transition';
const CIP_VLASTNI = 'border-primary-600 bg-primary-600 text-white';
const CIP_VYCHOZI = 'border-dashed border-primary-600 bg-primary-50 text-primary-900';

export function PruvodceOdberatel({ data, koncept, zmen }: {
  data: DataPruvodce;
  koncept: KonceptObjednavky;
  zmen: ZmenaKonceptu;
}) {
  const { places, orders, dnes } = data;
  const [hledani, setHledani] = useState('');
  const [vsichni, setVsichni] = useState(false);

  const vybrany = odberatelKonceptu(koncept, places);
  // Nový odběratel = napsané jméno, které v katalogu není (založí se při uložení).
  const vybranyNovy = !vybrany && koncept.placeName.trim() !== '' ? koncept.placeName : '';

  // Bez odběratelů, kteří jsou už jen místem jiného (Sklad a Drobák patří pod Radka).
  const nabidka = useMemo(() => odberateleKVyberu(places, orders), [places, orders]);
  const rychli = useMemo(() => {
    const caste = nejcastejsiOdberatele(nabidka, orders, POCET_RYCHLYCH_ODBERATELU);
    return caste.length > 0 ? caste : odberateleAbecedne(nabidka).slice(0, POCET_RYCHLYCH_ODBERATELU);
  }, [nabidka, orders]);

  const dotaz = hledani.trim();
  // Zkratka bez hledání: největší odběratelé; vybraný, který mezi nimi není, se
  // přidá navrch, ať je vidět, koho jsi vybral.
  const zakladni = vybrany && !rychli.some((p) => p.id === vybrany.id)
    ? [vybrany, ...rychli.slice(0, POCET_RYCHLYCH_ODBERATELU - 1)]
    : rychli;
  // `misto` = hledání trefilo název místa závozu („sklad" → Radek, místo Sklad).
  let seznam: { odberatel: Place; misto: string | null }[];
  if (dotaz) seznam = hledejOdberatele(nabidka, dotaz);
  else if (vsichni) seznam = odberateleAbecedne(nabidka).map((odberatel) => ({ odberatel, misto: null }));
  else seznam = zakladni.map((odberatel) => ({ odberatel, misto: null }));

  // Nový odběratel se nenabízí, když napsané už je odběratel nebo jméno místa závozu.
  const jeZnamy = nabidka.some((p) => proHledani(p.name) === proHledani(dotaz))
    || nabidka.some((p) => mistaOdberatele(p).some((m) => proHledani(m.nazev) === proHledani(dotaz)));
  const novyKNabidnuti = dotaz && !jeZnamy ? dotaz : '';

  const vyber = (p: Place, misto: string | null) => {
    zmen((k) => {
      const n = vyberOdberatele(k, { id: p.id, name: p.name });
      return misto ? nastavMisto(n, misto) : n;
    });
    setHledani('');
  };
  const vyberNoveho = (nazev: string) => { zmen((k) => vyberOdberatele(k, null, nazev)); setHledani(''); };

  const mista = mistaKVolbe(vybrany);
  const ucinny = ucinnyZavoz(koncept, places, dnes);
  const dny = nabidkaDnu(dnes);
  const dalsiMesic = jeDalsiMesic(ucinny.datum, dnes);

  let vysvetleniDne = '';
  if (ucinny.vychozi) {
    if (koncept.bezZavozu) vysvetleniDne = `Den není vybraný — objednávka se odečte ze skladu dnes (${datumKratce(dnes)}). Jiný den vyber klepnutím.`;
    else if (ucinny.datum) vysvetleniDne = `Den není vybraný — závoz bude ${popisZavozu(ucinny)} (výchozí den odběratele). Jiný den vyber klepnutím.`;
    else vysvetleniDne = 'Tenhle odběratel nemá pevný den závozu — vyber den, nebo nech objednávku bez dne.';
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display font-black text-2xl text-neutral-900 dark:text-neutral-100">Pro koho?</h2>

      <div className="relative">
        <label htmlFor="pruvodce-hledani" className="sr-only">Hledat odběratele</label>
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" aria-hidden="true" />
        <input
          id="pruvodce-hledani"
          type="search"
          autoComplete="off"
          value={hledani}
          onChange={(e) => setHledani(e.target.value)}
          placeholder="Hledat — „zizkov“ najde i Žižkov"
          className="input !pl-11 !min-h-[52px] !text-base"
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Odběratelé">
        {vybranyNovy && !dotaz && (
          <button type="button" aria-pressed="true" onClick={() => vyberNoveho(vybranyNovy)} className={`${DLAZDICE} ${DLAZDICE_VYBRANA}`}>
            <span className="flex items-center justify-between gap-1.5 font-display font-black text-lg"><span className="truncate">{vybranyNovy}</span><Check size={20} className="shrink-0 text-primary-700" aria-hidden="true" /></span>
            <span className="text-xs font-semibold text-neutral-600">nový odběratel</span>
          </button>
        )}
        {seznam.map(({ odberatel: p, misto }) => {
          const vyb = vybrany?.id === p.id;
          const nazevMista = misto ? mistaOdberatele(p).find((m) => m.id === misto)?.nazev : null;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={vyb}
              onClick={() => vyber(p, misto)}
              className={`${DLAZDICE} ${vyb ? DLAZDICE_VYBRANA : DLAZDICE_JINA}`}
            >
              <span className="flex items-center justify-between gap-1.5 font-display font-black text-lg">
                <span className="truncate">{p.name}</span>
                {vyb && <Check size={20} className="shrink-0 text-primary-700" aria-hidden="true" />}
              </span>
              <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">{nazevMista ? `místo: ${nazevMista}` : podNazvem(p, places)}</span>
            </button>
          );
        })}
        {novyKNabidnuti && (
          <button type="button" onClick={() => vyberNoveho(novyKNabidnuti)} className={`${DLAZDICE} ${DLAZDICE_JINA} border-dashed`}>
            <span className="flex items-center gap-1.5 font-display font-black text-lg"><UserPlus size={20} className="shrink-0" aria-hidden="true" /><span className="truncate">Nový: {novyKNabidnuti}</span></span>
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-300">založí se při uložení</span>
          </button>
        )}
        {dotaz && seznam.length === 0 && !novyKNabidnuti && (
          <p className="col-span-2 text-sm font-semibold text-neutral-600">Nikdo odpovídající „{dotaz}“.</p>
        )}
      </div>

      {!dotaz && nabidka.length > zakladni.length && (
        <button type="button" onClick={() => setVsichni((v) => !v)} className="btn-ghost w-full">
          {vsichni ? 'Jen nejčastější' : `Všichni odběratelé (${nabidka.length})`}
        </button>
      )}

      {mista.length > 0 && vybrany && (
        <section aria-labelledby="pruvodce-kam" className="rounded-2xl border border-primary-200 bg-primary-50 p-3 space-y-2">
          <h3 id="pruvodce-kam" className="text-sm font-black text-primary-900">{vybrany.name} vozí na víc míst — kam tentokrát?</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-labelledby="pruvodce-kam">
            {mista.map((m) => {
              const vyb = koncept.mistoZavozu === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={vyb}
                  onClick={() => zmen((k) => nastavMisto(k, m.id))}
                  className={`${vyb ? 'btn-primary' : 'btn-ghost'} min-h-[44px] !px-4`}
                >
                  {m.nazev}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section aria-labelledby="pruvodce-kdy" className="space-y-2">
        <h2 id="pruvodce-kdy" className="font-display font-black text-lg text-neutral-900 dark:text-neutral-100">Kdy se veze?</h2>
        <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="pruvodce-kdy">
          {dny.map((d) => {
            const vlastni = koncept.datum === d.datum;
            const vychozi = !vlastni && ucinny.vychozi && ucinny.datum === d.datum;
            return (
              <button
                key={d.datum}
                type="button"
                aria-pressed={vlastni}
                onClick={() => zmen((k) => (k.datum === d.datum ? zrusVyberDne(k) : nastavDen(k, { den: d.den, datum: d.datum })))}
                className={`${CIP} ${vlastni ? CIP_VLASTNI : vychozi ? CIP_VYCHOZI : DLAZDICE_JINA}`}
              >
                <span className="font-display font-black text-lg leading-tight">{d.zkratka}</span>
                <span className="text-xs font-semibold">{d.kratce}{d.jeDnes ? ' · dnes' : ''}</span>
              </button>
            );
          })}
        </div>
        {vysvetleniDne && <p data-testid="pruvodce-vychozi-den" className="text-xs font-bold text-neutral-700 dark:text-neutral-300">{vysvetleniDne}</p>}

        <div>
          <label htmlFor="pruvodce-datum" className="label">Jiné datum závozu (i zpětně)</label>
          <input
            id="pruvodce-datum"
            type="date"
            className="input"
            value={koncept.datum}
            onChange={(e) => zmen((k) => nastavDatum(k, e.target.value))}
          />
        </div>

        {dalsiMesic && ucinny.datum && (
          <label className="flex items-start gap-2 p-2.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-rose-900 text-xs font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={koncept.potvrzenoDalsiMesic}
              onChange={(e) => zmen((k) => potvrdDalsiMesic(k, e.target.checked))}
              className="w-4 h-4 mt-0.5 rounded accent-rose-600 shrink-0"
            />
            <span className="flex items-start gap-1.5">
              <AlertTriangle className="ikona-text shrink-0" aria-hidden="true" />
              <span>
                Potvrzuji, že závoz {new Date(`${ucinny.datum}T00:00:00Z`).toLocaleDateString('cs-CZ', { timeZone: 'UTC' })} spadá do{' '}
                {new Date(`${ucinny.datum}T00:00:00Z`).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric', timeZone: 'UTC' })} — objednávka se
                bude počítat do skladu a uzávěrky od 1. dne toho měsíce, ne do aktuálního.
              </span>
            </span>
          </label>
        )}

        <label className="flex items-start gap-2 p-2.5 rounded-xl bg-neutral-100 border-2 border-neutral-200 text-neutral-800 text-xs font-bold cursor-pointer">
          <input
            type="checkbox"
            checked={koncept.bezZavozu}
            onChange={(e) => zmen((k) => nastavBezZavozu(k, e.target.checked))}
            className="w-4 h-4 mt-0.5 rounded accent-neutral-700 shrink-0"
          />
          <span>Bez závozu — odběratel si bere pivo sám, nejde do trasy.</span>
        </label>
      </section>
    </div>
  );
}
