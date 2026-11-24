// 🧭 Vektorové hledání (R38): dotaz → vektor (OpenAI embeddings) a spojení s hledáním podle slov (RRF).
// ---------------------------------------------------------------------------
// Majitel 24. 11. 2026 (zadání RAG chatbota): „vytvoření embeddings a uložení do vektorové databáze“.
// Vektory pasáží počítá worker (scripts/bible/vektory.py) a leží v bible_vektory (pgvector). Tady je
// druhá půlka: z dotazu uživatele se při hledání spočítá vektor stejným modelem a funkce
// bible_hledej_vektor vrátí nejbližší pasáže. Spolu s hledáním podle slov (varianty cs/de/en, filtry)
// se výsledky spojí metodou RRF — kdo je vysoko v obou seznamech, vyhrává; česká otázka tak najde
// i německou nebo anglickou pasáž, ve které se žádné její slovo nevyskytuje.
//
// Pravidla:
//  • BEZ KLÍČE, BEZ VEKTORŮ, PŘI CHYBĚ SÍTĚ NEBO API se hledá jen podle slov — vektory nikdy nesmí
//    hledání rozbít ani zdržet (omezení času 4 s), a nic se nehlásí uživateli jako chyba;
//  • do embeddingů jde jen text dotazu; klíč se nikdy nevypisuje (ani v chybě);
//  • model a velikost vektoru musí odpovídat migraci 20261124000000_bible_vektory (halfvec(1024))
//    a worker (scripts/bible/vektory.py) — hlídá to test.

/** Model embeddingů; v bible_vektory.model_key a v ceníku (bible_nastaveni.cenik_usd_za_mtok). */
export const MODEL_VEKTORU = 'text-embedding-3-large';
/** Počet čísel ve vektoru (OpenAI `dimensions`); sloupec je halfvec(1024). */
export const ROZMER_VEKTORU = 1024;
export const URL_EMBEDDINGU = 'https://api.openai.com/v1/embeddings';
/** Nejvýš tak dlouho se čeká na vektor dotazu; pak se hledá jen podle slov. */
export const CAS_EMBEDDINGU_MS = 4000;
/** Delší dotaz se pro vektor zkrátí (hledání podle slov má vlastní limit dotazu). */
export const MAX_ZNAKU_DOTAZU = 2000;
/** Konstanta RRF: čím větší, tím míň záleží na přesném pořadí v seznamech (běžná hodnota 60). */
export const RRF_K = 60;

/** Vektor dotazu, nebo null (bez klíče, chyba, pomalá odpověď…). */
export type Embedder = (dotaz: string) => Promise<number[] | null>;

/** Je to vektor správné velikosti z konečných čísel? */
export function jePlatnyVektor(v: unknown): v is number[] {
  return Array.isArray(v) && v.length === ROZMER_VEKTORU && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

/** Vektor jako text pro PostgreSQL / PostgREST: „[0.1,0.2,…]“ (bez mezer). Neplatný vektor je chyba. */
export function vektorText(v: number[]): string {
  if (!jePlatnyVektor(v)) throw new Error(`Vektor musí mít ${ROZMER_VEKTORU} konečných čísel.`);
  return `[${v.map((x) => String(Number(x.toPrecision(7)))).join(',')}]`;
}

/**
 * Embedder přes OpenAI (klíč z app_secrets hlavní appky, který nasazení dá do secrets funkcí bible).
 * Bez klíče vrací null — pak se vektory vůbec nezkouší. Síť se předává kvůli testům.
 */
export function embedderOpenAi(
  klic: string | null | undefined,
  volby: { fetch?: typeof fetch; casMs?: number } = {},
): Embedder | null {
  const k = (klic ?? '').trim();
  if (!k) return null;
  const posli = volby.fetch ?? fetch;
  const casMs = volby.casMs ?? CAS_EMBEDDINGU_MS;
  return async (dotaz: string) => {
    const text = dotaz.trim().slice(0, MAX_ZNAKU_DOTAZU);
    if (!text) return null;
    const preruseni = new AbortController();
    const casovac = setTimeout(() => preruseni.abort(), casMs);
    try {
      const odpoved = await posli(URL_EMBEDDINGU, {
        method: 'POST',
        headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODEL_VEKTORU, input: text, dimensions: ROZMER_VEKTORU, encoding_format: 'float' }),
        signal: preruseni.signal,
      });
      if (!odpoved.ok) return null;
      const telo = await odpoved.json() as { data?: { embedding?: unknown }[] };
      const v = telo?.data?.[0]?.embedding;
      return jePlatnyVektor(v) ? v : null;
    } catch {
      return null; // síť, čas, rozbitá odpověď — hledá se jen podle slov; klíč ani text chyby se nikam nepíše
    } finally {
      clearTimeout(casovac);
    }
  };
}

/**
 * Reciprocal rank fusion: položka dostane za každý seznam, ve kterém je, 1 / (k + pořadí od jedničky).
 * Výsledek je seřazený podle součtu; shodné součty zůstanou v pořadí prvního výskytu (první seznam před
 * druhým, v seznamu podle pořadí) — řazení je stabilní. Stejná položka (podle klíče) se v jednom seznamu
 * počítá jen poprvé; vrací se její první výskyt.
 */
export function rrf<T>(seznamy: readonly (readonly T[])[], klic: (t: T) => string, k = RRF_K, limit = Infinity): T[] {
  const stav = new Map<string, { polozka: T; skore: number }>();
  for (const seznam of seznamy) {
    const videno = new Set<string>();
    seznam.forEach((polozka, i) => {
      const kl = klic(polozka);
      if (videno.has(kl)) return;
      videno.add(kl);
      const pocet = 1 / (k + i + 1);
      const s = stav.get(kl);
      if (s) s.skore += pocet;
      else stav.set(kl, { polozka, skore: pocet });
    });
  }
  return [...stav.values()].sort((a, b) => b.skore - a.skore).slice(0, limit).map((s) => s.polozka);
}

/** Místo v knize, jak ho vrací hledání (stránka originálu nebo překladu). */
export type MistoHledani = { dokument_id: string; pdf_index: number; zdroj: string };

/** Spojí hledání podle slov a podle významu (RRF); u shody drží řádek z hledání podle slov (má počet shod slov). */
export function spojHledani<T extends MistoHledani>(podleSlov: readonly T[], podleVyznamu: readonly T[], limit: number): T[] {
  return rrf([podleSlov, podleVyznamu], (r) => `${r.dokument_id}:${r.pdf_index}:${r.zdroj}`, RRF_K, limit);
}
