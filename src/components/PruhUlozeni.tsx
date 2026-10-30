// 💾 Uložení nahoře — hlavní tlačítko formuláře je pořád na očích.
// ---------------------------------------------------------------------------
// Z provozu 30. 10. 2026: „To uložit fasování musí být všude nahoře, to samý
// u objednávek atd." Tlačítko bylo až pod dlaždicemi piv, poznámkou
// a přepínači — na telefonu se k němu muselo rolovat přes celou obrazovku.
//
// Pruh stojí na začátku formuláře a při rolování se přilepí k horní hraně
// obsahu (pod hlavičku appky), takže uložit jde odkudkoli. Je v něm jen to,
// co zápis ukládá; „Vymazat vše" zůstává dole, ať se nahoře omylem neklepne.
import type { ReactNode } from 'react';

export function PruhUlozeni({ souhrn, chyba, children }: {
  /** Co je zatím zapsané (např. „20 ks · 10 L") — vpravo vedle tlačítka. */
  souhrn?: ReactNode;
  /** Chyba posledního uložení — pod tlačítkem, ať je vidět tam, kde se klepalo. */
  chyba?: string | null;
  /** Tlačítko (tlačítka) uložení. */
  children: ReactNode;
}) {
  return (
    <div
      data-testid="pruh-ulozeni"
      className="sticky top-0 z-20 -mx-1 mb-3 px-1 py-2 bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {souhrn != null && souhrn !== '' && (
        <div className="ml-auto text-sm font-black text-neutral-900 dark:text-neutral-100 tabular-nums">{souhrn}</div>
      )}
      {chyba && <span className="basis-full text-xs font-bold text-rose-700">{chyba}</span>}
    </div>
  );
}
