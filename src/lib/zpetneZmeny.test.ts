import { describe, it, expect } from 'vitest';
import { zpetneZmeny, inventuryPodleMesice } from './zpetneZmeny';

const SRPEN = { entry_date: '2026-08-31', created_at: '2026-09-01T22:14:00Z' };

const pohyb = (datum: string, created_at: string | null, popis = 'x') =>
  ({ datum, created_at, zdroj: 'závoz', popis });

describe('zpetneZmeny', () => {
  it('najde pohyb dopsaný do srpna až po srpnové inventuře', () => {
    // Přesně případ Manea: k závozu z 26. 8. se 6. 9. dopsaly dvě dvacítky.
    const n = zpetneZmeny([SRPEN], [pohyb('2026-08-26', '2026-09-06T20:38:00Z', '2× 10° Desítka 20 l')]);
    expect(n).toHaveLength(1);
    expect(n[0].mesic).toBe('2026-08');
    expect(n[0].popis).toBe('2× 10° Desítka 20 l');
  });

  it('pohyb zapsaný PŘED inventurou je v pořádku', () => {
    expect(zpetneZmeny([SRPEN], [pohyb('2026-08-26', '2026-08-26T10:00:00Z')])).toEqual([]);
  });

  it('pohyb v měsíci, který se ještě nepočítal, se nehlásí', () => {
    expect(zpetneZmeny([SRPEN], [pohyb('2026-09-02', '2026-09-07T09:00:00Z')])).toEqual([]);
  });

  it('bez času zápisu se nehádá', () => {
    // Radši mlčet než tvrdit „přibylo pozdě" u řádku, o kterém se neví, kdy vznikl.
    expect(zpetneZmeny([SRPEN], [pohyb('2026-08-26', null)])).toEqual([]);
  });

  it('bez jediné inventury nehlásí nic', () => {
    expect(zpetneZmeny([], [pohyb('2026-08-26', '2026-09-06T20:38:00Z')])).toEqual([]);
  });

  it('řadí od nejčerstvějšího', () => {
    const n = zpetneZmeny([SRPEN], [
      pohyb('2026-08-01', '2026-09-03T08:00:00Z', 'starší'),
      pohyb('2026-08-02', '2026-09-06T20:38:00Z', 'novější'),
    ]);
    expect(n.map((x) => x.popis)).toEqual(['novější', 'starší']);
  });
});

describe('inventuryPodleMesice', () => {
  it('u měsíce dorovnávaného na několikrát platí POSLEDNÍ zápis', () => {
    // Srpen se dorovnal 1. 9. a znovu 7. 9.; po tom pozdějším se nic měnit nemá.
    const m = inventuryPodleMesice([
      { entry_date: '2026-08-31', created_at: '2026-09-01T22:14:00Z' },
      { entry_date: '2026-08-31', created_at: '2026-09-07T10:57:00Z' },
    ]);
    expect(m.get('2026-08')).toBe('2026-09-07T10:57:00Z');
  });

  it('inventura bez času zápisu se přeskočí', () => {
    expect(inventuryPodleMesice([{ entry_date: '2026-08-31', created_at: null }]).size).toBe(0);
  });
});
