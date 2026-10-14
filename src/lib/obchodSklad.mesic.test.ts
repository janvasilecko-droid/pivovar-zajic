// Obchod → Sklad (13. 10. 2026): „naskladněno = aktuální stav, prodáno = počet prodaných od začátku měsíce."
import { describe, it, expect } from 'vitest';
import { jePalenka, konecMesiceISO, posunMesic, sledujeSklad, stavySkladu, type VstupSkladu } from './obchodSklad';

const zbozi = [
  { kod: '11141', nazev: 'Pivo PET 1l 12° světlá', beer_id: 'b12s', package_id: 'p1' },
  { kod: '1106', nazev: 'Saponát 1l', beer_id: null, package_id: null },
  { kod: '777', nazev: 'Slivovice pálenka 0,5l', beer_id: null, package_id: null },
];
const v = (p: Partial<VstupSkladu> = {}): VstupSkladu => ({
  zbozi, fasovani: [], prijmy: [], uzaverky: [], radky: [], inventury: [], ...p,
});

describe('prodáno od začátku měsíce', () => {
  const uzaverky = [
    { id: 'u1', datum_od: '2026-09-28', datum_do: '2026-09-30' },
    { id: 'u2', datum_od: '2026-10-02', datum_do: '2026-10-02' },
    { id: 'u3', datum_od: '2026-10-09', datum_do: '2026-10-09' },
    { id: 'u4', datum_od: '2026-10-20', datum_do: '2026-10-20' },
  ];
  const radky = [
    { uzaverka_id: 'u1', kod: '1106', mnozstvi: 9 },
    { uzaverka_id: 'u2', kod: '1106', mnozstvi: 3 },
    { uzaverka_id: 'u3', kod: '1106', mnozstvi: 2 },
    { uzaverka_id: 'u4', kod: '1106', mnozstvi: 50 },
    { uzaverka_id: 'u2', kod: '11141', mnozstvi: 4 },
  ];
  const s = (kod: string, kDatu = '2026-10-13') => stavySkladu(v({ uzaverky, radky }), kDatu).find((x) => x.kod === kod)!;

  it('počítá jen uzávěrky tohoto měsíce do dneška, i když zboží nemá inventuru', () => {
    expect(s('1106')).toMatchObject({ prodanoMesic: 5, stav: null });
    expect(s('11141').prodanoMesic).toBe(4);
  });

  it('nezávisí na inventuře: prodej před ní se do měsíčního prodeje počítá dál', () => {
    const r = stavySkladu(v({ uzaverky, radky, inventury: [{ kod: '1106', datum: '2026-10-05', napocitano: 20 }] }), '2026-10-13').find((x) => x.kod === '1106')!;
    expect(r.prodanoMesic).toBe(5);
    expect(r.stav).toBe(18); // 20 − 2 po inventuře
  });

  it('jiný měsíc = jiné číslo', () => {
    expect(s('1106', '2026-09-30').prodanoMesic).toBe(9);
  });
});

describe('co se u zboží sleduje na skladě', () => {
  it('piva a pálenka ano, ostatní jen prodej', () => {
    expect(jePalenka(zbozi[2])).toBe(true);
    expect(sledujeSklad(zbozi[0])).toBe(true);
    expect(sledujeSklad(zbozi[2])).toBe(true);
    expect(sledujeSklad(zbozi[1])).toBe(false);
  });
});

describe('limonády se do skladu nepočítají (13. 10. 2026)', () => {
  const limoPivo = { kod: '15160', nazev: '0,5l limo sklo Kiwi', beer_id: 'kiwi', package_id: 'p05' };
  const vstup = v({ zbozi: [...zbozi, limoPivo], inventury: [{ kod: '15160', datum: '2026-10-01', napocitano: 5 }], uzaverky: [{ id: 'u1', datum_od: '2026-10-05', datum_do: '2026-10-05' }], radky: [{ uzaverka_id: 'u1', kod: '15160', mnozstvi: 9 }] });

  it('i vedená jako pivo se limonáda sleduje jen jako prodej', async () => {
    const { jeLimonada, varovaniZasob } = await import('./obchodSklad');
    expect(jeLimonada(limoPivo)).toBe(true);
    expect(sledujeSklad(limoPivo)).toBe(false);
    const s = stavySkladu(vstup, '2026-10-13').find((x) => x.kod === '15160')!;
    expect(s).toMatchObject({ sklad: false, limonada: true, prodanoMesic: 9 });
    // Záporný stav (5 − 9) nevyvolá hlídání zásob.
    expect(varovaniZasob(stavySkladu(vstup, '2026-10-13')).some((x) => x.kod === '15160')).toBe(false);
  });

  it('do litrů a kusů piva ve Statistice nejde', async () => {
    const { prodejPoZbozi, prodejPoPivech } = await import('./obchodStatistika');
    const st = { zbozi: [limoPivo], uzaverky: vstup.uzaverky, radky: vstup.radky, obaly: [{ id: 'p05', volume_l: 0.5 }], piva: [{ id: 'kiwi', name: 'Kiwi' }] } as any;
    expect(prodejPoZbozi(st)[0]).toMatchObject({ jePivo: false, ks: 9, litry: 0 });
    expect(prodejPoPivech(st)).toEqual([]);
  });
});

// 14. 10. 2026: „sloupce budou sklad, nafasováno, prodáno, údaje budou za celý měsíc."
describe('nafasováno a přijato za celý měsíc', () => {
  const fasovani = [
    { beer_id: 'b12s', package_id: 'p1', quantity: 12, entry_date: '2026-10-02' },
    { beer_id: 'b12s', package_id: 'p1', quantity: 6, entry_date: '2026-10-09' },
    { beer_id: 'b12s', package_id: 'p1', quantity: 5, entry_date: '2026-09-20' },
    { beer_id: 'b12s', package_id: 'p1', quantity: 40, entry_date: '2026-10-20' },
  ];
  const prijmy = [
    { kod: '777', datum: '2026-10-03', mnozstvi: 4 },
    { kod: '777', datum: '2026-09-28', mnozstvi: 9 },
  ];
  const s = (kod: string, kDatu: string, extra: Partial<VstupSkladu> = {}) =>
    stavySkladu(v({ fasovani, prijmy, ...extra }), kDatu).find((x) => x.kod === kod)!;

  it('sčítá fasování a příjem od prvního dne měsíce do dneška', () => {
    expect(s('11141', '2026-10-13')).toMatchObject({ fasovanoMesic: 18, prijatoMesic: 0 });
    expect(s('777', '2026-10-13')).toMatchObject({ fasovanoMesic: 0, prijatoMesic: 4 });
  });

  it('běžící měsíc nepočítá fasování z budoucna', () => {
    expect(s('11141', '2026-10-13').fasovanoMesic).toBe(18);
    expect(s('11141', '2026-10-31').fasovanoMesic).toBe(58);
  });

  it('uplynulý měsíc: jeho vlastní čísla, ne říjnová', () => {
    expect(s('11141', '2026-09-30')).toMatchObject({ fasovanoMesic: 5, prodanoMesic: 0 });
    expect(s('777', '2026-09-30').prijatoMesic).toBe(9);
  });

  it('nezávisí na inventuře: fasování před inventurou v měsíci se počítá dál, stav ne', () => {
    const r = s('11141', '2026-10-13', { inventury: [{ kod: '11141', datum: '2026-10-05', napocitano: 20 }] });
    expect(r.fasovanoMesic).toBe(18);   // 12 před inventurou + 6 po ní
    expect(r.stav).toBe(26);            // 20 napočítáno + 6 po inventuře
  });

  it('zboží bez fasování a příjmu má nuly', () => {
    expect(s('1106', '2026-10-13')).toMatchObject({ fasovanoMesic: 0, prijatoMesic: 0 });
  });
});

describe('měsíc: poslední den a posun', () => {
  it('konecMesiceISO', () => {
    expect(konecMesiceISO('2026-10')).toBe('2026-10-31');
    expect(konecMesiceISO('2026-09')).toBe('2026-09-30');
    expect(konecMesiceISO('2026-02')).toBe('2026-02-28');
    expect(konecMesiceISO('2028-02')).toBe('2028-02-29');
    expect(konecMesiceISO('2026-12')).toBe('2026-12-31');
  });
  it('posunMesic přes hranici roku', () => {
    expect(posunMesic('2026-10', -1)).toBe('2026-09');
    expect(posunMesic('2026-01', -1)).toBe('2025-12');
    expect(posunMesic('2026-12', 1)).toBe('2027-01');
    expect(posunMesic('2026-10', 0)).toBe('2026-10');
  });
});
