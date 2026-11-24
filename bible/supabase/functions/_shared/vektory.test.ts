// @vitest-environment node
// Vektorové hledání (R38): vektor dotazu a spojení výsledků (RRF). Falešná síť — žádný skutečný klíč
// ani text knih (repo je veřejné).
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CAS_EMBEDDINGU_MS, embedderOpenAi, jePlatnyVektor, MAX_ZNAKU_DOTAZU, MODEL_VEKTORU, ROZMER_VEKTORU, rrf, RRF_K, spojHledani, URL_EMBEDDINGU, vektorText,
} from './vektory';

const vektor = (n = ROZMER_VEKTORU, prvni = 0.25) => Array.from({ length: n }, (_, i) => (i === 0 ? prvni : 0));
const odpoved = (telo: unknown, status = 200) => new Response(JSON.stringify(telo), { status, headers: { 'Content-Type': 'application/json' } });
const dobra = () => odpoved({ data: [{ embedding: vektor() }], usage: { prompt_tokens: 3, total_tokens: 3 } });

describe('konstanty držené s databází a workerem', () => {
  it('model, velikost vektoru, adresa a časový limit', () => {
    expect(MODEL_VEKTORU).toBe('text-embedding-3-large');
    expect(ROZMER_VEKTORU).toBe(1024);
    expect(URL_EMBEDDINGU).toBe('https://api.openai.com/v1/embeddings');
    expect(CAS_EMBEDDINGU_MS).toBe(4000);
    expect(MAX_ZNAKU_DOTAZU).toBe(2000);
    expect(RRF_K).toBe(60);
  });

  it('migrace má sloupec i parametr hledání halfvec(1024) a ceník stejného modelu', () => {
    const sql = readFileSync('bible/supabase/migrations/20261124000000_bible_vektory.sql', 'utf-8');
    expect(sql).toContain(`embedding extensions.halfvec(${ROZMER_VEKTORU}) NOT NULL`);
    expect(sql).toContain(`p_vektor extensions.halfvec(${ROZMER_VEKTORU})`);
    expect(sql).toContain(`"${MODEL_VEKTORU}": {"vstup": 0.13`);
  });
});

describe('vektor dotazu (embedder přes OpenAI)', () => {
  it('bez klíče žádný embedder — vektory se vůbec nezkoušejí', () => {
    for (const klic of [undefined, null, '', '   ']) expect(embedderOpenAi(klic)).toBeNull();
  });

  it('pošle model, velikost vektoru a oříznutý dotaz; klíč jde jen v hlavičce', async () => {
    const posli = vi.fn(async () => dobra());
    const v = await embedderOpenAi('  tajny-klic  ', { fetch: posli as unknown as typeof fetch })!('  pěna rychle padá  ');
    expect(v).toEqual(vektor());
    const [url, init] = posli.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_EMBEDDINGU);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer tajny-klic', 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({ model: MODEL_VEKTORU, input: 'pěna rychle padá', dimensions: ROZMER_VEKTORU, encoding_format: 'float' });
    expect(String(init.body)).not.toContain('tajny-klic');
  });

  it('dlouhý dotaz se zkrátí na 2000 znaků, prázdný síť nevolá', async () => {
    const posli = vi.fn(async () => dobra());
    const embed = embedderOpenAi('k', { fetch: posli as unknown as typeof fetch })!;
    await embed('x'.repeat(2500));
    expect(JSON.parse(String((posli.mock.calls[0] as unknown as [string, RequestInit])[1].body)).input).toHaveLength(2000);
    expect(await embed('   ')).toBeNull();
    expect(posli).toHaveBeenCalledTimes(1);
  });

  it('každá chyba je null, nikdy výjimka: stav 401/429/500, síť, rozbitá odpověď, špatný tvar vektoru', async () => {
    const spatne: (() => Promise<Response>)[] = [
      async () => odpoved({ error: { message: 'x' } }, 401),
      async () => odpoved({}, 429),
      async () => odpoved({}, 500),
      // stav mimo 2xx je chyba, i když tělo vypadá jako platný vektor
      async () => odpoved({ data: [{ embedding: vektor() }] }, 401),
      async () => odpoved({ data: [{ embedding: vektor() }] }, 429),
      async () => odpoved({ data: [{ embedding: vektor() }] }, 500),
      async () => { throw new Error('síť spadla'); },
      async () => new Response('není json', { status: 200 }),
      async () => odpoved({}),
      async () => odpoved({ data: [] }),
      async () => odpoved({ data: [{}] }),
      async () => odpoved({ data: [{ embedding: vektor(ROZMER_VEKTORU - 1) }] }),
      async () => odpoved({ data: [{ embedding: vektor(ROZMER_VEKTORU + 1) }] }),
      async () => odpoved({ data: [{ embedding: [...vektor(ROZMER_VEKTORU - 1), 'a'] }] }),
      async () => odpoved({ data: [{ embedding: [...vektor(ROZMER_VEKTORU - 1), null] }] }),
    ];
    for (const [i, f] of spatne.entries()) {
      expect(await embedderOpenAi('k', { fetch: vi.fn(f) as unknown as typeof fetch })!('pěna'), `případ ${i}`).toBeNull();
    }
  });

  it('pomalá odpověď po uplynutí času přeruší a vrátí null (hledá se jen podle slov)', async () => {
    const pomala = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_ok, ko) => {
      init.signal?.addEventListener('abort', () => ko(new Error('přerušeno')));
    }));
    const zacatek = Date.now();
    expect(await embedderOpenAi('k', { fetch: pomala as unknown as typeof fetch, casMs: 30 })!('pěna')).toBeNull();
    expect(Date.now() - zacatek).toBeLessThan(2000);
  });

  it('po odpovědi se časový limit zruší — nezůstane běžet časovač', async () => {
    vi.useFakeTimers();
    try {
      const posli = vi.fn(async () => dobra());
      expect(await embedderOpenAi('k', { fetch: posli as unknown as typeof fetch })!('pěna')).toEqual(vektor());
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('klíč ani text chyby se nikam nepíše', async () => {
    const hlasi = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error')];
    const posli = vi.fn(async () => { throw new Error('chyba s tajny-klic uvnitř'); });
    expect(await embedderOpenAi('tajny-klic', { fetch: posli as unknown as typeof fetch })!('pěna')).toBeNull();
    for (const h of hlasi) { expect(h).not.toHaveBeenCalled(); h.mockRestore(); }
  });
});

describe('vektor jako text pro databázi', () => {
  it('tvar „[a,b,…]“ bez mezer, právě 1024 čísel', () => {
    const t = vektorText(vektor());
    expect(t.startsWith('[0.25,0,0,')).toBe(true);
    expect(t.endsWith(',0]')).toBe(true);
    expect(t).not.toContain(' ');
    expect(t.slice(1, -1).split(',')).toHaveLength(ROZMER_VEKTORU);
  });

  it('čísla se zaokrouhlí na 7 platných číslic a malá zůstanou v exponentu (PostgreSQL je přijme)', () => {
    const v = vektor();
    v[1] = 0.123456789012; v[2] = 1e-9; v[3] = -0.5;
    const casti = vektorText(v).slice(1, -1).split(',');
    expect(casti.slice(1, 4)).toEqual(['0.1234568', '1e-9', '-0.5']);
  });

  it('neplatný vektor je chyba (do SQL se nikdy nedostane)', () => {
    for (const v of [[], [1, 2, 3], vektor(ROZMER_VEKTORU + 1), [...vektor(ROZMER_VEKTORU - 1), Number.NaN], [...vektor(ROZMER_VEKTORU - 1), Infinity]]) {
      expect(() => vektorText(v as number[])).toThrow(/1024 konečných čísel/);
    }
    expect(jePlatnyVektor(vektor())).toBe(true);
    expect(jePlatnyVektor('[1,2]')).toBe(false);
  });
});

describe('RRF — spojení pořadí', () => {
  const id = (x: { k: string }) => x.k;
  const p = (k: string, z = 'a') => ({ k, z });

  it('kdo je v obou seznamech, předběhne ty, kdo jsou jen v jednom; shody zůstanou v pořadí prvního výskytu', () => {
    const vysl = rrf([[p('A'), p('B'), p('C')], [p('D'), p('B'), p('E')]], id).map((x) => x.k);
    expect(vysl).toEqual(['B', 'A', 'D', 'C', 'E']);
  });

  it('skóre je 1 / (k + pořadí od jedničky): dvě 61. místa (2/121) předběhnou jedno 1. místo (1/61)', () => {
    const vyplne = (pocet: number, predpona: string) => Array.from({ length: pocet }, (_, i) => p(`${predpona}${i}`));
    const prvni = [p('B'), ...vyplne(59, 'f'), p('A')]; // B je 1., A 61.
    const druhy = [...vyplne(60, 'g'), p('A')]; // A je 61.
    // k = 60: A = 2/121 ≈ 0,016529 > B = g0 = 1/61 ≈ 0,016393 (B před g0, protože byl viděn dřív)
    expect(rrf([prvni, druhy], id, 60).map((x) => x.k).slice(0, 3)).toEqual(['A', 'B', 'g0']);
  });

  it('shodné součty zůstanou v pořadí prvního výskytu: první seznam před druhým', () => {
    // X i Y mají 1. a 2. místo (pokaždé naopak) → stejný součet
    expect(rrf([[p('X'), p('Y')], [p('Y'), p('X')]], id).map((x) => x.k)).toEqual(['X', 'Y']);
    expect(rrf([[p('Y'), p('X')], [p('X'), p('Y')]], id).map((x) => x.k)).toEqual(['Y', 'X']);
  });

  it('vrací se první výskyt (řádek z prvního seznamu)', () => {
    const vysl = rrf([[p('X', 'slova')], [p('X', 'vyznam')]], id);
    expect(vysl).toEqual([{ k: 'X', z: 'slova' }]);
  });

  it('stejná položka se v jednom seznamu počítá jen jednou', () => {
    expect(rrf([[p('A'), p('A'), p('A'), p('B')]], id).map((x) => x.k)).toEqual(['A', 'B']);
    // A třikrát v jednom seznamu nepředběhne B, které je ve dvou seznamech
    expect(rrf([[p('A'), p('A'), p('A'), p('B')], [p('B')]], id).map((x) => x.k)).toEqual(['B', 'A']);
  });

  it('limit a prázdné seznamy', () => {
    expect(rrf([[p('A'), p('B'), p('C')]], id, RRF_K, 2).map((x) => x.k)).toEqual(['A', 'B']);
    expect(rrf([], id)).toEqual([]);
    expect(rrf([[], []], id)).toEqual([]);
  });

  it('jen jeden neprázdný seznam zachová jeho pořadí', () => {
    expect(rrf([[], [p('A'), p('B'), p('C')]], id).map((x) => x.k)).toEqual(['A', 'B', 'C']);
  });
});

describe('spojení hledání podle slov a podle významu', () => {
  const D1 = '11111111-1111-4111-8111-111111111111';
  const D2 = '22222222-2222-4222-8222-222222222222';
  const r = (dokument_id: string, pdf_index: number, zdroj = 'original', extra: Record<string, unknown> = {}) => ({ dokument_id, pdf_index, zdroj, ...extra });

  it('stránka nalezená oběma způsoby je první a drží řádek z hledání podle slov (má shodu slov)', () => {
    const vysl = spojHledani(
      [r(D1, 5, 'original', { shoda: 2 }), r(D1, 7, 'preklad')],
      [r(D2, 1), r(D1, 5, 'original')], 10,
    );
    expect(vysl.map((x) => `${x.dokument_id === D1 ? 'D1' : 'D2'}:${x.pdf_index}:${x.zdroj}`)).toEqual(['D1:5:original', 'D2:1:original', 'D1:7:preklad']); // 1/61 + 1/62, pak 1/61 (první podle významu), pak 1/62
    expect(vysl[0]).toMatchObject({ shoda: 2 });
  });

  it('originál a překlad téže strany zůstávají dvě místa; limit platí', () => {
    const vysl = spojHledani([r(D1, 5, 'original')], [r(D1, 5, 'preklad'), r(D2, 2)], 2);
    expect(vysl).toHaveLength(2);
    expect(spojHledani([r(D1, 5, 'original')], [r(D1, 5, 'preklad')], 10)).toHaveLength(2);
  });

  it('bez výsledků hledání podle slov zůstanou výsledky podle významu v jejich pořadí', () => {
    expect(spojHledani([], [r(D2, 9), r(D1, 3)], 10).map((x) => x.pdf_index)).toEqual([9, 3]);
  });
});
