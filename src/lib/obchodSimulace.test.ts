// 🧪 Simulace měsíce v obchodě: sklad, uzávěrky, odpisy, inventura, statistiky, mezery.
// Každé číslo, které aplikace ukazuje, se porovná s nezávislým výpočtem (účetní kniha den po dni).
import { describe, it, expect } from 'vitest';
import {
  fasovaniBezZbozi, pohybyZbozi, stavySkladu, uzaverkyPresInventuru, varovaniZasob, type VstupSkladu,
} from './obchodSklad';
import { prodejPoObdobich, prodejPoPivech, prodejPoZbozi, souhrnObdobi } from './obchodStatistika';
import { inventuraObchoduChybi, rozdilyInventury } from './obchodInventura';
import { mezeryUzaverek } from './obchodMezery';
import { spoctiUpozorneni } from './obchodUpozorneni';
import {
  KODY, OBALY, PIVA, ZBOZI, dnyMeziData, sInventurouNaKonci, sestavScenar, stavPodleKnihy, type Scenar,
} from './obchodSimulace.fixture';

const zakladni = sestavScenar();
// Konec měsíce: A (12° světlá) chybí 3 ks (manko), C (tmavá) je o 1 víc, PET o 2 míň, zbytek sedí.
const sInventurou = sInventurouNaKonci(zakladni, '2026-10-31', { '11001': -3, '11004': 1, '11141': -2 });

const stavLib = (s: Scenar, kod: string, datum: string) => stavySkladu(s.vstup, datum).find((x) => x.kod === kod)!.stav;

describe('sklad obchodu = účetní kniha, každý den a každé zboží', () => {
  it('bez inventury na konci měsíce: aplikace a kniha se shodnou na každý den 29. 9. – 10. 11.', () => {
    const rozdily: string[] = [];
    for (const d of dnyMeziData('2026-09-29', '2026-11-10')) {
      for (const kod of KODY) {
        const a = stavLib(zakladni, kod, d);
        const k = stavPodleKnihy(zakladni, kod, d);
        if (a !== k) rozdily.push(`${d} ${kod}: aplikace ${a}, kniha ${k}`);
      }
    }
    expect(rozdily).toEqual([]);
  });

  it('s inventurou na konci měsíce: shoda i po ní (po inventuře se počítá od napočítaného čísla)', () => {
    const rozdily: string[] = [];
    for (const d of dnyMeziData('2026-09-29', '2026-11-10')) {
      for (const kod of KODY) {
        const a = stavLib(sInventurou, kod, d);
        const k = stavPodleKnihy(sInventurou, kod, d);
        if (a !== k) rozdily.push(`${d} ${kod}: aplikace ${a}, kniha ${k}`);
      }
    }
    expect(rozdily).toEqual([]);
  });

  it('ručně spočítané kontrolní hodnoty (aby nesouhlasily jen dva stejně špatné výpočty)', () => {
    // Prodej: 12° světlá 1. 10. = 14 ks, 2. 10. = 23 ks; limo 3 a 5 ks; sud 1 a 1.
    expect(stavLib(zakladni, '11001', '2026-09-30')).toBe(100); // fasování 500 ks z 15. 9. už je v inventuře
    expect(stavLib(zakladni, '11001', '2026-10-01')).toBe(134); // 100 + 48 − 14
    expect(stavLib(zakladni, '11001', '2026-10-02')).toBe(111); // − 23
    expect(stavLib(zakladni, '15160', '2026-10-02')).toBe(16); // 24 − 3 − 5
    expect(stavLib(zakladni, '15160', '2026-10-03')).toBe(28); // + příjem 12
    expect(stavLib(zakladni, '10241', '2026-10-02')).toBe(6); // 6 + 2 − 1 − 1
  });

  it('před první inventurou je stav neznámý (null), ne nula', () => {
    for (const kod of KODY) expect(stavLib(zakladni, kod, '2026-09-29')).toBeNull();
  });

  it('po inventuře s mankem stav odpovídá napočítanému číslu a od něj se počítá dál', () => {
    const ocek = stavPodleKnihy(zakladni, '11001', '2026-10-31')!;
    expect(stavLib(sInventurou, '11001', '2026-10-31')).toBe(ocek - 3);
    // 1. 11. = napočítáno − prodej toho dne (a nic víc)
    const prodejNeděle = zakladni.vstup.radky
      .filter((r) => r.kod === '11001' && zakladni.vstup.uzaverky.find((u) => u.id === r.uzaverka_id)?.datum_do === '2026-11-01')
      .reduce((a, r) => a + Number(r.mnozstvi), 0);
    expect(stavLib(sInventurou, '11001', '2026-11-01')).toBe(ocek - 3 - prodejNeděle);
  });
});

describe('inventura na konci měsíce', () => {
  it('rozdíly proti očekávanému stavu jsou přesně ty tři odchylky, se správným znaménkem', () => {
    const stavy = stavySkladu(zakladni.vstup, '2026-10-31');
    const napocitano = new Map(sInventurou.vstup.inventury.filter((i) => i.datum === '2026-10-31').map((i) => [i.kod, Number(i.napocitano)]));
    const rozdily = rozdilyInventury(stavy.map((s) => ({ kod: s.kod, nazev: s.nazev, ocekavano: s.stav, napocitano: napocitano.get(s.kod)! })));
    expect(rozdily.map((r) => [r.kod, r.rozdil]).sort()).toEqual([['11001', -3], ['11004', 1], ['11141', -2]].sort());
  });

  it('připomínka: před koncem měsíce a po něm, dokud inventura chybí; po uložení utichne', () => {
    const bez = zakladni.vstup.inventury;
    expect(inventuraObchoduChybi(bez, '2026-10-20')).toBeNull(); // daleko od konce měsíce
    expect(inventuraObchoduChybi(bez, '2026-10-28')).toMatchObject({ mesic: '2026-10', naleha: false });
    expect(inventuraObchoduChybi(bez, '2026-11-02')).toMatchObject({ mesic: '2026-10', naleha: true });
    expect(inventuraObchoduChybi(sInventurou.vstup.inventury, '2026-11-02')).toBeNull();
  });
});

describe('hlídání zásob a upozornění — shodně s účetní knihou', () => {
  it('zboží pod minimem / vyprodané / v mínusu na každý den = podle knihy', () => {
    const rozdily: string[] = [];
    for (const d of dnyMeziData('2026-09-30', '2026-11-10')) {
      const oc = new Set<string>();
      for (const z of ZBOZI) {
        const k = stavPodleKnihy(sInventurou, z.kod, d);
        const min = z.min_ks == null ? null : Number(z.min_ks);
        if (k != null && (k < 0 || (min != null && min > 0 && k < min) || (min != null && min > 0 && k === 0))) oc.add(z.kod);
      }
      const app = new Set(varovaniZasob(stavySkladu(sInventurou.vstup, d)).map((v) => v.kod));
      if ([...oc].sort().join() !== [...app].sort().join()) rozdily.push(`${d}: kniha [${[...oc]}], aplikace [${[...app]}]`);
    }
    expect(rozdily).toEqual([]);
  });

  it('nafasované pivo bez zboží (Osma) se hlásí od první inventury', () => {
    const b = fasovaniBezZbozi(zakladni.vstup);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ beer_id: 'b8', package_id: 'l05', ks: 12, poslednDatum: '2026-10-08' });
  });

  it('odznak na ploše: součet je shodný s jednotlivými částmi a mění se podle dne', () => {
    for (const d of ['2026-10-02', '2026-10-09', '2026-10-30', '2026-11-02', '2026-11-06']) {
      const u = spoctiUpozorneni(sInventurou.vstup, zakladni.zavreno, d);
      expect(u.celkem).toBe(u.zasoby + u.fasovaniBezZbozi + u.mezery + (u.inventura ? 1 : 0));
      expect(u.zasoby).toBe(varovaniZasob(stavySkladu(sInventurou.vstup, d)).length);
    }
    // 30. 10. je v okně inventury a ta ještě nebyla zapsaná — jen ve scénáři bez ní se hlásí
    expect(spoctiUpozorneni(zakladni.vstup, zakladni.zavreno, '2026-10-30').inventura).toBe(true);
    expect(spoctiUpozorneni(sInventurou.vstup, zakladni.zavreno, '2026-11-02').inventura).toBe(false);
  });
});

describe('mezery v uzávěrkách', () => {
  it('chybí 3. 10. a 8.–9. 10.; 4. a 11. 10. jsou „zavřeno"', () => {
    const m = mezeryUzaverek({ uzaverky: zakladni.vstup.uzaverky, zavreno: zakladni.zavreno, dnes: '2026-11-06' });
    expect(m.map((x) => [x.od, x.do])).toEqual([['2026-10-03', '2026-10-03'], ['2026-10-08', '2026-10-09']]);
  });

  it('bez označení „zavřeno" přibydou ty dva dny', () => {
    const m = mezeryUzaverek({ uzaverky: zakladni.vstup.uzaverky, zavreno: [], dnes: '2026-11-06' });
    expect(m.map((x) => [x.od, x.do])).toEqual([
      ['2026-10-03', '2026-10-04'], ['2026-10-08', '2026-10-09'], ['2026-10-11', '2026-10-11'],
    ]);
  });
});

describe('statistiky prodeje — nezávisle přepočítané', () => {
  const v = { zbozi: ZBOZI, uzaverky: zakladni.vstup.uzaverky, radky: zakladni.vstup.radky, obaly: OBALY, piva: PIVA };
  const uzavDoMesice = (mesic: string) => zakladni.vstup.uzaverky.filter((u) => u.datum_do.startsWith(mesic));
  const radkyU = (ids: Set<string>) => zakladni.vstup.radky.filter((r) => ids.has(r.uzaverka_id));
  const objem = (kod: string) => {
    const z = ZBOZI.find((x) => x.kod === kod)!;
    return z.package_id ? Number(OBALY.find((o) => o.id === z.package_id)!.volume_l) : 0;
  };

  it('říjen: tržba, kusy a litry piv = součet z řádků uzávěrek', () => {
    const ids = new Set(uzavDoMesice('2026-10').map((u) => u.id));
    const r = radkyU(ids);
    const trzba = r.reduce((a, x) => a + Number(x.mnozstvi) * Number(x.cena), 0);
    const ksPiv = r.filter((x) => ZBOZI.find((z) => z.kod === x.kod)!.beer_id).reduce((a, x) => a + Number(x.mnozstvi), 0);
    const litry = r.reduce((a, x) => a + Number(x.mnozstvi) * objem(x.kod), 0);
    const s = souhrnObdobi(v, '2026-10-01', '2026-10-31');
    expect(s.uzaverek).toBe(ids.size);
    expect(s.trzba).toBeCloseTo(trzba, 2);
    expect(s.ks).toBe(ksPiv);
    expect(s.litry).toBeCloseTo(litry, 0);
  });

  it('po pivech: litry každého piva sedí a jejich součet je součet všech litrů', () => {
    const po = prodejPoPivech(v, '2026-10-01', '2026-10-31');
    const ids = new Set(uzavDoMesice('2026-10').map((u) => u.id));
    for (const p of po) {
      const kody = ZBOZI.filter((z) => z.beer_id === p.beerId).map((z) => z.kod);
      const ocek = radkyU(ids).filter((x) => kody.includes(x.kod)).reduce((a, x) => a + Number(x.mnozstvi) * objem(x.kod), 0);
      expect(p.litry).toBeCloseTo(ocek, 0);
    }
    expect(po.reduce((a, p) => a + p.litry, 0)).toBeCloseTo(souhrnObdobi(v, '2026-10-01', '2026-10-31').litry, 0);
  });

  it('po zboží: kusy každého zboží = součet řádků; po dnech, týdnech i měsících vychází stejná tržba', () => {
    const ids = new Set(uzavDoMesice('2026-10').map((u) => u.id));
    for (const z of prodejPoZbozi(v, '2026-10-01', '2026-10-31')) {
      const ks = radkyU(ids).filter((x) => x.kod === z.kod).reduce((a, x) => a + Number(x.mnozstvi), 0);
      expect(z.ks).toBe(ks);
    }
    const celkem = souhrnObdobi(v, '2026-10-01', '2026-11-30').trzba;
    for (const rozliseni of ['den', 'tyden', 'mesic'] as const) {
      const soucet = prodejPoObdobich(v, rozliseni, '2026-10-01', '2026-11-30').reduce((a, o) => a + o.trzba, 0);
      expect(soucet, `po ${rozliseni}`).toBeCloseTo(celkem, 2);
    }
    expect(prodejPoObdobich(v, 'mesic', '2026-10-01', '2026-11-30').map((o) => o.klic)).toHaveLength(2);
  });
});

describe('smazání uzávěrky vrátí kusy do skladu', () => {
  it('po smazání týdenní uzávěrky 12.–18. 10. je stav od 18. 10. vyšší přesně o její prodej', () => {
    const u = zakladni.vstup.uzaverky.find((x) => x.datum_od === '2026-10-12')!;
    const bez: Scenar = {
      ...zakladni,
      vstup: {
        ...zakladni.vstup,
        uzaverky: zakladni.vstup.uzaverky.filter((x) => x.id !== u.id),
        radky: zakladni.vstup.radky.filter((r) => r.uzaverka_id !== u.id),
      },
    };
    for (const kod of KODY) {
      const prodej = zakladni.vstup.radky.filter((r) => r.uzaverka_id === u.id && r.kod === kod).reduce((a, r) => a + Number(r.mnozstvi), 0);
      expect(stavLib(bez, kod, '2026-10-17')).toBe(stavLib(zakladni, kod, '2026-10-17')); // před koncem uzávěrky beze změny
      expect(stavLib(bez, kod, '2026-10-18')).toBe((stavLib(zakladni, kod, '2026-10-18') as number) + prodej);
      expect(stavLib(bez, kod, '2026-10-30')).toBe((stavLib(zakladni, kod, '2026-10-30') as number) + prodej);
    }
  });
});

describe('pohyby zboží (historie pod položkou)', () => {
  it('limo: inventura, příjem, odpis i prodeje jsou v historii se správnými kusy', () => {
    const p = pohybyZbozi('15160', zakladni.vstup, 200);
    const soucet = (druh: string) => p.filter((x) => x.druh === druh).reduce((a, x) => a + x.ks, 0);
    const prijemyScenare = zakladni.vstup.prijmy.filter((x) => x.kod === '15160').reduce((a, x) => a + Number(x.mnozstvi), 0);
    expect(prijemyScenare).toBeGreaterThan(0);
    expect(soucet('prijem')).toBe(prijemyScenare);
    expect(soucet('odpis')).toBe(-2);
    const prodejZRadku = zakladni.vstup.radky.filter((r) => r.kod === '15160').reduce((a, r) => a + Number(r.mnozstvi), 0);
    expect(soucet('prodej')).toBe(-prodejZRadku);
    // Historie dává dohromady stejný stav jako výpočet: inventura + příjmy − odpisy − prodej (vše po 30. 9.)
    const stav = 24 + soucet('prijem') + soucet('odpis') + soucet('prodej');
    expect(stav).toBe(stavLib(zakladni, '15160', '2026-11-10'));
  });
});

describe('týdenní uzávěrka přes inventuru (prodej před inventurou by se odečetl podruhé)', () => {
  /** Poslední týden měsíce zadaný jednou týdenní uzávěrkou (26. 10. – 1. 11.) místo denních; součty stejné. */
  function sTydennouPresInventuru(pravda: Scenar): Scenar {
    const dni = pravda.vstup.uzaverky.filter((u) => u.datum_do >= '2026-10-26' && u.datum_do <= '2026-11-01');
    const ids = new Set(dni.map((u) => u.id));
    const soucty = new Map<string, number>();
    for (const r of pravda.vstup.radky) if (ids.has(r.uzaverka_id)) soucty.set(r.kod, (soucty.get(r.kod) ?? 0) + Number(r.mnozstvi));
    return {
      ...pravda,
      vstup: {
        ...pravda.vstup,
        uzaverky: [...pravda.vstup.uzaverky.filter((u) => !ids.has(u.id)), { id: 'u-tyden', typ: 'tydenni', datum_od: '2026-10-26', datum_do: '2026-11-01', cislo: '2/3000', stredisko: '2' }],
        radky: [...pravda.vstup.radky.filter((r) => !ids.has(r.uzaverka_id)), ...[...soucty].map(([kod, mnozstvi]) => ({ uzaverka_id: 'u-tyden', kod, mnozstvi }))],
      },
    };
  }

  it('aplikace takovou uzávěrku pozná a ohlásí (a denní uzávěrky ne)', () => {
    expect(uzaverkyPresInventuru(sInventurou.vstup.uzaverky, sInventurou.vstup.inventury)).toEqual([]);
    const s = sTydennouPresInventuru(sInventurou);
    const p = uzaverkyPresInventuru(s.vstup.uzaverky, s.vstup.inventury);
    expect(p).toEqual([{ id: 'u-tyden', cislo: '2/3000', datum_od: '2026-10-26', datum_do: '2026-11-01', inventura: '2026-10-31' }]);
  });

  it('uzávěrka, která končí PŘESNĚ v den inventury, je v pořádku', () => {
    const u = [{ id: 'x', datum_od: '2026-10-25', datum_do: '2026-10-31', cislo: '2/1' }];
    expect(uzaverkyPresInventuru(u, [{ kod: 'A', datum: '2026-10-31' }])).toEqual([]);
  });

  it('uzávěrka, která začíná až PO inventuře, je v pořádku; inventura uprostřed ne', () => {
    const inv = [{ kod: 'A', datum: '2026-10-31' }];
    expect(uzaverkyPresInventuru([{ id: 'x', datum_od: '2026-11-01', datum_do: '2026-11-07', cislo: null }], inv)).toEqual([]);
    expect(uzaverkyPresInventuru([{ id: 'x', datum_od: '2026-10-31', datum_do: '2026-11-06', cislo: null }], inv)).toHaveLength(1);
  });

  it('starší inventura, kterou přepsala novější, se neřeší', () => {
    const inv = [{ kod: 'A', datum: '2026-10-10' }, { kod: 'A', datum: '2026-10-31' }];
    expect(uzaverkyPresInventuru([{ id: 'x', datum_od: '2026-10-05', datum_do: '2026-10-12', cislo: null }], inv)).toEqual([]);
  });

  it('důvod varování: sklad po takové uzávěrce ukazuje o prodej před inventurou míň, než je', () => {
    const pravda = sInventurou; // denní uzávěrky
    const spatne = sTydennouPresInventuru(sInventurou);
    // správně: 1. 11. = napočítáno 31. 10. − prodej 1. 11.; s týdenní uzávěrkou se odečte celý týden
    const prodejDoInventury = pravda.vstup.radky
      .filter((r) => r.kod === '11001' && pravda.vstup.uzaverky.find((u) => u.id === r.uzaverka_id)!.datum_do >= '2026-10-26' && pravda.vstup.uzaverky.find((u) => u.id === r.uzaverka_id)!.datum_do <= '2026-10-31')
      .reduce((a, r) => a + Number(r.mnozstvi), 0);
    const rozdil = (stavLib(spatne, '11001', '2026-11-01') as number) - (stavLib(pravda, '11001', '2026-11-01') as number);
    expect(rozdil).toBe(-prodejDoInventury);
    expect(prodejDoInventury).toBeGreaterThan(0);
  });
});

// Pomocný typ pro kontrolu, že fixture sedí s deklarovaným VstupSkladu (zachytí změnu tvaru dat).
const _typ: VstupSkladu = zakladni.vstup;
void _typ;
