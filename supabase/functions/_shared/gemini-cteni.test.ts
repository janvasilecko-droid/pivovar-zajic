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
