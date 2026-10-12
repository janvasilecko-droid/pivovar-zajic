import { describe, it, expect } from 'vitest';
import { planPokusuFoto, planPokusuText } from './gemini-cteni';

describe('Plán čtení fotky přes Gemini (zdarma, víc pokusů)', () => {
  it('hlavní model, pauza, jiná flash verze, delší pauza, Gemma', () => {
    const plan = planPokusuFoto(['gemini-3.5-flash', 'gemini-3.0-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash-image', 'gemma-3-27b-it']);
    expect(plan.map((p) => `${p.model}${p.pauzaMs ? `+${p.pauzaMs}` : ''}${p.json ? '' : ' (bez JSON)'}`)).toEqual([
      'gemini-3.5-flash', 'gemini-3.5-flash+3000', 'gemini-3.0-flash', 'gemini-3.5-flash+8000', 'gemma-3-27b-it (bez JSON)',
    ]);
  });
  it('bez seznamu modelů: hlavní model a Gemma', () => {
    expect(planPokusuFoto(null).map((p) => p.model)).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash', 'gemini-3.5-flash', 'gemma-3-27b-it']);
  });
  it('text jen jedním pokusem jako dřív', () => {
    expect(planPokusuText()).toHaveLength(1);
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
    ]);
  });
});
