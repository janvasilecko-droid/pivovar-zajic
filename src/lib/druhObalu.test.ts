import { describe, it, expect } from 'vitest';
import { vyhovujeDruhu, type DruhObaluFiltr } from './druhObalu';
import type { ObalInfo } from './whatsappAmendment';

// Katalog obalů tak, jak vypadá v pivovaru. Petky jsou schválně dvojí:
// jedna s `kind: 'pet'` a jedna jen podle objemu — v katalogu jsou obě
// varianty a filtr musí chytit obě.
const KATALOG: ObalInfo[] = [
  { id: 'keg50', label: 'KEG 50l', kind: 'keg', volume_l: 50 },
  { id: 'keg30', label: 'KEG 30l', kind: 'keg', volume_l: 30 },
  { id: 'keg20', label: 'KEG 20l', kind: 'keg', volume_l: 20 },
  { id: 'keg15', label: 'KEG 15l', kind: 'keg', volume_l: 15 },
  { id: 'pet15', label: 'PET 1.5l', kind: 'pet', volume_l: 1.5 },
  { id: 'pet1', label: '1l', kind: 'bottle', volume_l: 1 },
  { id: 'lah05', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 },
  { id: 'lah033', label: 'Lahev 0,33l', kind: 'bottle', volume_l: 0.33 },
];

const najdi = (id: string) => KATALOG.find((o) => o.id === id)!;

describe('vyhovujeDruhu', () => {
  it('sudy jsou všechny velikosti KEG a nic jiného', () => {
    for (const id of ['keg50', 'keg30', 'keg20', 'keg15']) {
      expect(vyhovujeDruhu(najdi(id), 'keg')).toBe(true);
    }
    for (const id of ['pet15', 'pet1', 'lah05', 'lah033']) {
      expect(vyhovujeDruhu(najdi(id), 'keg')).toBe(false);
    }
  });

  it('petky jsou PET, ne sklo — kvůli tomuhle to celé vzniklo', () => {
    expect(vyhovujeDruhu(najdi('pet15'), 'pet')).toBe(true);
    expect(vyhovujeDruhu(najdi('pet1'), 'pet')).toBe(true);
    expect(vyhovujeDruhu(najdi('lah05'), 'pet')).toBe(false);
    expect(vyhovujeDruhu(najdi('lah033'), 'pet')).toBe(false);
  });

  it('lahve jsou sklo, petka mezi ně nepatří', () => {
    expect(vyhovujeDruhu(najdi('lah05'), 'lahev')).toBe(true);
    expect(vyhovujeDruhu(najdi('lah033'), 'lahev')).toBe(true);
    expect(vyhovujeDruhu(najdi('pet15'), 'lahev')).toBe(false);
    expect(vyhovujeDruhu(najdi('pet1'), 'lahev')).toBe(false);
    expect(vyhovujeDruhu(najdi('keg30'), 'lahev')).toBe(false);
  });

  it('„petka 15" je 1,5 l, ne patnáctilitrový sud', () => {
    // Kdyby se tohle překlopilo, zmizely by petky z filtru petek a přibyly
    // by k sudům — a na plánu stáčení by chyběly.
    expect(vyhovujeDruhu({ id: 'x', label: 'PET 1,5l', kind: null, volume_l: 1.5 }, 'pet')).toBe(true);
    expect(vyhovujeDruhu({ id: 'x', label: 'PET 1,5l', kind: null, volume_l: 1.5 }, 'keg')).toBe(false);
  });

  it('každý obal padne právě do jedné volby — žádný nepropadne', () => {
    // Tohle je to podstatné pravidlo. Kdyby některý obal nevyhověl ani
    // jedné volbě, zmizel by ze všech filtrů naráz a objednávka by se
    // tvářila, že neexistuje.
    const volby: Exclude<DruhObaluFiltr, 'all'>[] = ['keg', 'pet', 'lahev'];
    const neznamy: ObalInfo = { id: 'divny', label: 'něco bez objemu', kind: null, volume_l: null };
    for (const obal of [...KATALOG, neznamy]) {
      const kolik = volby.filter((v) => vyhovujeDruhu(obal, v)).length;
      expect(`${obal.id}: ${kolik}`).toBe(`${obal.id}: 1`);
    }
  });

  it('„všechny druhy" pustí i obal, který v katalogu není', () => {
    expect(vyhovujeDruhu(null, 'all')).toBe(true);
    expect(vyhovujeDruhu(undefined, 'all')).toBe(true);
    // Se zapnutým filtrem se naopak radši skryje, než aby se vydával za lahev.
    expect(vyhovujeDruhu(null, 'lahev')).toBe(false);
    expect(vyhovujeDruhu(null, 'keg')).toBe(false);
  });
});
