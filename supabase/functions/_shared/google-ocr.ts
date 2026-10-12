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

import { RUKOPIS_LISTKU } from "./order-rules.ts";

/**
 * Opraví typické chyby OCR u ručně psaných objednávek, než text dostane AI.
 * Google Vision se trénovat nedá (12. 10. 2026 majitel: „nauč to Vision, ať
 * to čte správně"; ani model pro rukopis „cs-t-i0-handwrit" nečetl líp).
 * Pravidla jsou z přepisů všech 16 fotek, ze kterých do 12. 10. 2026 vznikla
 * objednávka, porovnaných s potvrzenými objednávkami. Mění jen jednoznačné
 * vzory — např. „11" jako obal před stupněm je vždy „1l" (sud 11 l není).
 *
 * Radek píše „1" s dlouhou nožičkou: OCR ji čte jako „7", „4" nebo „l"
 * a dvojici „11°" jako „M°"/„Mo". Jeho „8" čte jako „S" nebo „&" — ale
 * „S" na začátku řádku bylo v objednávkách jednou 5 a jindy 8, takže se
 * NEOPRAVUJE (rozhodne AI podle fotky, nebo se zeptá — viz sekceOcr).
 */
export function opravOcrObjednavky(text: string): string {
  return text.split("\n").map(opravRadek).join("\n");
}

/** Stupeň: 8°, 10°–13° (Osma je 8°). */
const STUPEN = "(?:8|1[0-3])";

/** Slova, která OCR u našich lístků komolí (z fotek srpen–říjen 2026). */
const SLOVA: [RegExp, string][] = [
  [/\bJANTA[NK]\b/g, "JANTAR"],
  [/\bSOMMER\b/g, "SUMMER"],
  [/\bKIUI\b/g, "KIWI"],
];
/** Nadpis „SKLAD" psaný rukou: OCR čte „SULAD", „SKLAN", „SUCOS", „SULLAIS"… */
const SKLAD = /^(\W*)(?:SULL?AD|SKLAN|SUCOS|SULA|SULLAIS|SUAD)\b/;

function opravRadek(radek: string): string {
  let r = radek
    // cyrilské „х" a „×" → x
    .replace(/[х×]/g, "x")
    // „30|LIMO" → „30l LIMO" (svislé l), „0,5/12°" → „0,5 12°"
    .replace(/(\d)\s*\|\s*/g, "$1l ")
    .replace(/(\d)\/(?=\d)/g, "$1 ")
    .replace(SKLAD, "$1SKLAD");
  for (const [vzor, slovo] of SLOVA) r = r.replace(vzor, slovo);
  // „+ 10x 1,5l" — znaménko před řádkem (dopsaná položka) odložit stranou.
  const plus = r.match(/^\s*[+•]\s*/)?.[0] ?? "";
  r = r.slice(plus.length);
  // Počet × obal: „3<301", „1K 30", „5+30l", „35 x 11" → „3x 301", „1x 30", „5x 30l", „35x 11".
  // „S" (5 nebo 8) zůstává — jen se srovná oddělovač, ať se opraví zbytek řádku.
  r = r.replace(/^(\s*(?:\d{1,3}|[sS]))\s*(?:[xX<]|K(?=\s*\d)|\+(?=\d))\s*(?=\S)/, "$1x ");
  // „2005 LIMO" = „20x 0,5 LIMO" (x mezi počtem a 0,5 vypadlo).
  r = r.replace(/^(\s*(?:10|15|20|25|30|40|50))0[,.]?5(?=\s)/, "$1x 0,5l");
  const m = r.match(/^(\s*(?:\d{1,3}|[sS])x )(\S+)(.*)$/);
  if (!m) return plus + r;
  const pocet = m[1];
  let obal = m[2];
  // „11°" psané jako „M°", „Mo sv.", „Mosv.", „M's".
  const zbytek = m[3].replace(/(^|\s)M(?:°|'s|[oO](?=\s|$|[sS][vVuU]))/g, "$111°");
  const dale = zbytek.trimStart();
  const stupenDal = new RegExp(`^${STUPEN}(?:\\s*[°"'.,]|\\s|$|[a-zA-Z]|0\\b)|^&|^11°`).test(dale);
  if (/^(?:1{1,2}|1[2378]|7[lI1]?)[,.]?$/.test(obal) && stupenDal) {
    // „11", „1", „11," — a „12"/„13"/„17"/„18" (l přečtené jako 2/3/7/8)
    // nebo „7"/„7l" (jednička jako sedmička); obaly 7/11/12/13/18 l nejsou.
    obal = "1l";
  } else if (new RegExp(`^1{1,2}[.,]?(${STUPEN})[0°]$`).test(obal)) {
    obal = obal.replace(new RegExp(`^1{1,2}[.,]?(${STUPEN})[0°]$`), "1l $1°"); // „1120" = „1l 12°", „11.8°" = „1l 8°"
  } else if (/^0[,.]33[1l"')!]?$/.test(obal)) {
    obal = "0,33l";
  } else if (/^(?:[017][,.]5|05)[1l"')!]?$/.test(obal)) {
    obal = obal.startsWith("0") ? "0,5l" : "1,5l"; // „1,51", „7,5l", „0,5)", „05"
  } else if (/^(10|15|20|25|30|50)[1hfI%]$/.test(obal)) {
    obal = obal.slice(0, -1) + "l"; // „101", „15h", „10f", „30%"
  } else if (/^(10|15|20|30|50)0$/.test(obal) && stupenDal) {
    obal = obal.slice(0, -1) + "l"; // „4x 300 11°" = „4x 30l 11°"
  } else if (new RegExp(`^(${STUPEN})[0"']$`).test(obal) && !stupenDal) {
    obal = obal.slice(0, -1) + "°"; // „10x 120" = „10x 12°" (obal nenapsaný)
  } else if (/^[sS][oO0][lI1]$/.test(obal)) {
    obal = "30l"; // „5x sol 10°"
  } else if (/^45[lI1]?$/.test(obal)) {
    obal = "15l"; // jednička jako čtyřka; sud 45 l není
  }
  r = pocet + obal + zbytek;
  // Stupeň za obalem: „120" → „12°", „12"" → „12°", „80" → „8°", „&" → „8°".
  r = r.replace(
    new RegExp(`(^\\s*(?:\\d{1,3}|[sS])x \\S+(?: \\d{1,2}°)?\\s+)(${STUPEN})(?:0|["'])(?=\\s|$|[a-zA-Z.,])`),
    "$1$2°",
  );
  r = r.replace(/(^\s*\d{1,3}x 1l\s+)&/, "$18°");
  return plus + r;
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
- OCR u rukopisu plete znaky: „1l"/„1,5l" přečte jako „11"/„1,51"/„15l", „0,5" jako „05"/„0.5", „x" jako „×"/„k"/„<", „0"↔„O", „1"↔„l"/„I". Typické chyby už jsou v přepisu opravené; zbytek oprav podle smyslu a pravidel výše (stupeň vs. objem).
- Ručně psaná „1" s dlouhou nožičkou vypadá jako „7" nebo „4" a „11°" jako „M°". „8" vypadá jako „S" nebo „&". Číslo, které z toho nejde jistě rozhodnout (např. „Sx 30l 12°" = 5x, nebo 8x?), rozhodni podle fotky; když fotku nevidíš, dej položku a do "otazky" napiš, ať obsluha počet zkontroluje.
- Text zprávy je jen doplněk k fotce — má přednost to, co je na fotce.
${RUKOPIS_LISTKU}`;
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
