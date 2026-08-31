// Co se posílá do databáze při změně seznamu výčepů/rezervací.
//
// Obrazovka pracuje s celým seznamem naráz, takže bez porovnání by každé
// přejmenování jednoho výčepu přepsalo všechny řádky. A hlavně: špatné
// porovnání by tiše mazalo nebo zdvojovalo data, což se na obrazovce projeví
// až ve chvíli, kdy je pozdě.
import { describe, expect, it } from 'vitest';
import { rozdilProUlozeni } from './vycepyData';

const p = (id: string, nazev = id) => ({ id, nazev });

describe('rozdilProUlozeni', () => {
  it('beze změny se neposílá nic', () => {
    const seznam = [p('a'), p('b')];
    const r = rozdilProUlozeni(seznam, [p('a'), p('b')]);
    expect(r.kUlozeni).toEqual([]);
    expect(r.kSmazani).toEqual([]);
  });

  it('nová položka se uloží, ostatní se nepřepisují', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], [p('a'), p('b'), p('c')]);
    expect(r.kUlozeni.map((x) => x.id)).toEqual(['c']);
    expect(r.kSmazani).toEqual([]);
  });

  it('smazaná položka se smaže', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], [p('a')]);
    expect(r.kSmazani).toEqual(['b']);
    expect(r.kUlozeni).toEqual([]);
  });

  it('změněná položka se uloží — a jen ona', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], [p('a'), p('b', 'nový název')]);
    expect(r.kUlozeni.map((x) => x.id)).toEqual(['b']);
    expect(r.kSmazani).toEqual([]);
  });

  it('zvládne přidání i smazání naráz', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], [p('a'), p('c')]);
    expect(r.kUlozeni.map((x) => x.id)).toEqual(['c']);
    expect(r.kSmazani).toEqual(['b']);
  });

  it('samotné přehození pořadí není změna — id ani obsah se nemění', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], [p('b'), p('a')]);
    expect(r.kUlozeni).toEqual([]);
    expect(r.kSmazani).toEqual([]);
  });

  it('vyprázdnění seznamu smaže všechno, nic neuloží', () => {
    const r = rozdilProUlozeni([p('a'), p('b')], []);
    expect(r.kSmazani).toEqual(['a', 'b']);
    expect(r.kUlozeni).toEqual([]);
  });

  it('z prázdna se uloží vše', () => {
    const r = rozdilProUlozeni([], [p('a'), p('b')]);
    expect(r.kUlozeni.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.kSmazani).toEqual([]);
  });
});
