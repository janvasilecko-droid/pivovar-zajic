import { describe, it, expect } from 'vitest';
import { porovnejMigrace, pocetCekajicich, osirele, ZACATEK_EVIDENCE } from './migraceStav';

const STARA = '20260101000000_neco_stareho.sql';
const NOVA_A = '20261228000000_nova_a.sql';
const NOVA_B = '20261229000000_nova_b.sql';

describe('porovnejMigrace', () => {
  it('co je v evidenci, je aplikované — s datem a zdrojem', () => {
    const r = porovnejMigrace([NOVA_A], [{ nazev: NOVA_A, aplikovano_at: '2026-12-28T10:00:00Z', zdroj: 'apply-migration.mjs' }]);
    expect(r).toEqual([{ nazev: NOVA_A, stav: 'aplikovano', aplikovanoAt: '2026-12-28T10:00:00Z', zdroj: 'apply-migration.mjs' }]);
  });

  it('novější než evidence a nezapsaná = čeká', () => {
    const r = porovnejMigrace([NOVA_A, NOVA_B], [{ nazev: NOVA_A, aplikovano_at: null }]);
    expect(r.map((x) => x.stav)).toEqual(['aplikovano', 'ceka']);
    expect(pocetCekajicich(r)).toBe(1);
  });

  it('starší než evidence se NEHLÁSÍ jako čekající', () => {
    // Tohle je celé jádro modulu: o migracích pustených před zavedením
    // evidence se nedá nic zjistit. Falešné „čeká" u čtyřiceti starých
    // migrací by přehled udělalo nepoužitelným a nikdo by si ho nevšiml,
    // až by o ně čekající migrace opravdu byla.
    const r = porovnejMigrace([STARA, NOVA_A], []);
    expect(r.map((x) => x.stav)).toEqual(['starsi-nez-evidence', 'ceka']);
    expect(pocetCekajicich(r)).toBe(1);
  });

  it('sama zakládající migrace se bere jako součást evidence', () => {
    const r = porovnejMigrace([ZACATEK_EVIDENCE], []);
    // Není starší než začátek evidence (je to on sám), takže „čeká" —
    // což je pravda, dokud ji nikdo nepustí.
    expect(r[0].stav).toBe('ceka');
  });

  it('řadí podle jména, tedy v pořadí spouštění', () => {
    const r = porovnejMigrace([NOVA_B, STARA, NOVA_A], []);
    expect(r.map((x) => x.nazev)).toEqual([STARA, NOVA_A, NOVA_B]);
  });

  it('prázdný repozitář i prázdná evidence dávají prázdno, ne chybu', () => {
    expect(porovnejMigrace([], [])).toEqual([]);
    expect(pocetCekajicich([])).toBe(0);
  });
});

describe('osirele', () => {
  it('najde migraci v evidenci, která v repozitáři není', () => {
    // Přejmenovaný soubor: v repozitáři zůstane pod novým jménem a pustí
    // se podruhé. Lepší o tom vědět.
    expect(osirele([NOVA_A], [{ nazev: NOVA_A, aplikovano_at: null }, { nazev: NOVA_B, aplikovano_at: null }]))
      .toEqual([NOVA_B]);
  });

  it('když se všechno páruje, nevrací nic', () => {
    expect(osirele([NOVA_A], [{ nazev: NOVA_A, aplikovano_at: null }])).toEqual([]);
  });
});
