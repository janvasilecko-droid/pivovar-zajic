import { describe, it, expect } from 'vitest';
import { platneVraceni, poznamkaVraceni, pripojPoznamku, zaznamyDorovnaniVraceni, type PolozkaVraceni } from './vraceniZObjednavky';

const polozky: PolozkaVraceni[] = [
  { beer_id: 'b1', beer_name: '12° Světlé', package_id: 'p1', package_label: 'KEG 50l', pocet: 2 },
  { beer_id: 'b2', beer_name: '11° Tmavé', package_id: 'p2', package_label: 'KEG 30l', pocet: 0 },
];

describe('platneVraceni', () => {
  it('zahodí položky s nulovým nebo nezadaným počtem', () => {
    expect(platneVraceni(polozky)).toEqual([polozky[0]]);
  });

  it('zahodí položku bez beer_id/package_id i s kladným počtem', () => {
    const bezObalu = [{ beer_id: '', beer_name: null, package_id: 'p1', package_label: null, pocet: 3 }];
    expect(platneVraceni(bezObalu)).toEqual([]);
  });
});

describe('zaznamyDorovnaniVraceni', () => {
  it('vytvoří jeden řádek na platnou položku, s kladným množstvím', () => {
    const radky = zaznamyDorovnaniVraceni(polozky, '2026-09-18');
    expect(radky).toHaveLength(1);
    expect(radky[0]).toMatchObject({ entry_date: '2026-09-18', beer_id: 'b1', package_id: 'p1', quantity: 2 });
  });
});

describe('poznamkaVraceni', () => {
  it('popíše vrácené kusy, datum a týden', () => {
    const text = poznamkaVraceni(polozky, '2026-09-18');
    expect(text).toContain('2× KEG 50l 12° Světlé');
    expect(text).toContain('18. 9. 2026');
    expect(text).toContain('týdne 2026-09-14');
  });

  it('nulové položky do popisu nejdou', () => {
    expect(poznamkaVraceni(polozky, '2026-09-18')).not.toContain('Tmavé');
  });
});

describe('pripojPoznamku', () => {
  it('k prázdné poznámce jen přidá novou řádku', () => {
    expect(pripojPoznamku(null, 'Nová věc')).toBe('Nová věc');
    expect(pripojPoznamku('', 'Nová věc')).toBe('Nová věc');
  });

  it('k existující poznámce připojí na nový řádek, nepřepíše ji', () => {
    expect(pripojPoznamku('vratný sud', 'Vráceno 2× KEG 50l')).toBe('vratný sud\nVráceno 2× KEG 50l');
  });
});
