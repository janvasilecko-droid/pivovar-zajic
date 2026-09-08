import { describe, it, expect } from 'vitest';
import { stavPolicka, tridyPolicka } from './polickoInventury';

describe('stavPolicka', () => {
  it('ve skladu něco je a nepočítalo se → šedé', () => {
    // Nejnebezpečnější kombinace: prázdné políčko se ve výpočtu chová jako
    // nula, takže by z nespočítané položky vyšlo manko rovné celému stavu.
    expect(stavPolicka('', 6)).toBe('nespocitano');
    expect(stavPolicka(undefined, 6)).toBe('nespocitano');
  });

  it('prázdný sklad i prázdné políčko → bez barvy', () => {
    expect(stavPolicka('', 0)).toBe('prazdne');
  });

  it('napočítáno sedí se skladem → zelené', () => {
    expect(stavPolicka('6', 6)).toBe('sedi');
    expect(stavPolicka(0, 0)).toBe('sedi');
  });

  it('napočítáno nesedí → červené', () => {
    expect(stavPolicka('5', 6)).toBe('nesedi');
    expect(stavPolicka('0', 6)).toBe('nesedi');
  });

  it('spočítaná nula proti prázdnému skladu je shoda, ne manko', () => {
    expect(stavPolicka('0', 0)).toBe('sedi');
  });

  it('desetinná čárka se bere jako tečka (načatý sud na půlky)', () => {
    expect(stavPolicka('2,5', 2.5)).toBe('sedi');
  });

  it('rozepsané číslo ještě nebliká červeně', () => {
    expect(stavPolicka('-', 6)).toBe('prazdne');
  });

  it('záporný sklad (evidence nesedí) proti nule je nesoulad', () => {
    expect(stavPolicka('0', -1)).toBe('nesedi');
  });
});

describe('tridyPolicka', () => {
  it('každý stav má vlastní barvu', () => {
    const barvy = (['nespocitano', 'sedi', 'nesedi', 'prazdne'] as const).map(tridyPolicka);
    expect(new Set(barvy).size).toBe(4);
  });
});
