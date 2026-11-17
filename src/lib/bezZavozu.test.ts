// Zadání 24. 9. 2026: „do obednavek pridej zaskrtavaci volbu bez zavozu,
// automaticky ji zaskrtni kdyz bude mates,jitka,restaurace,terasa u zbytku
// se musi zadat rucne."
import { describe, it, expect } from 'vitest';
import { denZavozuProUlozeni, jeAutomatickyBezZavozu } from './bezZavozu';

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

// 16. 11. 2026: objednávka Restaurace bez vybraného dne se neodečetla ze skladu
// („nevidím ji v rozboru") — databáze jí dala až pátek příštího týdne.
describe('denZavozuProUlozeni', () => {
  it('bez závozu a bez vybraného dne: pivo odchází v den objednávky (den v týdnu i datum)', () => {
    expect(denZavozuProUlozeni({ bezZavozu: true, den: '', datum: '', datumObjednavky: '2026-11-16' })).toEqual({ den: 'po', datum: '2026-11-16' });
    expect(denZavozuProUlozeni({ bezZavozu: true, den: null, datum: undefined, datumObjednavky: '2026-11-15' })).toEqual({ den: 'ne', datum: '2026-11-15' });
    expect(denZavozuProUlozeni({ bezZavozu: true, den: '', datum: '', datumObjednavky: '2026-11-20' })).toEqual({ den: 'pa', datum: '2026-11-20' });
  });

  it('vybraný den nebo datum se nikdy nepřepisuje — ani u objednávky bez závozu', () => {
    expect(denZavozuProUlozeni({ bezZavozu: true, den: 'ut', datum: '2026-11-03', datumObjednavky: '2026-11-05' })).toEqual({ den: 'ut', datum: '2026-11-03' });
    expect(denZavozuProUlozeni({ bezZavozu: true, den: '', datum: '2026-10-30', datumObjednavky: '2026-11-02' })).toEqual({ den: null, datum: '2026-10-30' });
    expect(denZavozuProUlozeni({ bezZavozu: true, den: 'pa', datum: '', datumObjednavky: '2026-11-16' })).toEqual({ den: 'pa', datum: null });
  });

  it('objednávka se závozem bez dne zůstane bez dne — výchozí den doplní databáze podle odběratele', () => {
    expect(denZavozuProUlozeni({ bezZavozu: false, den: '', datum: '', datumObjednavky: '2026-11-16' })).toEqual({ den: null, datum: null });
    expect(denZavozuProUlozeni({ bezZavozu: false, den: 'st', datum: '2026-11-18', datumObjednavky: '2026-11-16' })).toEqual({ den: 'st', datum: '2026-11-18' });
  });

  it('neplatné datum objednávky nic nedomýšlí', () => {
    expect(denZavozuProUlozeni({ bezZavozu: true, den: '', datum: '', datumObjednavky: '' })).toEqual({ den: null, datum: null });
    expect(denZavozuProUlozeni({ bezZavozu: true, den: '', datum: '', datumObjednavky: '16. 11. 2026' })).toEqual({ den: null, datum: null });
  });
});
