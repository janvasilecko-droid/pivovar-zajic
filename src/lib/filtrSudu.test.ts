import { describe, it, expect } from 'vitest';
import { FILTR_SUDU, odpovidaFiltruObalu } from './filtrSudu';

const obaly = [
  { id: 'k50', kind: 'keg', label: ' 50l', volume_l: 50 },
  { id: 'k30', kind: 'keg', label: '30l', volume_l: 30 },
  { id: 'k20', kind: 'keg', label: '20l', volume_l: 20 },
  { id: 'k15', kind: 'keg', label: ' 15l', volume_l: 15 },
  { id: 'k10', kind: 'keg', label: ' 10l', volume_l: 10 },
  { id: 'p1', kind: 'bottle', label: '1l', volume_l: 1 },
];

describe('Filtr obalů v Přehledu stáčení: sudy 50 / 30 / Ost.', () => {
  it('nabízí tři skupiny sudů', () => {
    expect(FILTR_SUDU.map((f) => f.label)).toEqual(['Sud 50l', 'Sud 30l', 'Sud Ost.']);
  });

  it('Sud 50l a 30l berou jen svou velikost', () => {
    expect(obaly.filter((o) => odpovidaFiltruObalu(o.id, 'sud:50', obaly)).map((o) => o.id)).toEqual(['k50']);
    expect(obaly.filter((o) => odpovidaFiltruObalu(o.id, 'sud:30', obaly)).map((o) => o.id)).toEqual(['k30']);
  });

  it('Ost. = 20, 15 a 10 l; lahve do ní nepatří', () => {
    expect(obaly.filter((o) => odpovidaFiltruObalu(o.id, 'sud:ost', obaly)).map((o) => o.id)).toEqual(['k20', 'k15', 'k10']);
  });

  it('obyčejné id obalu (lahev) funguje jako dřív; prázdný filtr pustí všechno', () => {
    expect(odpovidaFiltruObalu('p1', 'p1', obaly)).toBe(true);
    expect(odpovidaFiltruObalu('k50', 'p1', obaly)).toBe(false);
    expect(odpovidaFiltruObalu('k50', '', obaly)).toBe(true);
    expect(odpovidaFiltruObalu(null, 'sud:ost', obaly)).toBe(false);
  });
});
