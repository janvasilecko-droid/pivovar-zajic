import { describe, it, expect } from 'vitest';
import { podezreleMnozstvi } from './kontrolaZadani';

const bezna = [40, 45, 38, 42, 50, 44, 40, 46];

describe('kontrola překlepu o řád', () => {
  it('u desetinásobku obvyklého množství se zeptá', () => {
    const dotaz = podezreleMnozstvi(420, bezna, '11° Světlá · KEG 30 l');
    expect(dotaz).toContain('420');
    expect(dotaz).toContain('11° Světlá');
    // Nabídne, co je obvyklé, aby šlo rozhodnout bez hledání v historii.
    expect(dotaz).toContain('42');
  });

  it('běžné množství i solidní výkyv projdou bez dotazu', () => {
    expect(podezreleMnozstvi(42, bezna, 'x')).toBeNull();
    expect(podezreleMnozstvi(90, bezna, 'x')).toBeNull();   // dvojnásobek — běžné
    expect(podezreleMnozstvi(150, bezna, 'x')).toBeNull();  // velká várka, pod pětinásobkem
  });

  it('bez dostatečné historie mlčí — nedá se říct, co je obvyklé', () => {
    expect(podezreleMnozstvi(500, [40, 45], 'x')).toBeNull();
    expect(podezreleMnozstvi(500, [], 'x')).toBeNull();
  });

  it('u drobných počtů se neptá — tam se výkyvy dějí běžně', () => {
    // Obvykle 2 ks, teď 15 — u takhle malých čísel je to normální provoz.
    expect(podezreleMnozstvi(15, [1, 2, 2, 3, 2, 1], 'x')).toBeNull();
    // Ale 200 ks proti obvyklým dvěma už je jasný přehmat.
    expect(podezreleMnozstvi(200, [1, 2, 2, 3, 2, 1], 'x')).not.toBeNull();
  });

  it('jeden dřívější festival nebo překlep v historii posouzení nerozhodí', () => {
    // Medián, ne průměr: jedna hodnota 900 v historii nesmí vypnout kontrolu.
    expect(podezreleMnozstvi(400, [40, 45, 38, 42, 900, 44], 'x')).not.toBeNull();
  });

  it('nulu a nesmysl ignoruje', () => {
    expect(podezreleMnozstvi(0, bezna, 'x')).toBeNull();
    expect(podezreleMnozstvi(Number.NaN, bezna, 'x')).toBeNull();
    expect(podezreleMnozstvi(-5, bezna, 'x')).toBeNull();
  });
});
