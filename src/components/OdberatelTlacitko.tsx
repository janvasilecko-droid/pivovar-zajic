import { useMemo, useRef, useState } from 'react';
import { Store } from 'lucide-react';
import { Modal } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import type { Place } from '../lib/supabase';
import {
  filtrujOdberatele, nejcastejsiOdberatele, odberateleAbecedne, odberateleDleCetnosti, rozdelDlePismen,
  type ObjednavkaProRazeni,
} from '../lib/odberateleDleCetnosti';

/** Kolik odběratelů je nahoře ve zkratce „Nejčastější“. */
const POCET_NEJCASTEJSICH = 8;
/** Od kolika odběratelů se nad abecedním seznamem ukáže lišta písmen (u krátkého seznamu stačí rolovat). */
const LISTA_PISMEN_OD = 12;

/**
 * Výběr odběratele u nové objednávky jako TLAČÍTKO (5. 10. 2026).
 *
 * Klepnutí otevře okno: nahoře pole, kam jde odběratele napsat (napovídá
 * a umí založit nového). Pod ním:
 *  - při psaní jen odběratelé, kteří napsanému odpovídají (29. 10. 2026),
 *  - jinak zkratka „Nejčastější“ a pod ní „Všichni odběratelé“ podle
 *    abecedy s nadpisy písmen a lištou písmen na rychlý skok (majitel:
 *    „docela dlouho jsem hledal Martina“).
 * Výběr okno zavře.
 */
export function OdberatelTlacitko({ placeId, placeName, places, objednavky, onChange, onPlacesChanged }: {
  placeId: string;
  placeName: string;
  places: Place[];
  objednavky: ObjednavkaProRazeni[];
  onChange: (placeId: string, placeName: string) => void;
  onPlacesChanged?: () => void;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const nadpisy = useRef<Record<string, HTMLElement | null>>({});

  // Napsaný text je filtr jen tehdy, když odběratel ještě není vybraný — po výběru
  // pole ukazuje jeho jméno a seznam pod ním má zůstat celý.
  const filtr = placeId ? '' : placeName;
  const hledani = filtr.trim().length > 0;

  const nejcastejsi = useMemo(
    () => nejcastejsiOdberatele(places, objednavky, POCET_NEJCASTEJSICH),
    [places, objednavky],
  );
  const skupiny = useMemo(() => rozdelDlePismen(odberateleAbecedne(places)), [places]);
  const nalezeno = useMemo(
    () => (hledani ? odberateleDleCetnosti(filtrujOdberatele(places, filtr), objednavky) : []),
    [hledani, places, filtr, objednavky],
  );
  const vybrany = places.find((p) => p.id === placeId)?.name ?? placeName.trim();

  function vyber(id: string, nazev: string) {
    onChange(id, nazev);
    // Psaní do pole posílá ('', text) při každé klávese — okno se zavře až
    // výběrem existujícího nebo založením nového odběratele.
    if (id) setOtevreno(false);
  }

  function skocNaPismeno(pismeno: string) {
    // scrollIntoView v testovacím prostředí (jsdom) chybí.
    nadpisy.current[pismeno]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  const tlacitko = (p: Place) => (
    <button
      key={p.id}
      type="button"
      onClick={() => vyber(p.id, p.name)}
      className={`${p.id === placeId ? 'btn-primary' : 'btn-ghost'} min-h-[44px] !justify-start text-left`}
    >
      {p.name}
    </button>
  );
  const mrizka = 'grid grid-cols-2 sm:grid-cols-3 gap-2';
  const nadpisSekce = 'text-popisek font-black uppercase tracking-wider text-neutral-500 mb-2';

  return (
    <>
      <button
        type="button"
        onClick={() => setOtevreno(true)}
        className={`${vybrany ? 'btn-primary' : 'btn-ghost'} w-full min-h-[48px] !justify-start text-left`}
      >
        <Store size={18} className="shrink-0" />
        <span className="truncate">{vybrany || 'Vybrat odběratele'}</span>
      </button>

      {/* Úsporné okno: seznam potřebuje každý pixel. Odsazení si řeší sám (px-4), takže se lišta
          písmen přilepí k úplnému hornímu okraji rolování, ne pod odsazení okna. */}
      <Modal open={otevreno} onClose={() => setOtevreno(false)} title="Odběratel" wide kompaktni>
        <div className="px-4 pt-3 pb-4 space-y-4">
          <PlaceCombobox
            value={placeId || placeName}
            onChange={vyber}
            places={places}
            onPlacesChanged={onPlacesChanged}
            bezNapovedy
          />

          {places.length === 0 && (
            <p className="text-sm font-semibold text-neutral-600">
              Zatím tu nejsou žádní odběratelé — napiš jméno do pole nahoře a založí se nový.
            </p>
          )}

          {hledani ? (
            <section aria-label="Nalezení odběratelé">
              <h3 className={nadpisSekce}>Nalezeno · {nalezeno.length}</h3>
              {nalezeno.length > 0 ? (
                <div className={mrizka}>{nalezeno.map(tlacitko)}</div>
              ) : (
                <p className="text-sm font-semibold text-neutral-600">
                  Nikdo odpovídající „{filtr.trim()}“ — je to nový odběratel? Založ ho tlačítkem pod polem.
                </p>
              )}
            </section>
          ) : (
            <>
              {nejcastejsi.length > 0 && (
                <section aria-label="Nejčastější odběratelé">
                  <h3 className={nadpisSekce}>Nejčastější</h3>
                  <div className={mrizka}>{nejcastejsi.map(tlacitko)}</div>
                </section>
              )}

              {places.length > 0 && (
                <section aria-label="Všichni odběratelé podle abecedy">
                  <h3 className={nadpisSekce}>Všichni odběratelé (A–Z) · {places.length}</h3>

                  {places.length >= LISTA_PISMEN_OD && (
                    // Lišta zůstává nahoře okna, když se pod ní roluje — z ní se dá skočit na jiné písmeno.
                    <nav
                      aria-label="Přeskočit na písmeno"
                      className="sticky top-0 z-10 -mx-4 px-4 py-1.5 mb-2 flex gap-1 overflow-x-auto scrollbar-thin bg-white/95 backdrop-blur-md border-b border-neutral-100"
                    >
                      {skupiny.map((s) => (
                        <button
                          key={s.pismeno}
                          type="button"
                          onClick={() => skocNaPismeno(s.pismeno)}
                          className="btn-zalozka !px-0 !py-0 h-11 min-w-9 justify-center"
                        >
                          {s.pismeno}
                        </button>
                      ))}
                    </nav>
                  )}

                  <div className="space-y-3">
                    {skupiny.map((s) => (
                      <div key={s.pismeno}>
                        <h4
                          ref={(el) => { nadpisy.current[s.pismeno] = el; }}
                          className="scroll-mt-16 mb-1.5 flex items-center gap-2 font-display font-black text-neutral-900"
                        >
                          <span className="grid place-items-center min-w-7 h-7 px-1.5 rounded bg-amber-100 text-amber-900 text-sm">{s.pismeno}</span>
                          <span className="flex-1 h-px bg-neutral-200" aria-hidden="true" />
                        </h4>
                        <div className={mrizka}>{s.odberatele.map(tlacitko)}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
