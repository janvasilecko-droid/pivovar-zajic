import { describe, expect, it } from 'vitest';
import { lzeUlozitKoncept, slucInventuru } from './rozepsanaInventura';

describe('slucInventuru', () => {
  it('naťukané číslo přenačtení nepřepíše', () => {
    // Přesně ten případ z provozu: člověk napíše 9, klikne o řádek níž na
    // „Odečíst", obrazovka se přenačte — a devítka musí zůstat.
    expect(slucInventuru({ 'b1__p1': '0' }, { 'b1__p1': '9' }, false)).toEqual({ 'b1__p1': '9' });
  });

  it('položky, kterých se člověk nedotkl, se z databáze doplní', () => {
    expect(slucInventuru({ 'b1__p1': '5', 'b1__p2': '7' }, { 'b1__p1': '9' }, false))
      .toEqual({ 'b1__p1': '9', 'b1__p2': '7' });
  });

  it('vymazané pole zůstane vymazané — prázdno je taky odpověď', () => {
    // Prázdné pole znamená napočítanou nulu. Kdyby ho přenačtení nahradilo
    // starou hodnotou z databáze, nešlo by nic vynulovat.
    expect(slucInventuru({ 'b1__p1': '12' }, { 'b1__p1': '' }, false)).toEqual({ 'b1__p1': '' });
  });

  it('při přepnutí měsíce se rozepsané zahodí', () => {
    // Jinak by srpnová čísla visela v zářijové tabulce.
    expect(slucInventuru({ 'b1__p1': '3' }, { 'b1__p1': '99' }, true)).toEqual({ 'b1__p1': '3' });
  });

  it('prázdné načtení nesmaže rozepsané', () => {
    expect(slucInventuru({}, { 'b1__p1': '9' }, false)).toEqual({ 'b1__p1': '9' });
  });
});

describe('lzeUlozitKoncept', () => {
  it('před prvním načtením měsíce se koncept neukládá', () => {
    // Prázdný stav při otevírání obrazovky by jinak přepsal uložený koncept
    // dřív, než se stihne načíst.
    expect(lzeUlozitKoncept(null, '2026-08')).toBe(false);
    expect(lzeUlozitKoncept('2026-07', '2026-08')).toBe(false);
  });

  it('po načtení měsíce už ano', () => {
    expect(lzeUlozitKoncept('2026-08', '2026-08')).toBe(true);
  });
});
