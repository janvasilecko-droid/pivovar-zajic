// Z provozu: „ten měsíční checklist — když ho jednou odkliknu a vyplním, že
// jsem ho udělal, ať se propíše do deníku a už se nezobrazuje, zas až poslední
// týden další měsíc."
//
// Příčina byla v tom, že se odškrtnuté checklisty ukládají po DNECH
// ('bottling_checklist_<datum>'). „Hotovo" tedy platilo jen pro ten jeden den
// a druhý den posledního týdne se okno s měsíční údržbou otevřelo znovu.
// Dokončení se proto drží zvlášť — na měsíc a linku (lahve / KEG).
import { describe, it, expect, beforeEach } from 'vitest';
import {
  isMonthlyLineDone, markMonthlyLineDone,
  readMonthlyCleanupStage, isMonthlyCleanupPending,
} from './monthlyCleanup';

const SRPEN = '2026-08';
const ZARI = '2026-09';

describe('Měsíční úklid — dokončení platí na celý měsíc, ne na jeden den', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('hotová linka zůstane hotová i další den (stav se neváže na datum)', () => {
    expect(isMonthlyLineDone('bottle', SRPEN)).toBe(false);
    markMonthlyLineDone('bottle', SRPEN);
    // Žádný denní klíč se nečte — platí to bez ohledu na to, který den je.
    expect(isMonthlyLineDone('bottle', SRPEN)).toBe(true);
  });

  it('další měsíc se úklid připomene znovu', () => {
    markMonthlyLineDone('bottle', SRPEN);
    markMonthlyLineDone('keg', SRPEN);
    expect(isMonthlyLineDone('bottle', ZARI)).toBe(false);
    expect(isMonthlyLineDone('keg', ZARI)).toBe(false);
    expect(readMonthlyCleanupStage(ZARI)).toBe(null);
  });

  it('linky se drží zvlášť — hotové lahve neoznačí za hotové i KEGy', () => {
    markMonthlyLineDone('bottle', SRPEN);
    expect(isMonthlyLineDone('keg', SRPEN)).toBe(false);
    // Dokud není hotové obojí, upozornění samo od sebe neumlkne.
    expect(readMonthlyCleanupStage(SRPEN)).not.toBe('done');
  });

  it('když jsou hotové obě linky, upozornění se umlčí na zbytek měsíce', () => {
    markMonthlyLineDone('bottle', SRPEN);
    markMonthlyLineDone('keg', SRPEN);
    expect(readMonthlyCleanupStage(SRPEN)).toBe('done');
  });

  it('po dokončení obou linek už úklid nečeká (dlaždice na Domů zmizí)', () => {
    const monthKey = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    markMonthlyLineDone('bottle', monthKey);
    markMonthlyLineDone('keg', monthKey);
    // Mimo poslední týden měsíce nečeká nikdy; v posledním týdnu to teď
    // vypnulo dokončení obou linek.
    expect(isMonthlyCleanupPending()).toBe(false);
  });
});
