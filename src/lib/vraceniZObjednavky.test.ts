import { describe, it, expect } from 'vitest';
import {
  datumCesky, datumZavozu, objednavkyKVraceni, platneVraceni, poznamkaVraceni, pripojPoznamku,
  zaznamyDorovnaniVraceni, type ObjednavkaProVraceni, type PolozkaVraceni,
} from './vraceniZObjednavky';

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

// ---------------------------------------------------------------------------
// Záložka „Vrácení piva" — nabídka objednávek, ze kterých se dá vracet
// ---------------------------------------------------------------------------
const obj = (o: Partial<ObjednavkaProVraceni> & { id: string }): ObjednavkaProVraceni => ({
  place_id: 'm1', place_name: 'Lužec', status: 'nova', is_delivered: true,
  order_date: '2026-09-15', delivery_date: null, ...o,
});
const sPolozkou = (ids: string[]): Record<string, unknown[]> =>
  Object.fromEntries(ids.map((id) => [id, [{ quantity: 1 }]]));

describe('objednavkyKVraceni', () => {
  const dnes = '2026-09-18';

  it('nabízí jen zavezené objednávky s položkami', () => {
    const vstup = [
      obj({ id: 'a' }),
      obj({ id: 'b', is_delivered: false }),   // ještě nevyjela — není co vracet
      obj({ id: 'c' }),                        // bez položek
      obj({ id: 'd', status: 'storno' }),      // zrušená
    ];
    const ven = objednavkyKVraceni(vstup, sPolozkou(['a', 'b', 'd']), { dnes });
    expect(ven.map((o) => o.id)).toEqual(['a']);
  });

  it('starší než osm týdnů se nenabízí', () => {
    const vstup = [obj({ id: 'stara', order_date: '2026-06-01' }), obj({ id: 'nova' })];
    const ven = objednavkyKVraceni(vstup, sPolozkou(['stara', 'nova']), { dnes });
    expect(ven.map((o) => o.id)).toEqual(['nova']);
  });

  it('hranice osmi týdnů se nepočítá o den vedle (místní půlnoc vs. UTC)', () => {
    // 56 dní zpátky od 18. 9. 2026 je 24. 7. 2026 — ten se ještě vejde.
    const vstup = [obj({ id: 'hranice', order_date: '2026-07-24' }), obj({ id: 'denPred', order_date: '2026-07-23' })];
    const ven = objednavkyKVraceni(vstup, sPolozkou(['hranice', 'denPred']), { dnes });
    expect(ven.map((o) => o.id)).toEqual(['hranice']);
  });

  it('řadí od nejnovějšího závozu a datum závozu přebíjí datum objednávky', () => {
    const vstup = [
      obj({ id: 'stara', order_date: '2026-09-01' }),
      obj({ id: 'zavezenaPozdeji', order_date: '2026-08-20', delivery_date: '2026-09-17' }),
    ];
    const ven = objednavkyKVraceni(vstup, sPolozkou(['stara', 'zavezenaPozdeji']), { dnes });
    expect(ven.map((o) => o.id)).toEqual(['zavezenaPozdeji', 'stara']);
  });

  it('hledání jde podle jména odběratele, bez ohledu na velikost písmen', () => {
    const vstup = [obj({ id: 'a' }), obj({ id: 'b', place_name: 'Duck and Dog' })];
    const ven = objednavkyKVraceni(vstup, sPolozkou(['a', 'b']), { dnes, hledat: 'duck' });
    expect(ven.map((o) => o.id)).toEqual(['b']);
  });
});

describe('datumZavozu', () => {
  it('bere datum závozu, a když chybí, datum objednávky', () => {
    expect(datumZavozu({ order_date: '2026-09-01', delivery_date: '2026-09-03' })).toBe('2026-09-03');
    expect(datumZavozu({ order_date: '2026-09-01', delivery_date: null })).toBe('2026-09-01');
  });
});

describe('datumCesky', () => {
  it('píše den bez nuly na začátku', () => {
    expect(datumCesky('2026-09-08')).toBe('8. 9. 2026');
  });

  it('nesmyslný vstup vrátí, jak přišel — radši ISO než „NaN. NaN."', () => {
    expect(datumCesky('nevim')).toBe('nevim');
  });
});

describe('zaznamyDorovnaniVraceni s odběratelem', () => {
  it('jméno se připíše do důvodu, ať je ve skladu dohledatelné', () => {
    const [r] = zaznamyDorovnaniVraceni(polozky, '2026-09-18', 'Lužec');
    expect(r.reason).toContain('Lužec');
    expect(r.reason).toMatch(/^Vráceno z objednávky/);
  });

  it('bez jména se důvod nezmění', () => {
    expect(zaznamyDorovnaniVraceni(polozky, '2026-09-18')[0].reason)
      .toBe(zaznamyDorovnaniVraceni(polozky, '2026-09-18', '   ')[0].reason);
  });
});
