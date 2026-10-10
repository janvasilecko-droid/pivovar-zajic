// Nabídka zboží k přidání (10. 10. 2026): „jednotlivý piva, půllitry, kosmetika — zatím ty z té výdejky".
import { describe, it, expect } from 'vitest';
import { KATALOG_VYDEJKY, SKUPINY, dlazdiceSkupiny, jeVolitelna, zapisZDlazdic } from './obchodKatalog';
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
