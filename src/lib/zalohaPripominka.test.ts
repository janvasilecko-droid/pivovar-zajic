/**
 * 💾 Připomínka zálohy.
 *
 * Denní záloha jde do `zalohy/` v GITHUBU — tedy tam, kde je i kód. Kdyby se
 * ztratil přístup k účtu, zmizí obojí naráz; záloha na jednom účtu není
 * záloha. Jediná kopie mimo něj je ta, kterou si někdo stáhne do telefonu
 * nebo do počítače — a to appka doteď nikomu nepřipomněla, i když si datum
 * poslední zálohy zapisovala.
 */
import { describe, it, expect } from 'vitest';
import {
  dnuOdZalohy, isWeeklyBackupDue, oznacZalohu,
  KLIC_POSLEDNI_ZALOHA, ZALOHA_PO_DNECH, type UlozisteZalohy,
} from './backup';

function pamet(hodnota?: string): UlozisteZalohy & { data: Map<string, string> } {
  const data = new Map<string, string>();
  if (hodnota !== undefined) data.set(KLIC_POSLEDNI_ZALOHA, hodnota);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

function predDny(dnu: number): string {
  return new Date(Date.now() - dnu * 24 * 3600 * 1000).toISOString();
}

describe('dnuOdZalohy', () => {
  it('spočítá dny od poslední zálohy', () => {
    expect(dnuOdZalohy(pamet(predDny(3)))).toBe(3);
    expect(dnuOdZalohy(pamet(predDny(0)))).toBe(0);
  });

  it('bez záznamu vrací null, ne nulu', () => {
    // Nula by znamenala „zálohováno dnes" — přesně naopak, než jak to je.
    expect(dnuOdZalohy(pamet())).toBeNull();
  });

  it('nesmyslné datum se bere jako „nevím"', () => {
    expect(dnuOdZalohy(pamet('tohle není datum'))).toBeNull();
  });

  it('datum v budoucnosti (přenastavené hodiny) je „dnes", ne záporno', () => {
    expect(dnuOdZalohy(pamet(predDny(-5)))).toBe(0);
  });

  it('nedostupné úložiště vrací null a nespadne', () => {
    expect(dnuOdZalohy(null)).toBeNull();
    const rozbite: UlozisteZalohy = {
      getItem: () => { throw new Error('zamčeno'); },
      setItem: () => { throw new Error('zamčeno'); },
    };
    expect(dnuOdZalohy(rozbite)).toBeNull();
  });
});

describe('isWeeklyBackupDue', () => {
  it(`hlásí po ${ZALOHA_PO_DNECH} dnech`, () => {
    expect(isWeeklyBackupDue(pamet(predDny(ZALOHA_PO_DNECH - 1)))).toBe(false);
    expect(isWeeklyBackupDue(pamet(predDny(ZALOHA_PO_DNECH)))).toBe(true);
  });

  it('když se to nedá zjistit, radši ANO než mlčet', () => {
    // Mlčení znamená „záloha je v pořádku" a to je ta horší z obou
    // možných chyb.
    expect(isWeeklyBackupDue(pamet())).toBe(true);
    expect(isWeeklyBackupDue(null)).toBe(true);
  });
});

describe('oznacZalohu', () => {
  it('zapíše dnešek a připomínka zmlkne', () => {
    const s = pamet(predDny(30));
    expect(isWeeklyBackupDue(s)).toBe(true);
    oznacZalohu(s);
    expect(dnuOdZalohy(s)).toBe(0);
    expect(isWeeklyBackupDue(s)).toBe(false);
  });

  it('zamčené úložiště nesmí shodit stahování zálohy', () => {
    const rozbite: UlozisteZalohy = {
      getItem: () => null,
      setItem: () => { throw new Error('zamčeno'); },
    };
    expect(() => oznacZalohu(rozbite)).not.toThrow();
    expect(() => oznacZalohu(null)).not.toThrow();
  });
});
