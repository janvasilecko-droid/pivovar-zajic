// 📦 Výběr obalu vyklikáním — společný základ pro sudy i lahve.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: nejdřív „ten zdrojový keg ve stáčení lahví nedělej jako
// rozklikávací pole, ale zaškrtávací (vypiš všechny velikosti)", vzápětí
// „udělej stejně i obaly".
//
// Rozbalovátko je na stáčecí lince špatný ovladač: klepnutí navíc, pod prstem
// v rukavici se v něm trefuje mizerně a hlavně NENÍ VIDĚT, co je vybrané,
// dokud se neotevře. Velikostí je u sudů pět a u lahví čtyři — vejdou se
// všechny vedle sebe a platná svítí.
//
// Tady je jen ta mechanika. Co se jak jmenuje a co znamená prázdná volba, si
// říká každé použití samo (VyberZdrojovehoSudu.tsx, BottlingScreen.tsx) —
// „bez sudu" a „prázdné" znamenají v provozu něco jiného.

export type ObalKVyberu = { id: string; volume_l: number | null; label?: string | null };

/** „0,5 L" — desetinná čárka, ne tečka. Na etiketách i v hlavě je čárka. */
export function objemCesky(volume_l: number | null | undefined): string {
  const objem = Number(volume_l);
  if (!Number.isFinite(objem) || objem <= 0) return '';
  return `${String(objem).replace('.', ',')} L`;
}

export default function VyberObalu({
  obaly,
  vybrany,
  zmen,
  popis,
  prazdnyPopis,
  prazdnyVybrany = 'btn-secondary',
  ariaLabel,
}: {
  obaly: ObalKVyberu[];
  vybrany: string;
  zmen: (id: string) => void;
  /** Jak se obal pojmenuje na tlačítku. */
  popis: (obal: ObalKVyberu) => string;
  /** Popisek volby „žádný". Když chybí, volba se nenabídne vůbec. */
  prazdnyPopis?: string;
  /** Třída pro vybranou prázdnou volbu — jinde má jinou váhu. */
  prazdnyVybrany?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={ariaLabel}>
      {obaly.map((obal) => {
        const jeVybrany = vybrany === obal.id;
        return (
          <button
            key={obal.id}
            type="button"
            role="radio"
            aria-checked={jeVybrany}
            onClick={() => zmen(obal.id)}
            className={jeVybrany ? 'btn-amber' : 'btn-ghost'}
          >
            {popis(obal)}
          </button>
        );
      })}
      {prazdnyPopis && (
        <button
          type="button"
          role="radio"
          aria-checked={vybrany === ''}
          onClick={() => zmen('')}
          // Schválně poslední a nenápadná. Prázdná volba bývala PRVNÍ položkou
          // rozbalovátka, takže kdo výběr přeskočil, nechal ji tam omylem.
          className={vybrany === '' ? prazdnyVybrany : 'btn-ghost opacity-70'}
        >
          {prazdnyPopis}
        </button>
      )}
    </div>
  );
}
