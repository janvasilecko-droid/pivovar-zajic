// 🔎 Přepis fotky na text přes Google Cloud Vision (technologie Google Lens).
// ---------------------------------------------------------------------------
// 12. 10. 2026, majitel: „fotku převést do textu a text pak může AI přenést
// do aplikace… nebude jednodušší, ať to rovnou udělá Google Vision a pak
// teprve AI čte ten text?" Proto se fotka VŽDY nejdřív přepíše: Gemini dostane
// fotku i přepis (ke kontrole, ať nevynechá řádek), ostatní AI čtou jen
// přepis — jako text, na který mají bezplatné kvóty mnohem větší než na fotky.
// (Za 30 dní do 12. 10. 2026 přišlo 9 fotek, nejvíc 2 za den.)
//
// Vision je zdarma do 1 000 fotek měsíčně, pak placený. Proto pojistka
// OCR_LIMIT_DEN: nejvýš 30 přepisů za 24 h → i za 32 započatých dní < 1 000.
// Zapne se, až je v app_secrets klíč GOOGLE_VISION_API_KEY.

/** Nejvýš tolik přepisů za 24 h (30 × 32 dní = 960 < 1 000 zdarma). */
export const OCR_LIMIT_DEN = 30;
/** Pevné „uživatelské" id počítadla v edge_rate_limits (sdílí ho všechny funkce). */
const OCR_POCITADLO_ID = "00000000-0000-0000-0000-000000000000";
const OCR_POCITADLO = "google-vision-ocr";

/** Text z odpovědi images:annotate (DOCUMENT_TEXT_DETECTION); "" když nic. */
// deno-lint-ignore no-explicit-any
export function textZOdpovediVision(data: any): string {
  const r = data?.responses?.[0];
  const text = r?.fullTextAnnotation?.text ?? r?.textAnnotations?.[0]?.description ?? "";
  return String(text).replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
}

/**
 * Část promptu o fotce, když je k dispozici přepis OCR. `sObrazkem` = AI
 * dostává i samotnou fotku (Gemini) — pak čte z fotky a přepis jen kontroluje;
 * bez obrázku čte z přepisu.
 */
export function sekceOcr(sObrazkem: boolean): string {
  const zaklad = sObrazkem
    ? `K této objednávce je přiložená FOTKA (viz obrázek v požadavku) a níže pod nadpisem „PŘEPIS FOTKY (OCR)" i její strojový přepis. Přečti objednávku PŘEDEVŠÍM Z FOTKY. Přepis OCR je pomůcka: podle něj si zkontroluj, že jsi nevynechal žádný řádek a dobře přečetl čísla. Když se přepis s fotkou liší, platí fotka.`
    : `K této objednávce byla přiložená FOTKA (obvykle ručně psaný lístek). Její text přepsalo OCR a najdeš ho níže pod nadpisem „PŘEPIS FOTKY (OCR)". Přečti objednávku PŘEDEVŠÍM Z TOHO PŘEPISU.`;
  return `

📷 FOTKA OBJEDNÁVKY Z WHATSAPP:
${zaklad}
- raw_text = doslovný přepis CELÉHO textu z fotky, řádek po řádku, v pořadí jako na fotce (zjevné chyby OCR oprav).
- Ke KAŽDÉMU řádku fotky s objednávkovým údajem MUSÍ existovat položka v items (viz pravidla výše).
- Čísla čti VELMI POZORNĚ (5x30 ≠ 5x50, 3 vs 5 vs 8, 0 vs 6).
- OCR u rukopisu plete znaky: „1l"/„1,5l" přečte jako „11"/„1,51"/„15l", „0,5" jako „05"/„0.5", „x" jako „×"/„k"/„X", „5"↔„S", „0"↔„O", „1"↔„l"/„I". Oprav to podle smyslu a pravidel výše (stupeň vs. objem).
- Text zprávy je jen doplněk k fotce — má přednost to, co je na fotce.`;
}

/** Uživatelská část požadavku: text zprávy + přepis fotky. */
export function textSOcr(rawText: string | undefined, ocr: string): string {
  return `TEXT OBJEDNÁVKY Z WHATSAPP:\n"""\n${rawText ?? ""}\n"""\n\nPŘEPIS FOTKY (OCR):\n"""\n${ocr}\n"""`;
}

/**
 * Přepíše fotku na text. Vrací "" když to nejde (limit, chyba) — důvod
 * zapíše do `chyby`. `admin` = Supabase klient se service role.
 */
export async function prepisFotkyGoogle(opts: {
  klic: string;
  imageBase64: string;
  // deno-lint-ignore no-explicit-any
  admin: any;
  chyby: string[];
  timeoutMs?: number;
}): Promise<string> {
  // Pojistka proti placení: bez potvrzeného počítadla se OCR nevolá.
  const { data: smi, error } = await opts.admin.rpc("consume_edge_rate_limit", {
    p_user_id: OCR_POCITADLO_ID,
    p_bucket: OCR_POCITADLO,
    p_limit: OCR_LIMIT_DEN,
    p_window_seconds: 86_400,
  });
  if (error) {
    opts.chyby.push(`ocr: počítadlo nedostupné (${error.message ?? "chyba"}) — přeskočeno`);
    return "";
  }
  if (smi !== true) {
    opts.chyby.push(`ocr: denní limit ${OCR_LIMIT_DEN} přepisů vyčerpán (bezplatná kvóta) — přeskočeno`);
    return "";
  }
  try {
    const resp = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(opts.klic)}`,
      {
        signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            image: { content: opts.imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            imageContext: { languageHints: ["cs"] },
          }],
        }),
      },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      console.warn(`Google Vision error (status ${resp.status}): ${errText.slice(0, 300)}`);
      opts.chyby.push(`ocr: HTTP ${resp.status} ${errText.slice(0, 200)}`);
      return "";
    }
    const data = await resp.json();
    const chyba = data?.responses?.[0]?.error?.message;
    if (chyba) {
      opts.chyby.push(`ocr: ${String(chyba).slice(0, 200)}`);
      return "";
    }
    const text = textZOdpovediVision(data);
    opts.chyby.push(text ? `ocr: přepsáno ${text.split("\n").length} řádků` : "ocr: na fotce nenašel text");
    return text;
  } catch (err) {
    opts.chyby.push(`ocr: ${err instanceof Error ? err.name : "chyba"}`);
    return "";
  }
}
