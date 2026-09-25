// Zadání 24. 9. 2026: „do obednavek pridej zaskrtavaci volbu bez zavozu,
// automaticky ji zaskrtni kdyz bude mates,jitka,restaurace,terasa u zbytku
// se musi zadat rucne."
import { describe, it, expect } from 'vitest';
import { jeAutomatickyBezZavozu } from './bezZavozu';

describe('jeAutomatickyBezZavozu', () => {
  it('zaškrtne se samo pro jmenované odběratele', () => {
    expect(jeAutomatickyBezZavozu('Mates')).toBe(true);
    expect(jeAutomatickyBezZavozu('Jitka')).toBe(true);
    expect(jeAutomatickyBezZavozu('Restaurace')).toBe(true);
    expect(jeAutomatickyBezZavozu('Terasa')).toBe(true);
  });

  it('nezávisí na velikosti písmen ani diakritice', () => {
    expect(jeAutomatickyBezZavozu('MATES')).toBe(true);
    expect(jeAutomatickyBezZavozu('restaurace')).toBe(true);
    expect(jeAutomatickyBezZavozu('  Terasa  ')).toBe(true);
  });

  // 🐛 Katalog má i „Restaurace Na Růžku" — skutečného odběratele s vlastním
  // závozem. Podřetězcová shoda by ho omylem zaškrtla jako bez závozu.
  it('podobné, ale JINÉ jméno se nezaškrtne — musí sedět přesně', () => {
    expect(jeAutomatickyBezZavozu('Restaurace Na Růžku')).toBe(false);
    expect(jeAutomatickyBezZavozu('U Matese')).toBe(false);
    expect(jeAutomatickyBezZavozu('Terasa Karlov')).toBe(false);
  });

  it('ostatní odběratelé se nezaškrtávají — musí se zadat ručně', () => {
    expect(jeAutomatickyBezZavozu('Lužec')).toBe(false);
    expect(jeAutomatickyBezZavozu('Seeberg')).toBe(false);
  });

  it('prázdné nebo chybějící jméno se nezaškrtne', () => {
    expect(jeAutomatickyBezZavozu('')).toBe(false);
    expect(jeAutomatickyBezZavozu(null)).toBe(false);
    expect(jeAutomatickyBezZavozu(undefined)).toBe(false);
  });
});
