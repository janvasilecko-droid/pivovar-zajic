// 🤖 AI sládek: chatbot a hledání v knihách na dvou kartách.
// Sdílí ho Pivovarská bible v hlavní aplikaci (screens/BibleScreen.tsx) i samostatná aplikace
// AI sládek na /sladek/ (screens/SladekApp.tsx, R39) — jeden kód, takže obě chodí stejně.
import { useState } from 'react';
import { Bot, Search, type LucideIcon } from 'lucide-react';
import { smiPrispivat, type BibleRole } from '../../lib/bibleOpravneni';
import { BibleChat } from './BibleChat';
import { BibleHledani } from './BibleHledani';

export const OTAZKA_PROBLEMU = 'Najdi možné příčiny tohoto problému: projdi příznaky a dotčené várky, porovnej je s literaturou a zkušenostmi '
  + 'a řekni, co mám ověřit a změřit. Podstatná zjištění zapiš k problému.';

/** AI sládek: chatbot a hledání v knihách na dvou kartách (chat zůstává při přepnutí rozpracovaný). */
export function BibleAiSladek({ otevri, dotazHledani = null, problem = null, role, doKnihovny }: {
  otevri: (dokumentId: string, list: number) => void;
  dotazHledani?: string | null;
  problem?: { id: string; nazev: string } | null;
  role: BibleRole | null;
  /** Otevře Knihovnu dokumentů (přidání další knihy); bez ní se tlačítko v přehledu knih nezobrazí. */
  doKnihovny?: () => void;
}) {
  const [karta, setKarta] = useState<'chat' | 'hledani'>(dotazHledani ? 'hledani' : 'chat');
  const [otazka, setOtazka] = useState<{ text: string; klic: number } | null>(problem ? { text: OTAZKA_PROBLEMU, klic: 1 } : null);
  const zalozka = (id: 'chat' | 'hledani', nazev: string, Ikona: LucideIcon) => (
    <button type="button" role="tab" id={`bible-karta-${id}`} aria-selected={karta === id} aria-controls={`bible-panel-${id}`}
      className={karta === id ? 'btn-amber' : 'btn-tmave'} onClick={() => setKarta(id)}>
      <Ikona size={18} /> {nazev}
    </button>
  );
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="AI sládek" className="flex flex-wrap gap-2">
        {zalozka('chat', 'Zeptat se', Bot)}
        {zalozka('hledani', 'Hledání v knihách', Search)}
      </div>
      <div role="tabpanel" id="bible-panel-chat" aria-labelledby="bible-karta-chat" hidden={karta !== 'chat'}>
        <BibleChat otevri={otevri} problem={problem} otazkaZvenku={otazka} role={role} doKnihovny={smiPrispivat(role) ? doKnihovny : undefined} />
      </div>
      <div role="tabpanel" id="bible-panel-hledani" aria-labelledby="bible-karta-hledani" hidden={karta !== 'hledani'}>
        <BibleHledani otevri={otevri} pocatecniDotaz={dotazHledani ?? undefined}
          zeptatSe={(q) => { setOtazka((o) => ({ text: q, klic: (o?.klic ?? 0) + 1 })); setKarta('chat'); }} />
      </div>
    </div>
  );
}
