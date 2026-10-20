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
  const citace = normText(quotedText || "");
  if (!citace) return items;
  const zprava = normText(messageText || "");
  return items.filter((item) => {
    const raw = normText(item.raw_line || "");
    if (!raw || raw.length < 4) return true;
    if (zprava.includes(raw)) return true;
    return !(citace.includes(raw) || raw.includes(citace));
  });
}
