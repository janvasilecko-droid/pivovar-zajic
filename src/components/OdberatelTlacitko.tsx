import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { Modal } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import type { Place } from '../lib/supabase';
import { odberateleAbecedne, odberateleDleCetnosti, type ObjednavkaProRazeni } from '../lib/odberateleDleCetnosti';
import { nacti, uloz } from '../lib/uloziste';

type Razeni = 'cetnost' | 'abeceda';
const KLIC_RAZENI = 'pivovar_odberatel_razeni';
const VOLBY_RAZENI: { id: Razeni; popisek: string }[] = [
  { id: 'cetnost', popisek: 'Nejčastější' },
  { id: 'abeceda', popisek: 'A–Z' },
];

/**
 * Výběr odběratele u nové objednávky jako TLAČÍTKO (5. 10. 2026).
 *
 * Klepnutí otevře okno: nahoře pole, kam jde odběratele napsat (napovídá
 * a umí založit nového), pod ním tlačítka všech odběratelů — buď od nejčastěji
 * používaných (výchozí), nebo podle abecedy (29. 10. 2026). Zvolené řazení si
 * telefon pamatuje. Výběr okno zavře.
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
  const [razeni, setRazeni] = useState<Razeni>(() => (nacti(KLIC_RAZENI) === 'abeceda' ? 'abeceda' : 'cetnost'));
  const serazene = useMemo(
    () => (razeni === 'abeceda' ? odberateleAbecedne(places) : odberateleDleCetnosti(places, objednavky)),
    [razeni, places, objednavky],
  );
  const zvolRazeni = (r: Razeni) => { setRazeni(r); uloz(KLIC_RAZENI, r); };
  const vybrany = places.find((p) => p.id === placeId)?.name ?? placeName.trim();

  function vyber(id: string, nazev: string) {
    onChange(id, nazev);
    // Psaní do pole posílá ('', text) při každé klávese — okno se zavře až
    // výběrem existujícího nebo založením nového odběratele.
    if (id) setOtevreno(false);
  }

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

      <Modal open={otevreno} onClose={() => setOtevreno(false)} title="Odběratel" wide>
        <div className="p-4 space-y-4">
          <PlaceCombobox
            value={placeId || placeName}
            onChange={vyber}
            places={places}
            onPlacesChanged={onPlacesChanged}
          />
          <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Řazení odběratelů">
            <span className="text-udaj font-extrabold text-neutral-700 shrink-0">Řadit:</span>
            {VOLBY_RAZENI.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => zvolRazeni(v.id)}
                aria-pressed={razeni === v.id}
                className={`btn-zalozka ${razeni === v.id ? 'btn-zalozka-aktivni' : ''}`}
              >
                {v.popisek}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {serazene.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => vyber(p.id, p.name)}
                className={`${p.id === placeId ? 'btn-primary' : 'btn-ghost'} min-h-[44px] !justify-start text-left`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
