// Čtení uzávěrky z pokladny: čísla se kontrolují proti sobě, nic se nedomýšlí.
import { describe, it, expect } from 'vitest';
import {
  cislo, cistyKod, datumCasZTextu, normalizujUzaverku, souctRadku, uzaverkaZTextu, zkontrolujUzaverku,
  type PrectenaUzaverka,
} from './uzaverka';
import { UCTENKA_2873 } from './uzaverka.fixture';

const kopie = (): PrectenaUzaverka => JSON.parse(JSON.stringify(UCTENKA_2873));

describe('cislo', () => {
  it('rozumí českému i anglickému zápisu', () => {
    expect(cislo('1275,00')).toBe(1275);
    expect(cislo('1 275,00')).toBe(1275);
    expect(cislo('1.275,00')).toBe(1275);
    expect(cislo('1,275.00')).toBe(1275);
    expect(cislo('20675.00 Kč')).toBe(20675);
    expect(cislo(8)).toBe(8);
  });

  it('čemu nerozumí, to je null — ne nula', () => {
    expect(cislo('')).toBeNull();
    expect(cislo('osm')).toBeNull();
    expect(cislo(null)).toBeNull();
    expect(cislo(Number.NaN)).toBeNull();
  });
});

describe('datumCasZTextu', () => {
  it('z účtenky i z ISO', () => {
    expect(datumCasZTextu('10.10.2026 10:09')).toBe('2026-10-10T10:09');
    expect(datumCasZTextu('9. 10. 2026 8:05')).toBe('2026-10-09T08:05');
    expect(datumCasZTextu('2026-10-10T10:09:00')).toBe('2026-10-10T10:09');
    expect(datumCasZTextu('2026-10-10')).toBe('2026-10-10');
    expect(datumCasZTextu('včera')).toBeNull();
  });
});

describe('cistyKod', () => {
  it('jen číslice a písmena', () => {
    expect(cistyKod(' 10241 ')).toBe('10241');
    expect(cistyKod(10241)).toBe('10241');
    expect(cistyKod('10 241')).toBe('10241');
    expect(cistyKod(null)).toBe('');
  });
});

describe('skutečná účtenka 2/2873', () => {
  it('čísla sedí sama se sebou: žádný problém, součet 20 675 Kč', () => {
    expect(souctRadku(UCTENKA_2873.radky)).toBe(20675);
    expect(zkontrolujUzaverku(UCTENKA_2873)).toEqual({ problemy: [], skore: 0 });
  });

  it('má 26 položek a žádný kód dvakrát', () => {
    expect(UCTENKA_2873.radky).toHaveLength(26);
    expect(new Set(UCTENKA_2873.radky.map((r) => r.kod)).size).toBe(26);
  });

  it('chybně přečtené množství se chytí a nabídne se, kolik by vyšlo z částky', () => {
    const u = kopie();
    u.radky[2].mnozstvi = 6; // 10241: 8 × 1275 = 10200, přečteno 6
    const { problemy } = zkontrolujUzaverku(u);
    const p = problemy.find((x) => x.radek === 2);
    expect(p?.text).toContain('6 × 1275 = 7650, ale na účtence je 10200');
    expect(p?.navrzeneMnozstvi).toBe(8);
    // Součet částek sedí s Celkem dál — chyba je jen v jednom řádku, ne v účtence.
    expect(problemy).toHaveLength(1);
  });

  it('vynechaný řádek: součet nesedí s Celkem', () => {
    const u = kopie();
    u.radky.splice(11, 1); // 11141: 1092 Kč
    const { problemy } = zkontrolujUzaverku(u);
    expect(problemy).toHaveLength(1);
    expect(problemy[0].radek).toBeNull();
    expect(problemy[0].text).toContain('rozdíl 1092');
  });

  it('kód dvakrát a chybějící údaje', () => {
    const u = kopie();
    u.radky[5].kod = '11000';
    u.radky[3].cena = null;
    u.radky[4].mnozstvi = Number.NaN;
    const t = zkontrolujUzaverku(u).problemy.map((p) => p.text).join(' | ');
    expect(t).toContain('je na účtence dvakrát');
    expect(t).toContain('chybí cena');
    expect(t).toContain('množství chybí');
  });

  it('chybí Celkem nebo řádky', () => {
    expect(zkontrolujUzaverku({ ...kopie(), celkem: null }).problemy[0].text).toContain('Celkem');
    expect(zkontrolujUzaverku({ cislo: null, stredisko: null, vytisteno: null, celkem: 0, radky: [] }).problemy[0].text).toContain('žádné řádky');
  });

  it('haléřové zaokrouhlení pokladny není chyba', () => {
    const u = kopie();
    u.celkem = 20675.4;
    expect(zkontrolujUzaverku(u).problemy).toEqual([]);
  });
});

describe('normalizujUzaverku a uzaverkaZTextu', () => {
  it('textová čísla, český zápis, kód s mezerou', () => {
    const u = normalizujUzaverku({
      cislo: '2/2873', stredisko: 2, vytisteno: '10.10.2026 10:09', celkem: '20 675,00',
      radky: [{ kod: ' 10241 ', nazev: 'Pivo sud 30l 10° světlá', mnozstvi: '8', cena: '1275,00', celkem: '10200,00' }],
    });
    expect(u).toEqual({
      cislo: '2/2873', stredisko: '2', vytisteno: '2026-10-10T10:09', celkem: 20675,
      radky: [{ kod: '10241', nazev: 'Pivo sud 30l 10° světlá', mnozstvi: 8, cena: 1275, celkem: 10200 }],
    });
  });

  it('chybějící množství se nedosadí jako nula', () => {
    const u = normalizujUzaverku({ radky: [{ kod: '1', nazev: 'x', cena: 5, celkem: 5 }] });
    expect(Number.isNaN(u.radky[0].mnozstvi)).toBe(true);
  });

  it('prázdné řádky se zahodí', () => {
    expect(normalizujUzaverku({ radky: [{}, null, 'x'] }).radky).toEqual([]);
  });

  it('odpověď v ``` blocích a s řečí okolo', () => {
    const odpoved = 'Tady je to:\n```json\n{"cislo":"2/2873","celkem":140,"radky":[{"kod":"393","nazev":"Půllitr","mnozstvi":1,"cena":140,"celkem":140}]}\n```';
    const u = uzaverkaZTextu(odpoved);
    expect(u.cislo).toBe('2/2873');
    expect(u.radky).toHaveLength(1);
  });

  it('rozbitý JSON je prázdná uzávěrka, ne výjimka', () => {
    expect(uzaverkaZTextu('nesmysl').radky).toEqual([]);
    expect(uzaverkaZTextu('').cislo).toBeNull();
  });
});
