// 🧭 Průvodce objednávkou — krok 3: souhrn a uložení.
// ---------------------------------------------------------------------------
// Všechno, co se uloží, na jedné obrazovce: komu a kdy, položky po pivech
// (každou jde upravit tužkou a odebrat koškem — odebrání jde vzít zpět),
// součet v litrech a lahvích a poznámka. Malé sudy (20/15/10 l), na které
// není sud, se zbarví jako ve starém formuláři (lib/maleSudy.ts).
import type { ReactNode } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { beerBg, beerName } from '../../lib/supabase';
import { toastZpet } from '../../lib/toast';
import { MaleSudyRadek, tridaRadkuSudu } from '../MaleSudyVolne';
import {
  mistaKVolbe, mnozstvi, nastavMnozstvi, odberatelKonceptu, odeberRadek, popisSouctu, popisZavozu, skupinyPodlePiv,
  souctyObjednavky, ucinnyZavoz, type KonceptObjednavky, type RadekKonceptu,
} from '../../lib/objednavkaPruvodce';
import type { DataPruvodce, PrideleniMalychSudu, ZmenaKonceptu } from './pruvodceTypy';

const KARTA = 'rounded-2xl border border-neutral-200 bg-white dark:bg-neutral-800 dark:border-neutral-700';

export function PruvodceSouhrn({ data, koncept, zmen, upravPivo, zpetNaOdberatele, prideleniSudu, vycep, patka }: {
  data: DataPruvodce;
  koncept: KonceptObjednavky;
  zmen: ZmenaKonceptu;
  /** Úprava řádku: otevře krokové zadávání piva s předvoleným obalem. */
  upravPivo: (beerId: string, pkgId: string) => void;
  /** Změna odběratele nebo dne: vrátí na krok 1. */
  zpetNaOdberatele: () => void;
  prideleniSudu?: PrideleniMalychSudu;
  /** Pole „Půjčení výčepu" pod poznámkou (PruvodceVycep); bez něj se výčep nenabízí. */
  vycep?: ReactNode;
  /** Tlačítka uložení uvnitř souhrnu (na počítači; na telefonu jsou v patičce okna). */
  patka?: ReactNode;
}) {
  const { places, beers, packages, dnes } = data;
  const odberatel = odberatelKonceptu(koncept, places);
  const misto = mistaKVolbe(odberatel).find((m) => m.id === koncept.mistoZavozu);
  const z = ucinnyZavoz(koncept, places, dnes);
  const skupiny = skupinyPodlePiv(koncept.radky, packages, beers);
  const soucty = souctyObjednavky(koncept.radky, packages);
  const popis = popisSouctu(soucty);

  function odeber(r: RadekKonceptu, text: string, pivo: string) {
    zmen((k) => ({ ...k, radky: odeberRadek(k.radky, r.id) }));
    toastZpet(`Odebráno: ${pivo} ${text}`, () => {
      zmen((k) => ({ ...k, radky: nastavMnozstvi(k.radky, r.beerId, r.pkgId, mnozstvi(k.radky, r.beerId, r.pkgId) + r.qty) }));
    });
  }

  const radekKarty = 'flex items-center gap-2 min-h-[52px] px-3.5';
  const tuzka = 'btn-ghost !flex-none !w-11 !px-0 shrink-0';

  return (
    <div className="space-y-3">
      <h2 className="font-display font-black text-2xl text-neutral-900 dark:text-neutral-100">Souhrn objednávky</h2>

      <section aria-label="Komu a kdy" className={`${KARTA} divide-y divide-neutral-100 dark:divide-neutral-700`}>
        <div className={radekKarty}>
          <span className="w-16 shrink-0 text-xs font-black uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Komu</span>
          <span className="flex-1 min-w-0 font-display font-black text-lg text-neutral-900 dark:text-neutral-100 truncate">
            {koncept.placeName || '—'}{misto ? ` · ${misto.nazev}` : ''}
            {!odberatel && koncept.placeName && <span className="ml-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-300">nový</span>}
          </span>
          <button type="button" onClick={zpetNaOdberatele} className={tuzka} aria-label="Změnit odběratele"><Pencil size={16} /></button>
        </div>
        <div className={radekKarty}>
          <span className="w-16 shrink-0 text-xs font-black uppercase tracking-wider text-neutral-600 dark:text-neutral-300">Kdy</span>
          <span className="flex-1 min-w-0 font-display font-black text-lg text-neutral-900 dark:text-neutral-100">
            {popisZavozu(z)}
            {z.vychozi && z.datum && <span className="ml-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-300">výchozí den</span>}
            {koncept.bezZavozu && <span className="ml-1.5 text-xs font-bold text-neutral-600 dark:text-neutral-300">bez závozu</span>}
          </span>
          <button type="button" onClick={zpetNaOdberatele} className={tuzka} aria-label="Změnit den závozu"><Pencil size={16} /></button>
        </div>
      </section>

      <section aria-label="Položky objednávky" className={`${KARTA} py-2`}>
        {skupiny.length === 0 ? (
          <p className="px-3.5 py-3 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Zatím žádné pivo — vrať se na výběr piva.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {skupiny.map((s) => {
              const pivo = s.pivo ? beerName(s.pivo) : 'Pivo mimo nabídku';
              return (
                <div key={s.beerId} className="py-1.5">
                  <h3 className="flex items-center gap-2 px-3.5 py-1 font-display font-black text-lg text-neutral-900 dark:text-neutral-100">
                    <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/25" style={{ backgroundColor: beerBg(s.pivo) }} aria-hidden="true" />
                    {pivo}
                  </h3>
                  <ul>
                    {s.radky.map((r) => {
                      const sudy = prideleniSudu?.get(r.id);
                      const radek = koncept.radky.find((x) => x.id === r.id);
                      return (
                        <li key={r.id} className={`flex flex-wrap items-center gap-x-1 pl-3.5 pr-1.5 min-h-[48px] border-l-4 ${tridaRadkuSudu(sudy, 'border-transparent')}`}>
                          <span className="flex-1 min-w-0 text-base font-black text-neutral-900 dark:text-neutral-100">{r.text}</span>
                          <button type="button" onClick={() => upravPivo(s.beerId, r.pkgId)} className={tuzka} aria-label={`Upravit ${pivo} ${r.text}`}><Pencil size={16} /></button>
                          <button
                            type="button"
                            onClick={() => radek && odeber(radek, r.text, pivo)}
                            className={`${tuzka} !text-rose-700`}
                            aria-label={`Odebrat ${pivo} ${r.text}`}
                          ><Trash2 size={16} /></button>
                          <MaleSudyRadek prideleni={sudy} obal={r.text.replace(/^\d+×\s*/, '')} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
        {popis && (
          <p className="mx-3.5 mt-1 pt-2.5 pb-1 border-t border-neutral-100 dark:border-neutral-700 text-sm font-semibold text-neutral-600 dark:text-neutral-300">
            Celkem: <strong className="font-black text-neutral-900 dark:text-neutral-100">{popis}</strong>
          </p>
        )}
      </section>

      <div>
        <label htmlFor="pruvodce-poznamka" className="label">Poznámka</label>
        <input
          id="pruvodce-poznamka"
          type="text"
          maxLength={500}
          autoComplete="off"
          className="input"
          value={koncept.poznamka}
          onChange={(e) => zmen((k) => ({ ...k, poznamka: e.target.value }))}
          placeholder="Nepovinné — třeba „vozí řidič Petr“"
        />
      </div>

      {vycep}

      {patka}
    </div>
  );
}
