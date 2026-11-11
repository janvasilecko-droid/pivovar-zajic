// @vitest-environment node
// Etapa 6b — očekávané hodnoty jsou přepočtené NEZÁVISLE (samostatný skript
// v Pythonu, hustota Newtonovou metodou místo půlení intervalu), ne tímhle kódem.
import { describe, it, expect } from 'vitest';
import { MimoRozsah, spocitej, vychoziHodnoty, type Vysledek } from './zaklad.ts';
import { VYPOCTY, najdiVypocet } from './katalog.ts';
import { VYPOCTY_6B, CO2_ZE_SACHAROZY, CO2_Z_GLUKOZY_MONOHYDRATU } from './katalog-6b.ts';

const vysledek = (r: Vysledek, nazev: string, jednotka?: string) => {
  const v = r.vysledky.find((x) => x.nazev === nazev && (jednotka === undefined || x.jednotka === jednotka));
  if (!v) throw new Error(`Výsledek ${nazev} ${jednotka ?? ''} chybí (je: ${r.vysledky.map((x) => `${x.nazev} [${x.jednotka}]`).join(', ')})`);
  return v.hodnota;
};
const mezikrok = (r: Vysledek, nazev: string) => {
  const v = r.mezikroky.find((x) => x.nazev === nazev);
  if (!v) throw new Error(`Mezikrok ${nazev} chybí`);
  return v.hodnota;
};
const vypocet = (id: string) => {
  const d = najdiVypocet(id);
  if (!d) throw new Error(`Výpočet ${id} chybí`);
  return d;
};

describe('katalog 6b', () => {
  it('je v katalogu za 6a, id se neopakují, s výchozími hodnotami všechno projde', () => {
    expect(VYPOCTY_6B).toHaveLength(14);
    expect(VYPOCTY.slice(-14)).toEqual(VYPOCTY_6B);
    expect(new Set(VYPOCTY.map((d) => d.id)).size).toBe(VYPOCTY.length);
    for (const d of VYPOCTY_6B) {
      expect(d.oblast, d.id).toMatch(/^[A-T]$/);
      const { h, r } = vychoziHodnoty(d);
      const v = spocitej(d, h, r);
      expect(v.vysledky.every((x) => Number.isFinite(x.hodnota)), d.id).toBe(true);
      expect(v.predpoklady.length, d.id).toBeGreaterThan(0);
      for (const t of [v.rozsah, v.nejistota, v.zdroj]) expect(t.length, d.id).toBeGreaterThan(5);
      for (const vs of d.vstupy) expect(vs.vychozi >= vs.min && vs.vychozi <= vs.max, `${d.id}.${vs.id}`).toBe(true);
    }
  });
});

describe('chlazení mladiny', () => {
  it('10 hl 12 °P z 95 na 8 °C, c 3,9, voda 2→80 °C, 60 min: 98,63 kWh, 1087 L vody', () => {
    const r = spocitej(vypocet('chlazeni_mladiny'), { v: 10, p: 12, t1: 95, t2: 8, cm: 3.9, tv1: 2, tv2: 80, min: 60 });
    expect(mezikrok(r, 'Hustota mladiny')).toBeCloseTo(1.046482, 5);
    expect(mezikrok(r, 'Hmotnost mladiny')).toBeCloseTo(1046.482, 2);
    expect(vysledek(r, 'Teplo k odvedení')).toBeCloseTo(98.63094, 3);
    expect(vysledek(r, 'Průměrný výkon chlazení')).toBeCloseTo(98.63094, 3);
    expect(vysledek(r, 'Chladicí voda')).toBeCloseTo(1087.4815, 2);
    expect(vysledek(r, 'Průtok chladicí vody')).toBeCloseTo(1087.4815, 2);
  });
  it('nesmyslné teploty se odmítnou', () => {
    const d = vypocet('chlazeni_mladiny');
    const z = { v: 10, p: 12, t1: 95, t2: 8, cm: 3.9, tv1: 2, tv2: 80, min: 60 };
    expect(() => spocitej(d, { ...z, t2: 95 })).toThrow(MimoRozsah);
    expect(() => spocitej(d, { ...z, tv1: 10 })).toThrow('studenější');
    expect(() => spocitej(d, { ...z, tv2: 96 })).toThrow(MimoRozsah);
  });
});

describe('plocha výměníku', () => {
  it('50 kW, 95→10 / 2→80 °C, U 2500: ΔT_ln 11,136 K, 1,796 m²', () => {
    const r = spocitej(vypocet('vymenik_plocha'), { w: 50, th1: 95, th2: 10, tc1: 2, tc2: 80, u: 2500 });
    expect(mezikrok(r, 'Střední logaritmický rozdíl')).toBeCloseTo(11.135704, 5);
    expect(vysledek(r, 'Potřebná plocha')).toBeCloseTo(1.7960247, 6);
  });
  it('stejné rozdíly na obou koncích nedělí nulou; křížení teplot se odmítne', () => {
    const r = spocitej(vypocet('vymenik_plocha'), { w: 10, th1: 90, th2: 30, tc1: 20, tc2: 80, u: 1000 });
    expect(mezikrok(r, 'Střední logaritmický rozdíl')).toBeCloseTo(10, 9);
    expect(() => spocitej(vypocet('vymenik_plocha'), { w: 50, th1: 70, th2: 10, tc1: 2, tc2: 80, u: 2500 })).toThrow('kříží');
  });
});

describe('voda: zbytková alkalita a kyselina', () => {
  it('alkalita 2,5 mmol/L, Ca 60, Mg 15: RA 4,107 °dH = 1,467 mmol/L, tvrdost 11,86 °dH', () => {
    const r = spocitej(vypocet('zbytkova_alkalita'), { alk: 2.5, ca: 60, mg: 15 });
    expect(vysledek(r, 'Zbytková alkalita', '°dH')).toBeCloseTo(4.1069618, 6);
    expect(vysledek(r, 'Zbytková alkalita', 'mmol/L')).toBeCloseTo(1.4667721, 6);
    expect(vysledek(r, 'Celková tvrdost')).toBeCloseTo(11.856137, 5);
  });
  it('500 L z 3 na 0,5 mmol/L: mléčná 80 % 117,3 mL, fosforečná 75 % 103,4 mL, 85 % 85,5 mL', () => {
    const r = spocitej(vypocet('kyselina_alkalita'), { v: 500, a1: 3, a2: 0.5 });
    expect(vysledek(r, 'Kyselina mléčná 80 %')).toBeCloseTo(117.29167, 3);
    expect(vysledek(r, 'Kyselina fosforečná 75 %')).toBeCloseTo(103.43572, 3);
    expect(vysledek(r, 'Kyselina fosforečná 85 %')).toBeCloseTo(85.525397, 3);
    expect(() => spocitej(vypocet('kyselina_alkalita'), { v: 500, a1: 1, a2: 2 })).toThrow('nižší');
  });
});

describe('potrubí a čerpadlo', () => {
  it('5 m³/h, DN 40 mm, 30 m, mladina 1040 kg/m³, 1,5 mPa·s, nerez: 1,105 m/s, Re 30 652, 0,1161 bar', () => {
    const r = spocitej(vypocet('potrubi_tlakova_ztrata'), { q: 5, d: 40, l: 30, rho: 1040, mu: 1.5, eps: 0.015 });
    expect(vysledek(r, 'Rychlost proudění')).toBeCloseTo(1.1052427, 6);
    expect(mezikrok(r, 'Reynoldsovo číslo')).toBeCloseTo(30652.063, 2);
    expect(mezikrok(r, 'Součinitel tření λ')).toBeCloseTo(0.02437756, 7);
    expect(vysledek(r, 'Tlaková ztráta', 'bar')).toBeCloseTo(0.11613687, 6);
    expect(vysledek(r, 'Ztrátová výška')).toBeCloseTo(1.1387178, 5);
    expect(r.predpoklady[0]).toMatch(/turbulentní/);
  });
  it('laminárně (0,2 m³/h, 50 mPa·s): Re 36,8, λ = 64/Re, 0,01326 bar; přechodová oblast se odmítne', () => {
    const r = spocitej(vypocet('potrubi_tlakova_ztrata'), { q: 0.2, d: 40, l: 30, rho: 1040, mu: 50, eps: 0.015 });
    expect(mezikrok(r, 'Reynoldsovo číslo')).toBeCloseTo(36.782476, 4);
    expect(vysledek(r, 'Tlaková ztráta', 'bar')).toBeCloseTo(0.013262912, 7);
    expect(r.predpoklady[0]).toMatch(/laminární/);
    expect(() => spocitej(vypocet('potrubi_tlakova_ztrata'), { q: 0.3, d: 40, l: 30, rho: 1000, mu: 1, eps: 0.015 })).toThrow('přechodové');
  });
  it('čerpadlo 5 m³/h na 15 m, 1040 kg/m³, η 55 %: 0,2125 kW hydraulicky, příkon 0,386 kW', () => {
    const r = spocitej(vypocet('cerpadlo_prikon'), { q: 5, h: 15, rho: 1040, eta: 55 });
    expect(mezikrok(r, 'Hydraulický výkon')).toBeCloseTo(0.21247742, 7);
    expect(vysledek(r, 'Příkon na hřídeli')).toBeCloseTo(0.38632258, 7);
  });
});

describe('CIP a energie', () => {
  it('500 L louhu 2 % z 50% NaOH (1,52 kg/L), roztok 1,02 kg/L: 20,4 kg = 13,42 L koncentrátu, 489,6 L vody', () => {
    const r = spocitej(vypocet('cip_roztok'), { v: 500, c: 2, ck: 50, rk: 1.52, rr: 1.02 });
    expect(mezikrok(r, 'Účinná látka')).toBeCloseTo(10.2, 9);
    expect(vysledek(r, 'Koncentrát', 'kg')).toBeCloseTo(20.4, 9);
    expect(vysledek(r, 'Koncentrát', 'L')).toBeCloseTo(13.421053, 5);
    expect(vysledek(r, 'Voda')).toBeCloseTo(489.6, 9);
    expect(() => spocitej(vypocet('cip_roztok'), { v: 500, c: 15, ck: 10, rk: 1.1, rr: 1.02 })).toThrow('nižší');
  });
  it('ohřev 10 hl vody z 15 na 78 °C, η 80 %, 3 Kč/kWh: 91,49 kWh, 274 Kč', () => {
    const r = spocitej(vypocet('ohrev_energie'), { v: 10, p: 0, c: 4.19, t1: 15, t2: 78, odpar: 0, eta: 80, cena: 3 });
    expect(mezikrok(r, 'Teplo na ohřev')).toBeCloseTo(73.193864, 4);
    expect(vysledek(r, 'Energie (dodaná)')).toBeCloseTo(91.49233, 4);
    expect(vysledek(r, 'Náklady')).toBeCloseTo(274.47699, 3);
  });
  it('mladina 12 °P ze 70 na 100 °C a odpar 80 L: 34,01 + 50,16 kWh, dodáno 105,21 kWh', () => {
    const r = spocitej(vypocet('ohrev_energie'), { v: 10, p: 12, c: 3.9, t1: 70, t2: 100, odpar: 80, eta: 80, cena: 3 });
    expect(mezikrok(r, 'Teplo na ohřev')).toBeCloseTo(34.01067, 4);
    expect(mezikrok(r, 'Teplo na odpar')).toBeCloseTo(50.155556, 5);
    expect(vysledek(r, 'Energie (dodaná)')).toBeCloseTo(105.20778, 4);
    expect(() => spocitej(vypocet('ohrev_energie'), { v: 10, p: 0, c: 4.19, t1: 80, t2: 20, odpar: 0, eta: 80, cena: 3 })).toThrow(MimoRozsah);
  });
});

describe('chmelovar, scezování, kvašení', () => {
  it('11,5 hl sladiny 10,5 °P, 90 min, 6 %/h: odpar 103,5 L, 10,465 hl mladiny 11,49 °P', () => {
    const r = spocitej(vypocet('chmelovar_odpar'), { v1: 11.5, p1: 10.5, min: 90, o: 6 });
    expect(vysledek(r, 'Odpařená voda')).toBeCloseTo(103.5, 6);
    expect(vysledek(r, 'Objem mladiny po varu')).toBeCloseTo(10.465, 9);
    expect(mezikrok(r, 'Extrakt ve sladině')).toBeCloseTo(125.60723, 3);
    expect(vysledek(r, 'Extrakt mladiny')).toBeCloseTo(11.4927925, 4);
    expect(() => spocitej(vypocet('chmelovar_odpar'), { v1: 10, p1: 10, min: 300, o: 20 })).toThrow('60 %');
  });
  it('200 kg šrotu, nálev 600 L, cíl 1150 L, 0,9 L/kg, mrtvý objem 30 L: vyslazovat 760 L', () => {
    const r = spocitej(vypocet('vyslazovaci_voda'), { kg: 200, vr: 600, vc: 1150, abs: 0.9, mrtvy: 30, odpar: 0 });
    expect(vysledek(r, 'Vyslazovací voda')).toBeCloseTo(760, 9);
    expect(mezikrok(r, 'Voda zadržená v mlátě')).toBeCloseTo(180, 9);
    expect(mezikrok(r, 'Poměr nálevu a šrotu')).toBeCloseTo(3, 9);
    expect(() => spocitej(vypocet('vyslazovaci_voda'), { kg: 100, vr: 2000, vc: 1000, abs: 0.9, mrtvy: 0, odpar: 0 })).toThrow('netřeba');
  });
  it('10 hl 12 °P, 1,5 mil./(mL·°P), kaše 1,5 mld./mL, viabilita 90 %: 18 000 mld. buněk, 13,33 L kaše', () => {
    const r = spocitej(vypocet('zakvaseni_davka'), { v: 10, p: 12, d: 1.5, h: 1.5, vit: 90 });
    expect(vysledek(r, 'Potřeba živých buněk')).toBeCloseTo(18000, 6);
    expect(vysledek(r, 'Kvasničná kaše')).toBeCloseTo(13.333333, 5);
  });
});

describe('dokvašení v lahvi', () => {
  it('výtěžky CO₂ ze stechiometrie: sacharóza 0,51429, glukóza monohydrát 0,44416 g/g', () => {
    expect(CO2_ZE_SACHAROZY).toBeCloseTo(0.51428513, 7);
    expect(CO2_Z_GLUKOZY_MONOHYDRATU).toBeCloseTo(0.44415637, 7);
  });
  it('po kvašení při 10 °C, cíl 5,5 g/L, 100 L: zbytek 2,246 g/L, sacharóza 6,33 g/L = 633 g, glukóza 7,33 g/L', () => {
    const r = spocitej(vypocet('refermentace_cukr'), { t: 10, g: 5.5, v: 100 });
    expect(mezikrok(r, 'Zbytkový CO₂ v pivu')).toBeCloseTo(2.2456996, 5);
    expect(vysledek(r, 'Sacharóza')).toBeCloseTo(6.3278135, 5);
    expect(vysledek(r, 'Sacharóza celkem')).toBeCloseTo(632.78135, 3);
    expect(vysledek(r, 'Glukóza (monohydrát)')).toBeCloseTo(7.326925, 5);
  });
  it('cíl pod zbytkovým CO₂ se odmítne', () => {
    expect(() => spocitej(vypocet('refermentace_cukr'), { t: 0, g: 3, v: 100 })).toThrow('netřeba');
  });
});

describe('ekonomika', () => {
  it('daň: 10 hl 12,4 °P (počítá se 12 celých), 32 Kč, malý pivovar 50 %: 1920 Kč, 1,92 Kč/L, 0,96 Kč na půllitr', () => {
    const r = spocitej(vypocet('spotrebni_dan'), { v: 10, p: 12.4, s: 32, sl: 50 });
    expect(mezikrok(r, 'Celé stupně Plato')).toBe(12);
    expect(vysledek(r, 'Daň')).toBeCloseTo(1920, 9);
    expect(vysledek(r, 'Daň na 1 L')).toBeCloseTo(1.92, 9);
    expect(vysledek(r, 'Daň na 0,5 L')).toBeCloseTo(0.96, 9);
    expect(mezikrok(spocitej(vypocet('spotrebni_dan'), { v: 1, p: 12, s: 32, sl: 100 }), 'Celé stupně Plato')).toBe(12);
  });
  it('náklady várky: součet 12 580 Kč na 10 hl = 1258 Kč/hl, 6,29 Kč na půllitr', () => {
    const r = spocitej(vypocet('naklady_varky'), {
      hl: 10, slad: 200, csl: 16, chmel: 2, cch: 700, kv: 800, kwh: 300, ce: 3, voda: 3, cv: 120, hod: 10, ch: 350, dan: 1920, jine: 500,
    });
    expect(vysledek(r, 'Náklady celkem')).toBeCloseTo(12580, 9);
    expect(vysledek(r, 'Náklady na hl')).toBeCloseTo(1258, 9);
    expect(vysledek(r, 'Náklady na 0,5 L')).toBeCloseTo(6.29, 9);
    expect(mezikrok(r, 'Slad')).toBe(3200);
  });
});
