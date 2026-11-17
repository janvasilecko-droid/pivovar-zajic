import { describe, it, expect, vi, afterEach } from 'vitest';
import { ctiPresGemini, jineFlashVerze, planPokusuFoto, planPokusuText, planyFotky } from './gemini-cteni';

describe('Plán čtení fotky přes Gemini (zdarma, víc pokusů)', () => {
  it('hlavní model, pauza, jiná flash verze, delší pauza, Gemma', () => {
    const plan = planPokusuFoto(['gemini-3.5-flash', 'gemini-3.0-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-image', 'gemma-3-27b-it']);
    expect(plan.map((p) => `${p.model}${p.pauzaMs ? `+${p.pauzaMs}` : ''}${p.json ? '' : ' (bez JSON)'}`)).toEqual([
      'gemini-3.5-flash', 'gemini-3.5-flash+3000', 'gemini-3.0-flash', 'gemini-3.5-flash+8000', 'gemma-3-27b-it (bez JSON)',
      'gemini-3.5-flash-lite',
    ]);
  });
  it('bez seznamu modelů: hlavní model a Gemma', () => {
    expect(planPokusuFoto(null).map((p) => p.model)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash', 'gemma-3-27b-it']);
  });
  it('text: hlavní model a další flash verze bez pauz', () => {
    expect(planPokusuText()).toHaveLength(1);
    expect(planPokusuText(['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemma-4-31b-it']).map((p) => p.model))
      .toEqual(['gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-3.5-flash', 'gemini-flash-latest']);
  });
});

describe('Gemma podle nabídky klíče', () => {
  it('bez 27B vezme největší Gemmu s obrazem, 1B ne', () => {
    const plan = planPokusuFoto(['gemini-3.5-flash', 'gemma-3-1b-it', 'gemma-3-12b-it', 'gemma-3-4b-it']);
    expect(plan[plan.length - 1].model).toBe('gemma-3-12b-it');
  });
  it('bez Gemmy v nabídce žádná Gemma', () => {
    expect(planPokusuFoto(['gemini-3.5-flash']).some((p) => p.model.startsWith('gemma'))).toBe(false);
  });
});

describe('Skutečná nabídka klíče 12. 10. 2026', () => {
  it('po vyčerpaném 3.5-flash zkusí flash-latest, 2.5-flash a Gemmu 4', () => {
    const plan = planPokusuFoto(['gemini-2.5-flash', 'gemini-2.5-flash-preview-tts', 'gemma-4-26b-a4b-it', 'gemma-4-31b-it',
      'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash-image', 'gemini-3.5-flash']);
    expect(plan.map((p) => p.model)).toEqual([
      'gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemma-4-31b-it',
      'gemini-flash-lite-latest',
    ]);
  });
});

describe('ctiPresGemini — extra nastavení generování (vypnuté přemýšlení)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const odpoved = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
  const volej = (plan: { model: string; json: boolean; pauzaMs: number }[], extra?: Record<string, unknown>) => {
    const chyby: string[] = [];
    return ctiPresGemini({
      klic: 'k', plan, parts: [{ text: 'x' }], timeoutMs: 10_000, zbyvaMs: () => 100_000,
      prijmi: (_m, c) => (c.includes('{') ? c : ''), chyby, extra,
    }).then((text) => ({ text, chyby }));
  };
  const tela = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse(c[1].body).generationConfig);

  it('bez extra se nastavení nemění', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(odpoved('{"a":1}')));
    vi.stubGlobal('fetch', f);
    const { text } = await volej([{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }]);
    expect(text).toBe('{"a":1}');
    expect(tela(f)).toEqual([{ temperature: 0.1, responseMimeType: 'application/json' }]);
  });

  it('s extra dostane model s JSON režimem navíc to nastavení', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(odpoved('{"a":1}')));
    vi.stubGlobal('fetch', f);
    await volej([{ model: 'gemini-flash-latest', json: true, pauzaMs: 0 }], { thinkingConfig: { thinkingBudget: 0 } });
    expect(tela(f)).toEqual([{ temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } }]);
  });

  it('model, který extra odmítne (400), se zkusí ještě jednou bez něj — pokus nepropadne', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"message":"Request contains an invalid argument."}}', { status: 400 }))
      .mockResolvedValueOnce(odpoved('{"b":2}'));
    vi.stubGlobal('fetch', f);
    const { text } = await volej([{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }], { thinkingConfig: { thinkingBudget: 0 } });
    expect(text).toBe('{"b":2}');
    expect(tela(f)).toEqual([
      { temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      { temperature: 0.1, responseMimeType: 'application/json' },
    ]);
  });

  it('400 i bez extra u hlavního modelu čtení ukončí jako dřív (špatný požadavek se nespraví)', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"error":{}}', { status: 400 })));
    vi.stubGlobal('fetch', f);
    const { text } = await volej([
      { model: 'gemini-3.5-flash', json: true, pauzaMs: 0 },
      { model: 'gemini-flash-latest', json: true, pauzaMs: 0 },
    ], { thinkingConfig: { thinkingBudget: 0 } });
    expect(text).toBe('');
    expect(f).toHaveBeenCalledTimes(2); // s extra a bez něj, pak konec — druhý model se nezkouší
  });

  it('model bez JSON režimu (Gemma) extra nedostane', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(odpoved('{"a":1}')));
    vi.stubGlobal('fetch', f);
    await volej([{ model: 'gemma-3-27b-it', json: false, pauzaMs: 0 }], { thinkingConfig: { thinkingBudget: 0 } });
    expect(tela(f)).toEqual([{ temperature: 0.1 }]);
  });

  it('přetížený model (503) se bere jako dřív — další model v plánu, extra se kvůli tomu neruší', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 }))
      .mockResolvedValueOnce(odpoved('{"c":3}'));
    vi.stubGlobal('fetch', f);
    const { text } = await volej([
      { model: 'gemini-3.5-flash', json: true, pauzaMs: 0 },
      { model: 'gemini-flash-latest', json: true, pauzaMs: 0 },
    ], { thinkingConfig: { thinkingBudget: 0 } });
    expect(text).toBe('{"c":3}');
    expect(tela(f)[1]).toMatchObject({ thinkingConfig: { thinkingBudget: 0 } });
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('Plány pro čtení fotky víc modely najednou (17. 11. 2026 — čtení se musí vejít do 75 s)', () => {
  // Skutečná nabídka klíče 17. 11. 2026 (zkráceno o tts/live/image varianty, které plán stejně nebere).
  const NABIDKA = ['gemini-2.5-flash', 'gemma-4-26b-a4b-it', 'gemma-4-31b-it', 'gemini-flash-latest', 'gemini-flash-lite-latest',
    'gemini-2.5-flash-lite', 'gemini-2.5-flash-image', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite', 'gemini-3.5-flash',
    'gemini-3.5-flash-lite', 'gemini-omni-1.2-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-tts'];
  const modely = (p: { model: string }[]) => p.map((x) => x.model);

  it('jiné plné flash verze: flash-latest první, pak od nejnovější; lite, image, tts, preview a omni ne', () => {
    expect(jineFlashVerze(NABIDKA)).toEqual(['gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-2.5-flash']);
    expect(jineFlashVerze(null)).toEqual([]);
  });

  it('hlavní model třikrát (hned, po 3 s, po 8 s), dvě náhradní verze jako vlastní dráhy, slabší čtení zvlášť', () => {
    const p = planyFotky(NABIDKA);
    expect(p.hlavni).toEqual([
      { model: 'gemini-3.5-flash', json: true, pauzaMs: 0 },
      { model: 'gemini-3.5-flash', json: true, pauzaMs: 3_000 },
      { model: 'gemini-3.5-flash', json: true, pauzaMs: 8_000 },
    ]);
    expect(p.nahradni).toEqual([
      [{ model: 'gemini-flash-latest', json: true, pauzaMs: 0 }],
      [{ model: 'gemini-3.8-flash', json: true, pauzaMs: 0 }],
    ]);
    expect(p.slabsi).toEqual([
      { model: 'gemma-4-31b-it', json: false, pauzaMs: 0 },
      { model: 'gemini-flash-lite-latest', json: true, pauzaMs: 0 },
    ]);
  });

  it('další kolo čtení téže fotky zkusí jiné náhradní verze (když minulé neodpověděly)', () => {
    const dvojice = (kolo: number) => planyFotky(NABIDKA, kolo).nahradni.map((d) => d[0].model);
    expect(dvojice(0)).toEqual(['gemini-flash-latest', 'gemini-3.8-flash']);
    expect(dvojice(1)).toEqual(['gemini-3.7-flash', 'gemini-3.6-flash']);
    expect(dvojice(2)).toEqual(['gemini-2.5-flash', 'gemini-flash-latest']);
    expect(dvojice(3)).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash']);
    // Nesmyslné kolo (záporné, necelé) nic nerozbije.
    expect(dvojice(-4)).toEqual(dvojice(0));
    expect(dvojice(1.9)).toEqual(dvojice(1));
  });

  it('jen dvě (nebo míň) náhradní verze: berou se vždy všechny, střídat není co', () => {
    const malo = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemma-3-27b-it'];
    expect(planyFotky(malo, 5).nahradni.map((d) => d[0].model)).toEqual(['gemini-flash-latest', 'gemini-2.5-flash']);
    expect(planyFotky(['gemini-3.5-flash'], 3).nahradni).toEqual([]);
  });

  it('bez seznamu modelů: hlavní model a Gemma, žádné náhradní verze', () => {
    const p = planyFotky(null);
    expect(modely(p.hlavni)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash']);
    expect(p.nahradni).toEqual([]);
    expect(modely(p.slabsi)).toEqual(['gemma-3-27b-it']);
  });

  it('žádný model se neztratí ani nezdvojí proti dosavadnímu plánu', () => {
    const p = planyFotky(NABIDKA);
    const vsechny = [...modely(p.hlavni), ...p.nahradni.flatMap(modely), ...modely(p.slabsi)].sort();
    expect(vsechny).toEqual(modely(planPokusuFoto(NABIDKA)).sort());
  });
});

describe('ctiPresGemini — zrušení zvenku (čtení vyhrála jiná dráha)', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  const odpoved = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

  it('zrušení během volání: plán skončí, další model se nezkouší a nic se nehlásí jako chyba', async () => {
    const zrus = new AbortController();
    const f = vi.fn().mockImplementation((_url: string, init: { signal: AbortSignal }) => new Promise((_ok, chyba) => {
      init.signal.addEventListener('abort', () => chyba(init.signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', f);
    const chyby: string[] = [];
    const slib = ctiPresGemini({
      klic: 'k', parts: [{ text: 'x' }], timeoutMs: 10_000, zbyvaMs: () => 100_000, chyby, zrus: zrus.signal,
      plan: [{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }, { model: 'gemini-flash-latest', json: true, pauzaMs: 0 }],
      prijmi: (_m, c) => c,
    });
    await Promise.resolve();
    zrus.abort();
    expect(await slib).toBe('');
    expect(f).toHaveBeenCalledTimes(1);
    expect(chyby).toEqual([]);
  });

  it('zrušení během pauzy před dalším pokusem: pauza skončí hned a další pokus se nepošle', async () => {
    vi.useFakeTimers();
    const zrus = new AbortController();
    const f = vi.fn().mockImplementation(() => Promise.resolve(new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 })));
    vi.stubGlobal('fetch', f);
    const slib = ctiPresGemini({
      klic: 'k', parts: [{ text: 'x' }], timeoutMs: 10_000, zbyvaMs: () => 100_000, chyby: [], zrus: zrus.signal,
      plan: [{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }, { model: 'gemini-3.5-flash', json: true, pauzaMs: 8_000 }],
      prijmi: (_m, c) => c,
    });
    await vi.advanceTimersByTimeAsync(1_000);
    zrus.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(await slib).toBe('');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('už zrušené čtení nepošle nic', async () => {
    const f = vi.fn().mockImplementation(() => Promise.resolve(odpoved('{"a":1}')));
    vi.stubGlobal('fetch', f);
    const zrus = new AbortController();
    zrus.abort();
    const text = await ctiPresGemini({
      klic: 'k', parts: [{ text: 'x' }], timeoutMs: 10_000, zbyvaMs: () => 100_000, chyby: [], zrus: zrus.signal,
      plan: [{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }], prijmi: (_m, c) => c,
    });
    expect(text).toBe('');
    expect(f).not.toHaveBeenCalled();
  });

  it('bez zrušení se přetížený hlavní model po pauze zkusí znovu (jako dřív)', async () => {
    vi.useFakeTimers();
    const f = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":{"status":"UNAVAILABLE"}}', { status: 503 }))
      .mockResolvedValueOnce(odpoved('{"ok":1}'));
    vi.stubGlobal('fetch', f);
    const slib = ctiPresGemini({
      klic: 'k', parts: [{ text: 'x' }], timeoutMs: 10_000, zbyvaMs: () => 100_000, chyby: [],
      plan: [{ model: 'gemini-3.5-flash', json: true, pauzaMs: 0 }, { model: 'gemini-3.5-flash', json: true, pauzaMs: 3_000 }],
      prijmi: (_m, c) => c,
    });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(await slib).toBe('{"ok":1}');
    expect(f).toHaveBeenCalledTimes(2);
  });
});
