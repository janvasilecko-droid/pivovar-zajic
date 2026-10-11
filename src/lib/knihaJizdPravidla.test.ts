import { describe, expect, it } from 'vitest';
import { jeMimoKnihuJizd, priplatekDne, velkeMestoZastavky, PRIPLATEK_MESTO_KM } from './knihaJizdPravidla';

describe('Kniha jízd — pravidla', () => {
  it('Matěs, Petr a Restaurace se do knihy nepočítají, jen přesným názvem', () => {
    expect(jeMimoKnihuJizd('Matěs')).toBe(true);
    expect(jeMimoKnihuJizd(' petr ')).toBe(true);
    expect(jeMimoKnihuJizd('Restaurace')).toBe(true);
    expect(jeMimoKnihuJizd('Restaurace Na Růžku')).toBe(false);
    expect(jeMimoKnihuJizd('Petr Moravčík prodejna')).toBe(false);
    expect(jeMimoKnihuJizd(null)).toBe(false);
  });

  it('+30 km za každou zastávku ve velkém městě (adresa i název, různé pády)', () => {
    expect(PRIPLATEK_MESTO_KM).toBe(30);
    expect(velkeMestoZastavky('U Zajíce', 'Vinohradská 12, Praha 2')).toBe('Praha');
    expect(velkeMestoZastavky('Hospoda', 'Náměstí 1, Hradec Králové')).toBe('Hradec Králové');
    expect(velkeMestoZastavky('Pivnice v Praze', null)).toBe('Praha');
    expect(velkeMestoZastavky('Sokolov bar', 'Sokolov')).toBeNull();
    expect(priplatekDne([
      { name: 'A', address: 'Praha 4' }, { name: 'B', address: 'Praha 1' }, { name: 'C', address: 'Cheb' }, { name: 'D', address: 'Hradec Králové' },
    ])).toEqual({ km: 90, mesta: ['Praha', 'Hradec Králové'] });
    expect(priplatekDne([{ name: 'C', address: 'Cheb' }])).toEqual({ km: 0, mesta: [] });
  });
});
