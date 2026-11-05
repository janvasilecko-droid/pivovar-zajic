// ✏️ Úprava už uloženého stáčení lahví přímo pod zápisem.
// ---------------------------------------------------------------------------
// 5. 11. 2026: „ve stáčení lahve: ověř, když jsem zadal stáčení, nešlo mi
// editovat stočené položky, uprav to." Seznam „Dnes stočeno do lahví" byl jen
// ke čtení; úprava existovala až v Přehledu (tužka v podrobnostech řádku), což
// nikdo po zápisu nehledá.
//
// Tady se ukáže tatáž tabulka jako v Přehledu (PrehledStaceniLahvi) — číslo se
// přepíše klepnutím, klepnutí na pivo otevře podrobnosti — jen omezená na
// jedno pivo a den, který se zapisuje. Druhá logika úprav nevznikla schválně:
// kontroly (přehmat o řád, sud bez velikosti), zápis do databáze i „Vrátit
// zpět" dělají stejné funkce jako v Přehledu, takže se obě místa nemůžou
// rozejít.
import { useEffect, useRef } from 'react';
import { Pencil } from 'lucide-react';
import type { EntryRow } from '../lib/supabase';
import type { DavkaStaceni } from '../lib/prehledStaceni';
import PrehledStaceniLahvi, { type PrehledStaceniLahviProps } from './PrehledStaceniLahvi';

export default function UpravaUlozenehoStaceni({ nazevPiva, davky, onZavrit, ...tabulka }: {
  nazevPiva: string;
  davky: DavkaStaceni<EntryRow>[];
  onZavrit: () => void;
} & Omit<PrehledStaceniLahviProps, 'davky' | 'castecnyVyber'>) {
  const koren = useRef<HTMLElement>(null);
  // Po klepnutí na tužku ať je úprava vidět, i když seznam zůstal nahoře.
  useEffect(() => { koren.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); }, []);

  return (
    <section
      ref={koren}
      aria-label={`Úprava uloženého stáčení: ${nazevPiva}`}
      data-testid="uprava-ulozeneho"
      className="card px-2 py-3 mb-5 border-2 border-amber-300/80"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-display font-black text-amber-950 text-base min-w-0 flex items-center gap-1.5">
          <Pencil size={16} className="shrink-0" aria-hidden />
          <span className="truncate">Upravit uložené stáčení · {nazevPiva}</span>
        </h3>
        <button type="button" onClick={onZavrit} className="btn-secondary btn-sm shrink-0">Hotovo</button>
      </div>
      {davky.length === 0 ? (
        <p className="text-sm text-neutral-600" role="status">U tohoto piva už není na tento den nic uloženo.</p>
      ) : (
        <PrehledStaceniLahvi {...tabulka} davky={davky} castecnyVyber={false} />
      )}
    </section>
  );
}
