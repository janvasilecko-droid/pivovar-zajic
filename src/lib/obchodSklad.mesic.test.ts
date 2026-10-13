// Obchod → Sklad (13. 10. 2026): „naskladněno = aktuální stav, prodáno = počet prodaných od začátku měsíce."
import { describe, it, expect } from 'vitest';
import { jePalenka, sledujeSklad, stavySkladu, type VstupSkladu } from './obchodSklad';

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
