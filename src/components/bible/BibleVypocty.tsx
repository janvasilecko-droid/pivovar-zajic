// 🧮 Výpočtová laboratoř bible (etapa 6a).
// ---------------------------------------------------------------------------
// Zadání etapy 6: výpočetní moduly s testy z ručně ověřených příkladů; každý
// výsledek ukáže vstupy, jednotky, vzorec, mezikroky, předpoklady, rozsah
// platnosti a nejistotu. Vstup mimo rozsah se odmítne (nic se neodhaduje).
// Počítá stejný kód jako nástroj `vypocet` konektoru Claude
// (bible/supabase/functions/_shared/vypocty).
import { useMemo, useState } from 'react';
import { ArrowLeft, Calculator, Plus, Search, Trash2 } from 'lucide-react';
import { MimoRozsah, formatuj, spocitej, vychoziHodnoty, type Definice, type Vstup, type Vysledek } from '../../../bible/supabase/functions/_shared/vypocty/zaklad.ts';
import { VYPOCTY } from '../../../bible/supabase/functions/_shared/vypocty/katalog.ts';
import { BIBLE_OBLASTI } from '../../lib/bibleOblasti';

/** Text z pole → číslo (desetinná čárka i tečka, minus i „−"); prázdné/nesmysl = NaN. */
export function cisloZTextu(t: string): number {
  const s = t.trim().replace(/\s/g, '').replace(',', '.').replace(/^−/, '-');
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return Number.NaN;
  return Number(s);
}

const naText = (n: number) => String(n).replace('.', ',');

type Formular = { h: Record<string, string>; r: Record<string, Record<string, string>[]> };

function formularZ(d: Definice): Formular {
  const { h, r } = vychoziHodnoty(d);
  return {
    h: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, naText(v)])),
    r: Object.fromEntries(Object.entries(r).map(([k, radky]) => [k, radky.map((x) => Object.fromEntries(Object.entries(x).map(([a, b]) => [a, naText(b)])))])),
  };
}

function PoleVstupu({ v, hodnota, zmen, idPole }: { v: Vstup; hodnota: string; zmen: (t: string) => void; idPole: string }) {
  return (
    <div>
      <label className="block text-xs font-bold text-neutral-300" htmlFor={idPole}>{v.nazev}{v.jednotka ? ` (${v.jednotka})` : ''}</label>
      <input
        id={idPole}
        className="input w-full tabular-nums"
        inputMode="decimal"
        value={hodnota}
        aria-describedby={v.napoveda ? `${idPole}-napoveda` : undefined}
        onChange={(e) => zmen(e.target.value)}
      />
      {v.napoveda && <span id={`${idPole}-napoveda`} className="block text-[11px] text-neutral-400">{v.napoveda}</span>}
    </div>
  );
}

function VysledekVypoctu({ v, hledej, dotaz }: { v: Vysledek; hledej?: (dotaz: string) => void; dotaz: string }) {
  const [hlavni, ...dalsi] = v.vysledky;
  return (
    <section className="rounded-xl border border-amber-700 bg-neutral-900 text-neutral-100 p-3 sm:p-4 space-y-3" aria-label="Výsledek">
      <div>
        <div className="text-[11px] font-black uppercase tracking-wide text-amber-400">{hlavni.nazev}</div>
        <div className="text-3xl font-black tabular-nums text-neutral-50">{formatuj(hlavni)}</div>
        {dalsi.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-sm">
            {dalsi.map((x, i) => <li key={i}><span className="text-neutral-300">{x.nazev}:</span> <strong className="tabular-nums">{formatuj(x)}</strong></li>)}
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-xs font-black uppercase tracking-wide text-neutral-300">Vzorec</h3>
        {v.vzorec.map((r, i) => <code key={i} className="block overflow-x-auto whitespace-pre-wrap break-words rounded bg-neutral-950 px-2 py-1 font-mono text-sm text-amber-100">{r}</code>)}
      </div>
      {v.mezikroky.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-black uppercase tracking-wide text-neutral-300">Mezikroky</h3>
          <ul className="space-y-0.5 text-sm">
            {v.mezikroky.map((x, i) => <li key={i}><span className="text-neutral-300">{x.nazev}:</span> <span className="tabular-nums">{formatuj(x)}</span></li>)}
          </ul>
        </div>
      )}
      <div className="space-y-1 text-sm">
        <h3 className="text-xs font-black uppercase tracking-wide text-neutral-300">Předpoklady</h3>
        <ul className="list-disc space-y-0.5 pl-5">{v.predpoklady.map((p, i) => <li key={i}>{p}</li>)}</ul>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
        <dt className="font-bold text-neutral-300">Rozsah platnosti</dt><dd>{v.rozsah}</dd>
        <dt className="font-bold text-neutral-300">Nejistota</dt><dd>{v.nejistota}</dd>
        <dt className="font-bold text-neutral-300">Zdroj vzorce</dt><dd>{v.zdroj}</dd>
      </dl>
      {hledej && (
        <button type="button" className="btn-tmave" onClick={() => hledej(dotaz)}>
          <Search size={16} /> Najít v knihách
        </button>
      )}
    </section>
  );
}

function DetailVypoctu({ d, zpet, hledej }: { d: Definice; zpet: () => void; hledej?: (dotaz: string) => void }) {
  const [f, setF] = useState<Formular>(() => formularZ(d));

  const stav = useMemo((): { vysledek: Vysledek } | { chyba: string } => {
    const h = Object.fromEntries(Object.entries(f.h).map(([k, t]) => [k, cisloZTextu(t)]));
    const r = Object.fromEntries(Object.entries(f.r).map(([k, radky]) => [k, radky.map((x) => Object.fromEntries(Object.entries(x).map(([a, t]) => [a, cisloZTextu(t)])))]));
    try {
      return { vysledek: spocitej(d, h, r) };
    } catch (e) {
      return { chyba: e instanceof MimoRozsah ? e.message : 'Výpočet se nepodařil.' };
    }
  }, [d, f]);

  const s = d.seznam;
  const radky = s ? f.r[s.id] ?? [] : [];

  return (
    <div className="space-y-4">
      <button type="button" className="btn-tmave" onClick={zpet}><ArrowLeft size={18} /> Zpět na výpočty</button>
      <div className="space-y-1">
        <h2 className="text-lg font-black text-neutral-50">{d.nazev}</h2>
        <p className="text-sm text-neutral-300">{d.popis}</p>
      </div>
      <form className="space-y-3" onSubmit={(e) => e.preventDefault()} aria-label="Vstupy">
        <div className="grid gap-3 sm:grid-cols-2">
          {d.vstupy.map((v) => (
            <PoleVstupu key={v.id} v={v} idPole={`vypocet-${d.id}-${v.id}`} hodnota={f.h[v.id] ?? ''} zmen={(t) => setF((x) => ({ ...x, h: { ...x.h, [v.id]: t } }))} />
          ))}
        </div>
        {s && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-black text-neutral-50">{s.nazev}</legend>
            {radky.map((radek, i) => (
              <div key={i} className="rounded-xl border border-neutral-700 bg-neutral-900 p-2 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black text-neutral-300">{i + 1}.</span>
                  {radky.length > s.minRadku && (
                    <button
                      type="button"
                      className="btn-tmave w-11 px-0"
                      aria-label={`Odebrat řádek ${i + 1}`}
                      onClick={() => setF((x) => ({ ...x, r: { ...x.r, [s.id]: radky.filter((_, j) => j !== i) } }))}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {s.polozky.map((p) => (
                    <PoleVstupu
                      key={p.id}
                      v={p}
                      idPole={`vypocet-${d.id}-${s.id}-${i}-${p.id}`}
                      hodnota={radek[p.id] ?? ''}
                      zmen={(t) => setF((x) => ({ ...x, r: { ...x.r, [s.id]: radky.map((rr, j) => (j === i ? { ...rr, [p.id]: t } : rr)) } }))}
                    />
                  ))}
                </div>
              </div>
            ))}
            {radky.length < s.maxRadku && (
              <button
                type="button"
                className="btn-tmave"
                onClick={() => setF((x) => ({ ...x, r: { ...x.r, [s.id]: [...radky, Object.fromEntries(s.polozky.map((p) => [p.id, naText(p.vychozi)]))] } }))}
              >
                <Plus size={16} /> Přidat řádek
              </button>
            )}
          </fieldset>
        )}
      </form>
      {'chyba' in stav ? (
        <div role="alert" className="rounded-xl border border-rose-600 bg-neutral-900 p-3 text-sm font-bold text-rose-300">{stav.chyba}</div>
      ) : (
        <VysledekVypoctu v={stav.vysledek} hledej={hledej} dotaz={d.hledat} />
      )}
    </div>
  );
}

/** Výpočty po tematických oblastech A–T (etapa 6b: 24 výpočtů se v jednom seznamu ztrácely). */
export function vypoctyPoOblastech(vypocty: readonly Definice[]): { kod: string; nazev: string; vypocty: Definice[] }[] {
  return BIBLE_OBLASTI
    .map((o) => ({ kod: o.kod, nazev: o.nazev, vypocty: vypocty.filter((d) => d.oblast === o.kod) }))
    .filter((g) => g.vypocty.length > 0);
}

export function BibleVypocty({ hledej }: { hledej?: (dotaz: string) => void }) {
  const [otevreny, setOtevreny] = useState<string | null>(null);
  const d = otevreny ? VYPOCTY.find((x) => x.id === otevreny) : undefined;
  if (d) return <DetailVypoctu key={d.id} d={d} zpet={() => setOtevreny(null)} hledej={hledej} />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300 max-w-2xl">
        Výpočty s ověřenými vzorci. U každého výsledku je vzorec, mezikroky, předpoklady, rozsah platnosti a nejistota; vstup mimo rozsah se odmítne.
        Stejně počítá i Claude přes konektor.
      </p>
      {vypoctyPoOblastech(VYPOCTY).map((g) => (
        <section key={g.kod} className="space-y-2" aria-label={`Oblast ${g.kod} · ${g.nazev}`}>
          <h2 className="text-xs font-black uppercase tracking-wide text-amber-400">{g.kod} · {g.nazev}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {g.vypocty.map((x) => (
              <li key={x.id}>
                <button
                  type="button"
                  onClick={() => setOtevreny(x.id)}
                  className="btn h-full w-full flex-col items-start gap-1 p-3 text-left bg-neutral-900 text-neutral-100 border border-neutral-700 hover:border-amber-500 hover:bg-neutral-800"
                >
                  <span className="flex items-center gap-2 text-sm font-black"><Calculator size={16} className="shrink-0 text-amber-400" /> {x.nazev}</span>
                  <span className="text-xs font-normal text-neutral-300">{x.popis}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default BibleVypocty;
