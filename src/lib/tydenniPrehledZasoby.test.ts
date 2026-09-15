import { describe, it, expect } from 'vitest';
import { zbyvaStocitPrehledTydne, zbyvaStocitPrehledTydnePodlePiv } from './tydenniPrehledZasoby';

const packages = [{ id: 'p30', label: '30l', kind: 'keg', volume_l: 30 }];
const PONDELI = '2026-09-14'; // pondělí — týden 2026-09-14 (po) až 2026-09-20 (ne)

describe('zbyvaStocitPrehledTydne — zjednodušený týdenní přehled', () => {
  it('stočeno tento týden pokryje objednávku, i bez pondělní zásoby', () => {
    const out = zbyvaStocitPrehledTydne({
      zdroje: {},
      packages,
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 20 }],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 24 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    expect(out.find((r) => r.package_id === 'p30')?.missing).toBe(4);
  });

  it('pondělní zásoba (inventura před týdnem) se počítá jako nabídka', () => {
    const out = zbyvaStocitPrehledTydne({
      zdroje: { inventoryRows: [{ entry_date: '2026-09-10', beer_id: 'b1', package_id: 'p30', quantity: 9, note: 'Fyzická inventura' }] },
      packages,
      stoceniTydne: [],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    // 9 skladem z minulého týdne pokryje objednávku na 5 — nic nechybí.
    expect(out.find((r) => r.package_id === 'p30')).toBeUndefined();
  });

  it('stočení ZE STEJNÉHO týdne (po pondělí) se do pondělní zásoby nepočítá dvakrát', () => {
    const out = zbyvaStocitPrehledTydne({
      zdroje: { keggingRows: [{ entry_date: '2026-09-15', beer_id: 'b1', package_id: 'p30', quantity: 20 }] },
      packages,
      // Stejný záznam se předá i jako stoceniTydne (jak to dělá volající obrazovka).
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 20 }],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 24 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    // Kdyby se 20 kusů počítalo dvakrát (jednou z pondělní zásoby, jednou
    // ze stoceniTydne), vyšlo by "nic nechybí" místo 4.
    expect(out.find((r) => r.package_id === 'p30')?.missing).toBe(4);
  });

  it('fasování se odečítá stejně jako objednávky', () => {
    const out = zbyvaStocitPrehledTydne({
      zdroje: {},
      packages,
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 10 }],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      fasovaniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 6 }],
      pondeliISO: PONDELI,
    });
    expect(out.find((r) => r.package_id === 'p30')?.missing).toBe(1);
  });

  it('zavezené objednávky se NEVYJÍMAJÍ — počítají se pořád celé', () => {
    const out = zbyvaStocitPrehledTydne({
      zdroje: {},
      packages,
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    // Ať je objednávka zavezená nebo ne, appka o tom v tomhle přehledu vůbec
    // neví — vstup je stejný, výsledek musí sedět (nic nechybí).
    expect(out.find((r) => r.package_id === 'p30')).toBeUndefined();
  });

  it('bez zásoby, stočení ani žádných objednávek vrátí prázdný seznam', () => {
    expect(zbyvaStocitPrehledTydne({
      zdroje: {}, packages, stoceniTydne: [], objednavkyTydne: [], fasovaniTydne: [], pondeliISO: PONDELI,
    })).toEqual([]);
  });

  it('jiný druh obalu (lahve) se do sudů nepočítá', () => {
    const pkgs = [...packages, { id: 'plah', label: 'Lahev 0,5l', kind: 'bottle', volume_l: 0.5 }];
    const out = zbyvaStocitPrehledTydne({
      zdroje: {},
      packages: pkgs,
      stoceniTydne: [],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'plah', quantity: 40 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    expect(out).toEqual([]);
  });
});

describe('zbyvaStocitPrehledTydnePodlePiv — rozklik obalu na jednotlivá piva', () => {
  it('součet piv na jeden obal sedí přesně s číslem na dlaždici (missing i missingLiters)', () => {
    const vstup = {
      zdroje: {},
      packages,
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      objednavkyTydne: [
        { beer_id: 'b1', package_id: 'p30', quantity: 12 },
        { beer_id: 'b2', package_id: 'p30', quantity: 8 },
      ],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    };
    const podleObalu = zbyvaStocitPrehledTydne(vstup);
    const podlePiv = zbyvaStocitPrehledTydnePodlePiv(vstup);
    const p30 = podleObalu.find((r) => r.package_id === 'p30');
    const soucetPiv = podlePiv.filter((it) => it.package_id === 'p30').reduce((s, it) => s + it.missing, 0);
    expect(soucetPiv).toBe(p30?.missing);
    expect(podlePiv.find((it) => it.beer_id === 'b1')?.missing).toBe(7);
    expect(podlePiv.find((it) => it.beer_id === 'b2')?.missing).toBe(8);
  });

  it('pivo, které nic nechybí, se v rozkliku nezobrazí', () => {
    const podlePiv = zbyvaStocitPrehledTydnePodlePiv({
      zdroje: {},
      packages,
      stoceniTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 20 }],
      objednavkyTydne: [{ beer_id: 'b1', package_id: 'p30', quantity: 5 }],
      fasovaniTydne: [],
      pondeliISO: PONDELI,
    });
    expect(podlePiv).toEqual([]);
  });
});
