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
  // Každá verze má vlastní bezplatnou kvótu (12. 10. 2026: gemini-3.5-flash
  // vyčerpal denní limit, gemini-flash-latest přečetl lístek 21/21).
  const jineFlash = (dostupne ?? [])
    .filter((m) => /^gemini-[\d.]+-flash(-latest|-\d+)?$|^gemini-flash-latest$/.test(m) && m !== HLAVNI)
    .sort((a, b) => (a === "gemini-flash-latest" ? -1 : b === "gemini-flash-latest" ? 1 : b.localeCompare(a, "en", { numeric: true })))
    .slice(0, 2);
  const plan: PokusGemini[] = [
    { model: HLAVNI, json: true, pauzaMs: 0 },
    { model: HLAVNI, json: true, pauzaMs: 3_000 },
  ];
  for (const m of jineFlash) plan.push({ model: m, json: true, pauzaMs: 0 });
  plan.push({ model: HLAVNI, json: true, pauzaMs: 8_000 });
  // Gemma s obrazem: preferovaná 27B, jinak největší nabízená (1B obraz neumí).
  const velikost = (m: string) => Number(m.match(/-(\d+)b-it$/)?.[1] ?? 0);
  const gemma = ma(GEMMA)
    ? GEMMA
    : (dostupne ?? []).filter((m) => /^gemma-[\d.]+n?-(?:e)?\d+b-it$/.test(m) && velikost(m) >= 4)
      .sort((a, b) => velikost(b) - velikost(a) || b.localeCompare(a, "en", { numeric: true }))[0];
  if (gemma) plan.push({ model: gemma, json: false, pauzaMs: 0 });
  // Poslední záchrana: lite (čte rukopis hůř, ale má velkou bezplatnou kvótu).
  for (const m of liteVerze(dostupne).slice(0, 1)) plan.push({ model: m, json: true, pauzaMs: 0 });
  return plan;
}

/** Bezplatné „flash-lite" verze, které klíč nabízí (nejnovější první). */
function liteVerze(dostupne: string[] | null): string[] {
  return (dostupne ?? [])
    .filter((m) => /^gemini-flash-lite-latest$|^gemini-[\d.]+-flash-lite$/.test(m))
    .sort((a, b) => (a === "gemini-flash-lite-latest" ? -1 : b === "gemini-flash-lite-latest" ? 1 : b.localeCompare(a, "en", { numeric: true })));
}

/**
 * Plán pro text. Bezplatný Gemini Flash má jen ~20 dotazů denně (12. 10. 2026
 * vyčerpaný), „flash-lite" řádově stovky — text ho čte stejně dobře. Proto
 * text jde napřed na lite verze a plné flash verze šetří pro fotky.
 */
export function planPokusuText(dostupne: string[] | null = null): PokusGemini[] {
  const lite = liteVerze(dostupne).map((model) => ({ model, json: true, pauzaMs: 0 }));
  const jine = planPokusuFoto(dostupne).filter((p) => p.pauzaMs === 0 && p.json && !lite.some((l) => l.model === p.model));
  return [...lite, ...jine];
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
  // Model s vyčerpanou kvótou (429) se už v tomhle čtení nezkouší znovu.
  const vycerpane = new Set<string>();
  for (const pokus of opts.plan) {
    if (vycerpane.has(pokus.model)) continue;
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
      if (resp.status === 429) vycerpane.add(pokus.model);
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
