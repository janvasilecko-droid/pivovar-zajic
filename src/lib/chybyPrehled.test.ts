import { describe, it, expect } from 'vitest';
import { rozlozVerzi, jeZeStarsiVerze, rozdelChyby, shrnutiChyb } from './chybyPrehled';

const ch = (id: string, app_version: string | null, vyrizeno_at: string | null = null) =>
  ({ id, app_version, vyrizeno_at });

describe('rozlozVerzi', () => {
  it('rozloží verzi na čísla', () => {
    expect(rozlozVerzi('2.324')).toEqual([2, 324]);
    expect(rozlozVerzi('2.3.1')).toEqual([2, 3, 1]);
  });

  it('prázdná nebo chybějící verze je prázdný seznam', () => {
    expect(rozlozVerzi(null)).toEqual([]);
    expect(rozlozVerzi('')).toEqual([]);
  });
});

describe('jeZeStarsiVerze', () => {
  it('porovnává čísla, ne text', () => {
    // Textově by „2.99" bylo větší než „2.324" — číselně ne.
    expect(jeZeStarsiVerze('2.99', '2.324')).toBe(true);
    expect(jeZeStarsiVerze('2.324', '2.99')).toBe(false);
  });

  it('přesně ta samá verze není starší', () => {
    expect(jeZeStarsiVerze('2.324', '2.324')).toBe(false);
  });

  it('novější verze (chyba přišla z rozestavěného buildu) není starší', () => {
    expect(jeZeStarsiVerze('2.325', '2.324')).toBe(false);
  });

  it('chybějící verze se bere jako stará — to je zápis z doby, kdy se nezapisovala', () => {
    expect(jeZeStarsiVerze(null, '2.324')).toBe(true);
    expect(jeZeStarsiVerze(undefined, '2.324')).toBe(true);
  });

  it('různě dlouhá čísla se porovnají po částech', () => {
    expect(jeZeStarsiVerze('2.3', '2.3.1')).toBe(true);
    expect(jeZeStarsiVerze('2.3.1', '2.3')).toBe(false);
  });
});

describe('rozdelChyby', () => {
  it('oddělí to, co se děje teď, od historie', () => {
    // Přesně stav z 8. 9. 2026: čtyři chyby z 2.323, dvě starší, běží 2.324.
    const r = rozdelChyby([
      ch('a', '2.323'), ch('b', '2.323'), ch('c', '2.323'), ch('d', '2.323'),
      ch('e', '2.306'), ch('f', '2.295', '2026-09-07T10:00:00Z'),
    ], '2.324');

    expect(r.aktualni).toHaveLength(0);
    expect(r.starsi.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(r.vyrizene.map((x) => x.id)).toEqual(['f']);
  });

  it('vyřízená chyba se do žádné z hromádek nepočítá, i když je z běžící verze', () => {
    const r = rozdelChyby([ch('a', '2.324', '2026-09-08T18:00:00Z')], '2.324');
    expect(r.aktualni).toHaveLength(0);
    expect(r.starsi).toHaveLength(0);
    expect(r.vyrizene).toHaveLength(1);
  });

  it('chyba z běžící verze patří mezi aktuální', () => {
    const r = rozdelChyby([ch('a', '2.324')], '2.324');
    expect(r.aktualni.map((x) => x.id)).toEqual(['a']);
  });
});

describe('shrnutiChyb', () => {
  it('řekne rozdíl mezi „děje se teď" a „historie"', () => {
    expect(shrnutiChyb({ aktualni: [], starsi: [], vyrizene: [] })).toBe('nic nového');
    expect(shrnutiChyb({ aktualni: [], starsi: [ch('a', '2.3')], vyrizene: [] })).toBe('1 ze starších verzí');
    expect(shrnutiChyb({ aktualni: [ch('a', '2.4')], starsi: [], vyrizene: [] })).toBe('1 z běžící verze');
    expect(shrnutiChyb({ aktualni: [ch('a', '2.4')], starsi: [ch('b', '2.3')], vyrizene: [] }))
      .toBe('1 z běžící verze, 1 starších');
  });
});
