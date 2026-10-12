// 🔎 Přepis fotky na text přes Google Cloud Vision (technologie Google Lens).
// ---------------------------------------------------------------------------
// 12. 10. 2026, majitel: „fotku převést do textu a text pak může AI přenést
// do aplikace… nebude jednodušší, ať to rovnou udělá Google Vision a pak
// teprve AI čte ten text?" Proto se fotka VŽDY nejdřív přepíše: Gemini dostane
// fotku i přepis (ke kontrole, ať nevynechá řádek), ostatní AI čtou jen
// přepis — jako text, na který mají bezplatné kvóty mnohem větší než na fotky.
// (Za 30 dní do 12. 10. 2026 přišlo 9 fotek, nejvíc 2 za den.)
//
// Vision je zdarma do 1 000 fotek měsíčně, pak placený (~1,50 USD za dalších
// 1 000). Majitel: „to omezení obrázků nedávej… ať se to nezastaví, dej
// u případně 900 obrázků varování do aplikace". Každý přepis se proto jen
// započte do ocr_pouziti (migrace 20261231290000_ocr_pocitadlo) a aplikace
// od 900 za měsíc varuje (src/lib/ocrPouziti.ts). Nic se nezastavuje.
// Zapne se, až je v app_secrets klíč GOOGLE_VISION_API_KEY.

/**
 * Opraví typické chyby OCR u ručně psaných objednávek, než text dostane AI.
 * Google Vision se trénovat nedá (12. 10. 2026 majitel: „nauč to Vision, ať
 * to čte správně"; ani model pro rukopis „cs-t-i0-handwrit" nečetl líp).
 * Pravidla jsou z lístku Radka (21 řádků) a mění jen jednoznačné vzory —
 * „11" jako obal před stupněm je vždy „1l" (obal „11 l" neexistuje).
 */
export function opravOcrObjednavky(text: string): string {
  return text.split("\n").map(opravRadek).join("\n");
}

function opravRadek(radek: string): string {
  let r = radek
    // cyrilské „х" a „×" → x
    .replace(/[х×]/g, "x")
    // „SX 20l" / „S x" na začátku = „5x"
    .replace(/^S\s*[xX](?=\s|\d)/, "5x");
  // Počet × obal: „10x 11 12°", „15x11 11°", „35 x 11, 12° sv." → „10x 1l 12°".
  r = r.replace(/^(\s*\d{1,3})\s*[xX]\s*/, "$1x ");
  const m = r.match(/^(\s*\d{1,3}x )(\S+)(.*)$/);
  if (m) {
    let [, pocet, obal, zbytek] = m;
    const dale = zbytek.trimStart();
    const stupenDal = /^\d{2}\s*(?:°|"|'|\s|$)|^\d{2}[a-zA-Z]/.test(dale) || /^\d{2}0\b/.test(dale);
    // „11", „1", „11," — a „12"/„13"/„17" (l přečtené jako 2/3/7; obal 12 l
    // ani 13 l neexistuje), když za ním stojí stupeň.
    if (/^(?:1{1,2}|1[237])[,.]?$/.test(obal) && stupenDal) obal = "1l";
    else if (/^1{1,2}(1[0-3])[0°]$/.test(obal)) obal = obal.replace(/^1{1,2}(1[0-3])[0°]$/, "1l $1°"); // „1120" = „1l 12°"
    else if (/^0[,.]33[1l"')!]?$/.test(obal)) obal = "0,33l";
    else if (/^[01][,.]5[1l"')!]?$/.test(obal)) obal = obal.replace(/^([01])[,.]5.*$/, "$1,5l"); // „1,51", „0,5)"
    else if (/^(10|15|20|25|30|50)[1h]$/.test(obal)) obal = obal.slice(0, -1) + "l"; // „101", „15h"
    r = pocet + obal + zbytek;
    // Stupeň za obalem: „120" → „12°", „12"" → „12°".
    r = r.replace(/(^\s*\d{1,3}x \S+(?: \d{1,2}°)?\s+)(1[0-3])(?:0|["'])(?=\s|$|[a-zA-Z])/, "$1$2°");
  }
  return r;
}

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
  // Započítat do měsíčního počtu (varování v aplikaci od 900) — jen když
  // Google požadavek zpracoval (odpověděl, nebo nestihl odpovědět; odmítnutý
  // požadavek se neplatí). Přepis se nezastaví ani bez počítadla (např. než
  // se spustí migrace).
  const zapocti = async (): Promise<string> => {
    try {
      const { data, error } = await opts.admin.rpc("zapocti_ocr_fotky");
      return error ? ` (počítadlo nedostupné: ${error.message ?? "chyba"})` : `, ${data}. v měsíci`;
    } catch (err) {
      return ` (počítadlo nedostupné: ${err instanceof Error ? err.message : "chyba"})`;
    }
  };
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
    const poradi = await zapocti();
    const data = await resp.json();
    const chyba = data?.responses?.[0]?.error?.message;
    if (chyba) {
      opts.chyby.push(`ocr: ${String(chyba).slice(0, 200)}${poradi}`);
      return "";
    }
    const text = opravOcrObjednavky(textZOdpovediVision(data));
    opts.chyby.push((text ? `ocr: přepsáno ${text.split("\n").length} řádků` : "ocr: na fotce nenašel text") + poradi);
    return text;
  } catch (err) {
    opts.chyby.push(`ocr: ${err instanceof Error ? err.name : "chyba"}${await zapocti()}`);
    return "";
  }
}
