import { describe, it, expect } from 'vitest';
import {
  jadroNazvu, jeStarsiVydani, kandidatiPredchozihoVydani, moznaJinaVydani, nahrazenaVydani, rodokmenVydani, vsechnaNovejsi,
  type StavDokumentu,
} from './bibleKnihovna';

const dok = (id: string, nazev: string, rok: number | null, stav: StavDokumentu = 'hotovo', isbn: string | null = null) => ({ id, nazev, rok, stav, isbn });

describe('nová vydání (etapa 3c)', () => {
  // Řada vydání 1 ← 2 ← 3 (3 je nejnovější).
  const r = rodokmenVydani([{ id: 'v2', predchozi: 'v1' }, { id: 'v3', predchozi: 'v2' }]);

  it('rodokmen: předchozí a novější vydání; novější i nepřímá', () => {
    expect(r.predchozi.get('v3')).toBe('v2');
    expect(r.novejsi.get('v1')).toEqual(['v2']);
    expect([...vsechnaNovejsi(r, 'v1')].sort()).toEqual(['v2', 'v3']);
    expect(jeStarsiVydani(r, 'v1')).toBe(true);
    expect(jeStarsiVydani(r, 'v3')).toBe(false);
  });

  it('nahrazené vydání = má ZPRACOVANÉ novější; dokud se nové zpracovává, staré platí', () => {
    const dokumenty = [dok('v1', 'Kniha', 2001), dok('v2', 'Kniha', 2010), dok('v3', 'Kniha', 2020, 'zpracovava')];
    expect([...nahrazenaVydani(r, dokumenty)]).toEqual(['v1']);
  });

  it('kandidáti na předchozí vydání: bez sebe, bez novějších vydání (kruh) a bez rozpracovaného nahrání', () => {
    const dokumenty = [dok('v1', 'B kniha', 2001), dok('v2', 'A kniha', 2010), dok('v3', 'C kniha', 2020), dok('x', 'Nahrává se', null, 'nahrava')];
    expect(kandidatiPredchozihoVydani(r, 'v2', dokumenty).map((d) => d.id)).toEqual(['v1']);
    expect(kandidatiPredchozihoVydani(r, 'v1', dokumenty).map((d) => d.id)).toEqual([]);
    expect(kandidatiPredchozihoVydani(r, 'v3', dokumenty).map((d) => d.id)).toEqual(['v2', 'v1']);
  });

  it('jádro názvu bez označení vydání, roku a diakritiky', () => {
    expect(jadroNazvu('Technologie piva, 2. vyd. (2019)')).toBe('technologie piva');
    expect(jadroNazvu('Technologie piva — 3. vydání, 2021')).toBe('technologie piva');
    expect(jadroNazvu('Technology Brewing and Malting, 6th edition')).toBe('technology brewing and malting');
    expect(jadroNazvu('Technologie Brauer und Mälzer 10. Auflage')).toBe('technologie brauer und malzer');
  });

  it('možná jiné vydání: stejné ISBN nebo stejný název; odhad novějšího podle roku; propojené ne', () => {
    const dokumenty = [
      dok('a', 'Technologie piva, 1. vyd.', 2001), dok('b', 'Technologie piva, 2. vyd.', 2010),
      dok('c', 'Pivovarství', 1990, 'hotovo', '978-80-1234-567-8'), dok('d', 'Brewing', null, 'hotovo', '9788012345678'),
      dok('e', 'Krátký', 2000), dok('f', 'Krátký', 2001),
    ];
    expect(moznaJinaVydani(dokumenty, rodokmenVydani([]))).toEqual([
      { a: 'a', b: 'b', novejsi: 'b' },
      { a: 'c', b: 'd', novejsi: null },
    ]);
    // Už propojené se nenabízí.
    expect(moznaJinaVydani(dokumenty, rodokmenVydani([{ id: 'b', predchozi: 'a' }]))).toEqual([{ a: 'c', b: 'd', novejsi: null }]);
  });
});
