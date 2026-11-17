// ↩️ Položky přečtené z CITOVANÉ zprávy se do objednávky nepřidávají.
// ---------------------------------------------------------------------------
// Z provozu 20. 10. 2026: Říčany napsaly „10x50l 12sv, 2x30l Winter Hazy 12",
// pak odpověď „A ještě plus 100x 0,5l 12sv". AI přečetla i text citace —
// z raw_line „Lokálka Říčany prosim 10x50l 12sv 2x30l Winter Hazy 12" udělala
// 10× 50 l winter a znovu 2× 30 l winter — a objednávka měla 12× 50 winter
// navíc a zdvojené 30 l. Prompt to zakazuje, ale AI ho porušuje, proto i
// pojistka v kódu: položka, jejíž raw_line NENÍ v textu odpovědi a je
// v textu citace, je z citace.
import { normText } from "./beer-match.ts";

export function bezPolozekZCitace<T extends { raw_line?: string | null }>(
  items: T[],
  messageText: string | null | undefined,
  quotedText: string | null | undefined,
): T[] {
  if (!normText(quotedText || "")) return items;
  return items.filter((item) => !radekJeZCitace(item.raw_line, messageText, quotedText));
}

/**
 * Pochází raw_line položky z CITOVANÉ zprávy, a ne z textu odpovědi samé?
 * (Řádek, který stojí i v odpovědi, je z odpovědi.)
 *
 * U odpovědi, která upravuje objednávku, vrací AI výsledný stav celé
 * objednávky a k řádkům, které jen opakuje, přikládá text původní zprávy.
 * Takový text už pro položku neplatí doslova — odpověď v ní mohla změnit
 * pivo i počet — a nesmí proto přebít to, co AI určila (17. 11. 2026,
 * Malešice: viz matchBeerId v beer-match.ts a kontrolní okno v appce).
 */
export function radekJeZCitace(
  rawLine: string | null | undefined,
  messageText: string | null | undefined,
  quotedText: string | null | undefined,
): boolean {
  const citace = normText(quotedText || "");
  if (!citace) return false;
  const raw = normText(rawLine || "");
  if (!raw || raw.length < 4) return false;
  if (normText(messageText || "").includes(raw)) return false;
  return citace.includes(raw) || raw.includes(citace);
}
