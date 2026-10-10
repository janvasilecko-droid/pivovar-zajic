// Uzávěrka obchodu (10. 10. 2026): období, přiřazení zboží z pokladny, kontrola před zápisem.
import { describe, it, expect } from 'vitest';
import {
  datumZVytisteno, navrhZbozi, obalZNazvu, objemZCisla, obdobiUzaverky, pivoZNazvu, prekryvajiciUzaverky,
  pripravZapis, type RadekKZapisu, type VstupZapisu,
} from './obchodUzaverka';
import { UCTENKA_2873 } from '../../supabase/functions/_shared/uzaverka.fixture';

const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°' },
  { id: 'b12t', name: '12° Tmavá', degree: '12°' },
  { id: 'b10', name: '10° Desítka', degree: '10°' },
  { id: 'b11', name: '11° Světlá', degree: '11°' },
  { id: 'bja', name: 'Jantar', degree: '12°' },
  { id: 'bos', name: 'Osma', degree: '8°' },
];
const obaly = [
  { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'k20', label: 'KEG 20l', kind: 'keg', volume_l: 20 },
  { id: 'p15', label: 'PET 1.5l', kind: 'bottle', volume_l: 1.5 },
  { id: 'p1', label: 'PET 1l', kind: 'bottle', volume_l: 1 },
  { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'l033', label: 'Lahve 0.33l', kind: 'bottle', volume_l: 0.33 },
];

describe('obdobiUzaverky', () => {
  it('denní = ten den, týdenní = pondělí až neděle, měsíční = celý měsíc', () => {
    expect(obdobiUzaverky('denni', '2026-10-10')).toEqual({ od: '2026-10-10', do: '2026-10-10' });
    // 10. 10. 2026 je sobota
    expect(obdobiUzaverky('tydenni', '2026-10-10')).toEqual({ od: '2026-10-05', do: '2026-10-11' });
    expect(obdobiUzaverky('tydenni', '2026-10-11')).toEqual({ od: '2026-10-05', do: '2026-10-11' }); // neděle
    expect(obdobiUzaverky('tydenni', '2026-10-05')).toEqual({ od: '2026-10-05', do: '2026-10-11' }); // pondělí
    expect(obdobiUzaverky('mesicni', '2026-10-10')).toEqual({ od: '2026-10-01', do: '2026-10-31' });
    expect(obdobiUzaverky('mesicni', '2026-02-14')).toEqual({ od: '2026-02-01', do: '2026-02-28' });
  });

  it('datum z času tisku', () => {
    expect(datumZVytisteno('2026-10-10T10:09')).toBe('2026-10-10');
    expect(datumZVytisteno(null)).toBeNull();
  });
});

describe('prekryvajiciUzaverky', () => {
  const stare = [
    { datum_od: '2026-10-05', datum_do: '2026-10-05', stredisko: '2' },
    { datum_od: '2026-10-06', datum_do: '2026-10-06', stredisko: '3' },
  ];
  it('týdenní přes denní téhož týdne se kryje; jiné středisko ne', () => {
    expect(prekryvajiciUzaverky({ od: '2026-10-05', do: '2026-10-11', stredisko: '2' }, stare)).toHaveLength(1);
    expect(prekryvajiciUzaverky({ od: '2026-10-06', do: '2026-10-06', stredisko: '2' }, stare)).toHaveLength(0);
    expect(prekryvajiciUzaverky({ od: '2026-10-11', do: '2026-10-12', stredisko: '2' }, stare)).toHaveLength(0);
  });
});

describe('objem z účtenky (pokladna tiskne „l" jako 1)', () => {
  it('30l = 301, 0,5l = 0,51, 0,33l = 0,331, PET 1l = 11, PET 1,5l = 1,51', () => {
    expect(objemZCisla('301')).toBe(30);
    expect(objemZCisla('30')).toBe(30);
    expect(objemZCisla('0,51')).toBe(0.5);
    expect(objemZCisla('0,5')).toBe(0.5);
    expect(objemZCisla('0,331')).toBe(0.33);
    expect(objemZCisla('0,33')).toBe(0.33);
    expect(objemZCisla('11')).toBe(1);
    expect(objemZCisla('1')).toBe(1);
    expect(objemZCisla('1,51')).toBe(1.5);
    expect(objemZCisla('1,5')).toBe(1.5);
    expect(objemZCisla('abc')).toBeNull();
  });

  it('z názvu zboží, i tak, jak ho vytiskne pokladna', () => {
    expect(obalZNazvu('Pivo sud 30l 10° světlá')).toEqual({ druh: 'sud', objem: 30 });
    expect(obalZNazvu('Pivo sud 301 10è svetla')).toEqual({ druh: 'sud', objem: 30 });
    expect(obalZNazvu('Pivo sklo 12è svetla 0,331')).toEqual({ druh: 'sklo', objem: 0.33 });
    expect(obalZNazvu('Pivo sklo 10% sv. 0,51')).toEqual({ druh: 'sklo', objem: 0.5 });
    expect(obalZNazvu('Pivo PET 11 12è svetla')).toEqual({ druh: 'pet', objem: 1 });
    expect(obalZNazvu('Pivo PET 1,51 12ejantarovy lez')).toEqual({ druh: 'pet', objem: 1.5 });
    expect(obalZNazvu('Kartonek')).toBeNull();
  });
});

describe('návrh zboží z názvu', () => {
  it('všech 20 piv z účtenky 2/2873 dostane pivo i obal, žádné se nehádá', () => {
    const pivni = UCTENKA_2873.radky.filter((r) => /^pivo/i.test(r.nazev));
    expect(pivni).toHaveLength(20);
    const ocekavano: Record<string, [string, string]> = {
      '10241': ['b10', 'k30'], '10242': ['b12s', 'k30'],
      '11000': ['b12s', 'l033'], '11001': ['b12s', 'l05'], '11004': ['b12t', 'l05'], '11005': ['b12t', 'l033'],
      '11009': ['b10', 'l05'], '11140': ['b10', 'p1'], '11141': ['b12s', 'p1'], '11142': ['bja', 'p1'],
      '11143': ['b12t', 'p1'], '11144': ['b11', 'p1'], '11146': ['b10', 'p15'], '11147': ['b12s', 'p15'],
      '11148': ['bja', 'p15'], '11149': ['b12t', 'p15'], '11172': ['b11', 'l033'], '11190': ['b11', 'p15'],
      '11197': ['bos', 'p1'], '11198': ['bos', 'p15'],
    };
    for (const r of pivni) {
      const n = navrhZbozi(r.nazev, piva, obaly);
      expect(n.jePivo).toBe(true);
      expect([r.kod, n.beer?.id, n.pkg?.id]).toEqual([r.kod, ...ocekavano[r.kod]]);
    }
  });

  it('PET se pozná, i když je v katalogu vedený jako druh „pet" místo „bottle"', () => {
    const sPet = obaly.map((o) => (o.id === 'p15' ? { ...o, kind: 'pet' } : o));
    expect(navrhZbozi('Pivo PET 1,5l 12° světlá', piva, sPet).pkg?.id).toBe('p15');
    // sud se kvůli tomu s PET nesplete
    expect(navrhZbozi('Pivo sud 30l 12° světlá', piva, sPet).pkg?.id).toBe('k30');
  });

  it('limo, saponát, kartonek, půllitr, gel jsou ostatní zboží', () => {
    for (const kod of ['393', '1106', '11111', '15117', '15160', '62019']) {
      const r = UCTENKA_2873.radky.find((x) => x.kod === kod)!;
      expect(navrhZbozi(r.nazev, piva, obaly)).toEqual({ jePivo: false });
    }
  });

  it('dvě stejně dobrá piva = nevím, ne tip', () => {
    const dvojita = [...piva, { id: 'b12x', name: '12° Světlá speciál', degree: '12°' }];
    expect(pivoZNazvu('Pivo PET 1l 12° světlá', dvojita)).toBeUndefined();
  });

  it('obal, který v katalogu není, se nehádá', () => {
    expect(navrhZbozi('Pivo sud 30l 10° světlá', piva, obaly.filter((o) => o.id !== 'k30')).pkg).toBeUndefined();
  });
});

// ── pripravZapis ──────────────────────────────────────────────────────────

const radkyZUctenky = (): RadekKZapisu[] =>
  UCTENKA_2873.radky.map((r) => {
    const n = navrhZbozi(r.nazev, piva, obaly);
    return {
      ...r,
      prirazeni: n.jePivo && n.beer && n.pkg
        ? { druh: 'pivo' as const, beerId: n.beer.id, pkgId: n.pkg.id }
        : { druh: 'ostatni' as const },
    };
  });

const vstup = (p: Partial<VstupZapisu> = {}): VstupZapisu => ({
  typ: 'denni', od: '2026-10-10', do: '2026-10-10', cislo: '2/2873', stredisko: '2',
  vytisteno: '2026-10-10T10:09', celkem: 20675, radky: radkyZUctenky(), znameZbozi: [], existujiciUzaverky: [], ...p,
});

describe('pripravZapis', () => {
  it('celá účtenka 2/2873 jde uložit a založí 26 kusů zboží', () => {
    const z = pripravZapis(vstup());
    expect(z.chyby).toEqual([]);
    expect(z.noveZbozi).toHaveLength(26);
    const sud = z.noveZbozi.find((x) => x.kod === '10241')!;
    expect(sud).toMatchObject({ beer_id: 'b10', package_id: 'k30', cena: 1275 });
    expect(z.noveZbozi.find((x) => x.kod === '1106')).toMatchObject({ beer_id: null, package_id: null });
  });

  it('zboží, které už v obchodě je, se znovu nezakládá', () => {
    const z = pripravZapis(vstup({
      znameZbozi: [{ kod: '10241', nazev: 'Pivo sud 30l 10° světlá', beer_id: 'b10', package_id: 'k30' }],
      radky: radkyZUctenky().map((r) => (r.kod === '10241' ? { ...r, prirazeni: { druh: 'zname' as const } } : r)),
    }));
    expect(z.chyby).toEqual([]);
    expect(z.noveZbozi).toHaveLength(25);
  });

  it('nepřiřazené zboží brání uložení', () => {
    const z = pripravZapis(vstup({ radky: radkyZUctenky().map((r) => (r.kod === '11141' ? { ...r, prirazeni: { druh: 'nevyreseno' as const } } : r)) }));
    expect(z.chyby.join(' ')).toContain('11141');
    expect(z.chyby.join(' ')).toContain('ještě není v obchodě');
  });

  it('chybně přečtené množství brání uložení a ukáže, o jaký řádek jde', () => {
    const radky = radkyZUctenky();
    radky[2] = { ...radky[2], mnozstvi: 6 };
    expect(pripravZapis(vstup({ radky })).chyby.join(' ')).toContain('10241');
  });

  it('chybí typ uzávěrky, období je obrácené', () => {
    expect(pripravZapis(vstup({ typ: null })).chyby[0]).toContain('denní, týdenní, měsíční');
    expect(pripravZapis(vstup({ od: '2026-10-11', do: '2026-10-10' })).chyby.join(' ')).toContain('dřív než začátek');
  });

  it('překryv s jinou uzávěrkou a stejné číslo se hlásí', () => {
    const existujici = [{ datum_od: '2026-10-05', datum_do: '2026-10-11', stredisko: '2', cislo: '2/2860', typ: 'tydenni' }];
    const t = pripravZapis(vstup({ existujiciUzaverky: existujici })).chyby.join(' ');
    expect(t).toContain('kryje s už zapsanou uzávěrkou');
    expect(t).toContain('2/2860');
    const stejna = pripravZapis(vstup({ existujiciUzaverky: [{ datum_od: '2026-09-01', datum_do: '2026-09-01', stredisko: '2', cislo: '2/2873', typ: 'denni' }] }));
    expect(stejna.chyby.join(' ')).toContain('už je zapsaná');
  });

  it('dvojice pivo + obal, která už má jiný kód, brání uložení', () => {
    const z = pripravZapis(vstup({
      znameZbozi: [{ kod: '99999', nazev: 'Pivo PET 1l 12° světlá (jiný kód)', beer_id: 'b12s', package_id: 'p1' }],
    }));
    expect(z.chyby.join(' ')).toContain('už má v obchodě zboží s kódem 99999');
  });
});
