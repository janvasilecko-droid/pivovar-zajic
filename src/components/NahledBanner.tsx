import { Eye } from 'lucide-react';
import { nastavNahled } from '../lib/nahledUzivatele';

// Pruh nahoře, dokud běží náhled „nový běžný uživatel“ — ať je to pořád vidět
// a jde ho jedním klepnutím ukončit.
export function NahledBanner() {
  return (
    <div
      role="note"
      className="fixed top-0 left-0 right-0 z-nadmodal flex items-center justify-center gap-2 bg-rose-700 text-white text-udaj font-black px-3 py-1 shadow-md"
    >
      <Eye size={14} aria-hidden="true" />
      <span>Náhled: nový běžný uživatel (změny plochy se neukládají)</span>
      <button type="button" className="underline underline-offset-2 font-black" onClick={() => nastavNahled(false)}>
        Ukončit náhled
      </button>
    </div>
  );
}
