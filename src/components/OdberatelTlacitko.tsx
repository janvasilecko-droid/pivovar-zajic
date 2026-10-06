import { useMemo, useState } from 'react';
import { Store } from 'lucide-react';
import { Modal } from './ui';
import { PlaceCombobox } from './PlaceCombobox';
import type { Place } from '../lib/supabase';
import { odberateleDleCetnosti, type ObjednavkaProRazeni } from '../lib/odberateleDleCetnosti';

/**
 * Výběr odběratele u nové objednávky jako TLAČÍTKO (5. 10. 2026).
 *
 * Klepnutí otevře okno: nahoře pole, kam jde odběratele napsat (napovídá
 * a umí založit nového), pod ním tlačítka všech odběratelů seřazená od
 * nejčastěji používaných. Výběr okno zavře.
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
  const serazene = useMemo(() => odberateleDleCetnosti(places, objednavky), [places, objednavky]);
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
