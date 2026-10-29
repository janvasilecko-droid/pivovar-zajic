import { describe, it, expect } from 'vitest';
import {
  filtrujOdberatele, nejcastejsiOdberatele, odberateleAbecedne, odberateleDleCetnosti, pismenoOdberatele, rozdelDlePismen,
} from './odberateleDleCetnosti';

describe('odběratelé od nejčastěji používaných', () => {
  const mista = [
    { id: 'a', name: 'Louka' },
    { id: 'b', name: 'Maneo' },
    { id: 'c', name: 'Čertovka' },
  ];

  it('řadí podle počtu objednávek, storno se nepočítá, bez id podle jména', () => {
    const serazene = odberateleDleCetnosti(mista, [
      { place_id: 'b', place_name: 'Maneo' },
      { place_id: null, place_name: 'maneo' },
      { place_id: 'a', place_name: 'Louka' },
      { place_id: 'a', place_name: 'Louka', status: 'storno' },
      { place_id: 'a', place_name: 'Louka', status: 'storno' },
    ]);
    expect(serazene.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('při shodě abecedně (česky)', () => {
    expect(odberateleDleCetnosti(mista, []).map((m) => m.name)).toEqual(['Čertovka', 'Louka', 'Maneo']);
  });
});

describe('odběratelé podle abecedy', () => {
  const jmena = (n: string[]) => n.map((name, i) => ({ id: String(i), name }));

  it('česká abeceda: velikost písmen nehraje roli, CH je za H, háčky na svém místě, číslice první', () => {
    const serazene = odberateleAbecedne(jmena([
      'Zizkov', 'Šimáček', 'Sedláčková', 'Řeka', 'Radek', 'CHmeloun', 'Hrad', 'Čertovka',
      'Ivo', 'Maneo', 'MARTIN', 'Mates Rybárna', 'petr', 'Petr moravcik prodejna', '7 stupnu Karlin',
    ]));
    expect(serazene.map((m) => m.name)).toEqual([
      '7 stupnu Karlin', 'Čertovka', 'Hrad', 'CHmeloun', 'Ivo', 'Maneo', 'MARTIN', 'Mates Rybárna',
      'petr', 'Petr moravcik prodejna', 'Radek', 'Řeka', 'Sedláčková', 'Šimáček', 'Zizkov',
    ]);
  });

  it('mezera na začátku jména odběratele neodsune na začátek seznamu', () => {
    expect(odberateleAbecedne(jmena([' Martin', 'Maneo', 'Zizkov'])).map((m) => m.name.trim()))
      .toEqual(['Maneo', 'Martin', 'Zizkov']);
  });

  it('nemění vstupní pole', () => {
    const vstup = jmena(['B', 'A']);
    odberateleAbecedne(vstup);
    expect(vstup.map((m) => m.name)).toEqual(['B', 'A']);
  });
});

describe('nejčastější odběratelé (zkratka nahoře ve výběru)', () => {
  const mista = [
    { id: 'a', name: 'Restaurace' },
    { id: 'b', name: 'Martin' },
    { id: 'c', name: 'Maneo' },
    { id: 'd', name: 'Zizkov' },
    { id: 'e', name: 'Nikdy neobjednal' },
  ];
  const obj = (id: string, n: number, status?: string) =>
    Array.from({ length: n }, () => ({ place_id: id, place_name: null, status }));

  it('jen ti, kdo někdy objednali, od nejčastějšího; bez objednávek se nepočítají', () => {
    const objednavky = [...obj('a', 3), ...obj('d', 2), ...obj('c', 1)];
    expect(nejcastejsiOdberatele(mista, objednavky).map((m) => m.name)).toEqual(['Restaurace', 'Zizkov', 'Maneo']);
  });

  it('stornované objednávky se nepočítají, ani aby odběratel do výběru vůbec vstoupil', () => {
    const objednavky = [...obj('a', 2), ...obj('b', 5, 'storno')];
    expect(nejcastejsiOdberatele(mista, objednavky).map((m) => m.name)).toEqual(['Restaurace']);
  });

  it('počet je omezený (výchozí 8), vybírají se ti nejčastější', () => {
    const hodne = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}`, name: `Odběratel ${String(i).padStart(2, '0')}` }));
    const objednavky = hodne.flatMap((m, i) => obj(m.id, i + 1));
    const vybrani = nejcastejsiOdberatele(hodne, objednavky);
    expect(vybrani).toHaveLength(8);
    expect(vybrani[0].name).toBe('Odběratel 11');
    expect(vybrani[7].name).toBe('Odběratel 04');
    expect(nejcastejsiOdberatele(hodne, objednavky, 3).map((m) => m.name)).toEqual(['Odběratel 11', 'Odběratel 10', 'Odběratel 09']);
  });

  it('objednávka bez place_id se přiřadí podle jména; bez objednávek je seznam prázdný', () => {
    expect(nejcastejsiOdberatele(mista, [{ place_id: null, place_name: 'martin' }]).map((m) => m.name)).toEqual(['Martin']);
    expect(nejcastejsiOdberatele(mista, [])).toEqual([]);
  });
});

describe('hledání odběratele při psaní', () => {
  const jmena = (n: string[]) => n.map((name, i) => ({ id: String(i), name }));
  const mista = jmena(['Martin', 'Marek', 'Mates Rybárna', 'Čertovka', 'Šimáček', 'Petr Moravčík prodejna']);

  it('bez textu vrátí všechny', () => {
    expect(filtrujOdberatele(mista, '')).toEqual(mista);
    expect(filtrujOdberatele(mista, '   ')).toEqual(mista);
  });

  it('hledá kdekoliv ve jméně, bez ohledu na velikost písmen a diakritiku', () => {
    expect(filtrujOdberatele(mista, 'mar').map((m) => m.name)).toEqual(['Martin', 'Marek']);
    expect(filtrujOdberatele(mista, 'CERT').map((m) => m.name)).toEqual(['Čertovka']);
    expect(filtrujOdberatele(mista, 'simacek').map((m) => m.name)).toEqual(['Šimáček']);
    expect(filtrujOdberatele(mista, 'ryb').map((m) => m.name)).toEqual(['Mates Rybárna']);
  });

  it('víc slov = všechna musí být ve jménu (v libovolném pořadí)', () => {
    expect(filtrujOdberatele(mista, 'mat ryb').map((m) => m.name)).toEqual(['Mates Rybárna']);
    expect(filtrujOdberatele(mista, 'prodejna petr').map((m) => m.name)).toEqual(['Petr Moravčík prodejna']);
    expect(filtrujOdberatele(mista, 'mar rybarna')).toEqual([]);
  });

  it('nic nenalezeno = prázdný seznam; vstup se nemění', () => {
    const vstup = [...mista];
    expect(filtrujOdberatele(vstup, 'xyz')).toEqual([]);
    expect(vstup).toEqual(mista);
  });
});

describe('písmena nadpisů v seznamu A–Z', () => {
  it('běžná písmena velkými, bez ohledu na velikost písmen a mezery na začátku', () => {
    expect(pismenoOdberatele('Martin')).toBe('M');
    expect(pismenoOdberatele('martin')).toBe('M');
    expect(pismenoOdberatele('  Zizkov')).toBe('Z');
  });

  it('Č, Ř, Š a Ž jsou v češtině samostatná písmena', () => {
    expect(pismenoOdberatele('Čertovka')).toBe('Č');
    expect(pismenoOdberatele('řeka')).toBe('Ř');
    expect(pismenoOdberatele('Šimáček')).toBe('Š');
    expect(pismenoOdberatele('Žižkov')).toBe('Ž');
  });

  it('ostatní háčky a čárky se řadí k základnímu písmenu (Á k A, Ď k D, Ů k U …)', () => {
    expect(pismenoOdberatele('Ádam')).toBe('A');
    expect(pismenoOdberatele('Ěva')).toBe('E');
    expect(pismenoOdberatele('Ďáblík')).toBe('D');
    expect(pismenoOdberatele('Ňuf')).toBe('N');
    expect(pismenoOdberatele('Ťapka')).toBe('T');
    expect(pismenoOdberatele('Ůtulna')).toBe('U');
    expect(pismenoOdberatele('Ýcko')).toBe('Y');
  });

  it('CH je samostatné písmeno', () => {
    expect(pismenoOdberatele('Chmeloun')).toBe('CH');
    expect(pismenoOdberatele('chata')).toBe('CH');
    expect(pismenoOdberatele('Hrad')).toBe('H');
  });

  it('číslice, uvozovky a prázdné jméno spadnou do skupiny „#“', () => {
    expect(pismenoOdberatele('7 stupnu Karlin')).toBe('#');
    expect(pismenoOdberatele('"U Kata"')).toBe('#');
    expect(pismenoOdberatele('')).toBe('#');
    expect(pismenoOdberatele('   ')).toBe('#');
  });
});

describe('rozdělení abecedního seznamu podle písmen', () => {
  const jmena = (n: string[]) => n.map((name, i) => ({ id: String(i), name }));
  // Pořadí písmen v české abecedě — nadpisy musí jít přesně takhle, každý jednou.
  const ABECEDA = ['#', 'A', 'B', 'C', 'Č', 'D', 'E', 'F', 'G', 'H', 'CH', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'Ř', 'S', 'Š', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', 'Ž'];

  it('seskupí po sobě jdoucí odběratele se stejným písmenem', () => {
    const skupiny = rozdelDlePismen(odberateleAbecedne(jmena(['Zizkov', 'Maneo', 'MARTIN', 'Mates Rybárna', 'Čertovka', 'Chmeloun', 'Hrad'])));
    expect(skupiny.map((s) => [s.pismeno, s.odberatele.map((o) => o.name)])).toEqual([
      ['Č', ['Čertovka']],
      ['H', ['Hrad']],
      ['CH', ['Chmeloun']],
      ['M', ['Maneo', 'MARTIN', 'Mates Rybárna']],
      ['Z', ['Zizkov']],
    ]);
  });

  it('řazení a nadpisy spolu sedí: každé písmeno je právě jednou a v pořadí české abecedy', () => {
    const vsechna = jmena([
      '7 stupnu Karlin', '"U Kata"', 'Ádam', 'Alfa', 'Beta', 'Cyril', 'Čertovka', 'Dolce', 'Ďáblík', 'Eden', 'Ěva', 'Fabrika',
      'Gong', 'Hrad', 'Chata', 'CHmeloun', 'Ivo', 'Jarda', 'Kolkovna', 'Lucerna', 'Maneo', 'MARTIN', 'Nový dvůr', 'Ňuf',
      'Oáza', 'petr', 'Quido', 'Radek', 'Řeka', 'Sedláčková', 'Šimáček', 'Tabor', 'Ťapka', 'Ústí', 'Ůtulna', 'Vinárna',
      'Wellness', 'Xaver', 'Ypsilon', 'Ýcko', 'Zizkov', 'Žižkov',
    ]);
    const skupiny = rozdelDlePismen(odberateleAbecedne(vsechna));
    const nadpisy = skupiny.map((s) => s.pismeno);
    expect(new Set(nadpisy).size).toBe(nadpisy.length); // žádné písmeno dvakrát
    expect(nadpisy).toEqual(ABECEDA.filter((p) => nadpisy.includes(p))); // a v pořadí abecedy
    expect(nadpisy).toEqual(ABECEDA); // tady jsou zastoupená všechna
    expect(skupiny.reduce((s, g) => s + g.odberatele.length, 0)).toBe(vsechna.length);
  });

  it('prázdný seznam = žádné skupiny', () => {
    expect(rozdelDlePismen([])).toEqual([]);
  });
});
