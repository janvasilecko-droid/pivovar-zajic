import { describe, it, expect } from 'vitest';
import { bezSuduOdberatele, doSuduOdberatele, doSuduOdberatelePolozky, vlastniSudyOdberatele } from './vlastniSudy';

// 27. 10. 2026, majitel: „ať se vymaže do vlastních sudů, prostě vše do sudů
// stejných." Dřívější odběratelé s vlastními sudy (Michal Fojtovice, Martin
// u malých, Duck and Dog do 20. 10.) i poznámka „do jejich sudu" jsou teď
// obyčejné objednávky ze sudů pivovaru.
describe('vlastní sudy odběratelů jsou zrušené', () => {
  const sud50 = { kind: 'keg', volume_l: 50 };
  const sud20 = { kind: 'keg', volume_l: 20 };
  const lahev = { kind: 'bottle', volume_l: 0.5 };

  it('nikdo nemá vlastní sudy — ani dřívější seznam, ani poznámka', () => {
    for (const misto of ['Michal Fojtovice', 'Michal vojtovice', 'MARTIN', 'Duck and Dog', 'EGON', 'Lokálka Říčany', null]) {
      expect(vlastniSudyOdberatele(misto)).toBeNull();
      expect(vlastniSudyOdberatele(misto, 'do jejich sudu')).toBeNull();
    }
  });

  it('do sudu odběratele se nestáčí nic — malé, velké ani lahve', () => {
    expect(doSuduOdberatele('Martin', sud20)).toBe(false);
    expect(doSuduOdberatele('Michal Fojtovice', sud50)).toBe(false);
    expect(doSuduOdberatele('EGON', sud20, 'do vlastního sudu')).toBe(false);
    expect(doSuduOdberatele('Michal Fojtovice', lahev)).toBe(false);
  });

  it('kontrola skladu a karty objednávek berou všechny položky', () => {
    const obaly = [{ id: 'k50', ...sud50 }, { id: 'k20', ...sud20 }];
    const polozky = [{ package_id: 'k50' }, { package_id: 'k20' }];
    expect(bezSuduOdberatele('Michal Fojtovice', polozky, obaly)).toEqual(polozky);
    expect(bezSuduOdberatele('EGON', polozky, obaly, 'do jejich sudu')).toEqual(polozky);
    expect(doSuduOdberatelePolozky('Martin', polozky, obaly)).toEqual([]);
  });
});
