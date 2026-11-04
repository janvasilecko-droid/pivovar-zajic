// @vitest-environment node
// Očekávané hodnoty jsou přepočtené NEZÁVISLE (samostatný skript v Pythonu,
// jiný kód než tady) a u hustoty porovnané s body tabulek extraktu.
import { describe, it, expect } from 'vitest';
import { MimoRozsah, formatuj, spocitej, vychoziHodnoty, zkontrolujVstupy, type Vysledek } from './zaklad.ts';
import { VYPOCTY, hustotaZPlato, najdiVypocet, objemyCo2, platoZHustoty } from './katalog.ts';

const vysledek = (r: Vysledek, nazev: string, jednotka?: string) => {
  const v = r.vysledky.find((x) => x.nazev === nazev && (jednotka === undefined || x.jednotka === jednotka));
  if (!v) throw new Error(`Výsledek ${nazev} chybí`);
  return v.hodnota;
};
const vypocet = (id: string) => {
  const d = najdiVypocet(id);
  if (!d) throw new Error(`Výpočet ${id} chybí`);
  return d;
};

describe('katalog výpočtů', () => {
  it('každý výpočet má vzorec, předpoklady, rozsah, nejistotu, zdroj a dotaz do knihovny; s výchozími hodnotami projde', () => {
    expect(VYPOCTY.length).toBeGreaterThanOrEqual(10);
    expect(new Set(VYPOCTY.map((d) => d.id)).size).toBe(VYPOCTY.length);
    for (const d of VYPOCTY) {
      expect(d.oblast).toMatch(/^[A-T]$/);
      expect(d.hledat.length).toBeGreaterThan(2);
      const { h, r } = vychoziHodnoty(d);
      const v = spocitej(d, h, r);
      expect(v.vzorec.length, d.id).toBeGreaterThan(0);
      expect(v.vysledky.length, d.id).toBeGreaterThan(0);
      expect(v.vysledky.every((x) => Number.isFinite(x.hodnota)), d.id).toBe(true);
      expect(v.predpoklady.length, d.id).toBeGreaterThan(0);
      for (const t of [v.rozsah, v.nejistota, v.zdroj]) expect(t.length, d.id).toBeGreaterThan(5);
    }
  });
});

describe('hustota a stupňovitost', () => {
  it('body tabulek extraktu: 10 °P = 1,04003; 12 °P = 1,04837; 20 °P = 1,08297', () => {
    expect(hustotaZPlato(10)).toBeCloseTo(1.040027, 5);
    expect(hustotaZPlato(12)).toBeCloseTo(1.048369, 5);
    expect(hustotaZPlato(20)).toBeCloseTo(1.082972, 5);
    expect(platoZHustoty(1.040)).toBeCloseTo(9.9935, 3);
    expect(platoZHustoty(1.050)).toBeCloseTo(12.3876, 3);
  });
  it('obrácený výpočet vrátí stejné °P', () => {
    for (const p of [-1, 0, 3, 8.5, 12, 19.3, 30]) expect(platoZHustoty(hustotaZPlato(p))).toBeCloseTo(p, 6);
  });
  it('výpočet „stupňovitost → hustota" i extrakt v hektolitru', () => {
    const r = spocitej(vypocet('hustota_z_plato'), { p: 12 });
    expect(vysledek(r, 'Relativní hustota (SG 20/20 °C)')).toBeCloseTo(1.048369, 5);
    expect(vysledek(r, 'Extrakt v 1 hl')).toBeCloseTo(100 * 1.048369 * 0.9982 * 0.12, 2);
  });
});

describe('alkohol a prokvašení (Balling)', () => {
  it('12 °P / 3 °P: SE 4,63 °P, 3,80 % hm., 4,87 % obj., prokvašení 75,0 % a 61,4 %', () => {
    const r = spocitej(vypocet('alkohol'), { oe: 12, ae: 3 });
    expect(r.mezikroky.find((x) => x.nazev.startsWith('Skutečný'))!.hodnota).toBeCloseTo(4.6272, 4);
    expect(vysledek(r, 'Alkohol', '% hm.')).toBeCloseTo(3.8033, 3);
    expect(vysledek(r, 'Alkohol', '% obj.')).toBeCloseTo(4.8665, 3);
    expect(vysledek(r, 'Zdánlivé prokvašení')).toBeCloseTo(75, 6);
    expect(vysledek(r, 'Skutečné prokvašení')).toBeCloseTo(61.44, 3);
  });
  it('zdánlivý extrakt nad původním se odmítne', () => {
    expect(() => spocitej(vypocet('alkohol'), { oe: 10, ae: 11 })).toThrow(MimoRozsah);
  });
});

describe('ředění', () => {
  it('10 hl 13 °P na 12 °P: přidat 87,7 L vody, výsledek 1087,7 L', () => {
    const r = spocitej(vypocet('redeni'), { v1: 10, p1: 13, p2: 12 });
    expect(vysledek(r, 'Přidat vody')).toBeCloseTo(87.715, 2);
    expect(vysledek(r, 'Výsledný objem')).toBeCloseTo(1087.69, 1);
  });
  it('cíl nad současným extraktem se odmítne (vodou se nezahušťuje)', () => {
    expect(() => spocitej(vypocet('redeni'), { v1: 10, p1: 11, p2: 12 })).toThrow('nižší');
  });
});

describe('varní výtěžek', () => {
  it('10 hl horké mladiny 12 °P ze 180 kg: 120,8 kg extraktu, 67,1 %', () => {
    const r = spocitej(vypocet('varni_vytezek'), { v: 10, e: 12, s: 180, k: 0.96 });
    expect(vysledek(r, 'Extrakt v mladině')).toBeCloseTo(120.7721, 3);
    expect(vysledek(r, 'Varní výtěžek')).toBeCloseTo(67.0956, 3);
  });
});

describe('hořkost (Tinseth)', () => {
  it('50 g, 10 % alfa, 20 L, 60 min, SG 1,050 (12,39 °P) ≈ 57,7 IBU', () => {
    const r = spocitej(vypocet('ibu_tinseth'), { v: 20, p: platoZHustoty(1.05) }, { davky: [{ g: 50, alfa: 10, min: 60 }] });
    expect(vysledek(r, 'Hořkost')).toBeCloseTo(57.666, 2);
  });
  it('víc dávek se sčítá; dávka bez varu (0 min) nic nepřidá', () => {
    const r = spocitej(vypocet('ibu_tinseth'), { v: 1000, p: 12 }, {
      davky: [{ g: 300, alfa: 4, min: 70 }, { g: 200, alfa: 3, min: 10 }, { g: 500, alfa: 5, min: 0 }],
    });
    expect(vysledek(r, 'Hořkost')).toBeCloseTo(3.4104, 3);
  });
  it('doba varu přes 120 min a prázdný seznam dávek se odmítnou', () => {
    expect(() => spocitej(vypocet('ibu_tinseth'), { v: 20, p: 12 }, { davky: [{ g: 50, alfa: 10, min: 150 }] })).toThrow('Doba varu (řádek 1)');
    expect(() => spocitej(vypocet('ibu_tinseth'), { v: 20, p: 12 }, { davky: [] })).toThrow('Chmelové dávky');
  });
});

describe('barva (Morey)', () => {
  it('200 kg 8 EBC + 10 kg 150 EBC do 1000 L: MCU 10,68, 7,57 SRM, 14,9 EBC', () => {
    const r = spocitej(vypocet('barva_morey'), { v: 1000 }, { slady: [{ kg: 200, ebc: 8 }, { kg: 10, ebc: 150 }] });
    expect(r.mezikroky[0].hodnota).toBeCloseTo(10.6779, 3);
    expect(vysledek(r, 'Barva piva', 'SRM')).toBeCloseTo(7.573, 2);
    expect(vysledek(r, 'Barva piva', 'EBC')).toBeCloseTo(14.9187, 2);
  });
  it('nad 50 SRM vzorec neplatí — odmítne se', () => {
    expect(() => spocitej(vypocet('barva_morey'), { v: 100 }, { slady: [{ kg: 50, ebc: 1400 }] })).toThrow('50 SRM');
  });
});

describe('vystírka', () => {
  it('100 kg šrotu 18 °C, 300 L vody, cíl 65 °C: voda 71,4 °C', () => {
    const r = spocitej(vypocet('vystirka_teplota'), { kg: 100, l: 300, ts: 18, tc: 65 });
    expect(vysledek(r, 'Teplota nálevové vody')).toBeCloseTo(71.4233, 3);
  });
  it('poměr vody a šrotu mimo 1,5–6 L/kg se odmítne', () => {
    expect(() => spocitej(vypocet('vystirka_teplota'), { kg: 100, l: 100, ts: 18, tc: 65 })).toThrow('1,5–6 L/kg');
  });
});

describe('CO₂', () => {
  it('2 °C a 1 bar: 2,95 objemu = 5,83 g/L', () => {
    expect(objemyCo2(2, 1)).toBeCloseTo(2.94881, 4);
    const r = spocitej(vypocet('co2_obsah'), { t: 2, p: 1 });
    expect(vysledek(r, 'CO₂ v pivu')).toBeCloseTo(5.8269, 3);
  });
  it('5 g/L při 4 °C potřebuje přetlak 0,84 bar (a zpět vyjde 5 g/L)', () => {
    const r = spocitej(vypocet('co2_tlak'), { t: 4, g: 5 });
    expect(vysledek(r, 'Přetlak')).toBeCloseTo(0.83612, 4);
    expect(objemyCo2(4, vysledek(r, 'Přetlak')) * 1.976).toBeCloseTo(5, 6);
  });
  it('cíl dosažitelný jen nad 4 bar se odmítne', () => {
    expect(() => spocitej(vypocet('co2_tlak'), { t: 20, g: 10 })).toThrow('4 bar');
  });
});

describe('kontrola vstupů', () => {
  it('mimo rozsah, chybějící a nečíselné hodnoty se odmítnou s hláškou; neznámá pole se zahodí', () => {
    const d = vypocet('hustota_z_plato');
    expect(() => spocitej(d, { p: 40 })).toThrow('Extrakt musí být −2–35 °P (zadáno 40).');
    expect(() => spocitej(d, {})).toThrow('Chybí extrakt.');
    expect(() => spocitej(d, { p: '12' as unknown as number })).toThrow(MimoRozsah);
    expect(zkontrolujVstupy(d, { p: 12, navic: 5 }).h).toEqual({ p: 12 });
  });
  it('formát pro člověka: desetinná čárka', () => {
    expect(formatuj({ nazev: 'x', hodnota: 1087.69, jednotka: 'L', mist: 1 })).toMatch(/^1\s?087,7 L$/);
  });
});
