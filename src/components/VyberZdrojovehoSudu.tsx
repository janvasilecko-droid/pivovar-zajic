// 🛢️ Zdrojový sud u stáčení lahví — vyklikat, ne rozklikávat.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „ten zdrojový keg ve stáčení lahví nedělej jako
// rozklikávací pole, ale zaškrtávací (vypiš všechny velikosti), ať se bude jen
// zaklikávat — primárně zakliknutý bude sud 50 l."
//
// Rozbalovátko je na stáčecí lince špatný ovladač: je to klepnutí navíc, pod
// prstem v rukavici se v něm trefuje mizerně a hlavně NENÍ VIDĚT, co je
// vybrané, dokud se neotevře. Velikostí sudu je pět. Vejdou se všechny vedle
// sebe a je na první pohled poznat, která platí.
//
// Padesátka je předvolená už dřív (viz lib/zdrojovySud.ts) — tohle jen
// ukazuje, že předvolená je.
import { IkonaSud } from './ikony';

export type SudKVyberu = { id: string; volume_l: number | null; label?: string | null };

/** Od nejmenšího po největší — v hlavě to lidi mají taky v řadě. */
export function serazeneSudy<T extends SudKVyberu>(sudy: T[]): T[] {
  const objem = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return [...sudy].sort((a, b) => objem(a.volume_l) - objem(b.volume_l));
}

/** „KEG 50 L" — popisek z katalogu, a když chybí, poskládaný z objemu. */
export function popisSudu(sud: SudKVyberu): string {
  const objem = Number(sud.volume_l);
  if (Number.isFinite(objem) && objem > 0) return `KEG ${objem} L`;
  return sud.label || 'KEG';
}

export default function VyberZdrojovehoSudu({
  sudy,
  vybrany,
  zmen,
  /** Nabídnout i „bez sudu". Stáčet jde i rovnou z tanku. */
  sBezSudu = true,
}: {
  sudy: SudKVyberu[];
  vybrany: string;
  zmen: (id: string) => void;
  sBezSudu?: boolean;
}) {
  const serazene = serazeneSudy(sudy);

  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Zdrojový KEG">
      {serazene.map((sud) => {
        const jeVybrany = vybrany === sud.id;
        return (
          <button
            key={sud.id}
            type="button"
            role="radio"
            aria-checked={jeVybrany}
            onClick={() => zmen(sud.id)}
            className={jeVybrany ? 'btn-amber' : 'btn-ghost'}
          >
            <IkonaSud className="ikona-text" />
            {popisSudu(sud)}
          </button>
        );
      })}
      {sBezSudu && (
        <button
          type="button"
          role="radio"
          aria-checked={vybrany === ''}
          onClick={() => zmen('')}
          // Schválně poslední a nenápadný: stáčení bez odečtu sudů je výjimka,
          // ne výchozí volba. Dřív bylo „— žádný —" první položkou rozbalovátka
          // a kdo výběr přeskočil, zapsal stáčení bez odečtu (viz zdrojovySud.ts).
          className={vybrany === '' ? 'btn-secondary' : 'btn-ghost opacity-70'}
        >
          bez sudu
        </button>
      )}
    </div>
  );
}
