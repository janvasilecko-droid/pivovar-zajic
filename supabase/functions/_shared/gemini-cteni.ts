// 📷 Čtení fotky objednávky přes Gemini — opakovaně a jen zdarma.
// ---------------------------------------------------------------------------
// 12. 10. 2026: lístek (Radek, 21 řádků) Gemini přečte celý a správně, ale
// ten den byl často přetížený (HTTP 503 „high demand") nebo nestihl limit.
// Čtení pak spadlo na placenou zálohu, která vynechala půlku řádků a „1l"
// psala jako „11". Majitel: „chci to zadarmo… ať to Gemini zkouší víckrát,
// po nějaké době, nebo najdi jiný zadarmo."
//
// Proto se u fotky Gemini zkouší několikrát s pauzami, mezi tím i jiný
// bezplatný model ze stejného klíče (jiná „flash" verze, Gemma 3 — má vlastní
// kvótu a umí obrázky). Všechno jde přes jeden bezplatný klíč GEMINI_API_KEY.

export type PokusGemini = {
  model: string;
  /** Nativní JSON režim — Gemma ho nemá, výstup se pak čistí z textu. */
  json: boolean;
  /** Pauza před pokusem (přetížení bývá krátké). */
  pauzaMs: number;
};

const HLAVNI = "gemini-3.5-flash";
const GEMMA = "gemma-3-27b-it";

/**
 * Pořadí pokusů pro fotku. `dostupne` = názvy modelů, které klíč právě
 * nabízí (bez prefixu „models/"); null = seznam se nepodařilo načíst.
 */
export function planPokusuFoto(dostupne: string[] | null): PokusGemini[] {
  const ma = (m: string) => !dostupne || dostupne.includes(m);
  // Jiná „flash" verze jako záloha při přetížení hlavní (ne lite — ta čte hůř,
  // ne image/tts/live varianty, které obyčejný dotaz neberou).
  const jinyFlash = (dostupne ?? [])
    .filter((m) => /^gemini-[\d.]+-flash(-latest|-\d+)?$|^gemini-flash-latest$/.test(m) && m !== HLAVNI)
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))[0];
  const plan: PokusGemini[] = [
    { model: HLAVNI, json: true, pauzaMs: 0 },
    { model: HLAVNI, json: true, pauzaMs: 3_000 },
  ];
  if (jinyFlash) plan.push({ model: jinyFlash, json: true, pauzaMs: 0 });
  plan.push({ model: HLAVNI, json: true, pauzaMs: 8_000 });
  if (ma(GEMMA)) plan.push({ model: GEMMA, json: false, pauzaMs: 0 });
  return plan;
}

/** Plán pro text: jeden pokus jako dřív (text mají v záloze Groq a Mistral). */
export function planPokusuText(): PokusGemini[] {
  return [{ model: HLAVNI, json: true, pauzaMs: 0 }];
}

/** Modely, které klíč nabízí (pro planPokusuFoto); null při chybě. */
export async function dostupneModelyGemini(klic: string): Promise<string[] | null> {
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(klic)}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!r.ok) return null;
    const data = await r.json();
    return (data?.models ?? []).map((m: any) => String(m?.name ?? "").replace(/^models\//, "")).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Projde plán pokusů. Vrací text první odpovědi, kterou `prijmi` přijme
 * (vrátí neprázdný řetězec), jinak "". Končí, když dojde čas (`zbyvaMs`).
 */
export async function ctiPresGemini(opts: {
  klic: string;
  plan: PokusGemini[];
  // deno-lint-ignore no-explicit-any
  parts: any[];
  timeoutMs: number;
  zbyvaMs: () => number;
  prijmi: (model: string, candidate: string) => string;
  chyby: string[];
}): Promise<string> {
  for (const pokus of opts.plan) {
    if (pokus.pauzaMs) {
      if (opts.zbyvaMs() < pokus.pauzaMs + 15_000) break;
      await new Promise((r) => setTimeout(r, pokus.pauzaMs));
    }
    if (opts.zbyvaMs() < 15_000) break;
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${pokus.model}:generateContent?key=${encodeURIComponent(opts.klic)}`,
        {
          signal: AbortSignal.timeout(Math.max(5_000, Math.min(opts.timeoutMs, opts.zbyvaMs()))),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: opts.parts }],
            generationConfig: pokus.json
              ? { temperature: 0.1, responseMimeType: "application/json" }
              : { temperature: 0.1 },
          }),
        },
      );
      if (resp.ok) {
        const data = await resp.json();
        const candidate = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") ?? "";
        const text = opts.prijmi(pokus.model, candidate);
        if (text) return text;
        continue; // nepoužitelný výstup → další pokus
      }
      const errText = await resp.text();
      console.warn(`Gemini ${pokus.model} error (status ${resp.status}): ${errText.slice(0, 300)}`);
      opts.chyby.push(`gemini ${pokus.model}: HTTP ${resp.status} ${errText.slice(0, 200)}`);
      // Špatný klíč/požadavek se opakováním nespraví; neznámý model ano (další v plánu).
      if (resp.status === 400 || resp.status === 401 || resp.status === 403) {
        if (pokus.model === HLAVNI) break;
      }
    } catch (err) {
      console.warn(`Gemini ${pokus.model} exception: ${err instanceof Error ? err.name + ": " + err.message : err}`);
      opts.chyby.push(`gemini ${pokus.model}: ${err instanceof Error ? err.name : "chyba"}`);
    }
  }
  return "";
}
