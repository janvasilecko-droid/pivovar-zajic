// 📋 Obchod → Inventura: napočítaný stav zboží (na konci měsíce i na začátku).
// ---------------------------------------------------------------------------
// Z provozu 10. 10. 2026: „inventura na konci měsíce". Napočítaný stav je
// stav KE KONCI zvoleného dne — od něj se sklad obchodu počítá (fasování
// a příjmy přičíst, prodej z uzávěrek odečíst). První inventura je počáteční
// stav obchodu. Rozdíl proti očekávanému stavu se ukáže hned a zůstane
// v historii.
import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { businessDateISO } from '../../lib/businessDate';
import { chyba as toastChyba, potvrd, uspech } from '../../lib/toast';
import { stavySkladu } from '../../lib/obchodSklad';
import { rozdilyInventury } from '../../lib/obchodInventura';
import { zapisInventuru, type DataObchodu } from '../../lib/obchodData';

const cs = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const dat = (iso: string) => `${Number(iso.slice(8, 10))}. ${Number(iso.slice(5, 7))}. ${iso.slice(0, 4)}`;

/** Poslední den předchozího měsíce — pro inventuru, která se dělá až v prvních dnech dalšího. */
function konecMinulehoMesice(dnes: string): string {
  const [r, m] = dnes.split('-').map(Number);
  return new Date(Date.UTC(r, m - 1, 0)).toISOString().slice(0, 10);
}

export function ObchodInventura({ data, zapsal }: { data: DataObchodu; zapsal: string | null }) {
  const dnes = businessDateISO();
  const [datum, setDatum] = useState(dnes);
  const [hodnoty, setHodnoty] = useState<Record<string, string>>({});
  const [uklada, setUklada] = useState(false);
  const [otevrenaHistorie, setOtevrenaHistorie] = useState<string | null>(null);

  const stavy = useMemo(() => stavySkladu(data.vstup, datum), [data.vstup, datum]);
  const piva = stavy.filter((s) => data.zbozi.find((z) => z.kod === s.kod)?.beer_id);
  const ostatni = stavy.filter((s) => !data.zbozi.find((z) => z.kod === s.kod)?.beer_id);

  const cislo = (kod: string): number | null => {
    const t = (hodnoty[kod] ?? '').trim();
    if (t === '') return null;
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
  };
  const zadane = stavy.filter((s) => cislo(s.kod) != null);
  const spatne = zadane.filter((s) => Number.isNaN(cislo(s.kod)));
  const radky = zadane
    .filter((s) => !Number.isNaN(cislo(s.kod)))
    .map((s) => ({ kod: s.kod, nazev: s.nazev, napocitano: cislo(s.kod) as number, ocekavano: s.stav }));

  function vseSedi() {
    setHodnoty((h) => {
      const dalsi = { ...h };
      for (const s of stavy) if (s.stav != null && (dalsi[s.kod] ?? '').trim() === '') dalsi[s.kod] = String(Math.max(0, s.stav));
      return dalsi;
    });
  }

  async function uloz() {
    if (radky.length === 0 || spatne.length > 0) return;
    const rozdily = rozdilyInventury(radky);
    const text = rozdily.length
      ? `Uložit inventuru ke dni ${dat(datum)}?\n\nRozdíly proti očekávanému stavu:\n` +
        rozdily.map((r) => `• ${r.nazev}: ${r.rozdil == null ? `počáteční stav ${cs(r.napocitano)}` : `${r.rozdil > 0 ? '+' : ''}${cs(r.rozdil)} (očekáváno ${cs(r.ocekavano ?? 0)}, napočítáno ${cs(r.napocitano)})`}`).join('\n')
      : `Uložit inventuru ke dni ${dat(datum)}? Všechno sedí.`;
    if (!(await potvrd(text, { titulek: 'Inventura obchodu', potvrdit: 'Uložit inventuru' }))) return;
    setUklada(true);
    try {
      const e = await zapisInventuru(datum, radky.map((r) => ({ kod: r.kod, napocitano: r.napocitano, ocekavano: r.ocekavano })), zapsal);
      if (e) { toastChyba(e); return; }
      uspech(`Inventura uložena (${radky.length} položek).`);
      setHodnoty({});
      data.znovu();
    } finally {
      setUklada(false);
    }
  }

  // Historie po dnech.
  const { inventury } = data;
  const historie = useMemo(() => {
    const m = new Map<string, typeof inventury>();
    for (const i of inventury) (m.get(i.datum) ?? m.set(i.datum, []).get(i.datum)!).push(i);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [inventury]);

  if (data.zbozi.length === 0) {
    return <div className="text-sm font-semibold text-neutral-600">Obchod zatím nemá žádné zboží. Nejdřív zadej uzávěrku (zboží z ní vznikne) nebo přidej zboží ve Skladu.</div>;
  }

  const radek = (s: (typeof stavy)[number]) => {
    const n = cislo(s.kod);
    const rozdil = n != null && !Number.isNaN(n) && s.stav != null ? Math.round((n - s.stav) * 100) / 100 : null;
    return (
      <li key={s.kod} className={`rounded-xl border-2 p-2.5 ${Number.isNaN(n) ? 'border-rose-400 bg-rose-50' : rozdil != null && rozdil !== 0 ? 'border-amber-400 bg-amber-50' : 'border-neutral-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-black text-neutral-950 truncate">{s.nazev}</div>
            <div className="text-[11px] font-semibold text-neutral-600">
              kód {s.kod} · {s.stav == null ? 'bez počátečního stavu' : `očekáváno ${cs(s.stav)}`}
              {rozdil != null && rozdil !== 0 && <span className="font-black text-amber-900"> · rozdíl {rozdil > 0 ? '+' : ''}{cs(rozdil)}</span>}
            </div>
          </div>
          {s.stav != null && (
            <button type="button" className="btn-ghost !rounded !py-1.5 !px-2 text-xs font-bold" aria-label={`Sedí — ${s.nazev}`} onClick={() => setHodnoty((h) => ({ ...h, [s.kod]: String(Math.max(0, s.stav as number)) }))}>
              <Check size={14} className="inline" /> Sedí
            </button>
          )}
          <input
            aria-label={`Napočítáno — ${s.nazev}`}
            className="input !w-20 !py-1.5 text-center text-base font-black"
            inputMode="decimal"
            value={hodnoty[s.kod] ?? ''}
            onChange={(e) => setHodnoty((h) => ({ ...h, [s.kod]: e.target.value }))}
          />
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-neutral-200 bg-white p-3 space-y-2">
        <div className="text-sm font-black text-neutral-900">Inventura obchodu</div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[11px] font-black uppercase text-neutral-500">
            Stav ke konci dne
            <input type="date" max={dnes} className="input font-bold block mt-0.5" value={datum} onChange={(e) => e.target.value && setDatum(e.target.value)} />
          </label>
          <button type="button" className={`btn-zalozka px-3 ${datum === dnes ? 'btn-zalozka-aktivni' : ''}`} onClick={() => setDatum(dnes)}>Dnes</button>
          <button type="button" className={`btn-zalozka px-3 ${datum === konecMinulehoMesice(dnes) ? 'btn-zalozka-aktivni' : ''}`} onClick={() => setDatum(konecMinulehoMesice(dnes))}>
            Konec minulého měsíce
          </button>
        </div>
        <div className="text-[11px] font-semibold text-neutral-600">
          Spočítej, co je opravdu na regálu. Co se ten den zapsalo (fasování, uzávěrka), už v čísle je. První inventura je počáteční stav obchodu.
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-ghost !rounded text-sm font-bold" onClick={vseSedi}>Vše sedí (doplnit očekávané)</button>
        <button type="button" className="btn-primary !rounded min-h-[48px] flex-1 sm:flex-none" disabled={uklada || radky.length === 0 || spatne.length > 0} onClick={() => void uloz()}>
          {uklada ? 'Ukládám…' : `Uložit inventuru (${radky.length})`}
        </button>
      </div>
      {spatne.length > 0 && <div role="alert" className="text-xs font-bold text-rose-800">Počet musí být číslo od nuly: {spatne.map((s) => s.nazev).join(', ')}.</div>}

      {piva.length > 0 && (
        <section aria-label="Piva" className="space-y-1.5">
          <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Piva ({piva.length})</h3>
          <ul className="space-y-1.5">{piva.map(radek)}</ul>
        </section>
      )}
      {ostatni.length > 0 && (
        <section aria-label="Ostatní zboží" className="space-y-1.5">
          <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Ostatní zboží ({ostatni.length})</h3>
          <ul className="space-y-1.5">{ostatni.map(radek)}</ul>
        </section>
      )}

      {historie.length > 0 && (
        <section aria-label="Historie inventur" className="space-y-1.5">
          <h3 className="text-xs font-black uppercase tracking-wide text-neutral-600">Dřívější inventury</h3>
          <ul className="space-y-1.5">
            {historie.map(([d, radkyDne]) => {
              const nazvy = new Map(data.zbozi.map((z) => [z.kod, z.nazev]));
              const rozdily = rozdilyInventury(radkyDne.map((r) => ({ kod: r.kod, nazev: nazvy.get(r.kod) ?? r.kod, ocekavano: r.ocekavano == null ? null : Number(r.ocekavano), napocitano: Number(r.napocitano) })));
              const otevreno = otevrenaHistorie === d;
              return (
                <li key={d} className="rounded-xl border-2 border-neutral-200 bg-white">
                  <button type="button" className="w-full flex items-center gap-3 p-3 text-left" onClick={() => setOtevrenaHistorie(otevreno ? null : d)} aria-expanded={otevreno}>
                    <div className="flex-1 text-sm font-black text-neutral-950">{dat(d)}</div>
                    <div className="text-xs font-semibold text-neutral-600">{radkyDne.length} položek · {rozdily.length === 0 ? 'bez rozdílů' : `${rozdily.length} rozdílů`}</div>
                    {otevreno ? <ChevronUp size={16} className="text-neutral-500" /> : <ChevronDown size={16} className="text-neutral-500" />}
                  </button>
                  {otevreno && (
                    <ul className="border-t border-neutral-200 p-3 space-y-0.5">
                      {rozdily.length === 0 && <li className="text-xs text-neutral-600">Všechno sedělo.</li>}
                      {rozdily.map((r) => (
                        <li key={r.kod} className="flex justify-between gap-2 text-xs font-semibold text-neutral-800">
                          <span className="truncate">{r.nazev}</span>
                          <span className="font-black tabular-nums shrink-0">
                            {r.rozdil == null ? `počáteční stav ${cs(r.napocitano)}` : `${r.rozdil > 0 ? '+' : ''}${cs(r.rozdil)} (${cs(r.ocekavano ?? 0)} → ${cs(r.napocitano)})`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
