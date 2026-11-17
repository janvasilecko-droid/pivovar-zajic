// @vitest-environment node
// Celý běh funkce parse-order-text s napodobenými AI službami — hlídá, že se
// čtení vejde do času, který server jednomu volání dá (viz cas-cteni.ts),
// a že vyhraje správné čtení. Bez téhle zkoušky by se to poznalo až v provozu.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Chovani = { ms?: number; status?: number; text?: string; visi?: boolean };

const TAJNE = 'tajny-cron';
const POLOZKY = { items: [{ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '2x 30l 12° sv', place_name: 'Sklad', date: null }], place_name: 'Sklad', raw_text: 'SKLAD\n2x 30l 12° sv', otazky: [] };
const JSON_OK = JSON.stringify(POLOZKY);
const NABIDKA = ['gemini-2.5-flash', 'gemma-4-31b-it', 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite',
  'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash'];

vi.mock('npm:@supabase/supabase-js@2', () => {
  const dotaz = (radky: unknown, jeden: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: jeden, error: null });
    q.then = (ok: (v: unknown) => unknown, chyba: (e: unknown) => unknown) => Promise.resolve({ data: radky, error: null }).then(ok, chyba);
    return q;
  };
  return {
    createClient: () => ({
      from: () => dotaz(
        ['GEMINI_API_KEY', 'GROQ_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_VISION_API_KEY'].map((key) => ({ key, value: `klic-${key}` })),
        { value: 'tajny-cron' },
      ),
      rpc: () => Promise.resolve({ data: 15, error: null }),
    }),
  };
});

let obsluha: (req: Request) => Promise<Response>;
const napodobDeno = () => vi.stubGlobal('Deno', {
  env: { get: (k: string) => (k === 'SUPABASE_URL' ? 'https://projekt.supabase.co' : 'servisni-klic') },
  serve: (h: (req: Request) => Promise<Response>) => { obsluha = h; },
});
beforeAll(async () => {
  napodobDeno();
  await import('../parse-order-text/index.ts');
});

/** Napodobené služby. `volani` = co všechno funkce zavolala (služba:model). */
function sluzby(nastaveni: {
  ocrMs?: number;
  gemini?: Record<string, Chovani | Chovani[]>;
  groq?: Record<string, Chovani>;
  mistral?: Record<string, Chovani>;
  openrouter?: Record<string, Chovani>;
}) {
  const volani: string[] = [];
  const poradi = new Map<string, number>();
  const odpovez = (ch: Chovani | undefined, signal: AbortSignal | undefined, telo: (text: string) => unknown) =>
    new Promise<Response>((ok, chyba) => {
      if (signal?.aborted) return chyba(signal.reason);
      const c = ch ?? { status: 404, text: 'neznámý model' };
      const priZruseni = () => { clearTimeout(casovac); chyba(signal!.reason); };
      const casovac = c.visi ? undefined : setTimeout(() => {
        signal?.removeEventListener('abort', priZruseni);
        ok(c.status && c.status !== 200
          ? new Response(JSON.stringify({ error: { message: c.text ?? 'chyba' } }), { status: c.status })
          : new Response(JSON.stringify(telo(c.text ?? JSON_OK)), { status: 200 }));
      }, c.ms ?? 100);
      signal?.addEventListener('abort', priZruseni, { once: true });
    });
  const openAiTelo = (text: string) => ({ choices: [{ message: { content: text } }] });

  vi.stubGlobal('fetch', (url: string, init: { signal?: AbortSignal; body?: string } = {}) => {
    const u = String(url);
    if (u.includes('vision.googleapis.com')) {
      volani.push('ocr');
      return odpovez({ ms: nastaveni.ocrMs ?? 3_000 }, init.signal, () => ({ responses: [{ fullTextAnnotation: { text: 'SKLAD\n2x 30l 12° sv' } }] }));
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      if (u.includes('/models?')) return odpovez({ ms: 300 }, init.signal, () => ({ models: NABIDKA.map((m) => ({ name: `models/${m}` })) }));
      const model = u.match(/models\/([^:]+):generateContent/)![1];
      volani.push(`gemini:${model}`);
      const n = poradi.get(model) ?? 0;
      poradi.set(model, n + 1);
      const ch = nastaveni.gemini?.[model];
      return odpovez(Array.isArray(ch) ? ch[Math.min(n, ch.length - 1)] : ch, init.signal, (text) => ({ candidates: [{ content: { parts: [{ text }] } }] }));
    }
    const model = init.body ? JSON.parse(init.body).model : '';
    if (u.includes('api.groq.com')) {
      if (u.endsWith('/models')) return odpovez({ ms: 200 }, init.signal, () => ({ data: Object.keys(nastaveni.groq ?? {}).map((id) => ({ id })) }));
      volani.push(`groq:${model}`);
      return odpovez(nastaveni.groq?.[model], init.signal, openAiTelo);
    }
    if (u.includes('api.mistral.ai')) {
      volani.push(`mistral:${model}`);
      return odpovez(nastaveni.mistral?.[model], init.signal, openAiTelo);
    }
    if (u.includes('openrouter.ai')) {
      if (u.endsWith('/models')) return odpovez({ ms: 200 }, init.signal, () => ({ data: Object.keys(nastaveni.openrouter ?? {}).map((id) => ({ id, architecture: { input_modalities: ['text', 'image'] } })) }));
      volani.push(`openrouter:${model}`);
      return odpovez(nastaveni.openrouter?.[model], init.signal, openAiTelo);
    }
    return Promise.reject(new Error(`nečekané volání ${u}`));
  });
  return volani;
}

const PRETIZENY: Chovani = { ms: 1_200, status: 503, text: 'This model is currently experiencing high demand.' };
/** Stav 17. 11. 2026 v 11:20: hlavní Gemini 503, náhradní verze neodpovídají, Groq odmítá velký pokyn, Mistral čte jen nemo. */
const DEN_17_11 = {
  gemini: {
    'gemini-3.5-flash': PRETIZENY, 'gemini-flash-latest': { visi: true }, 'gemini-3.8-flash': { visi: true },
    'gemini-3.7-flash': { visi: true }, 'gemini-3.6-flash': { visi: true }, 'gemini-2.5-flash': { visi: true },
    'gemma-4-31b-it': { visi: true }, 'gemini-flash-lite-latest': { visi: true },
  },
  groq: { 'openai/gpt-oss-120b': { ms: 400, status: 413, text: 'Request too large' } },
  mistral: {
    'mistral-medium-latest': { ms: 300, status: 429, text: 'Rate limit exceeded' },
    'mistral-small-latest': { ms: 300, status: 429, text: 'Rate limit exceeded' },
    'mistral-large-latest': { ms: 300, status: 403, text: 'tier_not_allowed' },
    'open-mistral-nemo': { ms: 18_000 },
  },
  openrouter: { 'google/gemma-4-31b-it:free': { visi: true } },
};

describe('parse-order-text: čtení se vejde do času serveru (17. 11. 2026 — fotka skončila HTTP 546)', () => {
  let start = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    start = Date.now();
    // AbortSignal.timeout běží mimo napodobený čas — pro zkoušku ho napodobíme taky.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('čas vypršel', 'TimeoutError')), ms);
      return c.signal;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); napodobDeno(); });

  const zavolej = async (telo: Record<string, unknown>) => {
    const slib = obsluha(new Request('https://projekt.supabase.co/functions/v1/parse-order-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Cron-Secret': TAJNE },
      body: JSON.stringify({
        beers: [{ id: 'b1', name: '12° Světlá', degree: '12°' }], packages: [{ id: 'p1', label: '30l' }], places: ['Sklad'],
        messages: [{ sender: 'Radek', date: '2026-11-17', text: '📷 Fotka objednávky (bez popisu)' }],
        ...telo,
      }),
    }));
    let trvalo = -1;
    void slib.then(() => { trvalo = Date.now() - start; });
    await vi.runAllTimersAsync();
    const odpoved = await slib;
    return { status: odpoved.status, json: await odpoved.json(), trvalo };
  };
  const FOTKA = { rawText: '📷 Fotka objednávky (bez popisu)', imageBase64: 'AAAA', imageMimeType: 'image/jpeg' };

  it('Gemini v pořádku: fotku přečte hlavní model, zálohy se vůbec nevolají', async () => {
    const volani = sluzby({ gemini: { 'gemini-3.5-flash': { ms: 40_000 }, 'gemini-flash-latest': { visi: true }, 'gemini-3.8-flash': { visi: true } } });
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(200);
    expect(json._provider).toBe('ocr+gemini');
    expect(json._zalozni).toBe(false);
    expect(json.items).toHaveLength(1);
    expect(trvalo).toBeLessThan(45_000);
    // Hlavní model a dvě náhradní verze vedle sebe; nic dalšího.
    expect(volani).toEqual(['ocr', 'gemini:gemini-3.5-flash', 'gemini:gemini-flash-latest', 'gemini:gemini-3.8-flash']);
  });

  it('stav ze 17. 11. (Gemini přetížený, náhradní verze mlčí): odpověď přijde do 58 s ze záložního čtení a je tak označená', async () => {
    const volani = sluzby(DEN_17_11);
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(200);
    expect(json._provider).toBe('ocr+mistral');
    expect(json._zalozni).toBe(true);
    expect(trvalo).toBeLessThanOrEqual(58_500);
    expect(trvalo).toBeGreaterThan(50_000); // do konce okna se čekalo na Gemini
    // Hlavní model se při přetížení zkusil třikrát (hned, po 3 s, po 8 s).
    expect(volani.filter((v) => v === 'gemini:gemini-3.5-flash')).toHaveLength(3);
    expect(volani).toContain('mistral:open-mistral-nemo');
    expect(volani).toContain('gemini:gemma-4-31b-it');
  });

  it('tentýž stav, čerstvá fotka z WhatsAppu („jen nejlepší čtení"): žádné slabší čtení, do 58 s odpověď „zkusí se znovu"', async () => {
    const volani = sluzby(DEN_17_11);
    const { status, json, trvalo } = await zavolej({ ...FOTKA, cteniFotky: 'nejlepsi' });
    expect(status).toBe(502);
    expect(json._docasne).toBe(true);
    expect(json.error).toMatch(/zkusí se to znovu/);
    expect(trvalo).toBeLessThanOrEqual(58_500);
    expect(volani.filter((v) => /^(groq|mistral|openrouter):/.test(v))).toEqual([]);
    expect(volani.filter((v) => /gemma|lite/.test(v))).toEqual([]);
    expect(json._provider_chyby.join('\n')).toMatch(/gemini gemini-3\.5-flash: HTTP 503/);
  });

  it('fotka, kterou Gemini nepřečetl ani po několika minutách („vše"): zálohy startují hned vedle něj a odpověď je tu do 58 s', async () => {
    const volani = sluzby(DEN_17_11);
    const { status, json, trvalo } = await zavolej({ ...FOTKA, cteniFotky: 'vse', kolo: 2 });
    expect(status).toBe(200);
    expect(json._provider).toBe('ocr+mistral');
    expect(json._zalozni).toBe(true);
    expect(trvalo).toBeLessThanOrEqual(58_500);
    // Mistral se volal dřív, než hlavní Gemini poprvé selhal.
    expect(volani.indexOf('mistral:mistral-medium-latest')).toBeLessThan(volani.lastIndexOf('gemini:gemini-3.5-flash'));
  });

  it('Gemini mlčí bez chyby (žádná ohlášená potíž) → zálohy se nevolají a do 58 s přijde „teď to nejde"', async () => {
    const volani = sluzby({ ...DEN_17_11, gemini: { ...DEN_17_11.gemini, 'gemini-3.5-flash': { visi: true } } });
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(502);
    expect(json._docasne).toBe(true);
    expect(trvalo).toBeLessThanOrEqual(58_500);
    expect(volani.filter((v) => /^(groq|mistral|openrouter):/.test(v))).toEqual([]);
  });

  it('volající dá míň času (maxMs) → čtení skončí v něm', async () => {
    sluzby(DEN_17_11);
    const { status, trvalo } = await zavolej({ ...FOTKA, cteniFotky: 'nejlepsi', maxMs: 45_000 });
    expect(status).toBe(502);
    expect(trvalo).toBeLessThanOrEqual(45_500);
  });

  it('další kolo čtení téže fotky zkusí jiné náhradní verze Gemini', async () => {
    const volani = sluzby({ ...DEN_17_11, gemini: { ...DEN_17_11.gemini, 'gemini-3.6-flash': { ms: 30_000 } } });
    const { status, json } = await zavolej({ ...FOTKA, cteniFotky: 'nejlepsi', kolo: 1 });
    expect(status).toBe(200);
    expect(json._provider).toBe('ocr+gemini:gemini-3.6-flash');
    expect(json._zalozni).toBe(false);
    expect(volani).toContain('gemini:gemini-3.7-flash');
    expect(volani).not.toContain('gemini:gemini-flash-latest');
  });

  it('náhradní verze odpoví dřív, ale hlavní model taky přečte → platí hlavní', async () => {
    sluzby({ gemini: { 'gemini-3.5-flash': { ms: 45_000 }, 'gemini-flash-latest': { ms: 20_000 }, 'gemini-3.8-flash': { visi: true } } });
    const { json, trvalo } = await zavolej(FOTKA);
    expect(json._provider).toBe('ocr+gemini');
    expect(trvalo).toBeLessThan(50_000);
  });

  it('hlavní model přetížený, náhradní verze přečte → platí náhradní a není to záložní čtení', async () => {
    sluzby({ ...DEN_17_11, gemini: { ...DEN_17_11.gemini, 'gemini-flash-latest': { ms: 35_000 } } });
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(200);
    expect(json._provider).toBe('ocr+gemini:gemini-flash-latest');
    expect(json._zalozni).toBe(false);
    // Hlavní model to zkouší do třetice (po 3 s a po 8 s), teprve pak platí náhradní.
    expect(trvalo).toBeLessThan(45_000);
  });

  it('nečte nikdo → 502 „teď to nejde" do 58 s (zpráva pak čeká na další pokus)', async () => {
    sluzby({ ...DEN_17_11, mistral: {}, groq: {}, openrouter: {} });
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(502);
    expect(json._docasne).toBe(true);
    expect(trvalo).toBeLessThanOrEqual(58_500);
  });

  it('textová zpráva: přečte ji lite verze Gemini za pár vteřin, bez přepisu fotky a bez záloh', async () => {
    const volani = sluzby({ gemini: { 'gemini-flash-lite-latest': { ms: 5_000 } } });
    const { status, json, trvalo } = await zavolej({ rawText: 'Sklad 2x30 12sv' });
    expect(status).toBe(200);
    expect(json._provider).toBe('gemini:gemini-flash-lite-latest');
    expect(json._zalozni).toBe(false);
    expect(trvalo).toBeLessThan(7_000);
    expect(volani).toEqual(['gemini:gemini-flash-lite-latest']);
  });

  it('textová zpráva, Gemini mimo provoz: přečte ji záloha (a u textu se neoznačuje jako záložní čtení fotky)', async () => {
    const mimo: Chovani = { ms: 500, status: 503 };
    const volani = sluzby({
      gemini: Object.fromEntries(NABIDKA.map((m) => [m, mimo])),
      groq: { 'openai/gpt-oss-120b': { ms: 4_000 } },
      mistral: DEN_17_11.mistral,
    });
    const { status, json, trvalo } = await zavolej({ rawText: 'Sklad 2x30 12sv' });
    expect(status).toBe(200);
    expect(json._provider).toBe('groq');
    expect(json._zalozni).toBe(false);
    expect(trvalo).toBeLessThan(15_000);
    expect(volani).not.toContain('ocr');
  });

  it('text: Gemini visí → zálohy se rozjedou v rezervě a odpověď přijde do 58 s', async () => {
    sluzby({ gemini: Object.fromEntries(NABIDKA.map((m) => [m, { visi: true }])), mistral: DEN_17_11.mistral });
    const { status, json, trvalo } = await zavolej({ rawText: 'Sklad 2x30 12sv' });
    expect(status).toBe(200);
    expect(json._provider).toBe('mistral');
    expect(trvalo).toBeLessThanOrEqual(58_500);
  });

  it('přepis fotky (OCR) neodpovídá: čtení pokračuje bez něj a pořád se vejde do času', async () => {
    const volani = sluzby({ ocrMs: 60_000, gemini: { 'gemini-3.5-flash': { ms: 30_000 }, 'gemini-flash-latest': { visi: true }, 'gemini-3.8-flash': { visi: true } } });
    const { status, json, trvalo } = await zavolej(FOTKA);
    expect(status).toBe(200);
    expect(json._provider).toBe('gemini'); // bez „ocr+"
    expect(trvalo).toBeLessThan(45_000);
    expect(volani[0]).toBe('ocr');
  });
});
