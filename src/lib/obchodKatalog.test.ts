// Nabídka zboží k přidání (10. 10. 2026): „jednotlivý piva, půllitry, kosmetika — zatím ty z té výdejky".
import { describe, it, expect } from 'vitest';
import {
  KATALOG_VYDEJKY, SKUPINY, cenaZPolicka, chybaKoduRucne, dlazdiceSkupiny, jeVolitelna, nazevZboziPiva, obalyProdejny,
  velikostiPiva, zapisZDlazdic, zapisZVoleb,
} from './obchodKatalog';
import { UCTENKA_2873 } from '../../supabase/functions/_shared/uzaverka.fixture';

// Katalog piv a obalů podle seed migrace (skutečné názvy v databázi) + Osma.
const piva = [
  { id: 'b12s', name: '12° Světlá', degree: '12°' }, { id: 'b11', name: '11° Světlá', degree: '11°' },
  { id: 'b10', name: '10° Desítka', degree: '10°' }, { id: 'b12t', name: '12° Tmavá', degree: '12°' },
  { id: 'bja', name: 'Jantar', degree: null }, { id: 'bos', name: 'Osma', degree: '8°' },
];
const obaly = [
  { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'l15', label: 'Lahve 1.5l', kind: 'bottle', volume_l: 1.5 }, { id: 'l1', label: 'Lahve 1l', kind: 'bottle', volume_l: 1 },
  { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 }, { id: 'l033', label: 'Lahve 0.33l', kind: 'bottle', volume_l: 0.33 },
];

describe('nabídka zboží z účtenky', () => {
  it('je to přesně zboží z účtenky 2/2873: stejné kódy, názvy i ceny', () => {
    const naUctence = new Map(UCTENKA_2873.radky.map((r) => [r.kod, r]));
    expect(KATALOG_VYDEJKY.map((p) => p.kod).sort()).toEqual([...naUctence.keys()].sort());
    for (const p of KATALOG_VYDEJKY) {
      expect(p.nazev, p.kod).toBe(naUctence.get(p.kod)!.nazev);
      expect(p.cena, p.kod).toBe(naUctence.get(p.kod)!.cena);
    }
  });

  it('kódy se neopakují a skupiny jsou piva (20), půllitry, kosmetika, ostatní', () => {
    expect(new Set(KATALOG_VYDEJKY.map((p) => p.kod)).size).toBe(KATALOG_VYDEJKY.length);
    const pocty = Object.fromEntries(SKUPINY.map((s) => [s.id, KATALOG_VYDEJKY.filter((p) => p.skupina === s.id).length]));
    expect(pocty).toEqual({ piva: 20, pullitry: 1, kosmetika: 1, ostatni: 4 });
    expect(KATALOG_VYDEJKY.find((p) => p.kod === '393')!.skupina).toBe('pullitry');
    expect(KATALOG_VYDEJKY.find((p) => p.kod === '62019')!.skupina).toBe('kosmetika');
  });
});

describe('dlaždice podle toho, co už v obchodě je', () => {
  it('prázdný obchod: všech 20 piv se spáruje s pivem a obalem a všechno je k přidání', () => {
    const d = dlazdiceSkupiny([], piva, obaly);
    expect(d.piva.every((x) => x.stav === 'nove' && x.pivo && x.obal)).toBe(true);
    expect(d.piva.find((x) => x.polozka.kod === '11001')).toMatchObject({ pivo: { id: 'b12s' }, obal: { id: 'l05' } });
    expect(d.piva.find((x) => x.polozka.kod === '10241')).toMatchObject({ pivo: { id: 'b10' }, obal: { id: 'k30' } });
    expect(d.piva.find((x) => x.polozka.kod === '11198')).toMatchObject({ pivo: { id: 'bos' }, obal: { id: 'l15' } });
    for (const s of ['pullitry', 'kosmetika', 'ostatni'] as const) expect(d[s].every((x) => x.stav === 'nove')).toBe(true);
  });

  it('zboží, které v obchodě je, se nedá znovu zvolit', () => {
    const d = dlazdiceSkupiny([{ kod: '11001', nazev: 'x', beer_id: 'b12s', package_id: 'l05', aktivni: true }], piva, obaly);
    const x = d.piva.find((y) => y.polozka.kod === '11001')!;
    expect(x.stav).toBe('v_obchode');
    expect(jeVolitelna(x)).toBe(false);
  });

  it('vypnuté zboží jde zase zapnout, ale ne když jeho pivo + obal mezitím zabralo jiné zboží', () => {
    const vypnute = { kod: '11001', nazev: 'x', beer_id: 'b12s', package_id: 'l05', aktivni: false };
    expect(dlazdiceSkupiny([vypnute], piva, obaly).piva.find((y) => y.polozka.kod === '11001')!.stav).toBe('vypnute');
    const zabrano = dlazdiceSkupiny([vypnute, { kod: '99999', nazev: 'jiné světlé 0,5l', beer_id: 'b12s', package_id: 'l05', aktivni: true }], piva, obaly);
    expect(zabrano.piva.find((y) => y.polozka.kod === '11001')).toMatchObject({ stav: 'obsazeno', obsazenoKym: 'jiné světlé 0,5l' });
  });

  it('stejné pivo + obal pod jiným kódem: dlaždice je zablokovaná a řekne kým', () => {
    const d = dlazdiceSkupiny([{ kod: '55555', nazev: 'Moje světlá lahev', beer_id: 'b12s', package_id: 'l05', aktivni: true }], piva, obaly);
    expect(d.piva.find((y) => y.polozka.kod === '11001')).toMatchObject({ stav: 'obsazeno', obsazenoKym: 'Moje světlá lahev' });
  });

  it('chybí-li v katalogu obal (třeba PET 1,5 l), dlaždice se nedá zvolit a nic se nehádá', () => {
    const bezPet = obaly.filter((o) => o.id !== 'l15');
    const d = dlazdiceSkupiny([], piva, bezPet);
    const x = d.piva.find((y) => y.polozka.kod === '11147')!;
    expect(x.stav).toBe('chybi_katalog');
    expect(jeVolitelna(x)).toBe(false);
    expect(zapisZDlazdic([x])).toEqual({ nove: [], zapnout: [] });
  });
});

describe('co se zapíše za zvolené dlaždice', () => {
  it('pivo dostane pivo, obal a cenu z účtenky; půllitr a kosmetika jen kód, název a cenu', () => {
    const d = dlazdiceSkupiny([], piva, obaly);
    const z = zapisZDlazdic([d.piva.find((x) => x.polozka.kod === '11001')!, d.pullitry[0], d.kosmetika[0]]);
    expect(z.zapnout).toEqual([]);
    expect(z.nove).toEqual([
      { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', cena: 48 },
      { kod: '393', nazev: 'Půllitr Mannheim 0,5l', beer_id: null, package_id: null, cena: 140 },
      { kod: '62019', nazev: 'Kyn-Pivní sprchový gel 300ml', beer_id: null, package_id: null, cena: 149 },
    ]);
  });

  it('vypnuté zboží se zapne a nezapíše znovu; nové a „v obchodě" se nepletou', () => {
    const d = dlazdiceSkupiny([
      { kod: '11001', nazev: 'x', beer_id: 'b12s', package_id: 'l05', aktivni: false },
      { kod: '11004', nazev: 'y', beer_id: 'b12t', package_id: 'l05', aktivni: true },
    ], piva, obaly);
    const z = zapisZDlazdic([
      d.piva.find((x) => x.polozka.kod === '11001')!, // vypnuté → zapnout
      d.piva.find((x) => x.polozka.kod === '11004')!, // už je → nic
      d.piva.find((x) => x.polozka.kod === '11009')!, // nové
    ]);
    expect(z.zapnout).toEqual(['11001']);
    expect(z.nove.map((n) => n.kod)).toEqual(['11009']);
  });

  it('dvě dlaždice na stejné pivo + obal se nezapíšou obě (v databázi je jedno zboží na dvojici)', () => {
    const d = dlazdiceSkupiny([], piva, obaly);
    const a = d.piva.find((x) => x.polozka.kod === '11001')!;
    const kopie = { ...a, polozka: { ...a.polozka, kod: '99001' } };
    expect(zapisZDlazdic([a, kopie]).nove.map((n) => n.kod)).toEqual(['11001']);
  });
});

// ── Pivo → velikosti jako ve Fasování (10. 10. 2026) ────────────────────

describe('obaly prodejny (stejná nabídka jako Fasování)', () => {
  const vsechny = [
    { id: 'k50', label: 'KEG 50l', kind: 'keg', volume_l: 50 }, { id: 'k30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
    { id: 'k100', label: 'KEG 100l', kind: 'keg', volume_l: 100 },
    { id: 'l05', label: 'Lahve 0.5l', kind: 'bottle', volume_l: 0.5 }, { id: 'l15', label: 'PET 1.5l', kind: 'bottle', volume_l: '1.5' },
    { id: 'l07', label: 'Lahev 0.7l', kind: 'bottle', volume_l: 0.7 },
    { id: 'x', label: 'Přepravka', kind: 'crate', volume_l: 1 },
  ];

  it('lahve od největší, pak sudy od největšího; neznámé objemy a druhy ven', () => {
    expect(obalyProdejny(vsechny).map((o) => o.id)).toEqual(['l15', 'l05', 'k50', 'k30']);
  });

  it('dává totéž co dřívější výpočet ve Fasování', () => {
    // Kopie původního výpočtu z ProdejnaScreen — nezávislý vzor.
    const povolene = [50, 30, 20, 15, 10, 1.5, 1, 0.5, 0.33];
    const lahve = vsechny.filter((p) => p.kind === 'bottle' && povolene.includes(Number(p.volume_l))).sort((a, b) => Number(b.volume_l) - Number(a.volume_l));
    const sudy = vsechny.filter((p) => p.kind === 'keg' && povolene.includes(Number(p.volume_l))).sort((a, b) => Number(b.volume_l) - Number(a.volume_l));
    expect(obalyProdejny(vsechny)).toEqual([...lahve, ...sudy]);
  });
});

describe('velikosti jednoho piva', () => {
  const shop = obalyProdejny(obaly);
  const dlazdicePiv = dlazdiceSkupiny([], piva, obaly).piva;
  const cenaZUctenky = (kod: string) => KATALOG_VYDEJKY.find((k) => k.kod === kod)!.cena;
  const b12s = piva.find((b) => b.id === 'b12s')!;

  it('velikost, která byla na účtence, má kód a cenu z ní — stačí klepnout', () => {
    const v = velikostiPiva(b12s, shop, [], dlazdicePiv);
    const l05 = v.find((x) => x.obal.id === 'l05')!;
    expect(l05).toMatchObject({ stav: 'nove', kod: '11001', cena: cenaZUctenky('11001'), zUctenky: true });
    expect(l05.dlazdice?.polozka.kod).toBe('11001');
    expect(v.find((x) => x.obal.id === 'k30')).toMatchObject({ kod: '10242', cena: cenaZUctenky('10242'), zUctenky: true });
  });

  it('pořadí je jako ve Fasování: lahve od největší, pak sudy', () => {
    expect(velikostiPiva(b12s, shop, [], dlazdicePiv).map((v) => v.obal.id)).toEqual(['l15', 'l1', 'l05', 'l033', 'k30']);
  });

  it('velikost, která na účtence nebyla, nemá kód: píše se ručně, název se vygeneruje', () => {
    const b11 = piva.find((b) => b.id === 'b11')!;
    const k30 = velikostiPiva(b11, shop, [], dlazdicePiv).find((x) => x.obal.id === 'k30')!; // 11° v sudu 30 l na účtence není
    expect(k30).toMatchObject({ stav: 'nove', kod: null, cena: null, zUctenky: false, nazev: nazevZboziPiva(obaly[0], b11) });
    expect(k30.dlazdice).toBeUndefined();
  });

  it('co v obchodě je, se pozná podle piva + obalu, ne podle kódu', () => {
    const zbozi = [{ kod: '777', nazev: 'Moje světlá lahev', beer_id: 'b12s', package_id: 'l05', aktivni: true, cena: '52' }];
    const l05 = velikostiPiva(b12s, shop, zbozi, dlazdiceSkupiny(zbozi, piva, obaly).piva).find((x) => x.obal.id === 'l05')!;
    expect(l05).toMatchObject({ stav: 'v_obchode', kod: '777', nazev: 'Moje světlá lahev', cena: 52 });
  });

  it('zboží jiného piva ve stejném obalu se nepřipočítá: každé pivo má své velikosti', () => {
    const cizi = [{ kod: '11009', nazev: 'Pivo sklo 10° sv. 0,5l', beer_id: 'b10', package_id: 'l05', aktivni: true }];
    const l05 = velikostiPiva(b12s, shop, cizi, dlazdiceSkupiny(cizi, piva, obaly).piva).find((x) => x.obal.id === 'l05')!;
    expect(l05).toMatchObject({ stav: 'nove', kod: '11001' });
    const b10 = piva.find((b) => b.id === 'b10')!;
    expect(velikostiPiva(b10, shop, cizi, []).find((x) => x.obal.id === 'l05')).toMatchObject({ stav: 'v_obchode', kod: '11009' });
  });

  it('vypnuté zboží jde zapnout (jeho kód zůstane)', () => {
    const zbozi = [{ kod: '777', nazev: 'Moje světlá lahev', beer_id: 'b12s', package_id: 'l05', aktivni: false }];
    const l05 = velikostiPiva(b12s, shop, zbozi, dlazdiceSkupiny(zbozi, piva, obaly).piva).find((x) => x.obal.id === 'l05')!;
    expect(l05).toMatchObject({ stav: 'vypnute', kod: '777' });
  });

  it('když je jedno zboží vypnuté a druhé aktivní, platí aktivní', () => {
    const zbozi = [
      { kod: '1', nazev: 'staré', beer_id: 'b12s', package_id: 'l05', aktivni: false },
      { kod: '2', nazev: 'nové', beer_id: 'b12s', package_id: 'l05', aktivni: true },
    ];
    expect(velikostiPiva(b12s, shop, zbozi, []).find((x) => x.obal.id === 'l05')).toMatchObject({ stav: 'v_obchode', kod: '2' });
  });
});

describe('zápis ze zvolených velikostí', () => {
  const dl = dlazdiceSkupiny([], piva, obaly).piva;
  const dlazdice = (kod: string) => ({ druh: 'dlazdice' as const, d: dl.find((x) => x.polozka.kod === kod)! });
  const rucne = (kod: string, beer_id: string, package_id: string, cena: number | null = null) =>
    ({ druh: 'rucne' as const, polozka: { kod, nazev: `ruční ${kod}`, beer_id, package_id, cena } });

  it('z účtenky, zapnutí a ruční zboží se zapíšou každé jinam', () => {
    const z = zapisZVoleb([dlazdice('11001'), { druh: 'zapnout', kod: '777' }, rucne('55555', 'b11', 'k30', 1200)]);
    expect(z.nove).toEqual([
      { kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l', beer_id: 'b12s', package_id: 'l05', cena: 48 },
      { kod: '55555', nazev: 'ruční 55555', beer_id: 'b11', package_id: 'k30', cena: 1200 },
    ]);
    expect(z.zapnout).toEqual(['777']);
  });

  it('ruční zboží může být bez ceny', () => {
    expect(zapisZVoleb([rucne('55555', 'b11', 'k30')]).nove[0].cena).toBeNull();
  });

  it('stejný kód ani stejné pivo + obal se nezapíše dvakrát', () => {
    const z = zapisZVoleb([dlazdice('11001'), rucne('11001', 'b11', 'k30'), rucne('222', 'b12s', 'l05'), rucne('333', 'b11', 'k30'), rucne('444', 'b11', 'k30')]);
    expect(z.nove.map((n) => n.kod)).toEqual(['11001', '333']);
  });

  it('zapnutí stejného kódu dvakrát zapne jednou', () => {
    expect(zapisZVoleb([{ druh: 'zapnout', kod: '777' }, { druh: 'zapnout', kod: '777' }]).zapnout).toEqual(['777']);
  });

  it('bez voleb se nezapíše nic', () => {
    expect(zapisZVoleb([])).toEqual({ nove: [], zapnout: [] });
  });
});

describe('kód a cena zadané ručně', () => {
  const existujici = [{ kod: '11001', nazev: 'Pivo sklo 12° světlá 0,5l' }];

  it('prázdný kód, kód který už zboží má, a kód zvolený jinde se nepustí', () => {
    expect(chybaKoduRucne('  ', existujici, [])).toBe('Doplň kód z pokladny.');
    expect(chybaKoduRucne('11001', existujici, [])).toContain('už má zboží „Pivo sklo 12° světlá 0,5l“');
    expect(chybaKoduRucne('555', existujici, ['555'])).toContain('zvolený u jiného zboží');
  });

  it('volný kód projde (mezery okolo se ignorují)', () => {
    expect(chybaKoduRucne(' 555 ', existujici, ['666'])).toBeNull();
  });

  it('cena: prázdná = bez ceny, čárka i tečka, záporná a text jsou chyba', () => {
    expect(cenaZPolicka('')).toBeNull();
    expect(cenaZPolicka(' 48 ')).toBe(48);
    expect(cenaZPolicka('48,5')).toBe(48.5);
    expect(cenaZPolicka('0')).toBe(0);
    expect(cenaZPolicka('-3')).toBe('chyba');
    expect(cenaZPolicka('abc')).toBe('chyba');
  });
});
