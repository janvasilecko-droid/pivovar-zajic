import { describe, it, expect } from 'vitest';
import { isLastWeekOfMonth, lastWeekOfMonthKey, getMonthKey, cleanupMonthKey } from './monthlyCleanup';

// Z provozu 24. 9. 2026: „proc si mi hlasil mesicni chek list dneska? hlas
// ho v posledni tyden v mesici, to znamena pristi, klidne at se prekryva
// s novym mesicem."
//
// 24. 9. 2026 je čtvrtek v týdnu 21.–27. 9. — starým pravidlem (posledních
// 7 kalendářních dnů, tedy 24.–30. 9.) to vyšlo jako „poslední týden" už
// TEN čtvrtek. Majitel ale myslí týdnem skutečný kalendářní týden: poslední
// týden září je 28. 9. – 4. 10. (obsahuje 30. 9., poslední den měsíce) a
// klidně přesahuje do října.
describe('isLastWeekOfMonth (kalendářní týden obsahující poslední den měsíce)', () => {
  it('přesně ten den, na který si majitel stěžoval: čtvrtek 24. 9. ještě NENÍ poslední týden', () => {
    expect(isLastWeekOfMonth('2026-09-24')).toBe(false);
    expect(isLastWeekOfMonth('2026-09-27')).toBe(false); // neděle, pořád ten samý týden
  });

  it('září (30 dní, poslední den je středa) — poslední týden je pondělí 28. 9. – neděle 4. 10.', () => {
    expect(isLastWeekOfMonth('2026-09-28')).toBe(true); // pondělí — „to znamena pristi"
    expect(isLastWeekOfMonth('2026-09-30')).toBe(true); // poslední kalendářní den měsíce
    expect(isLastWeekOfMonth('2026-10-01')).toBe(true); // přesah do října — „klidne at se prekryva"
    expect(isLastWeekOfMonth('2026-10-04')).toBe(true); // neděle, konec toho týdne
    expect(isLastWeekOfMonth('2026-10-05')).toBe(false); // pondělí — už samostatný, nový týden
  });

  it('srpen — poslední den (31.) vychází na pondělí, takže poslední týden skoro celý spadá do září', () => {
    // Okrajový případ: 31. 8. 2026 je pondělí, takže týden co ho obsahuje
    // je 31. 8. – 6. 9. Ze srpna samotného je v tom týdnu jediný den.
    expect(isLastWeekOfMonth('2026-08-30')).toBe(false); // neděle, předchozí týden
    expect(isLastWeekOfMonth('2026-08-31')).toBe(true);
    expect(isLastWeekOfMonth('2026-09-06')).toBe(true); // pořád přesah srpna
    expect(isLastWeekOfMonth('2026-09-07')).toBe(false); // další pondělí — nový týden
  });

  it('únor (28 dní, poslední den je sobota) — poslední týden je 23. 2. – 1. 3.', () => {
    expect(isLastWeekOfMonth('2026-02-22')).toBe(false); // neděle, ještě předchozí týden
    expect(isLastWeekOfMonth('2026-02-23')).toBe(true);
    expect(isLastWeekOfMonth('2026-02-28')).toBe(true);
    expect(isLastWeekOfMonth('2026-03-01')).toBe(true); // přesah do března
    expect(isLastWeekOfMonth('2026-03-02')).toBe(false);
  });

  it('duben (30 dní, poslední den je čtvrtek) — poslední týden je 27. 4. – 3. 5.', () => {
    expect(isLastWeekOfMonth('2026-04-26')).toBe(false);
    expect(isLastWeekOfMonth('2026-04-27')).toBe(true);
    expect(isLastWeekOfMonth('2026-04-30')).toBe(true);
    expect(isLastWeekOfMonth('2026-05-03')).toBe(true);
    expect(isLastWeekOfMonth('2026-05-04')).toBe(false);
  });

  it('den uprostřed měsíce nikdy není poslední týden', () => {
    expect(isLastWeekOfMonth('2026-08-10')).toBe(false);
  });
});

describe('lastWeekOfMonthKey — kterému měsíci poslední týden patří', () => {
  it('v přesahu do nového měsíce vrací měsíc STARÝ, ne kalendářní měsíc dneška', () => {
    // Tohle je jádro opravy: 1.–4. 10. je poslední týden ZÁŘÍ, ne říjnová
    // věc. Kdyby se tu vrátilo „2026-10", potvrzení úklidu 1. 10. by se
    // uložilo pod říjnový klíč a připomínka za září by se ukazovala dál.
    expect(lastWeekOfMonthKey('2026-10-01')).toBe('2026-09');
    expect(lastWeekOfMonthKey('2026-10-04')).toBe('2026-09');
  });

  it('v posledním týdnu bez přesahu vrací měsíc dne samotného', () => {
    expect(lastWeekOfMonthKey('2026-09-28')).toBe('2026-09');
  });

  it('mimo poslední týden vrací null', () => {
    expect(lastWeekOfMonthKey('2026-09-24')).toBe(null);
    expect(lastWeekOfMonthKey('2026-10-05')).toBe(null);
  });
});

describe('getMonthKey — prostý kalendářní měsíc, beze změny', () => {
  it('vrací klíč měsíce RRRR-MM podle kalendáře, i uprostřed přesahu', () => {
    expect(getMonthKey('2026-08-31')).toBe('2026-08');
    expect(getMonthKey('2026-12-01')).toBe('2026-12');
    // Na rozdíl od cleanupMonthKey: 1. 10. je kalendářně říjen, i když
    // ještě patří do zářijového posledního týdne.
    expect(getMonthKey('2026-10-01')).toBe('2026-10');
  });
});

describe('cleanupMonthKey — klíč pro ukládání stavu úklidu', () => {
  it('v přesahu drží starý měsíc, se kterým je poslední týden spojený', () => {
    expect(cleanupMonthKey('2026-10-01')).toBe('2026-09');
  });

  it('mimo poslední týden se chová jako getMonthKey', () => {
    expect(cleanupMonthKey('2026-09-24')).toBe(getMonthKey('2026-09-24'));
  });
});
