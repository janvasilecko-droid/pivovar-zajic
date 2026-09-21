// ↩️ Pozná, že zpráva mluví o VRÁCENÍ piva, ne o objednávce.
// ---------------------------------------------------------------------------
// Sdílené mezi klientem (src/lib/vraceniZeZpravy.ts) a edge funkcí
// (whatsapp-auto-parse) — ať obě strany souhlasí na tom, co je vrácení.
// Z provozu 21. 9. 2026: zpráva „Vrací jednu plnou 30tku", odpověď na
// vlastní objednávku (citace → amends_order_id), se v edge funkci brala
// jako ÚPRAVA té objednávky (AI dostala „SOUČASNÝ obsah, vrať výsledný
// stav po zapracování") — pro zprávu o vrácení to nedává smysl a AI z toho
// vypadávala prázdná/nesmyslná data. Detekce vrácení proto musí být
// dostupná už v edge funkci, ne jen v klientovi po přečtení.

/** Bez diakritiky, malými písmeny, jednoduché mezery. */
export function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tvary slovesa „vracet" na začátku i uvnitř zprávy.
 *
 * Schválně BEZ „vrátit zpět"/„vratny sud"/„vratne lahve": to jsou zavedené
 * pojmy o obalech a v objednávkách („+ vratné lahve") se objevují běžně —
 * z takové zprávy se vrácení dělat nesmí.
 */
const SLOVESO_VRACENI = /\b(vraci|vraceji|vracim|vracime|vraceno|vratili|vratil|vratila|vratime|vratim|vraceni)\b/;

/** Vypadá zpráva na vrácení piva (ne na objednávku)? */
export function vypadaJakoVraceni(text: string | null | undefined): boolean {
  const t = norm(text);
  if (!t) return false;
  // „vratné lahve" a spol. jsou obaly v objednávce, ne vrácení — viz výše.
  if (/\bvratn[eyaáé]\b/.test(t)) return false;
  return SLOVESO_VRACENI.test(t);
}
