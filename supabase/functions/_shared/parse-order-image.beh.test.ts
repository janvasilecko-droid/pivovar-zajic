// @vitest-environment node
// Celý běh funkce parse-order-image („Načíst z fotky" v appce, tabulka stáčení)
// s napodobeným Gemini a přepisem fotky — hlídá, že se čtení vejde do času,
// který server jednomu volání dá (viz cas-cteni.ts). Do 17. 11. 2026 se
// počítalo se 140 s a přetížený Gemini čtení protáhl až k HTTP 546.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Chovani = { ms?: number; status?: number; text?: string; visi?: boolean };

const TAJNE = 'tajny-cron';
const JSON_OK = JSON.stringify({ items: [{ quantity: 2, degree: '12°', beer_name: '12° Světlá', package_label: 'KEG 30l', raw_line: '2x 30l 12° sv', place_name: 'Sklad' }], place_name: 'Sklad', raw_text: 'SKLAD\n2x 30l 12° sv' });
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
      from: () => dotaz(['GEMINI_API_KEY', 'GOOGLE_VISION_API_KEY'].map((key) => ({ key, value: `klic-${key}` })), { value: 'tajny-cron' }),
      rpc: () => Promise.resolve({ data: 15, error: null }),
    }),
  };
});

let obsluha: (req: Request) => Promise<Response>;
const napodobDeno = () => vi.stubGlobal('Deno', {
  env: { get: () => 'https://projekt.supabase.co' },
  serve: (h: (req: Request) => Promise<Response>) => { obsluha = h; },
});
beforeAll(async () => {
  napodobDeno();
  await import('../parse-order-image/index.ts');
});

/** Napodobený Gemini a přepis fotky. `gemini(model, sFotkou)` říká, jak model odpoví. */
/** Těla požadavků poslaných Gemini (tedy i celý pokyn) — plní se v `sluzby`. */
const pokyny: string[] = [];

function sluzby(gemini: (model: string, sFotkou: boolean) => Chovani | undefined, ocrMs = 3_000) {
  const volani: string[] = [];
  pokyny.length = 0;
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
  vi.stubGlobal('fetch', (url: string, init: { signal?: AbortSignal; body?: string } = {}) => {
    const u = String(url);
    if (u.includes('vision.googleapis.com')) {
      volani.push('ocr');
      return odpovez({ ms: ocrMs }, init.signal, () => ({ responses: [{ fullTextAnnotation: { text: 'SKLAD\n2x 30l 12° sv' } }] }));
    }
    if (u.includes('/models?')) return odpovez({ ms: 300 }, init.signal, () => ({ models: NABIDKA.map((m) => ({ name: `models/${m}` })) }));
    const model = u.match(/models\/([^:]+):generateContent/)![1];
    const sFotkou = (init.body ?? '').includes('inline_data');
    volani.push(`${model}${sFotkou ? '' : ' (z přepisu)'}`);
    pokyny.push(init.body ?? '');
    return odpovez(gemini(model, sFotkou), init.signal, (text) => ({ candidates: [{ content: { parts: [{ text }] } }] }));
  });
  return volani;
}

const PRETIZENY: Chovani = { ms: 1_200, status: 503, text: 'This model is currently experiencing high demand.' };

describe('parse-order-image: čtení fotky v appce se vejde do času serveru', () => {
  let start = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    start = Date.now();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const c = new AbortController();
      setTimeout(() => c.abort(new DOMException('čas vypršel', 'TimeoutError')), ms);
      return c.signal;
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); napodobDeno(); });

  const zavolej = async (telo: Record<string, unknown> = {}) => {
    const slib = obsluha(new Request('https://projekt.supabase.co/functions/v1/parse-order-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Cron-Secret': TAJNE },
      body: JSON.stringify({
        imageBase64: 'AAAA', imageMimeType: 'image/jpeg',
        beers: [{ id: 'b1', name: '12° Světlá', degree: '12°' }], packages: [{ id: 'p1', label: '30l' }], places: ['Sklad'],
        ...telo,
      }),
    }));
    let trvalo = -1;
    void slib.then(() => { trvalo = Date.now() - start; });
    await vi.runAllTimersAsync();
    const odpoved = await slib;
    return { status: odpoved.status, json: await odpoved.json(), trvalo };
  };

  it('Gemini v pořádku: přečte hlavní model, slabší čtení se nevolá', async () => {
    const volani = sluzby((model) => (model === 'gemini-3.5-flash' ? { ms: 40_000 } : { visi: true }));
    const { status, json, trvalo } = await zavolej();
    expect(status).toBe(200);
    expect(json.items).toHaveLength(1);
    expect(json._zalozni).toBe(false);
    expect(trvalo).toBeLessThan(45_000);
    expect(volani).toEqual(['ocr', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-3.8-flash']);
  });

  it('Gemini přetížený a náhradní verze mlčí: do 58 s přečte záloha z přepisu a je tak označená', async () => {
    const volani = sluzby((model, sFotkou) => {
      if (model === 'gemini-3.5-flash') return PRETIZENY;
      if (!sFotkou && model === 'gemini-flash-lite-latest') return { ms: 9_000 };
      return { visi: true };
    });
    const { status, json, trvalo } = await zavolej();
    expect(status).toBe(200);
    expect(json._zalozni).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(trvalo).toBeLessThanOrEqual(58_500);
    expect(volani.filter((v) => v === 'gemini-3.5-flash')).toHaveLength(3);
    expect(volani).toContain('gemini-flash-lite-latest (z přepisu)');
  });

  it('nečte nikdo: do 58 s přijde „zkus to za chvíli znovu" (dřív se čekalo až 140 s a server volání ukončil)', async () => {
    sluzby((model) => (model === 'gemini-3.5-flash' ? PRETIZENY : { visi: true }));
    const { status, json, trvalo } = await zavolej();
    expect(status).toBe(502);
    expect(json.error).toMatch(/zkus to za chvíli znovu/);
    expect(trvalo).toBeLessThanOrEqual(58_500);
  });

  it('náhradní verze přečte, když je hlavní model přetížený — a není to záložní čtení', async () => {
    sluzby((model) => (model === 'gemini-3.5-flash' ? PRETIZENY : model === 'gemini-3.8-flash' ? { ms: 30_000 } : { visi: true }));
    const { status, json, trvalo } = await zavolej();
    expect(status).toBe(200);
    expect(json._zalozni).toBe(false);
    expect(trvalo).toBeLessThanOrEqual(58_500);
  });

  it('tabulka stáčení: přečte hlavní model s vypnutým přemýšlením; když nečte nikdo, do 58 s přijde chyba', async () => {
    const TABULKA = JSON.stringify({ radky: [{ radek: 1, datum: '3.11.', pivo: '12° Světlá', sudy: { '50': 5 }, lahve: null }] });
    const tela: string[] = [];
    const volani = sluzby((model) => (model === 'gemini-3.5-flash' ? { ms: 8_000, text: TABULKA } : { visi: true }));
    const puvodniFetch = globalThis.fetch;
    vi.stubGlobal('fetch', (url: string, init: { body?: string }) => {
      if (String(url).includes(':generateContent')) tela.push(init.body ?? '');
      return puvodniFetch(url, init as RequestInit);
    });
    const dobre = await zavolej({ rezim: 'tabulka', odData: '2026-11-01' });
    expect(dobre.status).toBe(200);
    expect(Array.isArray(dobre.json.tabulka.radky)).toBe(true); // co z řádků vyjde, hlídá tabulka-staceni.test.ts
    expect(dobre.trvalo).toBeLessThan(12_000);
    expect(volani).toContain('gemini-3.5-flash');
    expect(JSON.parse(tela[0]).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });

    start = Date.now();
    sluzby(() => ({ visi: true }));
    const spatne = await zavolej({ rezim: 'tabulka', odData: '2026-11-01' });
    expect(spatne.status).toBe(502);
    expect(spatne.trvalo).toBeLessThanOrEqual(58_500);
  });

  // 23. 11. 2026: potichu naučené zkratky („30l → 1l") se do pokynu neposílají,
  // ani když je pošle starší verze appky — viz parse-order-text.beh.test.ts.
  it('„naučené zkratky" z těla požadavku se do pokynu pro AI nedostanou', async () => {
    sluzby((model) => (model === 'gemini-3.5-flash' ? { ms: 2_000 } : { visi: true }));
    const { status } = await zavolej({
      aliases: [
        { alias_text: '30l', beer_name: null, package_label: 'PET 1l' },
        { alias_text: 'hazy spring day', beer_name: 'winter', package_label: null },
      ],
    });
    expect(status).toBe(200);
    expect(pokyny.length).toBeGreaterThan(0);
    const pokyn = pokyny.join('\n');
    expect(pokyn).not.toContain('→ PET 1l');
    expect(pokyn).not.toContain('hazy spring day');
    expect(pokyn).toContain('(žádné naučené zkratky zatím)');
  });

  // 🧠 Opravy, které uživatel výslovně potvrdil („Naučit"), do pokynu jdou —
  // s odběratelem, u kterého vznikly.
  it('naučené opravy (`opravy`) se do pokynu pro AI dostanou jako příklady s odběratelem', async () => {
    sluzby((model) => (model === 'gemini-3.5-flash' ? { ms: 2_000 } : { visi: true }));
    const { status } = await zavolej({
      opravy: [
        { odberatel: 'Lužec', radek: '5 beden světlého', pivo: null, obal: 'Lahve 0.33l' },
        { odberatel: 'Lužec', radek: 'Tm: 2x30l', pivo: '12° Tmavá', obal: null },
      ],
    });
    expect(status).toBe(200);
    const pokyn = pokyny.join('\n');
    expect(pokyn).toContain('[Lužec]');
    expect(pokyn).toContain('5 beden světlého');
    expect(pokyn).toContain('→ Lahve 0.33l');
    expect(pokyn).toContain('→ 12° Tmavá');
    expect(pokyn).not.toContain('(žádné naučené zkratky zatím)');
  });
});
