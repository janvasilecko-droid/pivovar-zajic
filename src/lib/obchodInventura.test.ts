// Inventura obchodu na konci měsíce (10. 10. 2026).
import { describe, it, expect } from 'vitest';
import { inventuraObchoduChybi, konecMesice, oknoInventury, rozdilyInventury } from './obchodInventura';

const inv = (datum: string) => ({ datum });

describe('inventuraObchoduChybi', () => {
  it('bez jakékoli inventury se nic nepřipomíná (je to počáteční stav)', () => {
    expect(inventuraObchoduChybi([], '2026-10-30')).toBeNull();
  });

  it('uprostřed měsíce je klid', () => {
    expect(inventuraObchoduChybi([inv('2026-09-30')], '2026-10-10')).toBeNull();
  });

  it('posledních pět dní měsíce připomíná; po konci je to naléhavé', () => {
    const jen = [inv('2026-09-30')];
    expect(inventuraObchoduChybi(jen, '2026-10-26')).toBeNull();
    expect(inventuraObchoduChybi(jen, '2026-10-27')).toEqual({ mesic: '2026-10', naleha: false });
    expect(inventuraObchoduChybi(jen, '2026-10-31')).toEqual({ mesic: '2026-10', naleha: false });
    expect(inventuraObchoduChybi(jen, '2026-11-02')).toEqual({ mesic: '2026-10', naleha: true });
    expect(inventuraObchoduChybi(jen, '2026-11-05')).toEqual({ mesic: '2026-10', naleha: true });
    expect(inventuraObchoduChybi(jen, '2026-11-06')).toBeNull();
  });

  it('inventura v okně měsíc uzavře — i ta z prvních dnů dalšího', () => {
    expect(inventuraObchoduChybi([inv('2026-09-30'), inv('2026-10-30')], '2026-10-31')).toBeNull();
    expect(inventuraObchoduChybi([inv('2026-09-30'), inv('2026-11-02')], '2026-11-03')).toBeNull();
  });

  it('přelom roku', () => {
    expect(inventuraObchoduChybi([inv('2026-11-30')], '2027-01-02')).toEqual({ mesic: '2026-12', naleha: true });
  });
});

describe('okno a konec měsíce', () => {
  it('okno inventury za říjen', () => {
    expect(oknoInventury('2026-10')).toEqual({ od: '2026-10-27', do: '2026-11-05' });
    expect(konecMesice('2026-02-10')).toBe('2026-02-28');
    expect(konecMesice('2028-02-10')).toBe('2028-02-29');
  });
});

describe('rozdilyInventury', () => {
  it('jen to, co se liší, největší rozdíl první; první inventura bez porovnání', () => {
    const r = rozdilyInventury([
      { kod: 'a', nazev: 'A', ocekavano: 10, napocitano: 10 },
      { kod: 'b', nazev: 'B', ocekavano: 10, napocitano: 7 },
      { kod: 'c', nazev: 'C', ocekavano: 5, napocitano: 6 },
      { kod: 'd', nazev: 'D', ocekavano: null, napocitano: 4 },
    ]);
    expect(r.map((x) => [x.kod, x.rozdil])).toEqual([['b', -3], ['c', 1], ['d', null]]);
  });
});
