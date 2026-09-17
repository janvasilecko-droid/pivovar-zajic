import { describe, it, expect } from 'vitest';
import { najdiPodezreleDuplicity } from './podezreleDuplicity';

// Skutečné případy z auditu 16.–17. 9. 2026 (katalog odběratelů).
describe('najdiPodezreleDuplicity — skutečné případy z produkce', () => {
  it('najde skoro stejné jméno s překlepem (Malenovice / Malenovoce)', () => {
    const nalezy = najdiPodezreleDuplicity([
      { id: 'a', name: 'Malenovice', address: 'K Vypichu, Rudná' },
      { id: 'b', name: 'Malenovoce', address: null },
    ]);
    expect(nalezy).toHaveLength(1);
    expect(nalezy[0].duvod).toBe('jmeno');
  });

  it('najde jedno jméno obsažené v druhém (Zizkov / Ma Zizkov)', () => {
    const nalezy = najdiPodezreleDuplicity([
      { id: 'a', name: 'Zizkov', address: 'Cimburkova, Praha 3' },
      { id: 'b', name: 'Ma Zizkov', address: null },
    ]);
    expect(nalezy).toHaveLength(1);
    expect(nalezy[0].duvod).toBe('jmeno');
  });

  it('najde stejnou adresu pod úplně jiným jménem (Mathovi / Maťha)', () => {
    const nalezy = najdiPodezreleDuplicity([
      { id: 'a', name: 'Mathovi, Černošice', address: 'Černošice' },
      { id: 'b', name: 'Maťha', address: 'Černošice' },
    ]);
    expect(nalezy).toHaveLength(1);
    expect(nalezy[0].duvod).toBe('adresa');
  });

  it('nabídne i "petr" / "Petr moravcik prodejna" jako kandidáta k ruční kontrole', () => {
    // POZOR: tohle jsou ve skutečnosti DVA různí lidé (potvrzeno uživatelem
    // 17. 9. 2026) — funkce je přesto správně nabídne, protože je to jen
    // návrh na kontrolu, ne automatické sloučení.
    const nalezy = najdiPodezreleDuplicity([
      { id: 'a', name: 'petr', address: null },
      { id: 'b', name: 'Petr moravcik prodejna', address: null },
    ]);
    expect(nalezy).toHaveLength(1);
  });

  it('nehlásí zjevně různé odběratele (jiné jméno, jiná/chybějící adresa)', () => {
    const nalezy = najdiPodezreleDuplicity([
      { id: 'a', name: 'Kiosek', address: 'A2 (cyklostezka), Praha-Zbraslav' },
      { id: 'b', name: 'Terasa', address: null },
      { id: 'c', name: 'Restaurace', address: null },
    ]);
    expect(nalezy).toHaveLength(0);
  });
});
