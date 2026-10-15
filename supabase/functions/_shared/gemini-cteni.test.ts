import { describe, it, expect, vi, afterEach } from 'vitest';
import { ctiPresGemini, planPokusuFoto, planPokusuText } from './gemini-cteni';

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
