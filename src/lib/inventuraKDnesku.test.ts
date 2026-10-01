// 1. 10. 2026: zářijová inventura počítaná 1. 10. — dnešní závozy a stáčení.
import { describe, it, expect } from 'vitest';
import { lzePocitatKDnesku, naDnes, posunPoKonciMesice, zDnes } from './inventuraKDnesku';
import type { Movement } from './stockLedger';

const m = (date: string, kind: Movement['kind'], qty: number, package_id = 'k50'): Movement =>
  ({ date, beer_id: 'b12', package_id, qty, kind });

describe('inventura k dnešku', () => {
  it('sečte pohyby od 1. dne dalšího měsíce do dneška, ne dřív ani později', () => {
    const posun = posunPoKonciMesice([
      m('2026-09-30', 'zavoz', -5),
      m('2026-10-01', 'zavoz', -2),
      m('2026-10-01', 'staceni', 100, 'l033'),
      m('2026-10-01', 'inventura', 7),
      m('2026-10-02', 'zavoz', -3),
    ], '2026-09', '2026-10-01');
    expect(posun.get('b12__k50')).toEqual({ celkem: -2, odjelo: 2, pribylo: 0 });
    expect(posun.get('b12__l033')).toEqual({ celkem: 100, odjelo: 0, pribylo: 100 });
  });

  it('ještě v měsíci samotném se nic neposouvá', () => {
    expect(posunPoKonciMesice([m('2026-09-30', 'zavoz', -2)], '2026-09', '2026-09-30').size).toBe(0);
  });

  it('k dnešku jen v okně inventury (do 10. dne dalšího měsíce)', () => {
    expect(lzePocitatKDnesku('2026-09', '2026-10-01')).toBe(true);
    expect(lzePocitatKDnesku('2026-09', '2026-10-10')).toBe(true);
    expect(lzePocitatKDnesku('2026-09', '2026-10-11')).toBe(false);
    expect(lzePocitatKDnesku('2026-08', '2026-10-01')).toBe(false);
    expect(lzePocitatKDnesku('2026-10', '2026-10-01')).toBe(false);
  });

  it('napočítáno dnes 12, dnes odjely 2 → ke konci měsíce se uloží 14 a ukáže zase 12', () => {
    const ulozit = zDnes('12', -2);
    expect(ulozit).toBe('14');
    expect(naDnes(ulozit, -2)).toBe('12');
  });

  it('dnes stočeno 100, napočítáno 100 → ke konci měsíce 0', () => {
    expect(zDnes('100', 100)).toBe('0');
  });

  it('prázdné políčko zůstane prázdné (nespočítáno ≠ nula)', () => {
    expect(zDnes('', -2)).toBe('');
    expect(naDnes('', -2)).toBe('');
    expect(naDnes(undefined, -2)).toBe('');
  });

  it('bez posunu se nic nemění', () => {
    expect(zDnes('5', 0)).toBe('5');
    expect(naDnes('5', 0)).toBe('5');
  });
});
