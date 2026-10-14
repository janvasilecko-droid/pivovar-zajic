// Účtenka z pokladny na víc fotek: slučování bez zdvojení (14. 10. 2026, majitel:
// „kontrola dat, kdyby se vyfotila na víckrát, ať se stejná data nesčítají nebo
// neodečítají víckrát"). Základ: skutečná účtenka 2/2873 (26 položek, Celkem 20675)
// rozdělená na dvě fotky, které se překrývají.
import { describe, it, expect } from 'vitest';
import { UCTENKA_2873 } from '../../supabase/functions/_shared/uzaverka.fixture';
import { souctRadku, zkontrolujUzaverku, type PrectenaUzaverka, type RadekUzaverky } from '../../supabase/functions/_shared/uzaverka';
import { jeNeuplnyRadek, jeStejnyRadek, popisSlouceni, slucUctenky, vlozPodleKodu } from './uctenkaSlouceni';

const radek = (i: number): RadekUzaverky => ({ ...UCTENKA_2873.radky[i] });
const radky = (od: number, do_: number): RadekUzaverky[] => UCTENKA_2873.radky.slice(od, do_ + 1).map((r) => ({ ...r }));
const bezHlavicky = { cislo: null, stredisko: null, vytisteno: null, celkem: null };

/** Horní část účtenky: hlavička a řádky 0–13, Celkem na fotce není. */
const horni = (): PrectenaUzaverka => ({ cislo: '2/2873', stredisko: '2', vytisteno: '2026-10-10T10:09', celkem: null, radky: radky(0, 13) });
/** Dolní část: řádky 11–25 (tři řádky překryvu) a Celkem, bez hlavičky. */
const dolni = (): PrectenaUzaverka => ({ ...bezHlavicky, celkem: 20675, radky: radky(11, 25) });

const utrzeny = (r: RadekUzaverky): RadekUzaverky => ({ ...r, mnozstvi: Number.NaN, cena: null, celkem: null });

describe('dvě fotky jedné účtenky, které se překrývají', () => {
  it('řádky z překryvu se nepřičtou podruhé, zbytek se přidá', () => {
    const v = slucUctenky(horni(), dolni());
    expect(v.jina).toBeNull();
    expect(v.stejne.map((r) => r.kod)).toEqual(['11141', '11142', '11143']);
    expect(v.pridat.map((r) => r.kod)).toEqual(UCTENKA_2873.radky.slice(14).map((r) => r.kod));
    expect(v.rozdilne).toEqual([]);
    expect(v.doplnit).toEqual([]);
  });

  it('po sloučení je to celá účtenka: 26 řádků, součet 20 675 Kč sedí s Celkem, žádný problém', () => {
    const horniFotka = horni();
    const v = slucUctenky(horniFotka, dolni());
    const spojene: PrectenaUzaverka = {
      ...horniFotka, ...v.hlavicka,
      radky: vlozPodleKodu(horniFotka.radky, v.pridat),
    };
    expect(spojene.radky).toHaveLength(26);
    expect(spojene.radky.map((r) => r.kod)).toEqual(UCTENKA_2873.radky.map((r) => r.kod));
    expect(souctRadku(spojene.radky)).toBe(20675);
    expect(spojene.celkem).toBe(20675);
    expect(zkontrolujUzaverku(spojene)).toEqual({ problemy: [], skore: 0 });
  });

  it('Celkem z druhé fotky se doplní do hlavičky; číslo a čas z první zůstávají', () => {
    expect(slucUctenky(horni(), dolni()).hlavicka).toEqual({ celkem: 20675 });
  });

  it('opačné pořadí: nejdřív dolní část, pak horní — řádky se srovnají podle kódu a hlavička se doplní', () => {
    const dolniFotka = dolni();
    const v = slucUctenky(dolniFotka, horni());
    expect(v.hlavicka).toEqual({ cislo: '2/2873', stredisko: '2', vytisteno: '2026-10-10T10:09' });
    expect(v.stejne).toHaveLength(3);
    const spojene = vlozPodleKodu(dolniFotka.radky, v.pridat);
    expect(spojene.map((r) => r.kod)).toEqual(UCTENKA_2873.radky.map((r) => r.kod));
    expect(souctRadku(spojene)).toBe(20675);
  });

  it('tatáž fotka podruhé: nic se nepřidá, všechno je „stejné"', () => {
    const celaFotka = UCTENKA_2873 as PrectenaUzaverka;
    const v = slucUctenky(celaFotka, JSON.parse(JSON.stringify(celaFotka)));
    expect(v.pridat).toEqual([]);
    expect(v.stejne).toHaveLength(26);
    expect(v.hlavicka).toEqual({});
    expect(v.rozdilne).toEqual([]);
  });

  it('čísla v jiném zápisu (1275.00 × 1275) jsou tentýž řádek', () => {
    expect(jeStejnyRadek(radek(2), { ...radek(2), cena: 1275.0001 })).toBe(true);
    expect(jeStejnyRadek(radek(2), { ...radek(2), cena: 1276 })).toBe(false);
  });
});

describe('řádek utržený na kraji fotky', () => {
  it('utržený na konci první fotky, celý na druhé → doplní se, nezdvojí', () => {
    const prvni = horni();
    prvni.radky[13] = utrzeny(prvni.radky[13]);
    expect(jeNeuplnyRadek(prvni.radky[13])).toBe(true);
    const v = slucUctenky(prvni, dolni());
    expect(v.doplnit).toHaveLength(1);
    expect(v.doplnit[0].kod).toBe('11143');
    expect(v.doplnit[0].radek).toMatchObject({ mnozstvi: 3, cena: 86, celkem: 258 });
    expect(v.pridat.map((r) => r.kod)).not.toContain('11143');
    expect(v.stejne.map((r) => r.kod)).toEqual(['11141', '11142']);
  });

  it('utržený na kraji druhé fotky, celý už v seznamu je → zůstane ten celý', () => {
    const druha = dolni();
    druha.radky[0] = utrzeny(druha.radky[0]);   // 11141
    const v = slucUctenky(horni(), druha);
    expect(v.stejne.map((r) => r.kod)).toContain('11141');
    expect(v.rozdilne).toEqual([]);
    expect(v.doplnit).toEqual([]);
  });

  it('částečně známý řádek: sedí-li známá čísla, doplní se; nesedí-li, je to rozdíl', () => {
    const prvni = horni();
    prvni.radky[13] = { ...prvni.radky[13], mnozstvi: Number.NaN, celkem: null };          // známá je jen cena 86
    expect(slucUctenky(prvni, dolni()).doplnit.map((d) => d.kod)).toEqual(['11143']);

    const spatna = horni();
    spatna.radky[13] = { ...spatna.radky[13], mnozstvi: Number.NaN, celkem: null, cena: 99 };
    const v = slucUctenky(spatna, dolni());
    expect(v.doplnit).toEqual([]);
    expect(v.rozdilne).toEqual(['11143']);
  });
});

describe('stejný kód, jiná čísla', () => {
  it('oba řádky se přidají a kód se ohlásí — jeden z nich je špatně přečtený', () => {
    const druha = dolni();
    druha.radky[0] = { ...druha.radky[0], mnozstvi: 3, cena: 1360, celkem: 4080 };   // 11141 přečteno jinak
    const v = slucUctenky(horni(), druha);
    expect(v.rozdilne).toEqual(['11141']);
    expect(v.pridat.map((r) => r.kod)).toContain('11141');
    // …a kontrola „kód je na účtence dvakrát" pak nedovolí uložit, dokud jeden nezmizí.
    const spojene: PrectenaUzaverka = { ...horni(), radky: [...horni().radky, ...v.pridat.filter((r) => r.kod === '11141')] };
    expect(zkontrolujUzaverku(spojene).problemy.map((p) => p.text).join(' ')).toContain('je na účtence dvakrát');
  });
});

describe('jiná účtenka', () => {
  const sPrvni = (zmena: Partial<PrectenaUzaverka>) => slucUctenky(horni(), { ...dolni(), ...zmena });

  it('jiné číslo uzávěrky: nic se nesloučí', () => {
    const v = sPrvni({ cislo: '2/2874' });
    expect(v.jina).toContain('jiná uzávěrka (č. 2/2874)');
    expect(v.jina).toContain('načtená je č. 2/2873');
    expect(v.pridat).toEqual([]);
    expect(v.stejne).toEqual([]);
    expect(v.hlavicka).toEqual({});
  });

  it('číslo s mezerami je totéž číslo', () => {
    expect(sPrvni({ cislo: '2 / 2873' }).jina).toBeNull();
  });

  it('jiné středisko, jiný čas tisku nebo jiné Celkem', () => {
    expect(sPrvni({ stredisko: '1' }).jina).toContain('jiného střediska');
    expect(sPrvni({ vytisteno: '2026-10-10T11:30' }).jina).toContain('jiná účtenka (vytištěno 2026-10-10 11:30)');
    expect(slucUctenky({ ...horni(), celkem: 1000 }, dolni()).jina).toContain('jiné „Celkem“');
  });

  it('čas tisku s vteřinami je tentýž čas', () => {
    expect(sPrvni({ vytisteno: '2026-10-10T10:09:00' }).jina).toBeNull();
  });
});

describe('řádky bez kódu a prázdné čtení', () => {
  it('řádek bez kódu se nedá spárovat, přidá se (kontrola ho pak ohlásí)', () => {
    const v = slucUctenky(horni(), { ...bezHlavicky, radky: [{ kod: '', nazev: 'něco', mnozstvi: 1, cena: 5, celkem: 5 }] });
    expect(v.pridat).toHaveLength(1);
    expect(v.stejne).toEqual([]);
  });

  it('z fotky se nepřečetlo nic: nic se nezmění', () => {
    const v = slucUctenky(horni(), { ...bezHlavicky, radky: [] });
    expect(v).toMatchObject({ pridat: [], stejne: [], doplnit: [], rozdilne: [], hlavicka: {}, jina: null });
  });

  it('do prázdného seznamu se přidá všechno, i s hlavičkou', () => {
    const v = slucUctenky({ ...bezHlavicky, radky: [] }, horni());
    expect(v.pridat).toHaveLength(14);
    expect(v.hlavicka).toEqual({ cislo: '2/2873', stredisko: '2', vytisteno: '2026-10-10T10:09' });
  });
});

describe('vlozPodleKodu', () => {
  const k = (...kody: string[]) => kody.map((kod) => ({ kod }));

  it('vzestupné kódy se spojí podle kódu (číselně, ne podle abecedy)', () => {
    expect(vlozPodleKodu(k('1106', '11000'), k('393', '10241')).map((r) => r.kod)).toEqual(['393', '1106', '10241', '11000']);
  });

  it('při stejném kódu je existující první', () => {
    const a = [{ kod: '5', zdroj: 'a' }];
    const b = [{ kod: '5', zdroj: 'b' }];
    expect(vlozPodleKodu(a, b).map((r) => r.zdroj)).toEqual(['a', 'b']);
  });

  it('když pořadí není vzestupné nebo kód není číslo, nové řádky jdou na konec', () => {
    expect(vlozPodleKodu(k('50', '10'), k('20')).map((r) => r.kod)).toEqual(['50', '10', '20']);
    expect(vlozPodleKodu(k('10', 'A5'), k('20')).map((r) => r.kod)).toEqual(['10', 'A5', '20']);
    expect(vlozPodleKodu(k('10', '30'), k('40', '20')).map((r) => r.kod)).toEqual(['10', '30', '40', '20']);
  });

  it('nic nového = stejné pole', () => {
    const a = k('1', '2');
    expect(vlozPodleKodu(a, [])).toBe(a);
  });
});

describe('popisSlouceni', () => {
  it('věta o tom, co se z další fotky stalo', () => {
    const v = slucUctenky(horni(), dolni());
    expect(popisSlouceni(v)).toBe('Přidáno 12 nových řádků; 3 řádky byly už načtených z předchozí fotky (podruhé se nepřičetly).');
  });

  it('jednotné a množné číslo', () => {
    const base = { pridat: [], stejne: [], doplnit: [], rozdilne: [], hlavicka: {}, jina: null };
    expect(popisSlouceni({ ...base, pridat: [radek(0)] })).toBe('Přidáno 1 nový řádek.');
    expect(popisSlouceni({ ...base, pridat: radky(0, 2), stejne: [radek(3)] })).toBe('Přidáno 3 nové řádky; 1 řádek byl už načtených z předchozí fotky (podruhé se nepřičetly).');
    expect(popisSlouceni({ ...base, pridat: radky(0, 4) })).toBe('Přidáno 5 nových řádků.');
    expect(popisSlouceni({ ...base, doplnit: [{ kod: '1', radek: radek(0) }] })).toBe('1 utržený řádek se doplnil.');
  });

  it('nic nového', () => {
    const base = { pridat: [], stejne: [], doplnit: [], rozdilne: [], hlavicka: {}, jina: null };
    expect(popisSlouceni(base)).toContain('nic nepřidalo');
  });
});
