import { describe, it, expect } from 'vitest';
import { buildMovements, stockAsOf, stockKey } from './stockLedger';
import { tydenniJakoInventura } from './tydenniInventura';

const B = 'b12';
const P = 'p50';
const K = stockKey(B, P);
const packages = [{ id: P, kind: 'keg', volume_l: 50 }];

// Týdenní počítání týdne 5.–11. 10. uložené v pondělí 12. 10. v 6:56 = 10 ks.
const pocitani = tydenniJakoInventura([
  { tyden_od: '2026-10-05', tyden_do: '2026-10-11', beer_id: B, package_id: P, napocitano: 10, updated_at: '2026-10-12T06:56:00Z' },
]);

const stav = (src: Parameters<typeof buildMovements>[0], den = '2026-10-13') =>
  stockAsOf(buildMovements({ packages, inventoryRows: pocitani as any, ...src }), den).get(K)?.qty;

describe('Zpětné zápisy po týdenním počítání (13. 10. 2026)', () => {
  it('zápis ze dne před počítáním, uložený PŘED ním, je v napočítaném čísle už zahrnutý', () => {
    expect(stav({
      zavozDeductionRows: [{ deduct_date: '2026-10-11', beer_id: B, package_id: P, quantity: 2, created_at: '2026-10-11T12:00:00Z' }],
    })).toBe(10);
  });

  it('objednávka zadaná zpětně na neděli PO počítání pondělní stav nemění (počítání platí)', () => {
    expect(stav({
      zavozDeductionRows: [{ deduct_date: '2026-10-11', beer_id: B, package_id: P, quantity: 2, created_at: '2026-10-13T09:15:22Z' }],
    })).toBe(10);
  });

  it('fasování zadané zpětně na neděli PO počítání pondělní stav nemění', () => {
    expect(stav({
      prodejnaRows: [{ entry_date: '2026-10-11', beer_id: B, package_id: P, quantity: 3, created_at: '2026-10-13T09:54:18Z' }],
    })).toBe(10);
  });

  it('srovnání z inventury, uložené současně s počítáním, se nepřičte podruhé', () => {
    expect(stav({
      adjustmentRows: [{ entry_date: '2026-10-11', beer_id: B, package_id: P, quantity: 1, reason: 'Dorovnání z inventury týdne 2026-10-05 — 50l', created_at: '2026-10-12T06:56:05Z' }],
      keggingRows: [{ entry_date: '2026-10-11', beer_id: B, package_id: P, quantity: 1, note: 'Doplněno z inventury týdne 2026-10-05 — 50l', created_at: '2026-10-12T06:56:06Z' }],
    })).toBe(10);
  });

  it('zápis bez času uložení (starší data) se chová jako dřív', () => {
    expect(stav({
      prodejnaRows: [{ entry_date: '2026-10-11', beer_id: B, package_id: P, quantity: 3 }],
    })).toBe(10);
  });

  it('začátek měsíce zůstává zamčený — pozdní zápis před „Počátečním stavem" ho nehýbe', () => {
    const m = buildMovements({
      packages,
      inventoryRows: [{ entry_date: '2026-10-01', beer_id: B, package_id: P, quantity: 5, note: 'Počáteční stav', created_at: '2026-10-01T05:00:00Z' }] as any,
      prodejnaRows: [{ entry_date: '2026-09-30', beer_id: B, package_id: P, quantity: 3, created_at: '2026-10-13T09:00:00Z' }],
    });
    expect(stockAsOf(m, '2026-10-13').get(K)?.qty).toBe(5);
  });
});

describe('Týdenní inventura: očekávaný stav bere zpětné zápisy po minulém počítání', () => {
  it('fasování zapsané po počítání, ale na den před ním, se odečte', async () => {
    const { ocekavanyStavTydne } = await import('./tydenniInventura');
    const pohyby = buildMovements({
      packages,
      prodejnaRows: [{ entry_date: '2026-10-11', beer_id: B, package_id: P, quantity: 3, created_at: '2026-10-13T09:54:18Z' }],
    });
    const minule = { [K]: { kusu: 10, den: '2026-10-12', cas: '2026-10-12T06:56:00Z' } };
    expect(ocekavanyStavTydne(pohyby, '2026-10-12', '2026-10-18', minule).get(K)?.qty).toBe(7);
  });
});

describe('Týdenní počítání z pátku (14. 10. 2026: 10° Desítka 30 l, závoz v neděli)', () => {
  // Počítání týdne 5.–11. 10. uložené v pátek 9. 10. v 10:28 = 5 ks.
  const patek = tydenniJakoInventura([
    { tyden_od: '2026-10-05', tyden_do: '2026-10-11', beer_id: B, package_id: P, napocitano: 5, updated_at: '2026-10-09T08:28:00Z' },
  ]);
  const stavP = (src: Parameters<typeof buildMovements>[0], den = '2026-10-13') =>
    stockAsOf(buildMovements({ packages, inventoryRows: patek as any, ...src }), den).get(K)?.qty;

  it('počítání platí ke dni počítání (ne až k pondělí)', () => {
    expect(patek[0]).toMatchObject({ entry_date: '2026-10-09' });
    expect(String(patek[0].note)).toContain('(konec dne)');
  });

  it('víkendový závoz po pátečním počítání se odečte, zápis z pátku už je v čísle', () => {
    expect(stavP({
      zavozDeductionRows: [
        { deduct_date: '2026-10-09', beer_id: B, package_id: P, quantity: 13, created_at: '2026-10-08T22:05:00Z' }, // před počítáním
        { deduct_date: '2026-10-11', beer_id: B, package_id: P, quantity: 1, created_at: '2026-10-11T12:11:00Z' },
        { deduct_date: '2026-10-11', beer_id: B, package_id: P, quantity: 1, created_at: '2026-10-13T09:15:22Z' },
      ],
      keggingRows: [{ entry_date: '2026-10-13', beer_id: B, package_id: P, quantity: 6, created_at: '2026-10-13T13:22:00Z' }],
    })).toBe(9); // 5 − 1 − 1 + 6 − 0
  });

  it('počítání v pondělí zůstává pondělní', () => {
    expect(pocitani[0]).toMatchObject({ entry_date: '2026-10-12' });
    expect(String(pocitani[0].note)).not.toContain('(konec dne)');
  });
});

describe('Úprava skladu platí od okamžiku počítání (28. 10. 2026)', () => {
  // Úprava skladu 26. 10. v 8:58 (07:58 UTC): napočítáno 0. Stáčení lahví
  // z téhož dne se zapsalo až v 16:16 — Sklad ho „spolkl" a po závozech
  // ukazoval mínus (12° Světlá 1 l: 0 − 5 = −5 místo 79 − 5 = 74).
  const uprava = tydenniJakoInventura([
    { tyden_od: '2026-10-26', tyden_do: '2026-11-01', beer_id: B, package_id: P, napocitano: 0, updated_at: '2026-10-26T07:58:00Z' },
  ]);
  const stavU = (src: Parameters<typeof buildMovements>[0], den = '2026-10-27') =>
    stockAsOf(buildMovements({ packages, inventoryRows: uprava as any, ...src }), den).get(K)?.qty;

  it('stáčení zapsané ten den PO počítání se přičte', () => {
    expect(stavU({
      bottlingRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 79, created_at: '2026-10-26T14:16:00Z' }],
      zavozDeductionRows: [{ deduct_date: '2026-10-27', beer_id: B, package_id: P, quantity: 5, created_at: '2026-10-27T13:53:00Z' }],
    })).toBe(74);
    expect(stavU({
      bottlingRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 79, created_at: '2026-10-26T14:16:00Z' }],
    }, '2026-10-26')).toBe(79);
  });

  it('zápis z téhož dne uložený PŘED počítáním je v napočítaném čísle', () => {
    expect(stavU({
      bottlingRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 20, created_at: '2026-10-26T06:30:00Z' }],
    })).toBe(0);
  });

  it('zápis bez času uložení se k napočítanému nepřičte (nevíme, kdy vznikl)', () => {
    expect(stavU({ bottlingRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 20 }] })).toBe(0);
  });

  it('srovnání z Úpravy skladu uložené po počítání se nepřičte podruhé', () => {
    expect(stavU({
      adjustmentRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 3, reason: 'Dorovnání z inventury týdne 2026-10-26 — 50l', created_at: '2026-10-26T08:00:00Z' }],
    })).toBe(0);
  });

  it('zápis k dni počítání dopsaný až POZDĚJI zůstává v napočítaném čísle (Winter 1 l)', () => {
    expect(stavU({
      prodejnaRows: [{ entry_date: '2026-10-26', beer_id: B, package_id: P, quantity: 1, created_at: '2026-10-27T11:15:59Z' }],
    })).toBe(0);
  });

  it('zpětný zápis na den PŘED počítáním zůstává v napočítaném čísle', () => {
    expect(stavU({
      zavozDeductionRows: [{ deduct_date: '2026-10-25', beer_id: B, package_id: P, quantity: 2, created_at: '2026-10-26T15:00:00Z' }],
    })).toBe(0);
  });

  it('měsíční napočítaná inventura se nemění — pohyby jejího dne do ní patří', () => {
    const mesicni = [{ entry_date: '2026-10-31', beer_id: B, package_id: P, quantity: 4, note: 'Fyzická inventura', created_at: '2026-11-01T08:00:00Z' }];
    expect(stockAsOf(buildMovements({
      packages, inventoryRows: mesicni,
      bottlingRows: [{ entry_date: '2026-10-31', beer_id: B, package_id: P, quantity: 6, created_at: '2026-11-01T09:00:00Z' }],
    }), '2026-10-31').get(K)?.qty).toBe(4);
  });
});
