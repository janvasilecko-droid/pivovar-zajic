// 🍺📦 Chipy piva a obalu — přímo klikatelné, vidět hned, bez rozbalování.
// ---------------------------------------------------------------------------
// Zadání 24. 9. 2026: „misto rollovaciho pole udelej obaly i piva
// rouzklikavaci ikony ktery budou videt hned, stejne jako po ut st......"
// — přesně jak dny týdne dělá PrepinacObdobi.tsx: klik rovnou vybere,
// nemusí se nic nejdřív rozbalovat.
//
// Filtr piva a obalu byl dřív <select> — a to samo o sobě dvakrát v Kegging.tsx
// i dvakrát v BottlingScreen.tsx (záložka Přehled i „Stočeno za týden"/
// „Lahve k dotočení"), pokaždé trochu jinak stylované. Aby se to teď
// nerozjelo do čtyř mírně odlišných kopií, je to jedna sdílená komponenta —
// stejný krok, jaký si kdysi vyžádal PrepinacObdobi.tsx.
//
// Role .btn-amber/.btn-ghost místo vlastní barvy (viz docs/jednotny-styl.md,
// hlídá scripts/zkontroluj-tlacitka.mjs). Barva piva je jen tečka vedle
// jména — nikdy jediný nositel informace, jméno je vždycky vypsané taky.
import type { ReactNode } from 'react';
import type { Beer, Package } from '../lib/supabase';
import { beerBg } from '../lib/supabase';

function Chip({ aktivni, onClick, children, ariaLabel }: {
  aktivni: boolean; onClick: () => void; children: ReactNode; ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktivni}
      aria-label={ariaLabel}
      className={`${aktivni ? 'btn-amber' : 'btn-ghost'} !rounded-full !px-3 !py-1 text-xs shrink-0 !gap-1.5`}
    >
      {children}
    </button>
  );
}

/** Chipy piv — prázdný `vybrane` znamená „všechna". */
export function ChipyPiva({ piva, vybrane, onVybrat, popisVsech = 'Všechna piva' }: {
  piva: Pick<Beer, 'id' | 'name' | 'beer_color'>[];
  vybrane: string;
  onVybrat: (id: string) => void;
  popisVsech?: string;
}) {
  if (piva.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr podle piva">
      <Chip aktivni={vybrane === ''} onClick={() => onVybrat('')}>{popisVsech}</Chip>
      {piva.map((b) => (
        <Chip key={b.id} aktivni={vybrane === b.id} onClick={() => onVybrat(b.id)}>
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/15"
            style={{ backgroundColor: beerBg({ beer_color: b.beer_color }) }}
            aria-hidden
          />
          {b.name}
        </Chip>
      ))}
    </div>
  );
}

/** Chipy obalů — prázdný `vybrane` znamená „všechny". */
export function ChipyObalu({ obaly, vybrane, onVybrat, popisVsech = 'Všechny obaly' }: {
  obaly: Pick<Package, 'id' | 'label'>[];
  vybrane: string;
  onVybrat: (id: string) => void;
  popisVsech?: string;
}) {
  if (obaly.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtr podle obalu">
      <Chip aktivni={vybrane === ''} onClick={() => onVybrat('')}>{popisVsech}</Chip>
      {obaly.map((p) => (
        <Chip key={p.id} aktivni={vybrane === p.id} onClick={() => onVybrat(p.id)}>{p.label}</Chip>
      ))}
    </div>
  );
}
