// ⏱️ Kolik času má jedno volání edge funkce — a kolik z něj smí vzít čtení AI.
// ---------------------------------------------------------------------------
// Worker edge funkce na Supabase (bezplatný tarif) přijímá nové požadavky
// prvních 75 s a ve 150 s končí, ať dělá cokoli — rozdělaný požadavek pak
// skončí HTTP 546. Změřeno 17. 11. 2026 (laciný požadavek každých 8 s: nový
// worker po 80, 160, 240 a 320 s). Požadavek, který přijde na konci toho okna,
// má tedy jistých jen 75 s; 150 s má jen ten, který worker sám založil.
//
// Do 17. 11. 2026 se u čtení objednávek počítalo se 140 s („pod tvrdým limitem
// 150 s"). Vyšlo to jen na čerstvém workeru — a jen když se čtení nezdrželo.
// Ten den byl Gemini přetížený, čtení fotky trvalo přes dvě minuty a skončilo
// 546; zpráva zůstala nepřečtená („nechce se mi naparsovat fotka objednávky").

/** Tolik má každý požadavek jistě (worker bere požadavky 75 s, žije 150 s). */
export const JISTY_CAS_POZADAVKU_MS = 75_000;

/**
 * Strop na čtení AI v jednom volání (parse-order-text, parse-order-image).
 * Zbytek do 75 s je na start funkce, ověření přihlášení, načtení těla
 * a odpověď — a na funkci, která tohle čtení volá a sama má taky jen 75 s
 * (whatsapp-auto-parse: fronta, katalog, stažení fotky, zápis výsledku).
 */
export const STROP_CTENI_MS = 58_000;

/**
 * Nejpozději tolik před koncem čtení se vedle nejlepšího čtení rozjedou
 * zálohy (viz cteni-poradi.ts). Čtení z přepisu s celým pokynem trvá záložní
 * AI kolem 18 s (17. 11. 2026, Mistral).
 */
export const REZERVA_PRO_ZALOHY_MS = 26_000;

/**
 * Strop čtení pro tohle volání. Volající může poslat menší (`maxMs` v těle
 * požadavku — whatsapp-auto-parse tak hlídá svůj vlastní čas), nikdy větší.
 */
export function stropCteni(maxMs: unknown): number {
  const n = typeof maxMs === "number" ? maxMs : Number.NaN;
  if (!Number.isFinite(n)) return STROP_CTENI_MS;
  return Math.round(Math.min(STROP_CTENI_MS, Math.max(10_000, n)));
}
