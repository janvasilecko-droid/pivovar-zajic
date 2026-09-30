// ✂️ „Oříznout fotku" — přepínač ve čteních z fotky (objednávky, stáčení,
// sudy, prodejna/fasování). Z provozu 30. 9. 2026: „ve čtení z fotek dej
// možnost oříznout fotku, dřív tam byla, nikde ji nevidím" — byla, ale jako
// drobné zaškrtávátko, které se ztratilo. Teď je to tlačítko vedle
// fotoaparátu a volba se pamatuje v telefonu (kdo ořezává, ořezává vždycky).
// Zapnuté = po vyfocení/výběru se před čtením otevře editor (ořez, otočení).
import { useState } from 'react';
import { Scissors } from 'lucide-react';
import { uloz } from '../lib/uloziste';

const KLIC = 'pivovar_orez_fotky';

/** Stav přepínače, zapamatovaný v telefonu. */
export function useOrezFotky(): [boolean, (v: boolean) => void] {
  const [zapnuto, setZapnuto] = useState(() => {
    try { return localStorage.getItem(KLIC) === '1'; } catch { return false; }
  });
  return [zapnuto, (v: boolean) => { setZapnuto(v); uloz(KLIC, v ? '1' : '0'); }];
}

export default function PrepinacOrezu({ zapnuto, onZmena }: { zapnuto: boolean; onZmena: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onZmena(!zapnuto)}
      aria-pressed={zapnuto}
      className={`btn-zalozka ${zapnuto ? 'btn-zalozka-aktivni' : ''}`}
      title="Před čtením otevřít fotku k oříznutí a otočení"
    >
      <Scissors size={16} /> {zapnuto ? 'Oříznout fotku: ZAP' : 'Oříznout fotku'}
    </button>
  );
}
