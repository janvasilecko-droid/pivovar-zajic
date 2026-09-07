import { describe, it, expect } from 'vitest';
import { okrajePasku } from './paskyZalozek';

describe('okrajePasku', () => {
  it('když se všechno vejde, nekreslí se nic', () => {
    expect(okrajePasku(0, 300, 300)).toEqual({ vlevo: false, vpravo: false });
  });

  it('na začátku dlouhého pásku svítí jen pravý okraj', () => {
    expect(okrajePasku(0, 900, 360)).toEqual({ vlevo: false, vpravo: true });
  });

  it('uprostřed svítí oba', () => {
    expect(okrajePasku(200, 900, 360)).toEqual({ vlevo: true, vpravo: true });
  });

  it('na konci svítí jen levý', () => {
    expect(okrajePasku(540, 900, 360)).toEqual({ vlevo: true, vpravo: false });
  });

  it('zlomkové rolování na konci nerozbliká pravý okraj', () => {
    // Prohlížeč vrací scrollLeft se zlomkem (539.5 při maximu 540) — bez
    // rezervy by přechod na konci pásku problikával při každém doteku.
    expect(okrajePasku(539.5, 900, 360).vpravo).toBe(false);
  });

  it('nevykreslený pásek (samé nuly) nehlásí nic', () => {
    expect(okrajePasku(0, 0, 0)).toEqual({ vlevo: false, vpravo: false });
  });
});
