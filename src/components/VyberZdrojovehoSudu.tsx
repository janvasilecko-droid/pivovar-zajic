// 🛢️ Zdrojový sud u stáčení lahví — vyklikat, ne rozklikávat.
// ---------------------------------------------------------------------------
// Zadání z 19. 9. 2026: „ten zdrojový keg ve stáčení lahví nedělej jako
// rozklikávací pole, ale zaškrtávací (vypiš všechny velikosti), ať se bude jen
// zaklikávat — primárně zakliknutý bude sud 50 l."
//
// Padesátka je předvolená už dřív (viz lib/zdrojovySud.ts) — tohle jen
// ukazuje, že předvolená je, bez otevírání.
//
// Mechanika je společná s výběrem obalu u lahví (VyberObalu.tsx). Zůstává tu
// to, co je sudové: řazení, popisek a hlavně význam prázdné volby — „bez sudu"
// znamená stáčení rovnou z tanku, ne nevyplněné políčko.
import VyberObalu, { type ObalKVyberu } from './VyberObalu';

export type SudKVyberu = ObalKVyberu;

/** Od nejmenšího po největší — v hlavě to lidi mají taky v řadě. */
export function serazeneSudy<T extends SudKVyberu>(sudy: T[]): T[] {
  const objem = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return [...sudy].sort((a, b) => objem(a.volume_l) - objem(b.volume_l));
}

/** „KEG 50 L" — z objemu, a když chybí, popisek z katalogu. */
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
  return (
    <VyberObalu
      obaly={serazeneSudy(sudy)}
      vybrany={vybrany}
      zmen={zmen}
      popis={popisSudu}
      prazdnyPopis={sBezSudu ? 'bez sudu' : undefined}
      ariaLabel="Zdrojový KEG"
    />
  );
}
